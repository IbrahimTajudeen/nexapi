import { beforeEach, describe, expect, it } from "vitest";
import { createNyxClient, type Transport } from "@nyxapi/core";
import { createApi } from "../src/api";
import { createDemoBackend, demoToken } from "../src/lib/backend/demo";
import { createDemoDeps } from "../src/lib/backend/demo-deps";
import { handleApi } from "../src/server/api";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem = (k: string): string | null => this.m.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.m.set(k, v);
  removeItem = (k: string): void => void this.m.delete(k);
}

let requests: string[] = [];
function setup() {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  const deps = createDemoDeps(createDemoBackend());
  requests = [];
  const transport: Transport = async (request) => {
    const url = new URL(request.url);
    requests.push(`${request.method} ${url.pathname}${url.search}`);
    const text = request.method === "GET" ? "" : await request.text();
    const auth = request.headers.get("authorization");
    const res = await handleApi(
      {
        method: request.method,
        path: url.pathname
          .replace(/^\/api\/?/, "")
          .split("/")
          .filter(Boolean),
        query: url.searchParams,
        body: text === "" ? undefined : (JSON.parse(text) as unknown),
        token: auth?.startsWith("Bearer ") ? auth.slice(7) : null,
        origin: url.origin,
      },
      deps,
    );
    return Response.json(res.body, { status: res.status, headers: res.headers });
  };
  const nyx = createNyxClient({
    baseUrl: "http://x/api",
    transport,
    getToken: () => Promise.resolve(demoToken("admin", "boss@example.com")),
    queryClient: { defaultOptions: { queries: { staleTime: 60_000 } } },
  });
  return { nyx, api: createApi(nyx) };
}

describe("the site's generated NyxAPI client", () => {
  let c: ReturnType<typeof setup>;
  beforeEach(() => {
    c = setup();
  });

  it("lists, creates and updates through the typed tree", async () => {
    const before = (await c.api.people.get({ query: {} })).length;
    const made = await c.api.people.post({ name: "Ada Test", slug: "ada-test" });
    expect(made.name).toBe("Ada Test");
    expect((await c.api.people.get({ query: {} })).length).toBe(before + 1);
    const patched = await c.api.people.byId(made.id).patch({ headline: "Hi" });
    expect(patched.headline).toBe("Hi");
  });

  it("rejects invalid input with the server's field errors", async () => {
    await expect(c.api.people.post({ name: "", slug: "x" })).rejects.toThrow();
  });

  it("caches a query and refetches after the list prefix key is invalidated", async () => {
    const options = c.api.people.get.options({ query: { published: true } });
    await c.nyx.queryClient.fetchQuery(options);
    await c.nyx.queryClient.fetchQuery(options);
    expect(requests.filter((r) => r.startsWith("GET /api/people"))).toHaveLength(1);

    const other = c.api.people.get.options({ query: { limit: 2 } });
    await c.nyx.queryClient.fetchQuery(other);
    // One prefix key finds both filtered lists, so one invalidation refreshes every view of a table.
    expect(c.nyx.queryClient.findAll(c.api.people.get.key())).toHaveLength(2);

    await c.nyx.queryClient.invalidateQueries(c.api.people.get.key());
    await c.nyx.queryClient.fetchQuery(options);
    expect(requests.filter((r) => r.startsWith("GET /api/people"))).toHaveLength(3);
  });
});
