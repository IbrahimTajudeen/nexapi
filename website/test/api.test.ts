import { beforeEach, describe, expect, it } from "vitest";
import { createDemoBackend, demoToken } from "../src/lib/backend/demo";
import { createDemoDeps } from "../src/lib/backend/demo-deps";
import { handleApi, type ApiResponse } from "../src/server/api";
import { cloudinarySignature } from "../src/server/supabase-deps";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem = (k: string): string | null => this.m.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.m.set(k, v);
  removeItem = (k: string): void => void this.m.delete(k);
}

const admin = demoToken("admin", "boss@example.com");
const editor = demoToken("editor", "ed@example.com");
const contributor = demoToken("contributor", "c@example.com");

let deps: ReturnType<typeof createDemoDeps>;
beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  deps = createDemoDeps(createDemoBackend());
});

async function call(
  method: string,
  path: string,
  opts: { token?: string | null; body?: unknown } = {},
): Promise<ApiResponse> {
  const url = new URL(`http://x/api/${path}`);
  return handleApi(
    {
      method,
      path: url.pathname
        .replace(/^\/api\//, "")
        .split("/")
        .filter(Boolean),
      query: url.searchParams,
      body: opts.body,
      token: opts.token ?? null,
      origin: "http://x",
    },
    deps,
  );
}
const rows = (r: ApiResponse): Record<string, unknown>[] => r.body as Record<string, unknown>[];
const errorOf = (
  r: ApiResponse,
): { code: string; message: string; fields?: Record<string, string> } =>
  (r.body as { error: { code: string; message: string; fields?: Record<string, string> } }).error;

describe("reading", () => {
  it("gives visitors only published rows, and caches them", async () => {
    const r = await call("GET", "people");
    expect(r.status).toBe(200);
    expect(rows(r).length).toBeGreaterThan(0);
    expect(rows(r).every((p) => p["published"] === true)).toBe(true);
    expect(r.headers?.["Cache-Control"]).toContain("s-maxage");
  });
  it("lets staff see unpublished rows, uncached, unless they ask not to", async () => {
    const all = await call("GET", "people", { token: editor });
    const pub = await call("GET", "people?published=true", { token: editor });
    expect(rows(all).length).toBeGreaterThan(rows(pub).length);
    expect(all.headers?.["Cache-Control"]).toBe("private, no-store");
  });
  it("orders and limits, and rejects columns it does not know", async () => {
    const r = await call("GET", "tutorials?order=-number&limit=3");
    expect(rows(r).map((t) => t["number"])).toEqual([30, 29, 28]);
    expect((await call("GET", "tutorials?order=drop_table")).status).toBe(400);
    expect((await call("GET", "tutorials?limit=0")).status).toBe(400);
    expect((await call("GET", "tutorials?limit=5000")).status).toBe(400);
  });
  it("keeps the team and the activity log for admins", async () => {
    for (const path of ["staff", "invites", "audit"]) {
      expect((await call("GET", path)).status, `${path} anonymous`).toBe(401);
      expect((await call("GET", path, { token: editor })).status, `${path} editor`).toBe(403);
      expect((await call("GET", path, { token: admin })).status, `${path} admin`).toBe(200);
    }
  });
  it("reports who you are, and rejects a bad token", async () => {
    expect((await call("GET", "me")).status).toBe(401);
    expect((await call("GET", "me", { token: "nonsense" })).status).toBe(401);
    expect((await call("GET", "me", { token: editor })).body).toMatchObject({
      role: "editor",
      email: "ed@example.com",
    });
  });
  it("serves its own OpenAPI document and status", async () => {
    const doc = (await call("GET", "openapi.json")).body as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toMatch(/^3\.0/);
    expect(Object.keys(doc.paths)).toContain("/people/{id}");
    expect((await call("GET", "status")).body).toEqual({ configured: true, mode: "demo" });
  });
  it("answers 404 and 405 where it should", async () => {
    expect((await call("GET", "nope")).status).toBe(404);
    expect((await call("PUT", "people")).status).toBe(405);
    expect((await call("GET", "people/abc/extra")).status).toBe(404);
  });
});

describe("writing", () => {
  const person = {
    slug: "new-one",
    name: "New One",
    roles: ["tutor"],
    socials: { github: "https://github.com/new-one" },
  };

  it("needs a sign-in and an editor role", async () => {
    expect((await call("POST", "people", { body: person })).status).toBe(401);
    expect((await call("POST", "people", { token: contributor, body: person })).status).toBe(403);
    expect((await call("POST", "people", { token: editor, body: person })).status).toBe(201);
  });
  it("creates, updates and deletes", async () => {
    const made = (await call("POST", "people", { token: editor, body: person })).body as {
      id: string;
    };
    const up = await call("PATCH", `people/${made.id}`, {
      token: editor,
      body: { headline: "Hi" },
    });
    expect(up.body).toMatchObject({ headline: "Hi", name: "New One" });
    expect((await call("DELETE", `people/${made.id}`, { token: editor })).body).toEqual({
      deleted: true,
    });
    expect(
      (await call("DELETE", `people/${made.id}`, { token: editor })).status,
    ).toBeGreaterThanOrEqual(400);
  });
  it("explains validation problems field by field", async () => {
    const r = await call("POST", "people", {
      token: editor,
      body: {
        name: "",
        slug: "x",
        roles: ["boss"],
        website: "http://a.com",
        socials: { x: "javascript:1" },
        nope: 1,
        id: "forced",
      },
    });
    expect(r.status).toBe(422);
    expect(Object.keys(errorOf(r).fields ?? {}).sort()).toEqual([
      "id",
      "nope",
      "roles",
      "socials",
      "website",
    ]);
    const missing = await call("POST", "people", { token: editor, body: {} });
    expect(Object.keys(errorOf(missing).fields ?? {}).sort()).toEqual(["name", "slug"]);
  });
  it("rejects an empty or non-object body", async () => {
    const t = (await call("GET", "tutorials?limit=1")).body as { id: string }[];
    expect((await call("PATCH", `tutorials/${t[0]?.id}`, { token: editor, body: {} })).status).toBe(
      422,
    );
    expect((await call("POST", "people", { token: editor, body: [] })).status).toBe(422);
  });
  it("turns database conflicts into 409", async () => {
    await call("POST", "people", { token: editor, body: person });
    expect((await call("POST", "people", { token: editor, body: person })).status).toBe(409);
  });
  it("does not allow changing the activity log or settings by the wrong verb", async () => {
    expect((await call("DELETE", "audit/1", { token: admin })).status).toBe(405);
    expect(
      (await call("PATCH", "settings/community.intro", { token: editor, body: { value: "x" } }))
        .status,
    ).toBe(405);
  });
  it("sets settings by key", async () => {
    const r = await call("PUT", "settings/community.intro", {
      token: editor,
      body: { value: "Hello" },
    });
    expect(r.status).toBe(200);
    expect(
      rows(await call("GET", "settings")).find((s) => s["key"] === "community.intro")?.["value"],
    ).toBe("Hello");
    expect((await call("PUT", "settings/community.intro", { body: { value: "x" } })).status).toBe(
      401,
    );
  });
});

describe("contributors", () => {
  it("edit only their own profile, and only the allowed fields", async () => {
    const mine = rows(await call("GET", "people", { token: editor })).find(
      (p) => p["user_id"] === "demo",
    );
    const other = rows(await call("GET", "people", { token: editor })).find(
      (p) => p["user_id"] !== "demo",
    );
    expect(mine && other).toBeTruthy();
    const ok = await call("PATCH", `people/${String(mine?.["id"])}`, {
      token: contributor,
      body: { bio: "New bio", socials: { github: "https://github.com/me" } },
    });
    expect(ok.status).toBe(200);
    for (const forbidden of [
      { published: true },
      { featured: true },
      { roles: ["maintainer"] },
      { slug: "mine" },
      { sort: 1 },
    ]) {
      const r = await call("PATCH", `people/${String(mine?.["id"])}`, {
        token: contributor,
        body: forbidden,
      });
      expect(r.status, JSON.stringify(forbidden)).toBe(403);
    }
    expect(
      (
        await call("PATCH", `people/${String(other?.["id"])}`, {
          token: contributor,
          body: { bio: "x" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await call("DELETE", `people/${String(mine?.["id"])}`, { token: contributor })).status,
    ).toBe(403);
    expect(
      (await call("PATCH", "tutorials/anything", { token: contributor, body: { title: "x" } }))
        .status,
    ).toBe(403);
  });
});

describe("team", () => {
  it("normalises invite emails and says honestly that no email was sent here", async () => {
    const r = await call("POST", "invites", {
      token: admin,
      body: { email: " Helper@Example.COM ", role: "editor" },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      invite: { email: "helper@example.com", role: "editor" },
      emailSent: false,
    });
    expect(
      (
        await call("POST", "invites", {
          token: admin,
          body: { email: "not-an-email", role: "editor" },
        })
      ).status,
    ).toBe(422);
    expect(
      (await call("POST", "invites", { token: editor, body: { email: "a@b.co", role: "editor" } }))
        .status,
    ).toBe(403);
  });
  it("sends the sign-in link when the server can, and reports a failure without losing the invite", async () => {
    const sent: string[] = [];
    deps.sendSignInLink = async (email, origin) => void sent.push(`${email}@${origin}`);
    const r = await call("POST", "invites", {
      token: admin,
      body: { email: "ok@example.com", role: "contributor" },
    });
    expect(r.body).toMatchObject({ emailSent: true });
    expect(sent).toEqual(["ok@example.com@http://x"]);
    deps.sendSignInLink = async () => {
      throw new Error("rate limited");
    };
    const failed = await call("POST", "invites", {
      token: admin,
      body: { email: "later@example.com", role: "contributor" },
    });
    expect(failed.body).toMatchObject({ emailSent: false, emailError: "rate limited" });
    expect(rows(await call("GET", "invites", { token: admin })).map((i) => i["email"])).toContain(
      "later@example.com",
    );
  });
  it("does not let admins remove themselves", async () => {
    expect((await call("DELETE", "staff/demo", { token: admin })).status).toBe(409);
  });
});

describe("media", () => {
  it("needs Cloudinary configured to sign, and a staff role", async () => {
    expect((await call("POST", "media/sign", { body: {} })).status).toBe(401);
    expect((await call("POST", "media/sign", { token: editor, body: {} })).status).toBe(503);
    deps.media = {
      sign: (folder) => ({
        cloudName: "c",
        apiKey: "k",
        timestamp: 1,
        signature: "s",
        folder,
        allowedFormats: "png",
        uploadUrl: "u",
      }),
      destroy: async () => true,
      owns: () => true,
    };
    expect(
      (await call("POST", "media/sign", { token: editor, body: { folder: "nyxapi/people" } })).body,
    ).toMatchObject({ folder: "nyxapi/people" });
    expect(
      (await call("POST", "media/sign", { token: editor, body: { folder: "../etc" } })).body,
    ).toMatchObject({ folder: "nyxapi" });
  });
  it("deletes the Cloudinary file along with the row, and says when it could not", async () => {
    const made = (
      await call("POST", "media", {
        token: editor,
        body: {
          public_id: "a/b",
          url: "https://res.cloudinary.com/x/image/upload/a/b.png",
          alt: "x",
        },
      })
    ).body as { id: string };
    const destroyed: string[] = [];
    deps.media = {
      sign: () => {
        throw new Error("unused");
      },
      destroy: async (id) => (destroyed.push(id), true),
      owns: () => true,
    };
    expect((await call("DELETE", `media/${made.id}`, { token: editor })).body).toEqual({
      deleted: true,
      assetDeleted: true,
    });
    expect(destroyed).toEqual(["a/b"]);
    const again = (
      await call("POST", "media", {
        token: editor,
        body: { public_id: "c/d", url: "https://res.cloudinary.com/x/image/upload/c/d.png" },
      })
    ).body as { id: string };
    deps.media = {
      sign: () => {
        throw new Error("unused");
      },
      destroy: async () => {
        throw new Error("down");
      },
      owns: () => true,
    };
    expect((await call("DELETE", `media/${again.id}`, { token: editor })).body).toEqual({
      deleted: true,
      assetDeleted: false,
    });
  });
  it("accepts small data images only in demo mode", async () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(
      (await call("POST", "media", { token: editor, body: { public_id: "d/1", url: png } })).status,
    ).toBe(201);
    deps = { ...deps, mode: "supabase" };
    expect(
      (await call("POST", "media", { token: editor, body: { public_id: "d/2", url: png } })).status,
    ).toBe(422);
  });
});

describe("cloudinary signing", () => {
  it("matches Cloudinary's documented example", () => {
    // From Cloudinary's docs: sha1("callback=...&eager=...&public_id=sample_image&timestamp=1315060510abcd")
    const secret = "abcd";
    const params = {
      eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
      public_id: "sample_image",
      timestamp: 1315060510,
    };
    expect(cloudinarySignature(params, secret)).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });
  it("sorts parameters so the order given does not matter", () => {
    expect(cloudinarySignature({ b: 1, a: 2 }, "s")).toBe(cloudinarySignature({ a: 2, b: 1 }, "s"));
  });
});
