/**
 * Every runnable example on the site lives here, so one test can execute them all against the
 * same mock API and check the output the docs promise. Edit an example, run `pnpm test`.
 */
export interface Example {
  code: string;
  /** Substrings that must appear in the output, in order. Checked by the test suite. */
  expect: string[];
}

const ex = (code: string, expect: string[]): Example => ({ code: code.replace(/^\n/, ""), expect });

export const EXAMPLES = {
  singleFlight: ex(
    `
// Five components ask for the same user at once.
const options = api.users.byId("1").get.options();
const fetchUser = () => nyx.queryClient.fetchQuery(options);
const users = await Promise.all([1, 2, 3, 4, 5].map(fetchUser));
log(users[0].name, "was shared by", users.length, "callers");
log("Requests sent:", server.requestCount());
`,
    ["Ada Lovelace was shared by 5 callers", "Requests sent: 1"],
  ),

  firstCall: ex(
    `
// Path segments become properties; {id} becomes a function call.
const user = await api.users.byId("1").get();
log(user);
`,
    ['"name":"Ada Lovelace"'],
  ),

  login: ex(
    `
// POST /auth/login: the body is the first argument.
const session = await api.auth.login.post({
  email: "ada@example.test",
  password: "secret",
});
log("Signed in as", session.user.name);
log("Token:", session.token);
`,
    ["Signed in as Ada Lovelace", "Token: demo-token"],
  ),

  list: ex(
    `
// Query parameters go in \`query\`. Arrays are sent as role=admin&role=...
const admins = await api.users.list.get({ query: { role: ["admin"], limit: 10 } });
log(admins.total, "admins:", admins.items.map((u) => u.name).join(", "));
`,
    ["2 admins: Ada Lovelace, Grace Hopper"],
  ),

  typedError: ex(
    `
// A missing user is a typed HttpError with the server's JSON body.
try {
  await api.users.byId("99").get();
} catch (error) {
  if (error instanceof core.HttpError && error.status === 404) {
    log("Server said:", error.body.message);
  } else {
    throw error;
  }
}
`,
    ["Server said: No user 99"],
  ),

  freshness: ex(
    `
// staleTime: how long fetched data counts as fresh.
const options = api.users.byId("1").get.options(undefined, { staleTime: 60_000 });
await nyx.queryClient.fetchQuery(options);
await nyx.queryClient.fetchQuery(options); // fresh: answered from the cache
log("Requests after two fetches:", server.requestCount());

await api.users.byId("1").get.invalidate(); // mark it stale
await nyx.queryClient.fetchQuery(options);
log("Requests after invalidating:", server.requestCount());
`,
    ["Requests after two fetches: 1", "Requests after invalidating: 2"],
  ),

  prefetch: ex(
    `
// prefetch() fills the cache; getData() reads it without any request.
await api.users.byId("2").get.prefetch();
const before = server.requestCount();
const cached = nyx.queryClient.getData(api.users.byId("2").get.key());
log("Read from cache:", cached.name);
log("Extra requests for the read:", server.requestCount() - before);
`,
    ["Read from cache: Linus Torvalds", "Extra requests for the read: 0"],
  ),

  optimistic: ex(
    `
const qc = nyx.queryClient;
const key = api.users.byId("1").get.key();
await qc.fetchQuery(api.users.byId("1").get.options());

const rename = api.users.byId("1").patch.options(undefined, {
  // Show the change immediately. NyxAPI undoes exactly this change if the request fails.
  onMutate: (patch, { optimistic }) => {
    optimistic(key, (old) => (old ? { ...old, ...patch } : old));
  },
  invalidates: [key],
});

const pending = qc.mutate(rename, { name: "Ada, Countess of Lovelace" });
await sleep(50);
log("While the request is in flight:", qc.getData(key).name);
await pending;
log("After the server confirms:", qc.getData(key).name);
`,
    [
      "While the request is in flight: Ada, Countess of Lovelace",
      "After the server confirms: Ada, Countess of Lovelace",
    ],
  ),

  rollback: ex(
    `
// The server rejects an empty name (422), so the optimistic change is rolled back.
const qc = nyx.queryClient;
const key = api.users.byId("1").get.key();
await qc.fetchQuery(api.users.byId("1").get.options());

const rename = api.users.byId("1").patch.options(undefined, {
  onMutate: (patch, { optimistic }) => {
    optimistic(key, (old) => (old ? { ...old, ...patch } : old));
  },
});

const pending = qc.mutate(rename, { name: "" }).catch((e) => e);
await sleep(50);
log("Optimistic name:", JSON.stringify(qc.getData(key).name));
const error = await pending;
log("Server said:", error.status, error.body.message);
log("Rolled back to:", qc.getData(key).name);
`,
    [
      'Optimistic name: ""',
      "Server said: 422 Name cannot be empty",
      "Rolled back to: Ada Lovelace",
    ],
  ),

  retries: ex(
    `
// Retries are for transient failures (network, timeouts, 5xx). Here the server is down.
server.failing = true;
const options = api.users.byId("1").get.options(undefined, { retry: 2, retryDelay: 100 });
try {
  await nyx.queryClient.fetchQuery(options);
} catch (error) {
  log("Gave up after", server.requestCount(), "requests:", error.status, error.body.message);
}
`,
    ["Gave up after 3 requests: 500 Simulated outage"],
  ),

  pagination: ex(
    `
const qc = nyx.queryClient;
const options = {
  queryKey: ["users", "paged"],
  staleTime: 60_000,
  initialPageParam: 1,
  queryFn: ({ pageParam, signal }) =>
    api.users.list.get({ query: { page: pageParam, limit: 2 }, signal }),
  getNextPageParam: (last, pages) => (pages.length * 2 < last.total ? pages.length + 1 : undefined),
};

await core.fetchInfiniteQuery(qc, options); // first page
const observer = new core.InfiniteQueryObserver(qc, options);
const stop = observer.subscribe(() => {});
log("Pages loaded:", observer.getResult().data.pages.length);
await observer.getResult().fetchNextPage();
const result = observer.getResult();
log("Pages loaded:", result.data.pages.length);
log("Users so far:", result.data.pages.flatMap((p) => p.items).map((u) => u.name).join(", "));
log("More to load:", result.hasNextPage);
stop();
`,
    [
      "Pages loaded: 1",
      "Pages loaded: 2",
      "Users so far: Ada Lovelace, Linus Torvalds, Grace Hopper, Margaret Hamilton",
      "More to load: false",
    ],
  ),

  cacheKeys: ex(
    `
// A key is [METHOD, path template, path params, request?]. Prefixes select groups of entries.
log(api.users.byId("1").get.key());
log(api.users.list.get.key());
log(api.users.list.get.key({ query: { page: 2 } }));
`,
    ['["GET","/users/{id}",{"id":"1"}]', '["GET","/users",{}]', '{"query":{"page":2}}'],
  ),

  inspect: ex(
    `
// What is in the cache right now?
await api.users.byId("1").get.prefetch();
await api.users.byId("2").get.prefetch();
for (const query of nyx.queryClient.findAll()) {
  log(JSON.stringify(query.key), query.state.status, "updated at", query.state.dataUpdatedAt > 0);
}
`,
    ['["GET","/users/{id}",{"id":"1"}] success updated at true'],
  ),
} satisfies Record<string, Example>;

export type ExampleId = keyof typeof EXAMPLES;
