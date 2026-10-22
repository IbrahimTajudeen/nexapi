import { beforeEach, describe, expect, it } from "vitest";
import { checkImage, imageUrl, MAX_IMAGE_BYTES } from "../src/lib/backend/cloudinary";
import { createDemoBackend } from "../src/lib/backend/demo";
import { BackendError, PRIMARY_KEY } from "../src/lib/backend/types";
import { episodeFromRow, episodeHref, releaseFromRow } from "../src/lib/content";
import { demoSeed } from "../src/lib/backend/seed-data";
import { EPISODES } from "../src/tutorials";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

const person = {
  slug: "new-person",
  name: "New Person",
  roles: ["contributor"],
  socials: {},
  contributions: [],
  featured: false,
  published: false,
  sort: 1,
};

describe("demo backend", () => {
  it("starts from the seed and sorts", async () => {
    const be = createDemoBackend();
    const t = await be.list("tutorials", { orderBy: [{ column: "number" }] });
    expect(t.length).toBe(EPISODES.length);
    expect(t.map((x) => x.number)).toEqual([...t.map((x) => x.number)].sort((a, b) => a - b));
  });
  it("hides unpublished rows from public reads only", async () => {
    const be = createDemoBackend();
    const all = await be.list("people");
    const pub = await be.list("people", { publishedOnly: true });
    expect(pub.length).toBeLessThan(all.length);
    expect(pub.every((p) => p.published)).toBe(true);
  });
  it("inserts, updates and removes, and logs each change", async () => {
    const be = createDemoBackend();
    const made = await be.insert("people", person as never);
    expect(made.id).toBeTruthy();
    const key = PRIMARY_KEY.people;
    expect(key).toBe("id");
    await be.update("people", made.id, { headline: "Hello" });
    expect((await be.list("people")).find((p) => p.id === made.id)?.headline).toBe("Hello");
    await be.remove("people", made.id);
    expect((await be.list("people")).some((p) => p.id === made.id)).toBe(false);
    const log = await be.list("audit_log");
    expect(log.slice(0, 3).map((l) => l.op)).toEqual(["DELETE", "UPDATE", "INSERT"]);
    expect(log[1]?.changed).toContain("headline");
  });
  it("rejects what the database would reject", async () => {
    const be = createDemoBackend();
    await expect(
      be.insert("people", { ...person, socials: { x: "http://x.com/a" } } as never),
    ).rejects.toBeInstanceOf(BackendError);
    await expect(
      be.insert("people", { ...person, website: "javascript:alert(1)" } as never),
    ).rejects.toBeInstanceOf(BackendError);
    await expect(be.insert("people", { ...person, name: "" } as never)).rejects.toBeInstanceOf(
      BackendError,
    );
    const existing = (await be.list("people"))[0];
    await expect(
      be.insert("people", { ...person, slug: existing?.slug } as never),
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("does not let a tutorial be published without a video", async () => {
    const be = createDemoBackend();
    const open = (await be.list("tutorials")).find((t) => t.status === "open");
    expect(open).toBeDefined();
    await expect(
      be.update("tutorials", open?.id ?? "", { status: "published" }),
    ).rejects.toBeInstanceOf(BackendError);
    await be.update("tutorials", open?.id ?? "", {
      status: "published",
      video_url: "https://example.com/v",
    });
  });
  it("upserts settings by key and persists across instances", async () => {
    const a = createDemoBackend();
    await a.upsert("site_settings", { key: "community.intro", value: "one" });
    await a.upsert("site_settings", { key: "community.intro", value: "two" });
    const b = createDemoBackend();
    const rows = (await b.list("site_settings")).filter((s) => s.key === "community.intro");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("two");
  });
  it("signs in with a role taken from the address and signs out", async () => {
    const be = createDemoBackend();
    expect(await be.auth.me()).toBeNull(); // the demo asks you to sign in too
    await be.auth.sendLink("boss@example.com");
    expect((await be.auth.me())?.role).toBe("admin");
    await be.auth.signOut();
    expect(await be.auth.me()).toBeNull();
    await be.auth.sendLink("Jane.Editor@example.com");
    expect(await be.auth.me()).toMatchObject({
      role: "editor",
      session: { email: "jane.editor@example.com" },
    });
    await be.auth.sendLink("sam.contributor@example.com");
    expect((await be.auth.me())?.role).toBe("contributor");
  });
});

describe("cloudinary helpers", () => {
  it("checks type and size", () => {
    expect(checkImage({ type: "image/png", size: 10 })).toBeNull();
    expect(checkImage({ type: "image/svg+xml", size: 10 })).toMatch(/PNG/);
    expect(checkImage({ type: "application/pdf", size: 10 })).not.toBeNull();
    expect(checkImage({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 })).toMatch(/5 MB/);
  });
  it("adds transformations to Cloudinary urls only, once", () => {
    const u = "https://res.cloudinary.com/demo/image/upload/v1/nyxapi/a.jpg";
    const t = imageUrl(u, { width: 100, height: 100, face: true });
    expect(t).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_100,h_100,c_fill,g_face/v1/nyxapi/a.jpg",
    );
    expect(imageUrl(t, { width: 50 })).toBe(t);
    expect(imageUrl("https://example.com/a.jpg", { width: 100 })).toBe("https://example.com/a.jpg");
    expect(imageUrl(null)).toBeUndefined();
  });
});

describe("content mappers", () => {
  const seed = demoSeed();
  it("rebuilds an episode from its row", () => {
    const row = seed.tutorials[0];
    const ep = episodeFromRow(row, seed.people);
    const src = EPISODES.find((e) => e.slug === row?.slug);
    expect(ep.title).toBe(src?.title);
    expect(ep.goals).toEqual(src?.goals);
    expect(ep.outline).toEqual(src?.outline);
    expect(ep.samples).toEqual(src?.samples);
    expect(ep.tutor).toEqual(src?.tutor);
  });
  it("drops sample ids it cannot run and survives hand-edited JSON", () => {
    const row = {
      ...seed.tutorials[0],
      content: {
        goals: "not a list",
        samples: [
          { kind: "example", id: "does-not-exist" },
          { kind: "code", lang: "weird", title: "t", code: "x" },
        ],
        outline: [null, 4],
      },
    };
    const ep = episodeFromRow(row);
    expect(ep.goals).toEqual([]);
    expect(ep.samples).toEqual([{ kind: "code", lang: "ts", title: "t", code: "x" }]);
    expect(ep.outline).toHaveLength(2);
  });
  it("links the tutor profile", () => {
    const tutor = seed.people.find((p) => p.roles.includes("tutor"));
    const ep = episodeFromRow({ ...seed.tutorials[0], tutor_id: tutor?.id } as never, seed.people);
    expect(ep.tutorProfile?.slug).toBe(tutor?.slug);
  });
  it("uses pretty paths for built-in episodes and a query for new ones", () => {
    expect(episodeHref("welcome")).toBe("/tutorials/welcome/");
    expect(episodeHref("brand new")).toBe("/tutorials/episode/?slug=brand%20new");
  });
  it("maps releases and omits empty lists", () => {
    const r = releaseFromRow({ ...seed.releases[0], fixes: [] });
    expect(r.fixes).toBeUndefined();
    expect(r.version).toBe(seed.releases[0]?.version);
  });
});
