import { beforeEach, describe, expect, it } from "vitest";
import { createDemoBackend, demoToken } from "../src/lib/backend/demo";
import { createDemoDeps } from "../src/lib/backend/demo-deps";
import { handleApi, safeFolder, type ApiDeps, type ApiResponse } from "../src/server/api";
import { bucketFor, clientKey, RateLimiter } from "../src/server/ratelimit";
import { ownsUpload } from "../src/server/supabase-deps";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem = (k: string): string | null => this.m.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.m.set(k, v);
  removeItem = (k: string): void => void this.m.delete(k);
}

const admin = demoToken("admin", "boss@example.com");
const editor = demoToken("editor", "ed@example.com");
const contributor = demoToken("contributor", "c@example.com");
const contributor2 = demoToken("contributor", "d@example.com");

let deps: ApiDeps;
const destroyed: string[] = [];
beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  destroyed.length = 0;
  const base = createDemoDeps(createDemoBackend());
  // Behave like the real server: no data images, uploads must belong to our account.
  deps = {
    ...base,
    mode: "supabase",
    authenticate: (t) =>
      base.authenticate(t).then((p) => (p ? { ...p, userId: `u-${p.email}` } : p)),
    media: {
      sign: () => {
        throw new Error("unused");
      },
      destroy: (id) => Promise.resolve(destroyed.push(id) > 0),
      owns: (url, id) => ownsUpload(url, id, "mine"),
    },
  };
});

function call(
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
const mine = (id: string) => ({
  public_id: `nyxapi/library/${id}`,
  url: `https://res.cloudinary.com/mine/image/upload/v1/nyxapi/library/${id}.png`,
  alt: "",
});

describe("media can only point at this site's own uploads", () => {
  it("registers an upload from our account and folder", async () => {
    expect((await call("POST", "media", { token: editor, body: mine("a") })).status).toBe(201);
  });
  it("refuses another account, another folder, or a mismatched id", async () => {
    const bad = [
      {
        public_id: "nyxapi/x",
        url: "https://res.cloudinary.com/other/image/upload/v1/nyxapi/x.png",
      },
      {
        public_id: "private/secret",
        url: "https://res.cloudinary.com/mine/image/upload/v1/private/secret.png",
      },
      {
        public_id: "nyxapi/../x",
        url: "https://res.cloudinary.com/mine/image/upload/v1/nyxapi/../x.png",
      },
      { public_id: "nyxapi/a", url: "https://evil.example/nyxapi/a.png" },
      {
        public_id: "nyxapi/a",
        url: "https://res.cloudinary.com/mine/image/upload/v1/nyxapi/b.png",
      },
    ];
    for (const body of bad)
      expect((await call("POST", "media", { token: editor, body })).status, body.public_id).toBe(
        422,
      );
  });
  it("refuses data images and registering when Cloudinary is not configured", async () => {
    const data = { public_id: "nyxapi/a", url: "data:image/png;base64,iVBORw0KGgo=" };
    expect((await call("POST", "media", { token: editor, body: data })).status).toBe(422);
    delete deps.media;
    expect((await call("POST", "media", { token: editor, body: mine("b") })).status).toBe(503);
  });
  it("never asks Cloudinary to delete outside the nyxapi folder", () => {
    expect(ownsUpload("https://res.cloudinary.com/mine/image/upload/a.png", "a", "mine")).toBe(
      false,
    );
  });
});

describe("contributors and the media library", () => {
  it("may add images and change only their own", async () => {
    const a = (await call("POST", "media", { token: contributor, body: mine("c1") })).body as {
      id: string;
      created_by: string;
    };
    expect(a.created_by).toBe("u-c@example.com");
    const b = (await call("POST", "media", { token: editor, body: mine("e1") })).body as {
      id: string;
    };
    expect(
      (await call("PATCH", `media/${a.id}`, { token: contributor, body: { alt: "mine" } })).status,
    ).toBe(200);
    expect(
      (await call("PATCH", `media/${b.id}`, { token: contributor, body: { alt: "no" } })).status,
    ).toBe(403);
    expect((await call("DELETE", `media/${b.id}`, { token: contributor })).status).toBe(403);
    expect((await call("DELETE", `media/${a.id}`, { token: contributor2 })).status).toBe(403);
    expect((await call("DELETE", `media/${a.id}`, { token: contributor })).status).toBe(200);
    expect(destroyed).toEqual(["nyxapi/library/c1"]);
    expect((await call("DELETE", `media/${b.id}`, { token: editor })).status).toBe(200);
  });
  it("the library is not public", async () => {
    expect((await call("GET", "media")).status).toBe(401);
    expect((await call("GET", "media", { token: contributor })).status).toBe(200);
  });
});

describe("input that tries to escape", () => {
  it("upload folders stay under nyxapi", () => {
    for (const f of [
      "../x",
      "/abs",
      "nyxapi/../x",
      "other",
      "nyxapi//x",
      "nyxapi/a b",
      5,
      undefined,
      "a".repeat(200),
    ])
      expect(safeFolder(f)).toBe("nyxapi");
    expect(safeFolder("nyxapi/people")).toBe("nyxapi/people");
  });
  it("site paths cannot be protocol-relative or use backslashes", async () => {
    const make = (link: string) =>
      call("POST", "announcements", {
        token: admin,
        body: { title: "m", link_url: link, link_label: "go", active: true },
      });
    for (const link of [
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "http://x.test",
    ])
      expect((await make(link)).status, link).toBe(422);
    expect((await make("/docs/")).status).toBe(201);
  });
  it("setting keys are restricted", async () => {
    expect(
      (await call("PUT", "settings/bad key!", { token: admin, body: { value: "x" } })).status,
    ).toBe(422);
    expect(
      (await call("PUT", "settings/community.intro", { token: admin, body: { value: "x" } }))
        .status,
    ).toBe(200);
  });
  it("answers are cached per Authorization header", async () => {
    expect((await call("GET", "people")).headers?.["Vary"]).toBe("Authorization");
    expect((await call("GET", "people", { token: editor })).headers?.["Vary"]).toBe(
      "Authorization",
    );
  });
});

describe("rate limiting", () => {
  it("allows up to the limit, then says when to retry, then recovers", () => {
    let t = 0;
    const r = new RateLimiter({ max: 3, windowMs: 1000 }, () => t);
    expect([1, 2, 3].map(() => r.take("a").allowed)).toEqual([true, true, true]);
    const v = r.take("a");
    expect(v).toEqual({ allowed: false, retryAfter: 1 });
    expect(r.take("b").allowed).toBe(true);
    t = 1000;
    expect(r.take("a").allowed).toBe(true);
  });
  it("blocked() does not count and stays bounded", () => {
    const r = new RateLimiter({ max: 1, windowMs: 1000 }, () => 0, 3);
    expect(r.blocked("a").allowed).toBe(true);
    r.take("a");
    expect(r.blocked("a").allowed).toBe(false);
    for (const k of ["b", "c", "d", "e", "f"]) r.take(k);
    expect(r.take("z").allowed).toBe(true);
  });
  it("picks a bucket and an address", () => {
    expect(bucketFor("GET", ["people"])).toBe("read");
    expect(bucketFor("PATCH", ["people", "1"])).toBe("write");
    expect(bucketFor("POST", ["invites"])).toBe("sensitive");
    expect(bucketFor("POST", ["media", "sign"])).toBe("sensitive");
    const h = (v: Record<string, string>) => ({ get: (n: string) => v[n] ?? null });
    expect(clientKey(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientKey(h({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientKey(h({}))).toBe("unknown");
  });
});
