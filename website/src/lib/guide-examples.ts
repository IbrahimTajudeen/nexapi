/**
 * Runnable examples for the guides: schema-less (manual) endpoints, plain HTTP requests, and
 * techniques. Like `examples.ts`, every one is executed by `test/examples.test.ts` against the
 * same mock API, and the output the docs promise is checked there.
 */
import type { Example } from "./examples";

const ex = (code: string, expect: string[]): Example => ({ code: code.replace(/^\n/, ""), expect });

export const GUIDE_EXAMPLES = {
  /* ---- manual endpoints ---------------------------------------------------------------- */
  manualGet: ex(
    `
// No schema? Describe the endpoint yourself. {id} is filled from params.
const getUser = nyx.query({ method: "get", path: "/users/{id}", params: { id: "1" } });

const user = await getUser(); // a plain request, no cache
log("Direct call:", user.name);
log("Cache key:", JSON.stringify(getUser.key()));

const cached = await nyx.queryClient.fetchQuery(getUser.options()); // through the cache
log("Through the cache:", cached.name, "| requests so far:", server.requestCount());
`,
    [
      "Direct call: Ada Lovelace",
      'Cache key: ["GET","/users/{id}",{"id":"1"}]',
      "Through the cache: Ada Lovelace | requests so far: 2",
    ],
  ),

  manualFactory: ex(
    `
// Path values change per call, so wrap the definition in a small function.
const userEndpoint = (id) =>
  nyx.query({ method: "get", path: "/users/{id}", params: { id } });

const qc = nyx.queryClient;
const users = await Promise.all(["1", "2", "3"].map((id) => qc.fetchQuery(userEndpoint(id).options(undefined, { staleTime: 60_000 }))));
log(users.map((u) => u.name).join(", "));

await qc.fetchQuery(userEndpoint("2").options(undefined, { staleTime: 60_000 })); // same id: cached
log("Requests:", server.requestCount());
`,
    ["Ada Lovelace, Linus Torvalds, Grace Hopper", "Requests: 3"],
  ),

  manualQuery: ex(
    `
// The request object carries query parameters and headers. Arrays repeat the parameter.
const listUsers = nyx.query({ method: "get", path: "/users" });

const admins = await listUsers({ query: { role: ["admin"], limit: 5 } });
log(admins.total, "admins:", admins.items.map((u) => u.name).join(", "));

// Each distinct request is its own cache entry.
log(JSON.stringify(listUsers.key({ query: { role: ["admin"], limit: 5 } })));
log(JSON.stringify(listUsers.key()));
`,
    [
      "2 admins: Ada Lovelace, Grace Hopper",
      '"query":{"role":["admin"],"limit":5}',
      '["GET","/users",{}]',
    ],
  ),

  manualMutation: ex(
    `
// POST with a JSON body. hasBody: true makes the body the first argument.
const createUser = nyx.mutation({ method: "post", path: "/users", hasBody: true });
const listUsers = nyx.query({ method: "get", path: "/users" });
const qc = nyx.queryClient;

await qc.fetchQuery(listUsers.options());
const created = await qc.mutate(
  createUser.options(undefined, { invalidates: [listUsers.key()] }),
  { name: "Alan Turing", email: "alan@example.test" },
);
log("Created", created.id, created.name);

const list = await qc.fetchQuery(listUsers.options()); // refetched: it was invalidated
log("The list now has", list.total, "users");
`,
    ["Created 101 Alan Turing", "The list now has 5 users"],
  ),

  manualTypedError: ex(
    `
// Errors from hand-written endpoints are the same typed errors as generated ones.
const getUser = nyx.query({ method: "get", path: "/users/{id}", params: { id: "99" } });
try {
  await getUser();
} catch (error) {
  if (error instanceof core.HttpError) {
    log("status:", error.status);
    log("body:", JSON.stringify(error.body));
    log("url (no query string):", error.url);
  }
}
`,
    [
      "status: 404",
      '"message":"No user 99"',
      "url (no query string): https://api.example.com/v1/users/99",
    ],
  ),

  customFetcher: ex(
    `
// Anything async can be cached: give the query client a key and a function.
const options = {
  queryKey: ["report", "lagos"],
  staleTime: 60_000,
  queryFn: async ({ signal }) => {
    const user = await api.users.byId("1").get({ signal }); // pass the signal on
    return { city: "Lagos", reportedBy: user.name };
  },
};
const a = await nyx.queryClient.fetchQuery(options);
const b = await nyx.queryClient.fetchQuery(options);
log(a.city, "reported by", a.reportedBy, "| requests:", server.requestCount());
log("Second call returned the very same object:", a === b);
`,
    ["Lagos reported by Ada Lovelace | requests: 1", "same object: true"],
  ),

  customOperation: ex(
    `
// Not HTTP at all? Wrap any async function as an operation and it gets keys,
// caching, invalidation and cancellation like every other endpoint.
let calls = 0;
const clock = core.createQueryOperation(
  { queryClient: nyx.queryClient },
  { prefix: ["CLOCK", "now"], run: async () => { calls += 1; return { time: "12:00" }; } },
  { hasInput: false },
);
await nyx.queryClient.fetchQuery(clock.options({ staleTime: 60_000 }));
await nyx.queryClient.fetchQuery(clock.options({ staleTime: 60_000 }));
log("Function ran", calls, "time for two reads");
log("Key:", JSON.stringify(clock.key()));
`,
    ["Function ran 1 time for two reads", 'Key: ["CLOCK","now"]'],
  ),

  /* ---- plain HTTP ---------------------------------------------------------------------- */
  httpMethods: ex(
    `
// /echo answers any method and reports what the server received.
for (const method of ["get", "post", "put", "patch", "delete"]) {
  const echo = await nyx.http.request({
    method,
    path: "/echo",
    body: method === "get" ? undefined : { hello: "nyx" },
  });
  log(method.toUpperCase().padEnd(6), "server saw", echo.method, "| body:", JSON.stringify(echo.body));
}

// HEAD and OPTIONS have no body worth reading: ask for "none".
await nyx.http.request({ method: "head", path: "/users/{id}", params: { id: "1" }, response: "none" });
await nyx.http.request({ method: "options", path: "/users", response: "none" });
log("HEAD and OPTIONS completed:", server.log().slice(-2).map((r) => r.method + " " + r.status).join(", "));
`,
    [
      "GET    server saw GET | body: null",
      'POST   server saw POST | body: {"hello":"nyx"}',
      "DELETE server saw DELETE",
      "HEAD and OPTIONS completed: HEAD 200, OPTIONS 204",
    ],
  ),

  bodyKinds: ex(
    `
// bodyKind decides how the body is encoded and which Content-Type is sent.
const send = async (bodyKind, body) => {
  const echo = await nyx.http.request({ method: "post", path: "/echo", bodyKind, body });
  const shown = typeof echo.body === "string" ? echo.body : JSON.stringify(echo.body);
  log(bodyKind.padEnd(10), echo.headers["content-type"], "|", shown);
};
await send("json", { name: "Ada", tags: ["a", "b"] });
await send("urlencoded", { name: "Ada Lovelace", role: "admin" });
await send("form-data", { name: "Ada" });
await send("text", "plain words");
await send("binary", new Blob(["raw bytes"], { type: "application/octet-stream" }));
`,
    [
      'json       application/json | {"name":"Ada","tags":["a","b"]}',
      "urlencoded application/x-www-form-urlencoded | name=Ada+Lovelace&role=admin",
      "form-data  multipart/form-data",
      "text       text/plain",
      "binary     application/octet-stream | raw bytes",
    ],
  ),

  responseKinds: ex(
    `
// response decides how a successful body is read. The default is "json".
const text = await nyx.http.request({ method: "get", path: "/files/notes.txt", response: "text" });
log("text:", JSON.stringify(text));

const blob = await nyx.http.request({ method: "get", path: "/files/logo.bin", response: "blob" });
log("blob:", blob.size, "bytes of", blob.type);

const none = await nyx.http.request({ method: "delete", path: "/users/{id}", params: { id: "4" }, response: "none" });
log("none:", none);
`,
    [
      'text: "NyxAPI notes\\nline two\\n"',
      "blob: 6 bytes of application/octet-stream",
      "none: undefined",
    ],
  ),

  queryStyles: ex(
    `
// Arrays repeat the parameter by default. queryStyles changes that per parameter.
const show = async (style) => {
  const echo = await nyx.http.request({
    method: "get",
    path: "/echo",
    query: { role: ["admin", "member"] },
    queryStyles: style ? { role: style } : undefined,
  });
  log((style ?? "default").padEnd(8), JSON.stringify(echo.query.role));
};
for (const style of [undefined, "csv", "space", "pipe"]) await show(style);

// deepObject writes an object as filter[role]=admin.
const deep = await nyx.http.request({
  method: "get",
  path: "/echo",
  query: { filter: { role: "admin", active: true } },
  queryStyles: { filter: "deepObject" },
});
log("deepObject", JSON.stringify(deep.query));
`,
    [
      'default  ["admin","member"]',
      'csv      ["admin,member"]',
      'space    ["admin member"]',
      'pipe     ["admin|member"]',
      '"filter[role]":["admin"]',
    ],
  ),

  headerPrecedence: ex(
    `
// Client headers < per-request headers. getToken adds Authorization on every call.
const client = core.createNyxClient({
  baseUrl: "https://api.example.com/v1",
  transport: server.transport,
  headers: { "x-app": "docs", "x-trace": "from-client" },
  getToken: async () => "demo-token",
});
const echo = await client.http.request({
  method: "get",
  path: "/echo",
  headers: { "x-trace": "from-request", "x-skipped": undefined },
});
log(JSON.stringify(echo.headers));
`,
    ['"authorization":"Bearer demo-token"', '"x-app":"docs"', '"x-trace":"from-request"'],
  ),

  /* ---- techniques ---------------------------------------------------------------------- */
  retryFlaky: ex(
    `
// /flaky answers 503 twice, then succeeds. Transient failures are safe to retry.
const flaky = nyx.query({ method: "get", path: "/flaky" });
const result = await nyx.queryClient.fetchQuery(
  flaky.options(undefined, { retry: 3, retryDelay: 50 }),
);
log("Succeeded on attempt", result.attempts, "| requests:", server.requestCount());
`,
    ["Succeeded on attempt 3 | requests: 3"],
  ),

  tokenRefresh: ex(
    `
// Middleware sees every response. On a 401, refresh the token once and replay the request.
let token = "expired";
let refreshes = 0;
let refreshing;

const refresh = async () => {
  refreshes += 1;
  const response = await server.transport(
    new Request("https://api.example.com/v1/auth/refresh", { method: "POST" }),
  );
  token = (await response.json()).token;
};

const client = core.createNyxClient({
  baseUrl: "https://api.example.com/v1",
  transport: server.transport,
  getToken: () => token,
  middleware: [
    async (request, next) => {
      const replay = request.clone(); // a body can only be read once
      const response = await next(request);
      if (response.status !== 401) return response;
      refreshing ??= refresh().finally(() => (refreshing = undefined)); // one refresh for all callers
      await refreshing;
      replay.headers.set("authorization", "Bearer " + token);
      return next(replay);
    },
  ],
});

const people = await Promise.all([1, 2, 3].map(() => client.http.request({ method: "get", path: "/me" })));
log("Signed in as", people[0].name, "| refreshes:", refreshes);
`,
    ["Signed in as Ada Lovelace | refreshes: 1"],
  ),

  cancelStale: ex(
    `
// Typing fast? Cancel the search you no longer need.
const search = (role) => ({
  queryKey: ["search", role],
  queryFn: ({ signal }) => api.users.list.get({ query: { role: [role] }, signal }),
});

const stale = nyx.queryClient.fetchQuery(search("admin")).catch((error) => error);
await sleep(10);
nyx.queryClient.cancelQueries(["search", "admin"]);
log("First search:", (await stale).name);

const fresh = await nyx.queryClient.fetchQuery(search("member"));
log("Second search found", fresh.total, "members");
`,
    ["First search: CancelledError", "Second search found 2 members"],
  ),

  dependentQueries: ex(
    `
// The second request needs the first one's answer. In React, use enabled: !!user.
const user = await nyx.queryClient.fetchQuery(api.users.byId("1").get.options());
const sameRole = await nyx.queryClient.fetchQuery(
  api.users.list.get.options({ query: { role: [user.role] } }),
);
log(user.name, "is one of", sameRole.total, "people with the role", user.role);
`,
    ["Ada Lovelace is one of 2 people with the role admin"],
  ),

  polling: ex(
    `
// Poll while something is watching; stop by unsubscribing.
const options = api.users.byId("1").get.options(undefined, { refetchInterval: 100 });
const observer = new core.QueryObserver(nyx.queryClient, options);
const stop = observer.subscribe(() => {});
await sleep(900);
stop();
log("Polled more than once:", server.requestCount() > 1);
const after = server.requestCount();
await sleep(300);
log("Stopped polling after unsubscribe:", server.requestCount() === after);
`,
    ["Polled more than once: true", "Stopped polling after unsubscribe: true"],
  ),

  optimisticCreate: ex(
    `
// Show a new row at once, then replace it with the server's version.
const listUsers = nyx.query({ method: "get", path: "/users" });
const qc = nyx.queryClient;
await qc.fetchQuery(listUsers.options());

const create = nyx.mutation({ method: "post", path: "/users", hasBody: true }).options(undefined, {
  onMutate: (draft, { optimistic }) => {
    optimistic(listUsers.key(), (old) =>
      old && { items: [...old.items, { id: "temp", ...draft }], total: old.total + 1 });
  },
  invalidates: [listUsers.key()],
});

const pending = qc.mutate(create, { name: "Alan Turing" });
await sleep(30);
log("While saving:", qc.getData(listUsers.key()).total, "users (one is temporary)");
await pending;
const list = await qc.fetchQuery(listUsers.options());
const last = list.items.at(-1);
log("After the server answered:", list.total, "users, last is", last.name, last.id);
`,
    [
      "While saving: 5 users (one is temporary)",
      "After the server answered: 5 users, last is Alan Turing 101",
    ],
  ),

  perUserClients: ex(
    `
// One client per user: caches and credentials never mix. Essential on a server.
const clientFor = (token) =>
  core.createNyxClient({ baseUrl: "https://api.example.com/v1", transport: server.transport, getToken: () => token });

const ada = clientFor("demo-token");
const stranger = clientFor("not-a-token");
ada.queryClient.setData(["secret"], "only for Ada");

log("Ada's cache:", ada.queryClient.getData(["secret"]));
log("Other client's cache:", stranger.queryClient.getData(["secret"]));
const me = await ada.http.request({ method: "get", path: "/me" });
log("Ada's token works:", me.name);
const denied = await stranger.http.request({ method: "get", path: "/me" }).catch((e) => e);
log("The other token is rejected with", denied.status);
`,
    ["Ada's cache: only for Ada", "Other client's cache: undefined", "rejected with 401"],
  ),

  explainErrors: ex(
    `
// One place that turns any failure into a message a person can act on.
const explain = (error) => {
  if (error instanceof core.HttpError)
    return error.status === 404 ? "That item no longer exists." : "The server said no (" + error.status + ").";
  if (error instanceof core.TimeoutError) return "That took too long. Try again.";
  if (error instanceof core.NetworkError) return "You appear to be offline.";
  return "Something unexpected happened.";
};

for (const attempt of [
  () => api.users.byId("99").get(),
  () => core.createNyxClient({ baseUrl: "https://api.example.com/v1", transport: server.transport, timeoutMs: 5 }).http.request({ method: "get", path: "/users" }),
  () => core.createNyxClient({ baseUrl: "https://api.example.com/v1", transport: () => Promise.reject(new TypeError("fetch failed")) }).http.request({ method: "get", path: "/users" }),
]) {
  try { await attempt(); } catch (error) { log(explain(error)); }
}
`,
    ["That item no longer exists.", "That took too long. Try again.", "You appear to be offline."],
  ),

  testingTransport: ex(
    `
// In tests, replace the network with a function. No server, no mocking library.
const calls = [];
const client = core.createNyxClient({
  baseUrl: "https://api.test/v1",
  transport: async (request) => {
    calls.push(request.method + " " + new URL(request.url).pathname);
    return new Response(JSON.stringify({ id: "1", name: "Test User" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
const user = await client.http.request({ method: "get", path: "/users/{id}", params: { id: "1" } });
log(user.name, "| calls:", calls.join(", "));
`,
    ["Test User | calls: GET /v1/users/1"],
  ),
  fakeRoutes: ex(
    `
// A tiny fake server for tests: a table of "METHOD /path" to responses. Unknown routes are 404.
const fakeApi = (routes) => {
  const calls = [];
  const transport = async (request) => {
    const key = request.method + " " + new URL(request.url).pathname.replace("/v1", "");
    calls.push(key);
    const hit = routes[key];
    if (!hit) return new Response(JSON.stringify({ message: "no route" }), { status: 404, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { transport, calls };
};

const fake = fakeApi({
  "GET /users/1": { body: { id: "1", name: "Test User" } },
  "POST /users": { status: 201, body: { id: "9", name: "New" } },
});
const client = core.createNyxClient({ baseUrl: "https://api.test/v1", transport: fake.transport });
const getUser = client.query({ method: "get", path: "/users/{id}", params: { id: "1" } });
const createUser = client.mutation({ method: "post", path: "/users", hasBody: true });

await client.queryClient.fetchQuery(getUser.options(undefined, { staleTime: 60_000 }));
await client.queryClient.fetchQuery(getUser.options(undefined, { staleTime: 60_000 }));
const created = await createUser({ name: "New" });
const missing = await client.http.request({ method: "get", path: "/nope" }).catch((e) => e);

log("Calls:", fake.calls.join(" | "));
log("Created:", created.id, "| unknown route:", missing.status);
`,
    ["Calls: GET /users/1 | POST /users | GET /nope", "Created: 9 | unknown route: 404"],
  ),
} satisfies Record<string, Example>;

export type GuideExampleId = keyof typeof GUIDE_EXAMPLES;
