import { describe, expect, it } from "vitest";
import { cloudinarySignature, createSupabaseDeps } from "../src/server/supabase-deps";

const base = { SUPABASE_URL: "https://p.supabase.co", SUPABASE_ANON_KEY: "anon" };

describe("createSupabaseDeps", () => {
  it("returns null until Supabase is configured", () => {
    expect(createSupabaseDeps({})).toBeNull();
    expect(createSupabaseDeps({ SUPABASE_URL: "https://p.supabase.co" })).toBeNull();
  });

  it("offers no media signing without Cloudinary credentials", () => {
    expect(createSupabaseDeps(base)?.media).toBeUndefined();
  });

  const cloud = {
    ...base,
    CLOUDINARY_CLOUD_NAME: "demo",
    CLOUDINARY_API_KEY: "key",
    CLOUDINARY_API_SECRET: "secret",
  };

  it("signs an upload with the secret and never returns the secret", () => {
    const signed = createSupabaseDeps(cloud)?.media?.sign("nyxapi/library");
    expect(signed).toBeDefined();
    expect(JSON.stringify(signed)).not.toContain("secret");
    expect(signed?.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(signed?.signature).toBe(
      cloudinarySignature(
        {
          allowed_formats: signed?.allowedFormats ?? "",
          folder: "nyxapi/library",
          timestamp: signed?.timestamp ?? 0,
        },
        "secret",
      ),
    );
  });

  it("destroys an asset with a signed request and reports the outcome", async () => {
    const calls: { url: string; body: URLSearchParams }[] = [];
    const fetcher = ((url: string, init: { body: URLSearchParams }) => {
      calls.push({ url, body: init.body });
      return Promise.resolve(Response.json({ result: "ok" }));
    }) as unknown as typeof fetch;
    const ok = await createSupabaseDeps(cloud, fetcher)?.media?.destroy("nyxapi/library/a");
    expect(ok).toBe(true);
    expect(calls[0]?.url).toBe("https://api.cloudinary.com/v1_1/demo/image/destroy");
    expect(calls[0]?.body.get("public_id")).toBe("nyxapi/library/a");
    expect(calls[0]?.body.get("api_key")).toBe("key");
    expect(calls[0]?.body.get("signature")).toMatch(/^[0-9a-f]{40}$/);
    expect(calls[0]?.body.has("api_secret")).toBe(false);

    const failing = (() =>
      Promise.resolve(new Response("nope", { status: 500 }))) as unknown as typeof fetch;
    expect(await createSupabaseDeps(cloud, failing)?.media?.destroy("x")).toBe(false);
  });
});
