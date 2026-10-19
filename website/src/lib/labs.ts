/**
 * Data behind the interactive option labs in the docs. Each lab is a small program with
 * slots; every option offers choices that fill a slot, so a reader can switch one option at a
 * time and watch the real engine behave differently. `test/labs.test.ts` runs every choice of
 * every option against the mock API, so no choice here can be broken.
 */
export interface LabChoice {
  label: string;
  /** Code that fills the option's slot. Empty means "leave the option out" (its default). */
  code: string;
  /** What this choice does, shown under the code. */
  note: string;
}

export interface LabOption {
  name: string;
  type: string;
  default: string;
  summary: string;
  /** Which slot of the lab's program the choice fills. Defaults to `options`. */
  slot?: string;
  choices: LabChoice[];
}

export interface Lab {
  id: string;
  title: string;
  intro: string;
  /** The program. `{{options}}` receives the chosen option lines; other slots are named. */
  program: string;
  /** Strings the default (all options left out) run must print, in order. */
  expectDefault: string[];
  options: LabOption[];
}

const def = (note: string): LabChoice => ({ label: "default", code: "", note });

export const LABS = {
  query: {
    id: "query",
    title: "Query options",
    intro:
      "A user is observed twice, a moment apart, like two components that mount one after the other. Change an option and compare the status line and the request count.",
    program: `
const options = api.users.byId("1").get.options(undefined, {
{{options}}
});

const first = new core.QueryObserver(nyx.queryClient, options);
const stopFirst = first.subscribe(() => {});
await sleep(700);
const r = first.getResult();
log("status:", r.status, "| fetchStatus:", r.fetchStatus, "| placeholder:", r.isPlaceholder);
log("data:", r.data);
log("requests after the first observer:", server.requestCount());

// A second observer mounts: does it reuse the cache or ask again?
const second = new core.QueryObserver(nyx.queryClient, options);
const stopSecond = second.subscribe(() => {});
await sleep(700);
log("requests after a second observer mounted:", server.requestCount());
log("stale now:", second.getResult().isStale);
stopFirst();
stopSecond();
`,
    expectDefault: ["status: success", "requests after the first observer: 1"],
    options: [
      {
        name: "staleTime",
        type: "number",
        default: "0",
        summary: "Milliseconds that fetched data counts as fresh. Infinity means never stale.",
        choices: [
          def("Data is stale immediately, so the second observer refetches."),
          {
            label: "60 seconds",
            code: "  staleTime: 60_000,",
            note: "Fresh for a minute: the second observer is answered from the cache.",
          },
          {
            label: "Infinity",
            code: "  staleTime: Infinity,",
            note: "Never stale by time. Only invalidation or a manual refetch fetches again.",
          },
        ],
      },
      {
        name: "refetchOnMount",
        type: "boolean",
        default: "true",
        summary: "Whether a newly mounted observer refetches stale data.",
        choices: [
          def("A mounting observer refetches data that is stale."),
          {
            label: "false",
            code: "  refetchOnMount: false,",
            note: "A mounting observer uses whatever is cached, stale or not.",
          },
        ],
      },
      {
        name: "enabled",
        type: "boolean",
        default: "true",
        summary: "When false the observer never fetches by itself.",
        choices: [
          def("The observer fetches as soon as it subscribes."),
          {
            label: "false",
            code: "  enabled: false,",
            note: "Nothing is requested; the status stays pending and idle.",
          },
        ],
      },
      {
        name: "select",
        type: "(data) => selected",
        default: "identity",
        summary: "Derive the value the observer reports. The cache still holds the full response.",
        choices: [
          def("The observer reports the whole user."),
          {
            label: "name only",
            code: "  select: (user) => user.name,",
            note: "data becomes the name string. The cached user is unchanged.",
          },
        ],
      },
      {
        name: "initialData",
        type: "TData | () => TData",
        default: "none",
        summary: "Seeds the cache entry when it is first created. Ignored if the entry exists.",
        choices: [
          def("The entry starts empty and the first fetch fills it."),
          {
            label: "seeded user",
            code: '  initialData: { id: "1", name: "Seeded locally", email: "seed@example.test", role: "admin" },',
            note: "Data is available at once and counts as fetched now, so staleTime applies to it.",
          },
          {
            label: "seeded, an hour old",
            code:
              '  initialData: { id: "1", name: "Seeded locally", email: "seed@example.test", role: "admin" },\n' +
              "  initialDataUpdatedAt: Date.now() - 3_600_000,\n" +
              "  staleTime: 60_000,",
            note: "initialDataUpdatedAt makes the seed look old, so it is stale and a fetch replaces it.",
          },
        ],
      },
      {
        name: "placeholderData",
        type: "TData | (previous) => TData",
        default: "none",
        summary: "Shown while there is no data yet. Never written to the cache.",
        choices: [
          def("No data is shown until the response arrives."),
          {
            label: "placeholder user",
            code: '  placeholderData: { id: "1", name: "Loading…", email: "", role: "member" },',
            note: "Early results report isPlaceholder: true. The real response replaces it.",
          },
        ],
      },
      {
        name: "retry",
        type: "boolean | number | (count, error) => boolean",
        default: "3 transient retries",
        summary:
          "Retry policy for failed fetches. Turn on “Server returns 500” below to see it work.",
        choices: [
          def("Up to 3 retries for transient failures, with backoff."),
          {
            label: "false",
            code: "  retry: false,",
            note: "Fail on the first error.",
          },
          {
            label: "2, fast",
            code: "  retry: 2,\n  retryDelay: 100,",
            note: "Two retries 100 ms apart: three requests in total when the server is down.",
          },
        ],
      },
      {
        name: "refetchInterval",
        type: "number | false",
        default: "false",
        summary: "Poll while observed and enabled, every N milliseconds.",
        choices: [
          def("No polling."),
          {
            label: "every 250 ms",
            code: "  refetchInterval: 250,",
            note: "The request count keeps climbing while the observers are subscribed.",
          },
        ],
      },
      {
        name: "structuralSharing",
        type: "boolean",
        default: "false",
        summary: "Reuse unchanged parts of refetched data so references stay stable.",
        choices: [
          def("Each refetch replaces the data object."),
          {
            label: "true",
            code: "  structuralSharing: true,",
            note: "Identical refetched data keeps the same object identity, so memoized UI does not re-render.",
          },
        ],
      },
    ],
  },

  mutation: {
    id: "mutation",
    title: "Mutation options",
    intro:
      "Rename a user whose profile is already cached. Pick the name the server will accept or reject, then add callbacks and policies one at a time.",
    program: `
const qc = nyx.queryClient;
const key = api.users.byId("1").get.key();
await qc.fetchQuery(api.users.byId("1").get.options());

const rename = api.users.byId("1").patch.options(undefined, {
{{options}}
});

const name = {{name}};
const pending = qc.mutate(rename, { name }).catch((e) => e);
await sleep(50);
log("while in flight, cached name:", JSON.stringify(qc.getData(key).name));
const outcome = await pending;
log("outcome:", outcome instanceof Error ? "failed (" + outcome.status + ")" : "succeeded");
log("final cached name:", qc.getData(key).name);
log("requests:", server.requestCount());
`,
    expectDefault: ['while in flight, cached name: "Ada Lovelace"', "outcome: succeeded"],
    options: [
      {
        name: "variables",
        slot: "name",
        type: "TVariables",
        default: "n/a",
        summary: "The value passed to mutate(). Not an option: it picks what the server will do.",
        choices: [
          {
            label: "valid name",
            code: '"Ada, Countess of Lovelace"',
            note: "The server accepts it.",
          },
          {
            label: "empty name",
            code: '""',
            note: "The server answers 422, so you can watch error handling and rollback.",
          },
        ],
      },
      {
        name: "onMutate",
        type: "(variables, helpers) => context",
        default: "none",
        summary:
          "Runs before the request. Use helpers.optimistic to patch the cache; the patch is rolled back if the request fails.",
        choices: [
          def("The cache changes only after the server confirms."),
          {
            label: "optimistic patch",
            code: "  onMutate: (patch, { optimistic }) => {\n    optimistic(key, (old) => (old ? { ...old, ...patch } : old));\n  },",
            note: "The new name shows at once. On failure only this patch is undone.",
          },
        ],
      },
      {
        name: "onSuccess",
        type: "(data, variables, context, helpers) => unknown",
        default: "none",
        summary: "Runs after a successful response, before invalidation.",
        choices: [
          def("No callback."),
          {
            label: "log it",
            code: '  onSuccess: (data) => log("onSuccess:", data.name),',
            note: "Fires only when the request succeeds.",
          },
        ],
      },
      {
        name: "onError",
        type: "(error, variables, context, helpers) => unknown",
        default: "none",
        summary: "Runs when the request fails, after any optimistic patch is rolled back.",
        choices: [
          def("No callback."),
          {
            label: "log it",
            code: '  onError: (error) => log("onError:", error.status, error.body.message),',
            note: "Fires only when the request fails. Pick the empty name to see it.",
          },
        ],
      },
      {
        name: "onSettled",
        type: "(data, error, variables, context, helpers) => unknown",
        default: "none",
        summary: "Runs after success or failure, once.",
        choices: [
          def("No callback."),
          {
            label: "log it",
            code: '  onSettled: (data, error) => log("onSettled:", error ? "error" : "ok"),',
            note: "Always fires, whichever way the request ended.",
          },
        ],
      },
      {
        name: "invalidates",
        type: "keys | filters | (data, variables) => keys | filters",
        default: "none",
        summary:
          "Queries to invalidate after success. Active ones refetch and the mutation waits for them.",
        choices: [
          def("Nothing is refetched."),
          {
            label: "the user",
            code: "  invalidates: [key],",
            note: "The cached user refetches after success, so the request count goes up by one.",
          },
          {
            label: "every user query",
            code: '  invalidates: [{ queryKey: ["GET", "/users/{id}"] }],',
            note: "A prefix filter: every cached GET /users/{id} entry is invalidated.",
          },
        ],
      },
      {
        name: "retry",
        type: "{ idempotent: true, attempts, delay?, when? }",
        default: "no retries",
        summary:
          "Opt-in retries for requests that are safe to repeat. Turn on “Server returns 500” to see it.",
        choices: [
          def("A failed mutation is never retried automatically."),
          {
            label: "2 attempts",
            code: "  retry: { idempotent: true, attempts: 2, delay: 100 },",
            note: "Only transient failures retry (network, timeout, 408, 429, 5xx).",
          },
        ],
      },
      {
        name: "scope",
        type: "{ id: string }",
        default: "none",
        summary: "Mutations with the same scope id send their requests one after another.",
        choices: [
          def("Mutations run in parallel."),
          {
            label: "scope: user-1",
            code: '  scope: { id: "user-1" },',
            note: "Submits to the same scope queue up, in order.",
          },
        ],
      },
    ],
  },

  client: {
    id: "client",
    title: "Client options",
    intro:
      "Each run builds a fresh client and sends one request. The transport prints what actually leaves the client, so you can see headers and URLs change.",
    program: `
const seen = [];
const client = core.createNyxClient({
  baseUrl: "https://api.example.com/v1",
  transport: (request) => {
    seen.push(request.method + " " + request.url);
    log("sent:", request.method, request.url);
    log("  headers:", JSON.stringify(Object.fromEntries(request.headers)));
    return server.transport(request);
  },
{{options}}
});

try {
  const user = await client.http.request({
    method: "get",
    path: "{{path}}",
    params: { id: "1" },
  });
  log("got:", user.name);
} catch (error) {
  log("failed:", error.name + ":", error.message);
}
`,
    expectDefault: ["sent: GET https://api.example.com/v1/users/1", "got: Ada Lovelace"],
    options: [
      {
        name: "path",
        slot: "path",
        type: "string",
        default: "n/a",
        summary: "Not an option: the endpoint path the request uses.",
        choices: [
          { label: "/users/{id}", code: "/users/{id}", note: "A normal path under the base URL." },
          {
            label: "absolute URL",
            code: "https://evil.example/steal",
            note: "An absolute URL in a path. By default this is refused, so a path can never redirect a request off your origin.",
          },
        ],
      },
      {
        name: "headers",
        type: "Record<string, string>",
        default: "none",
        summary: "Headers sent with every request. Lowest precedence.",
        choices: [
          def("No extra headers."),
          {
            label: "API version header",
            code: '  headers: { "x-api-version": "2026-10-01" },',
            note: "Sent on every request made by this client.",
          },
        ],
      },
      {
        name: "getToken",
        type: "() => string | null | undefined | Promise<...>",
        default: "none",
        summary: "Called per request. A returned token is sent as Authorization: Bearer.",
        choices: [
          def("No Authorization header."),
          {
            label: "static token",
            code: '  getToken: () => "demo-token",',
            note: "Read lazily on each request, so a refreshed token is picked up without rebuilding the client.",
          },
          {
            label: "async token",
            code: '  getToken: async () => { await sleep(20); return "refreshed-token"; },',
            note: "May be async, for example to refresh an expired token first.",
          },
        ],
      },
      {
        name: "middleware",
        type: "Middleware[]",
        default: "none",
        summary: "Wrap every request and response, outermost first.",
        choices: [
          def("No middleware."),
          {
            label: "timing",
            code: '  middleware: [async (request, next) => {\n    const t = Date.now();\n    const response = await next(request);\n    log("middleware saw status", response.status, "after", Date.now() - t, "ms");\n    return response;\n  }],',
            note: "Sees the final response, including error statuses, before they are turned into errors.",
          },
        ],
      },
      {
        name: "timeoutMs",
        type: "number",
        default: "none",
        summary: "Abort a request that takes longer than this many milliseconds.",
        choices: [
          def("No timeout."),
          {
            label: "50 ms",
            code: "  timeoutMs: 50,",
            note: "The mock API takes 300 ms by default, so this request is aborted and fails.",
          },
        ],
      },
      {
        name: "maxResponseBytes",
        type: "number",
        default: "unlimited",
        summary: "Largest response body that will be read.",
        choices: [
          def("Any size is read."),
          {
            label: "20 bytes",
            code: "  maxResponseBytes: 20,",
            note: "A larger body is cancelled and rejects with ResponseTooLargeError.",
          },
        ],
      },
      {
        name: "allowAbsoluteUrls",
        type: "boolean",
        default: "false",
        summary: "DANGEROUS. Lets an absolute URL in a path leave the configured origin.",
        choices: [
          def("Absolute URLs are refused. Choose “absolute URL” above to see the error."),
          {
            label: "true",
            code: "  allowAbsoluteUrls: true,",
            note: "The request goes where the URL says, carrying any token with it. Generated clients never need this.",
          },
        ],
      },
      {
        name: "credentials",
        type: "RequestCredentials",
        default: "runtime default",
        summary:
          "Fetch credentials mode: whether browsers send cookies. Only for the pinned origin.",
        choices: [
          def("The runtime default."),
          {
            label: "include",
            code: '  credentials: "include",',
            note: "Needed for cookie sessions against a cross-origin API. The mock transport does not use cookies.",
          },
        ],
      },
    ],
  },

  request: {
    id: "request",
    title: "Request options",
    intro:
      "Send one request with different serialization settings and read the exact URL and body that go on the wire.",
    program: `
const client = core.createNyxClient({
  baseUrl: "https://api.example.com/v1",
  transport: async (request) => {
    log("sent:", request.method, decodeURIComponent(request.url.replace("https://api.example.com/v1", "")));
    const type = request.headers.get("content-type");
    if (type) log("  content-type:", type.split(";")[0]);
    const text = request.method === "GET" ? "" : await request.clone().text();
    if (text) log("  body:", text.slice(0, 80));
    return server.transport(request);
  },
});

try {
  await client.http.request({
    method: "get",
    path: "/users",
    query: { role: ["admin", "member"] },
{{options}}
  });
  log("ok");
} catch (error) {
  log("server answered:", error.status ?? error.name);
}
`,
    expectDefault: ["sent: GET /users?role=admin&role=member", "ok"],
    options: [
      {
        name: "queryStyles",
        type: "Record<string, QueryStyle>",
        default: "exploded",
        summary:
          "Per-parameter serialization: csv, space, pipe or deepObject. Unlisted parameters stay exploded.",
        choices: [
          def("role=admin&role=member"),
          {
            label: "csv",
            code: '    queryStyles: { role: "csv" },',
            note: "role=admin,member",
          },
          {
            label: "space",
            code: '    queryStyles: { role: "space" },',
            note: "role=admin member (a space, encoded as %20 or + on the wire).",
          },
          {
            label: "pipe",
            code: '    queryStyles: { role: "pipe" },',
            note: "role=admin|member",
          },
        ],
      },
      {
        name: "headers",
        type: "Record<string, string | number | boolean | undefined>",
        default: "none",
        summary: "Per-request headers. An undefined value removes a client-level header.",
        choices: [
          def("Only the client's headers."),
          {
            label: "one header",
            code: '    headers: { "x-request-id": "abc-123" },',
            note: "Sent on this request only.",
          },
        ],
      },
      {
        name: "timeoutMs",
        type: "number",
        default: "client timeout",
        summary: "Per-request timeout, overriding the client default.",
        choices: [
          def("No timeout."),
          {
            label: "50 ms",
            code: "    timeoutMs: 50,",
            note: "Aborts this request: the mock API takes 300 ms.",
          },
        ],
      },
      {
        name: "signal",
        type: "AbortSignal",
        default: "none",
        summary: "Cancel the request from outside.",
        choices: [
          def("Not cancellable."),
          {
            label: "already aborted",
            code: "    signal: AbortSignal.abort(),",
            note: "The request is cancelled before it is sent.",
          },
        ],
      },
    ],
  },

  infinite: {
    id: "infinite",
    title: "Infinite query options",
    intro:
      "A paged user list, two users per page. Load the next page twice, then see what each option kept or dropped.",
    program: `
const qc = nyx.queryClient;
const options = {
  queryKey: ["users", "paged"],
  initialPageParam: 1,
  queryFn: ({ pageParam, signal }) =>
    api.users.list.get({ query: { page: pageParam, limit: 1 }, signal }),
  getNextPageParam: (last, pages) => (pages.length < last.total ? pages.length + 1 : undefined),
{{options}}
};

const observer = new core.InfiniteQueryObserver(qc, options);
const stop = observer.subscribe(() => {});
await sleep(500);
await observer.getResult().fetchNextPage();
await observer.getResult().fetchNextPage();
const r = observer.getResult();
const names = r.data.pages.flatMap((p) => p.items).map((u) => u.name);
log("pages held:", r.data.pages.length, "| page params:", JSON.stringify(r.data.pageParams));
log("users:", names.join(", "));
log("hasNextPage:", r.hasNextPage, "| hasPreviousPage:", r.hasPreviousPage);
stop();
`,
    expectDefault: ["pages held: 3", "hasNextPage: true"],
    options: [
      {
        name: "maxPages",
        type: "number (integer ≥ 1)",
        default: "unlimited",
        summary: "Keep at most this many pages. Loading at one end drops the page at the other.",
        choices: [
          def("Every loaded page is kept in memory."),
          {
            label: "2",
            code: "  maxPages: 2,",
            note: "Only the two newest pages are held, so memory stays bounded.",
          },
        ],
      },
      {
        name: "getPreviousPageParam",
        type: "(first, all, firstParam, allParams) => param | undefined",
        default: "none",
        summary: "Parameter of the page before the first loaded one. Enables fetchPreviousPage.",
        choices: [
          def("hasPreviousPage is always false."),
          {
            label: "previous page number",
            code: "  getPreviousPageParam: (first, pages, firstParam) => (firstParam > 1 ? firstParam - 1 : undefined),",
            note: "Pages loaded after dropping from the front can be reloaded from the back.",
          },
        ],
      },
      {
        name: "initialPageParam",
        type: "TParam",
        default: "required",
        summary: "The parameter of the first page.",
        choices: [
          def("Starts at page 1."),
          {
            label: "start at page 2",
            code: "  initialPageParam: 2,",
            note: "The first page loaded is page 2.",
          },
        ],
      },
      {
        name: "select",
        type: "(data) => selected",
        default: "identity",
        summary: "Derive the value the observer reports. Here the result reshapes the pages.",
        choices: [
          def("The observer reports pages and pageParams."),
          {
            label: "reverse pages",
            code: "  select: (data) => ({ pages: [...data.pages].reverse(), pageParams: [...data.pageParams].reverse() }),",
            note: "Pages are reported newest first; the cache keeps its own order.",
          },
        ],
      },
    ],
  },
  errors: {
    id: "errors",
    title: "Failure explorer",
    intro:
      "Pick a way for a request to fail. The program catches it and prints which class NyxAPI raised and the fields you can branch on.",
    program: `
const failing = (transport, options = {}) =>
  core.createNyxClient({ baseUrl: "https://api.example.com/v1", transport, ...options });
const get = (client) =>
  client.http.request({ method: "get", path: "/users/{id}", params: { id: "1" } });

try {
{{failure}}
  log("no error was raised");
} catch (error) {
  log("class:", error.constructor.name);
  log("is NyxError:", error instanceof core.NyxError);
  log("status:", error.status ?? "none");
  log("retryable:", error.retryable === undefined ? "undecided (engine default)" : error.retryable);
  log("message:", error.message);
}
`,
    expectDefault: ["class: HttpError", "status: 404"],
    options: [
      {
        name: "failure",
        slot: "failure",
        type: "failure mode",
        default: "n/a",
        summary: "How the request goes wrong.",
        choices: [
          {
            label: "404 not found",
            code: '  await api.users.byId("99").get();',
            note: "HttpError. status and the parsed JSON body are available. Not retried.",
          },
          {
            label: "422 rejected",
            code: '  await api.users.byId("1").patch({ name: "" });',
            note: "HttpError with the server's validation message in body.",
          },
          {
            label: "401 bad login",
            code: '  await api.auth.login.post({ email: "ada@example.test", password: "wrong" });',
            note: "HttpError. Authentication failures are never retried.",
          },
          {
            label: "500 server error",
            code: '  server.failing = true;\n  await api.users.byId("1").get();',
            note: "HttpError with a 5xx status. The default query retry policy treats it as transient.",
          },
          {
            label: "network down",
            code: '  await get(failing(() => Promise.reject(new TypeError("fetch failed"))));',
            note: "NetworkError: the request never produced a response. Transient, so retried.",
          },
          {
            label: "timeout",
            code: "  server.latency = Math.max(server.latency, 150);\n  await get(failing(server.transport, { timeoutMs: 20 }));",
            note: "TimeoutError carries timeoutMs. Transient, so retried.",
          },
          {
            label: "response too large",
            code: "  await get(failing(server.transport, { maxResponseBytes: 10 }));",
            note: "ResponseTooLargeError. The body is cancelled, never read in full, and never retried.",
          },
          {
            label: "invalid JSON",
            code: '  await get(failing(() => Promise.resolve(new Response("not json", { status: 200 }))));',
            note: "ParseError: a 2xx body that is not the expected format.",
          },
          {
            label: "bad path parameter",
            code: '  await api.users.byId("..").get();',
            note: "RequestError, raised before anything is sent. A path parameter can never climb out of its segment.",
          },
          {
            label: "cancelled",
            code: '  const controller = new AbortController();\n  const call = api.users.byId("1").get({ signal: controller.signal });\n  controller.abort();\n  await call;',
            note: "Aborting with your own signal surfaces as the platform's AbortError (a DOMException), not a NyxError, so check for it separately. CancelledError is what query cancellation raises.",
          },
        ],
      },
    ],
  },
} satisfies Record<string, Lab>;

export type LabId = keyof typeof LABS;

export type Selection = Readonly<Record<string, number>>;

/** Build the program for a selection: choice index per option name (default 0). */
export function composeLab(lab: Lab, selection: Selection = {}): string {
  const slots = new Map<string, string[]>();
  for (const option of lab.options) {
    const choice = option.choices[selection[option.name] ?? 0] ?? option.choices[0];
    if (!choice) continue;
    const slot = option.slot ?? "options";
    const list = slots.get(slot) ?? [];
    if (choice.code !== "") list.push(choice.code);
    slots.set(slot, list);
  }
  let out = lab.program.replace(/^\n/, "");
  for (const [slot, lines] of slots) {
    if (slot === "options") continue;
    out = out.replace(`{{${slot}}}`, lines[0] ?? "");
  }
  const chosen = slots.get("options") ?? [];
  // With no option chosen the placeholder line disappears, so the program stays tidy.
  return chosen.length > 0
    ? out.replace("{{options}}", chosen.join("\n"))
    : out.replace(/\{\{options\}\}\n/, "");
}
