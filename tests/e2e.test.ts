import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generate } from "@nexapi/codegen";
import { HttpError, QueryObserver, createNexClient, type NexClient } from "@nexapi/core";
import { createApi } from "../examples/basic/generated/index.js";
import type { User } from "../examples/basic/generated/index.js";
import { startServer, type TestServer } from "./server.js";

let server: TestServer;
let token: string | undefined;
let nex: NexClient;
let api: ReturnType<typeof createApi>;

beforeAll(async () => {
  server = await startServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(() => {
  server.requests.length = 0;
  server.latency = 0;
  server.users.clear();
  server.users.set("1", { id: "1", name: "Ada", email: "ada@example.test", role: "admin" });
  server.users.set("2", { id: "2", name: "Linus", email: null, role: "member" });
  token = undefined;
  nex = createNexClient({
    baseUrl: server.url,
    getToken: () => token,
    queryClient: { defaultOptions: { queries: { retry: false } } },
  });
  api = createApi(nex);
});

describe("generated client: direct HTTP", () => {
  it("api.auth.login.post sends the JSON body and returns the typed session", async () => {
    const session = await api.auth.login.post({ email: "dev@example.com", password: "secret" });
    expect(session.token).toBe("tok-1");
    expect(session.user.name).toBe("Ada");
    expect(server.requests[0]?.body).toEqual({ email: "dev@example.com", password: "secret" });
  });

  it("surfaces documented error payloads as typed HttpError", async () => {
    const error = await api.auth.login
      .post({ email: "a@b.c", password: "nope" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    const e = error as HttpError<{ code: string; message: string }>;
    expect(e.status).toBe(401);
    expect(e.body).toEqual({ code: "bad_credentials", message: "Wrong email or password" });
    expect(JSON.stringify(e)).not.toContain("nope"); // the password never appears in the error
  });

  it("api.users.byId(id).get() binds and encodes path parameters", async () => {
    expect((await api.users.byId("1").get()).name).toBe("Ada");
    server.users.set("a b/c", { id: "a b/c", name: "Odd", role: "member" });
    expect((await api.users.byId("a b/c").get()).name).toBe("Odd");
    expect(server.requests.at(-1)?.url).toBe("/v1/users/a%20b%2Fc");
    await expect(api.users.byId("..").get()).rejects.toMatchObject({ name: "RequestError" });
    expect(server.requests).toHaveLength(2); // the traversal attempt never left the process
  });

  it("serializes query parameters, including repeated array values", async () => {
    const page = await api.users.list.get({
      query: { page: 1, limit: 1, role: ["admin", "member"] },
    });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(server.requests[0]?.url).toBe("/v1/users?page=1&limit=1&role=admin&role=member");
    await api.users.list.get();
    expect(server.requests[1]?.url).toBe("/v1/users");
  });

  it("PATCH sends the body; DELETE resolves undefined for 204", async () => {
    const updated = await api.users.byId("2").patch({ name: "Linus T." });
    expect(updated).toMatchObject({ id: "2", name: "Linus T." });
    await expect(api.users.byId("2").delete()).resolves.toBeUndefined();
    await expect(api.users.byId("2").get()).rejects.toMatchObject({ status: 404 });
  });

  it("sends the async bearer token, and a different client sends a different one", async () => {
    token = "alice-token";
    await api.users.byId("1").get();
    expect(server.requests[0]?.authorization).toBe("Bearer alice-token");
    const other = createApi(createNexClient({ baseUrl: server.url, getToken: () => "bob-token" }));
    await other.users.byId("1").get();
    expect(server.requests[1]?.authorization).toBe("Bearer bob-token");
  });

  it("aborts in-flight requests via AbortSignal", async () => {
    server.latency = 200;
    const ctl = new AbortController();
    const pending = api.users.byId("1").get({ signal: ctl.signal });
    setTimeout(() => ctl.abort(), 20);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("times out slow responses", async () => {
    server.latency = 300;
    const slow = createApi(createNexClient({ baseUrl: server.url, timeoutMs: 30 }));
    await expect(slow.users.byId("1").get()).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("reports malformed JSON responses as ParseError and network failures as NetworkError", async () => {
    await expect(nex.http.request({ method: "get", path: "/broken" })).rejects.toMatchObject({
      name: "ParseError",
    });
    const down = createNexClient({ baseUrl: "http://127.0.0.1:1/v1" });
    await expect(createApi(down).users.byId("1").get()).rejects.toMatchObject({
      name: "NetworkError",
    });
  });
});

describe("generated client: query engine", () => {
  it("get.options() + fetchQuery: concurrent identical queries make exactly one request", async () => {
    server.latency = 30;
    const opts = api.users.byId("1").get.options();
    const [a, b, c] = await Promise.all([
      nex.queryClient.fetchQuery(opts),
      nex.queryClient.fetchQuery(api.users.byId("1").get.options()),
      api.users.byId("1").get.prefetch(),
    ]);
    expect(a).toBe(b);
    expect(c).toBeUndefined();
    expect(server.hits("GET", "/v1/users/1")).toBe(1);
  });

  it("different inputs are different cache entries; same inputs share one", async () => {
    await nex.queryClient.fetchQuery(api.users.list.get.options({ query: { page: 1 } }));
    await nex.queryClient.fetchQuery(api.users.list.get.options({ query: { page: 2 } }));
    await nex.queryClient.fetchQuery(
      api.users.list.get.options({ query: { page: 2 } }, { staleTime: 60_000 }),
    );
    expect(server.hits("GET", "/v1/users")).toBe(2); // page 2 again: fresh for a caller that accepts 60s
    await nex.queryClient.fetchQuery(api.users.list.get.options({ query: { page: 2 } })); // default staleTime 0
    expect(server.hits("GET", "/v1/users")).toBe(3); // this caller demands fresher data → refetched
    expect(nex.queryClient.findAll(api.users.list.get.key())).toHaveLength(2);
    // `undefined` query values do not create a new variant
    expect(api.users.list.get.key({ query: { page: 2, limit: undefined } })).toEqual(
      api.users.list.get.key({ query: { page: 2 } }),
    );
  });

  it("invalidate() refetches observed queries and select() derives values", async () => {
    const o = new QueryObserver(
      nex.queryClient,
      api.users
        .byId("1")
        .get.options(undefined, { select: (u: User) => u.name, staleTime: 60_000 }),
    );
    const stop = o.subscribe(() => undefined);
    await vi_waitFor(() => o.getResult().data === "Ada");
    server.users.set("1", { id: "1", name: "Ada L.", role: "admin" });
    await api.users.byId("1").get.invalidate();
    expect(o.getResult().data).toBe("Ada L.");
    expect(server.hits("GET", "/v1/users/1")).toBe(2);
    stop();
  });

  it("failed refetch keeps the previous data (typed HttpError in state)", async () => {
    const o = new QueryObserver(nex.queryClient, api.users.byId("2").get.options());
    const stop = o.subscribe(() => undefined);
    await vi_waitFor(() => o.getResult().isSuccess);
    server.users.delete("2");
    await o.refetch();
    expect(o.getResult().data).toMatchObject({ id: "2", name: "Linus" });
    expect(o.getResult().status).toBe("error");
    expect((o.getResult().error as HttpError).status).toBe(404);
    stop();
  });

  it("SSR isolation: two clients never share cached data", async () => {
    const aliceNex = createNexClient({ baseUrl: server.url, getToken: () => "alice" });
    const bobNex = createNexClient({ baseUrl: server.url, getToken: () => "bob" });
    await createApi(aliceNex).users.byId("1").get.prefetch();
    const key = createApi(aliceNex).users.byId("1").get.key();
    expect(aliceNex.queryClient.getData<User>(key)?.name).toBe("Ada");
    expect(bobNex.queryClient.getData(key)).toBeUndefined(); // same key, different client: nothing shared
    expect(aliceNex.queryClient.size).toBe(1);
    expect(bobNex.queryClient.size).toBe(0);
    await createApi(bobNex).users.byId("1").get.prefetch();
    expect(server.requests.map((r) => r.authorization)).toEqual(["Bearer alice", "Bearer bob"]); // bob did not get alice's cache
  });
});

describe("generated client: mutations", () => {
  const list = () => api.users.byId("1").get;

  it("optimistic update is visible immediately, then confirmed by invalidation", async () => {
    await nex.queryClient.fetchQuery(list().options(undefined, { staleTime: 60_000 }));
    server.latency = 40;
    const patch = api.users.byId("1").patch.options(undefined, {
      onMutate: (vars, { optimistic }) =>
        void optimistic<User>(list().key(), (old) => (old ? { ...old, ...vars } : undefined)),
      invalidates: [list().key()],
    });
    const key = list().key({});
    const pending = nex.queryClient.mutate(patch, { name: "Renamed" });
    await Promise.resolve();
    expect(nex.queryClient.getData<User>(key)?.name).toBe("Renamed"); // instant
    expect(server.users.get("1")?.name).toBe("Ada"); // server has not answered yet
    await pending;
    expect(server.users.get("1")?.name).toBe("Renamed");
    expect(nex.queryClient.getData<User>(key)?.name).toBe("Renamed");
  });

  it("a rejected mutation (422) rolls back to the confirmed value", async () => {
    await nex.queryClient.fetchQuery(list().options());
    const patch = api.users.byId("1").patch.options(undefined, {
      onMutate: (vars, { optimistic }) =>
        void optimistic<User>(list().key(), (old) => (old ? { ...old, ...vars } : undefined)),
    });
    const result = nex.queryClient.mutate(patch, { name: "" });
    await expect(result).rejects.toMatchObject({ status: 422, body: { code: "invalid" } });
    expect(nex.queryClient.getData<User>(list().key({}))?.name).toBe("Ada");
  });

  it("does not retry a failed POST by default", async () => {
    server.latency = 0;
    const login = api.auth.login.post.options();
    await expect(
      nex.queryClient.mutate(login, { email: "a", password: "bad" }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(server.hits("POST", "/v1/auth/login")).toBe(1);
  });
});

describe("generated output", () => {
  it("is exactly what the generator produces today (no drift, no irrelevant diffs)", () => {
    const text = readFileSync(new URL("../fixtures/openapi/basic.yaml", import.meta.url), "utf8");
    const config = JSON.parse(
      readFileSync(new URL("../examples/basic/nexapi.config.json", import.meta.url), "utf8"),
    ) as Parameters<typeof generate>[1];
    for (const file of generate(text, config).files)
      expect(
        readFileSync(new URL(`../examples/basic/generated/${file.path}`, import.meta.url), "utf8"),
      ).toBe(file.content);
  });
});

async function vi_waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
}
