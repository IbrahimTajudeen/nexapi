/**
 * The NyxAPI video playlist: 30 episodes from first install to production. Each episode carries
 * everything a tutor needs to record it (goals, a timed outline, talking points, demo steps,
 * pitfalls, an exercise) and a code sample. Samples that name an `example` id are runnable on
 * the page and are executed by the site's tests, so a tutor can trust them on camera.
 * `test/tutorials.test.ts` checks structure, numbering, links and sample ids.
 */
import type { ExampleId } from "./lib/examples";
import type { GuideExampleId } from "./lib/guide-examples";

export type Level = "beginner" | "intermediate" | "advanced";
export type EpisodeStatus = "open" | "claimed" | "published";

export interface Module {
  id: string;
  title: string;
  level: Level;
  summary: string;
  outcome: string;
}

export type Sample =
  | { kind: "example"; id: ExampleId | GuideExampleId; note?: string }
  | {
      kind: "code";
      lang: "ts" | "tsx" | "bash" | "json" | "yaml";
      title: string;
      code: string;
      note?: string;
    };

export interface Segment {
  /** Start time as m:ss. */
  at: string;
  title: string;
  notes: string;
}

export interface Episode {
  number: number;
  slug: string;
  module: string;
  level: Level;
  minutes: number;
  title: string;
  summary: string;
  goals: string[];
  prerequisites: string[];
  outline: Segment[];
  samples: Sample[];
  tutor: {
    hook: string;
    talkingPoints: string[];
    demo: string[];
    pitfalls: string[];
    exercise: string;
    outro: string;
  };
  docs: { title: string; href: string }[];
  /** Maintainers update these when a video is claimed or published. */
  status: EpisodeStatus;
  tutorName?: string;
  videoUrl?: string;
  /** Set when the episode comes from the database and has a linked tutor profile. */
  tutorProfile?: { name: string; slug: string; avatarUrl: string | null };
  thumbnailUrl?: string;
}

export const MODULES: Module[] = [
  {
    id: "start",
    title: "Start here",
    level: "beginner",
    summary: "What NyxAPI is, how to install it, and your first typed calls.",
    outcome: "You can install NyxAPI, make a typed request and read a generated client.",
  },
  {
    id: "core",
    title: "Core concepts",
    level: "beginner",
    summary: "The fluent API, the cache, errors, mutations and pagination.",
    outcome: "You understand why data is cached, shared, refreshed and rolled back.",
  },
  {
    id: "manual",
    title: "No schema: manual endpoints and HTTP",
    level: "intermediate",
    summary: "Everything NyxAPI does when there is nothing to generate from.",
    outcome: "You can define, type and call any HTTP endpoint by hand.",
  },
  {
    id: "react",
    title: "React and server rendering",
    level: "intermediate",
    summary: "Hooks, Suspense, optimistic UI, hydration and Next.js.",
    outcome: "You can build a React or Next.js screen on the NyxAPI cache.",
  },
  {
    id: "schemas",
    title: "Schemas and code generation",
    level: "intermediate",
    summary: "The nyx command, Swagger, GraphQL, tRPC, validation and CI.",
    outcome: "You can generate and maintain clients for any supported schema.",
  },
  {
    id: "pro",
    title: "Professional NyxAPI",
    level: "advanced",
    summary: "Authentication, security, testing, performance and production.",
    outcome: "You can ship and operate a NyxAPI app with confidence.",
  },
];

const ep = (e: Omit<Episode, "status" | "slug"> & { slug: string }): Episode => ({
  ...e,
  status: "open",
});

const M1: Episode[] = [
  ep({
    number: 1,
    slug: "welcome",
    module: "start",
    level: "beginner",
    minutes: 7,
    title: "Welcome to NyxAPI: what it is and who it is for",
    summary:
      "A plain-language tour of the problem NyxAPI solves and what you get from one install.",
    goals: [
      "Explain NyxAPI in one sentence",
      "Name the three things it combines: a typed client, a cache and a React adapter",
      "Decide whether it fits your project",
    ],
    prerequisites: ["Basic JavaScript or TypeScript", "Know what an API is"],
    outline: [
      {
        at: "0:00",
        title: "The problem",
        notes: "Hand-written fetch calls, copied types, duplicate requests, spinners everywhere.",
      },
      {
        at: "1:30",
        title: "What NyxAPI is",
        notes: "A schema becomes a typed client; the client caches, retries and shares requests.",
      },
      {
        at: "3:00",
        title: "Live: one call",
        notes: "Run the example below on the docs page and read the output.",
      },
      {
        at: "5:00",
        title: "Who it is for",
        notes: "Teams with a schema (OpenAPI, Swagger, GraphQL), and people with none.",
      },
      { at: "6:15", title: "What is next", notes: "Show the playlist and the docs site." },
    ],
    samples: [
      {
        kind: "example",
        id: "firstCall",
        note: "Path segments become properties; {id} becomes a function call.",
      },
    ],
    tutor: {
      hook: "Every app has the same bug: three components, one user, three identical requests. Here is what happens when that stops being your problem.",
      talkingPoints: [
        "NyxAPI generates a fluent TypeScript client from OpenAPI, Swagger or GraphQL, and adapts tRPC.",
        "It has a standalone cache, so React is optional.",
        "Types come from the schema, so they cannot drift.",
        "It is pre-1.0 and open source (MIT): say so honestly.",
      ],
      demo: [
        "Open the docs introduction.",
        "Run the firstCall example on the Quick start or the playground.",
        "Show the generated types for the same call.",
      ],
      pitfalls: [
        "Do not compare speed with other libraries without citing the benchmarks page and its caveats.",
        "Do not promise features from the roadmap as if they exist.",
      ],
      exercise:
        "Write down one API your project calls today and list which of its calls are repeated across screens.",
      outro: "Next episode: install NyxAPI and make your first typed call.",
    },
    docs: [
      { title: "Introduction", href: "/docs/" },
      { title: "Quick start", href: "/docs/quick-start/" },
    ],
  }),
  ep({
    number: 2,
    slug: "install-first-call",
    module: "start",
    level: "beginner",
    minutes: 10,
    title: "Install NyxAPI and make your first typed call",
    summary: "From an empty folder and an OpenAPI file to a running, type-checked request.",
    goals: [
      "Install the packages with your package manager",
      "Generate a client with nyx generate",
      "Make a typed call and see the editor catch a mistake",
    ],
    prerequisites: ["Node 22.12 or later", "Episode 1"],
    outline: [
      { at: "0:00", title: "Check Node", notes: "node --version must be 22.12 or later." },
      {
        at: "1:00",
        title: "Install",
        notes: "Core and CLI; show the package-manager tabs on the install page.",
      },
      { at: "2:30", title: "nyx init", notes: "Writes nyx.config.json from a schema it finds." },
      {
        at: "4:00",
        title: "nyx generate",
        notes: "Walk through the generated folder and open types.ts.",
      },
      { at: "6:00", title: "First call", notes: "createNyxClient, createApi, then await a GET." },
      {
        at: "8:30",
        title: "Break it on purpose",
        notes: "Pass a wrong type and show the compile error.",
      },
    ],
    samples: [
      {
        kind: "code",
        lang: "bash",
        title: "terminal",
        code: `npm install @nyxapi/core\nnpm install -D @nyxapi/cli\nnpx nyx init --input ./openapi.yaml --output ./src/api\nnpx nyx generate`,
        note: "After a global install the command is just nyx.",
      },
      {
        kind: "code",
        lang: "ts",
        title: "src/index.ts",
        code: `import { createNyxClient } from "@nyxapi/core";\nimport { createApi } from "./api";\n\nconst nyx = createNyxClient({ baseUrl: "https://api.example.com/v1" });\nconst api = createApi(nyx);\n\nconst user = await api.users.byId("1").get();\nconsole.log(user.name);`,
      },
    ],
    tutor: {
      hook: "Five minutes from now you will have a typed client that knows every endpoint in your API.",
      talkingPoints: [
        "The CLI is called nyx; nyxapi works as an alias.",
        "nyx.config.json holds input, output and options.",
        "Generated code is committed and read-only.",
        "baseUrl pins the origin for every request.",
      ],
      demo: [
        "Install with the package manager you use.",
        "Run nyx init, then nyx generate.",
        "Open generated/types.ts and client.ts.",
        "Call an endpoint and hover the result type.",
        "Change an argument type to see the error.",
      ],
      pitfalls: [
        "Node older than 22.12 fails with confusing errors.",
        "Editing generated files: they are overwritten by the next generate.",
      ],
      exercise: "Generate a client from any OpenAPI file you have and make one call.",
      outro: "Next: the playground, where you can try everything without installing.",
    },
    docs: [
      { title: "Installation", href: "/docs/installation/" },
      { title: "Quick start", href: "/docs/quick-start/" },
      { title: "CLI", href: "/docs/cli/" },
    ],
  }),
  ep({
    number: 3,
    slug: "playground-tour",
    module: "start",
    level: "beginner",
    minutes: 6,
    title: "A tour of the playground IDE",
    summary:
      "Use the in-browser editor, terminal and mock API to experiment safely. Your files stay in your browser.",
    goals: [
      "Run and edit a live example",
      "Create files and run commands in the terminal",
      "Read the Output, Preview and Mock API panels, and use the latency and Server returns 500 controls",
    ],
    prerequisites: ["Episode 1"],
    outline: [
      {
        at: "0:00",
        title: "What the playground is",
        notes:
          "The real engine running in your browser against a mock API; nothing leaves the page.",
      },
      { at: "1:00", title: "Run an example", notes: "Single flight: five callers, one request." },
      { at: "2:30", title: "Edit and re-run", notes: "Change the number of callers." },
      {
        at: "3:30",
        title: "Break the server",
        notes: "Turn on Server returns 500 and watch retries.",
      },
      {
        at: "5:00",
        title: "The terminal and new projects",
        notes: "Run new generate, then nyx generate, and read the files it writes.",
      },
    ],
    samples: [{ kind: "example", id: "singleFlight" }],
    tutor: {
      hook: "You do not need to install anything to see how NyxAPI behaves. Let us break some things.",
      talkingPoints: [
        "Every runnable example on the site is executed by a test.",
        "The mock API lives in your browser.",
        "Latency and failure are controls, not luck.",
      ],
      demo: [
        "Open the playground and show the explorer, editor and panels.",
        "Run singleFlight and read Requests sent: 1.",
        "Change [1,2,3,4,5] to ten ids.",
        "Toggle failure in the Mock API panel and run the retries example from Docs examples.",
        "Reload the page to show that your files are still there.",
      ],
      pitfalls: [
        "Each run starts a fresh mock server, so state never carries over between runs.",
        "The playground transpiles TypeScript but does not type-check it.",
      ],
      exercise:
        "Predict how many requests the singleFlight example sends if you add a second, different user id. Then run it.",
      outro: "Next: how to read the code NyxAPI generates for you.",
    },
    docs: [
      { title: "Playground", href: "/playground/" },
      { title: "Queries and caching", href: "/docs/queries/" },
    ],
  }),
  ep({
    number: 4,
    slug: "read-generated-client",
    module: "start",
    level: "beginner",
    minutes: 9,
    title: "Reading a generated client",
    summary: "Understand the files nyx generate writes and how a path becomes a typed call.",
    goals: [
      "Name the generated files",
      "Map an OpenAPI path to a call",
      "Read a cache key and know what it identifies",
    ],
    prerequisites: ["Episode 2"],
    outline: [
      {
        at: "0:00",
        title: "The folder",
        notes: "types.ts, client.ts, index.ts, and shapes.ts when validation is on.",
      },
      {
        at: "1:30",
        title: "Paths to properties",
        notes: "/users/{id} becomes api.users.byId(id).",
      },
      {
        at: "3:30",
        title: "GET versus the rest",
        notes: "GET is a query endpoint; others are mutations.",
      },
      { at: "5:00", title: "Keys", notes: "Run the cacheKeys example." },
      {
        at: "7:30",
        title: "Determinism",
        notes: "Same schema, same output; nyx generate --check proves it.",
      },
    ],
    samples: [{ kind: "example", id: "cacheKeys" }],
    tutor: {
      hook: "Generated code should never be a mystery. In nine minutes you will be able to read all of it.",
      talkingPoints: [
        "Output is deterministic, so diffs are meaningful.",
        "A key is [METHOD, path template, path params, request?].",
        "A shorter key is a prefix that matches a family.",
        "Never edit generated files.",
      ],
      demo: [
        "Open client.ts beside the OpenAPI file.",
        "Find one operation in both.",
        "Run cacheKeys and match each key to a call.",
      ],
      pitfalls: ["Confusing a key prefix with an exact key when invalidating."],
      exercise:
        "Pick three operations in your schema and write their generated call and key by hand, then check.",
      outro: "Next: your first write, a mutation.",
    },
    docs: [
      { title: "The fluent API", href: "/docs/fluent-api/" },
      { title: "Code generation", href: "/docs/codegen/" },
    ],
  }),
  ep({
    number: 5,
    slug: "first-mutation",
    module: "start",
    level: "beginner",
    minutes: 8,
    title: "Your first mutation: sending data",
    summary:
      "POST a body, read the typed result and see why writes are treated differently from reads.",
    goals: [
      "Send a POST with a JSON body",
      "Explain why a mutation is never silently retried",
      "Handle a rejected request",
    ],
    prerequisites: ["Episode 4"],
    outline: [
      {
        at: "0:00",
        title: "Reads versus writes",
        notes: "Repeating a read is harmless; repeating an order is not.",
      },
      {
        at: "1:30",
        title: "A direct call",
        notes: "Run the login example: the body is the first argument.",
      },
      { at: "3:30", title: "A wrong password", notes: "Change the password and catch the 401." },
      { at: "5:30", title: "No automatic retries", notes: "Explain idempotency in one minute." },
      { at: "7:00", title: "What is next", notes: "Tease invalidation and optimistic updates." },
    ],
    samples: [{ kind: "example", id: "login" }],
    tutor: {
      hook: "Reading data is easy to get wrong gently. Writing data is easy to get wrong expensively.",
      talkingPoints: [
        "The body is the first argument.",
        "Mutations run once; retries are opt-in and must say idempotent: true.",
        "Errors are typed HttpError values with the server's body.",
      ],
      demo: [
        "Run the login example.",
        "Change the password to trigger a 401.",
        "Log error.status and error.body.",
      ],
      pitfalls: ["Assuming a timed-out POST did nothing."],
      exercise: "Call a POST in your own API and handle its most likely failure.",
      outro: "Next module: the core concepts behind the cache.",
    },
    docs: [
      { title: "Mutations", href: "/docs/mutations/" },
      { title: "Errors", href: "/docs/errors/" },
    ],
  }),
];

const M2: Episode[] = [
  ep({
    number: 6,
    slug: "fluent-api",
    module: "core",
    level: "beginner",
    minutes: 9,
    title: "The fluent API: paths become calls",
    summary:
      "How resource paths, parameters, query strings and bodies map to a typed, discoverable API.",
    goals: [
      "Navigate the resource tree with autocomplete",
      "Pass query parameters and path parameters correctly",
      "Use options, key, prefetch and invalidate",
    ],
    prerequisites: ["Episode 4"],
    outline: [
      { at: "0:00", title: "Navigation", notes: "api.users.byId('1').get" },
      {
        at: "2:00",
        title: "Query parameters",
        notes: "Run the list example; arrays repeat the parameter.",
      },
      {
        at: "4:00",
        title: "The four extras",
        notes: "options, key, prefetch, invalidate on every GET.",
      },
      { at: "6:30", title: "Naming and overrides", notes: "How the config renames operations." },
      { at: "8:00", title: "Recap", notes: "One screenshot of the cheat sheet." },
    ],
    samples: [{ kind: "example", id: "list" }],
    tutor: {
      hook: "Your editor can now answer 'what can I call?' without opening the docs.",
      talkingPoints: [
        "Path placeholders become function calls.",
        "Query and headers go in the request object.",
        "options(request, config) takes the request first and settings second.",
      ],
      demo: [
        "Type api. and open autocomplete.",
        "Run the list example with role filters.",
        "Print key() with and without a request.",
      ],
      pitfalls: [
        "Passing cache settings as the first argument of options(): use options(undefined, config).",
      ],
      exercise: "Find the generated call for your three most-used endpoints.",
      outro: "Next: how the cache decides when to ask the server again.",
    },
    docs: [
      { title: "The fluent API", href: "/docs/fluent-api/" },
      { title: "API reference", href: "/docs/api/" },
    ],
  }),
  ep({
    number: 7,
    slug: "queries-freshness",
    module: "core",
    level: "beginner",
    minutes: 10,
    title: "Queries and freshness: staleTime and gcTime",
    summary: "Understand when data is fresh, stale or garbage-collected, and how to tune it.",
    goals: [
      "Define staleTime and gcTime",
      "Predict whether a second fetch hits the network",
      "Choose a staleTime for different kinds of data",
    ],
    prerequisites: ["Episode 6"],
    outline: [
      { at: "0:00", title: "Fresh versus stale", notes: "Default staleTime is 0." },
      {
        at: "2:00",
        title: "Run the freshness example",
        notes: "Two fetches, one request; invalidate; two requests.",
      },
      { at: "5:00", title: "gcTime", notes: "Default five minutes; Infinity keeps data." },
      { at: "7:00", title: "Choosing values", notes: "Feeds, profiles, constants." },
      { at: "9:00", title: "Try every query option", notes: "Use the lab on the Queries page." },
    ],
    samples: [{ kind: "example", id: "freshness" }],
    tutor: {
      hook: "'Why did it refetch?' and 'why is it stale?' are the same question. After this, you can answer both.",
      talkingPoints: [
        "Stale does not mean wrong; it means worth re-checking.",
        "Invalidating marks data stale immediately.",
        "refetchOnMount, refetchOnWindowFocus and refetchOnReconnect refine when stale data is refreshed.",
      ],
      demo: [
        "Run freshness.",
        "Change staleTime to 0 and compare.",
        "Open the query-options lab and switch staleTime.",
      ],
      pitfalls: ["Setting staleTime to Infinity for data that does change."],
      exercise: "Assign a staleTime to five of your own data types and justify each.",
      outro: "Next: how identical requests are shared.",
    },
    docs: [{ title: "Queries and caching", href: "/docs/queries/" }],
  }),
  ep({
    number: 8,
    slug: "keys-single-flight",
    module: "core",
    level: "intermediate",
    minutes: 9,
    title: "Cache keys and single flight",
    summary: "How NyxAPI decides two requests are the same, and why that saves requests.",
    goals: [
      "Read and build keys",
      "Explain single flight",
      "Invalidate a family of queries with a prefix",
    ],
    prerequisites: ["Episode 7"],
    outline: [
      { at: "0:00", title: "What is a key", notes: "[METHOD, path, params, request?]" },
      { at: "2:00", title: "Single flight", notes: "Run singleFlight: five callers, one request." },
      { at: "4:30", title: "Key order does not matter", notes: "{a,b} equals {b,a}." },
      { at: "6:00", title: "Prefixes", notes: "Invalidate all variants of a list." },
      { at: "8:00", title: "Inspect the cache", notes: "findAll() lists entries." },
    ],
    samples: [
      { kind: "example", id: "singleFlight" },
      { kind: "example", id: "inspect" },
    ],
    tutor: {
      hook: "The fastest request is the one you never send. Keys are how NyxAPI knows which ones those are.",
      talkingPoints: [
        "Same key, same entry.",
        "Different request options, different entry.",
        "A shorter key matches a whole family.",
      ],
      demo: [
        "Run singleFlight.",
        "Run inspect and read the keys.",
        "Invalidate with and without a request.",
      ],
      pitfalls: ["Putting changing values such as timestamps into a key."],
      exercise:
        "Print the key for a filtered list and for the unfiltered list. Which invalidation touches both?",
      outro: "Next: typed errors and retries.",
    },
    docs: [
      { title: "Queries and caching", href: "/docs/queries/" },
      { title: "Techniques", href: "/docs/techniques/" },
    ],
  }),
  ep({
    number: 9,
    slug: "errors-retries",
    module: "core",
    level: "intermediate",
    minutes: 11,
    title: "Typed errors and retries",
    summary:
      "The error classes, which failures retry, and how to turn any failure into a helpful message.",
    goals: [
      "Name the NyxAPI error classes",
      "Narrow an HttpError by status",
      "Explain which failures retry by default",
    ],
    prerequisites: ["Episode 7"],
    outline: [
      {
        at: "0:00",
        title: "The taxonomy",
        notes: "HttpError, NetworkError, TimeoutError, ParseError and friends.",
      },
      { at: "2:00", title: "Failure explorer", notes: "Use the lab on the Errors page." },
      { at: "5:00", title: "Retries", notes: "Run retries and retryFlaky; transient only." },
      { at: "8:00", title: "One error function", notes: "Run explainErrors." },
      {
        at: "10:00",
        title: "Security note",
        notes: "Errors never contain headers or bodies of the request.",
      },
    ],
    samples: [
      { kind: "example", id: "typedError" },
      { kind: "example", id: "retryFlaky" },
      { kind: "example", id: "explainErrors" },
    ],
    tutor: {
      hook: "An error is a message to a human. Here is how to make sure the right one gets delivered.",
      talkingPoints: [
        "Every NyxAPI error extends NyxError.",
        "Queries retry network trouble, timeouts, 408, 429 and 5xx up to three times.",
        "ResponseTooLargeError is never retried.",
      ],
      demo: [
        "Try each failure in the explorer.",
        "Run retryFlaky and count requests.",
        "Run explainErrors.",
      ],
      pitfalls: ["Showing error.message to end users.", "Retrying a 404."],
      exercise: "Write the explain function for your own app's tone of voice.",
      outro: "Next: mutations that keep the cache honest.",
    },
    docs: [
      { title: "Errors", href: "/docs/errors/" },
      { title: "API reference", href: "/docs/api/" },
    ],
  }),
  ep({
    number: 10,
    slug: "mutations-invalidation",
    module: "core",
    level: "intermediate",
    minutes: 10,
    title: "Mutations and invalidation",
    summary: "Run a write, then tell the cache which reads it made stale.",
    goals: [
      "Use options() with the query client's mutate",
      "List what a write invalidates",
      "Order writes with a scope",
    ],
    prerequisites: ["Episode 5", "Episode 8"],
    outline: [
      {
        at: "0:00",
        title: "Lifecycle",
        notes: "onMutate, request, onSuccess or onError, onSettled.",
      },
      {
        at: "2:30",
        title: "invalidates",
        notes: "Run manualMutation: create then refetch the list.",
      },
      { at: "5:30", title: "Scopes", notes: "Writes with the same scope id run in order." },
      {
        at: "7:30",
        title: "Try every mutation option",
        notes: "Use the lab on the Mutations page.",
      },
    ],
    samples: [{ kind: "example", id: "manualMutation" }],
    tutor: {
      hook: "After a write, something on screen is out of date. NyxAPI can refresh it for you if you say what.",
      talkingPoints: [
        "invalidates takes keys or filters, or a function that returns them.",
        "Active queries refetch and the mutation waits for them.",
        "A scope serialises requests for one resource.",
      ],
      demo: [
        "Run manualMutation.",
        "Remove invalidates and compare.",
        "Use the lab to toggle callbacks.",
      ],
      pitfalls: ["Invalidating too broadly.", "Forgetting to invalidate at all."],
      exercise:
        "Write the invalidates list for creating, renaming and deleting a user in your app.",
      outro: "Next: optimistic updates, the nicest part.",
    },
    docs: [{ title: "Mutations", href: "/docs/mutations/" }],
  }),
  ep({
    number: 11,
    slug: "optimistic-rollback",
    module: "core",
    level: "intermediate",
    minutes: 11,
    title: "Optimistic updates and safe rollback",
    summary:
      "Show the result before the server answers, and undo exactly your own change if it fails.",
    goals: [
      "Use helpers.optimistic in onMutate",
      "Explain transactions and rollback",
      "Handle the failure case in the UI",
    ],
    prerequisites: ["Episode 10"],
    outline: [
      { at: "0:00", title: "Why optimistic", notes: "Latency feels like lag." },
      { at: "2:00", title: "The success path", notes: "Run optimistic." },
      {
        at: "5:00",
        title: "The failure path",
        notes: "Run rollback: a 422 restores the old name.",
      },
      { at: "8:00", title: "Why it is safe", notes: "Each patch is its own transaction." },
      { at: "10:00", title: "Tell the user", notes: "Always surface onError." },
    ],
    samples: [
      { kind: "example", id: "optimistic" },
      { kind: "example", id: "rollback" },
    ],
    tutor: {
      hook: "The best loading spinner is the one that never shows. The risk is lying to the user. Here is how to do it honestly.",
      talkingPoints: [
        "optimistic returns a transaction with rollback() and commit().",
        "Only your patch is undone, not other changes.",
        "Server data underneath is never overwritten by a patch.",
      ],
      demo: [
        "Run optimistic and note the in-flight value.",
        "Run rollback and compare.",
        "Add an onError log.",
      ],
      pitfalls: ["No error message after a rollback."],
      exercise: "Add an optimistic rename to a list item and force a failure.",
      outro: "Next: paging through long lists.",
    },
    docs: [{ title: "Mutations", href: "/docs/mutations/" }],
  }),
  ep({
    number: 12,
    slug: "pagination",
    module: "core",
    level: "intermediate",
    minutes: 9,
    title: "Pagination and infinite queries",
    summary: "Load pages on demand, in both directions, with bounded memory.",
    goals: ["Use InfiniteQueryObserver", "Write getNextPageParam", "Bound memory with maxPages"],
    prerequisites: ["Episode 7"],
    outline: [
      { at: "0:00", title: "Pages versus infinite", notes: "Two UX patterns, one engine." },
      { at: "2:00", title: "Run pagination", notes: "Two pages, hasNextPage false." },
      {
        at: "5:00",
        title: "Previous pages and maxPages",
        notes: "Use the lab on the Pagination page.",
      },
      { at: "7:30", title: "In React", notes: "useInfiniteQuery adds fetchNextPage." },
    ],
    samples: [{ kind: "example", id: "pagination" }],
    tutor: {
      hook: "A list with ten thousand rows is a page with ten. Here is how to ship that.",
      talkingPoints: [
        "getNextPageParam returns the next parameter or undefined.",
        "A refetch re-requests all loaded pages.",
        "maxPages keeps memory bounded.",
      ],
      demo: [
        "Run pagination.",
        "Use the lab to set maxPages to 2.",
        "Show hasPreviousPage with getPreviousPageParam.",
      ],
      pitfalls: ["Unbounded pages in long sessions."],
      exercise: "Page a list in your app with a page size of 20.",
      outro: "Next module: no schema? No problem.",
    },
    docs: [
      { title: "Pagination", href: "/docs/pagination/" },
      { title: "React", href: "/docs/react/" },
    ],
  }),
];

const M3: Episode[] = [
  ep({
    number: 13,
    slug: "no-schema-manual-get",
    module: "manual",
    level: "intermediate",
    minutes: 10,
    title: "No schema? Define an endpoint by hand",
    summary: "Create a typed query for any URL with nyx.query, and know when to reach for it.",
    goals: [
      "Define a GET endpoint with nyx.query",
      "Type the request and the response",
      "Decide between manual and generated endpoints",
    ],
    prerequisites: ["Episode 7"],
    outline: [
      {
        at: "0:00",
        title: "When there is no schema",
        notes: "Legacy APIs, third parties, prototypes.",
      },
      { at: "1:30", title: "nyx.query", notes: "Run manualQuery: path, method, type parameters." },
      { at: "5:00", title: "Typed in one place", notes: "Wrap it in a function and export it." },
      {
        at: "7:30",
        title: "Manual versus generated",
        notes: "Manual endpoints are not validated against a schema.",
      },
    ],
    samples: [
      { kind: "example", id: "manualQuery" },
      { kind: "example", id: "manualFactory" },
    ],
    tutor: {
      hook: "Not every API ships an OpenAPI file. NyxAPI works just as well without one.",
      talkingPoints: [
        "Manual endpoints get the same cache, retries and hooks.",
        "You supply the types, so keep them in one module.",
        "Generate from a schema as soon as one exists.",
      ],
      demo: [
        "Run manualQuery.",
        "Open the manual docs page and the endpoint lab.",
        "Change the path and method.",
      ],
      pitfalls: ["Scattering inline types across components."],
      exercise: "Define a manual endpoint for a public API of your choice and call it twice.",
      outro: "Next: every HTTP method, body and response kind.",
    },
    docs: [{ title: "Manual endpoints", href: "/docs/manual/" }],
  }),
  ep({
    number: 14,
    slug: "http-methods-bodies",
    module: "manual",
    level: "intermediate",
    minutes: 12,
    title: "HTTP methods, bodies and responses",
    summary: "GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS, JSON, forms, files and text.",
    goals: [
      "Call each HTTP method",
      "Send JSON, form and multipart bodies",
      "Read JSON, text and binary responses",
    ],
    prerequisites: ["Episode 13"],
    outline: [
      { at: "0:00", title: "The request builder", notes: "nyx.http.request(spec)." },
      { at: "2:00", title: "Methods", notes: "Run httpMethods against the echo route." },
      { at: "5:00", title: "Bodies", notes: "Run bodyKinds." },
      { at: "8:00", title: "Responses", notes: "Run responseKinds." },
      { at: "10:30", title: "HTTP lab", notes: "Combine method, body and headers." },
    ],
    samples: [
      { kind: "example", id: "httpMethods" },
      { kind: "example", id: "bodyKinds" },
      { kind: "example", id: "responseKinds" },
    ],
    tutor: {
      hook: "HTTP is eight words and a few headers. Let us read them all.",
      talkingPoints: [
        "Content-Type is set for you from the body kind.",
        "HEAD has no body; OPTIONS answers 204 in the demo.",
        "Responses are parsed by Content-Type.",
      ],
      demo: ["Run each example and read the echo.", "Use the HTTP lab."],
      pitfalls: ["Setting Content-Type by hand on multipart."],
      exercise: "Send the same payload as JSON and as a form and compare the echoes.",
      outro: "Next: query strings and headers in depth.",
    },
    docs: [{ title: "HTTP requests", href: "/docs/http/" }],
  }),
  ep({
    number: 15,
    slug: "query-strings-headers",
    module: "manual",
    level: "intermediate",
    minutes: 9,
    title: "Query strings, headers and precedence",
    summary: "Arrays, nested values, undefined, and which header wins.",
    goals: [
      "Serialise arrays and objects in a query",
      "Explain header precedence",
      "Skip undefined values",
    ],
    prerequisites: ["Episode 14"],
    outline: [
      { at: "0:00", title: "Query styles", notes: "Run queryStyles." },
      {
        at: "3:00",
        title: "Header precedence",
        notes: "Run headerPrecedence: request beats client.",
      },
      { at: "6:00", title: "getToken", notes: "Authorization: Bearer from a function." },
      { at: "8:00", title: "Recap", notes: "Undefined values are skipped, not removed." },
    ],
    samples: [
      { kind: "example", id: "queryStyles" },
      { kind: "example", id: "headerPrecedence" },
    ],
    tutor: {
      hook: "Half of all API bugs are a header or a query string. Here is how to see both.",
      talkingPoints: [
        "Arrays repeat the parameter.",
        "Per-request headers override client headers.",
        "An undefined header is skipped; it does not delete a client header.",
      ],
      demo: ["Run both examples and read the echo."],
      pitfalls: ["Assuming undefined removes a header."],
      exercise: "Predict the echoed headers before running your own variant.",
      outro: "Next: custom fetchers and operations.",
    },
    docs: [
      { title: "HTTP requests", href: "/docs/http/" },
      { title: "Manual endpoints", href: "/docs/manual/" },
    ],
  }),
  ep({
    number: 16,
    slug: "custom-fetchers",
    module: "manual",
    level: "advanced",
    minutes: 10,
    title: "Custom fetchers and operations beyond HTTP",
    summary:
      "Use any async function, such as a WebSocket, a database or a file, as a cached query.",
    goals: [
      "Write a custom queryFn",
      "Create an operation with createQueryOperation",
      "Know what you keep: cache, dedupe and retries",
    ],
    prerequisites: ["Episode 13"],
    outline: [
      { at: "0:00", title: "Why", notes: "The cache does not care where data comes from." },
      { at: "2:00", title: "customFetcher", notes: "Run the example." },
      { at: "5:30", title: "customOperation", notes: "Wrap it for reuse." },
      { at: "8:30", title: "Limits", notes: "You own errors and types." },
    ],
    samples: [
      { kind: "example", id: "customFetcher" },
      { kind: "example", id: "customOperation" },
    ],
    tutor: {
      hook: "If it returns a promise, NyxAPI can cache it.",
      talkingPoints: [
        "The key identifies the data, the function fetches it.",
        "Cancellation arrives through the signal argument.",
      ],
      demo: ["Run both examples."],
      pitfalls: ["Ignoring the abort signal."],
      exercise: "Cache the result of a local async function.",
      outro: "Next module: React.",
    },
    docs: [
      { title: "Manual endpoints", href: "/docs/manual/" },
      { title: "Techniques", href: "/docs/techniques/" },
    ],
  }),
];

const M4: Episode[] = [
  ep({
    number: 17,
    slug: "react-setup",
    module: "react",
    level: "intermediate",
    minutes: 9,
    title: "React setup: NyxProvider and useQuery",
    summary: "Install the React adapter and render server data in a component.",
    goals: [
      "Wrap an app in NyxProvider",
      "Use useQuery for loading, error and data",
      "Share one request between components",
    ],
    prerequisites: ["Episode 7"],
    outline: [
      { at: "0:00", title: "Install", notes: "@nyxapi/react beside core." },
      { at: "1:30", title: "Provider", notes: "One client for the tree." },
      { at: "3:00", title: "useQuery", notes: "Branch on isPending and error." },
      { at: "6:30", title: "Sharing", notes: "Two components, one request." },
    ],
    samples: [
      {
        kind: "code",
        lang: "tsx",
        title: "UserCard.tsx",
        code: `import { NyxProvider, useQuery } from "@nyxapi/react";
import { nyx, api } from "./nyx";

function UserCard({ id }: { id: string }) {
  const user = useQuery(api.users.byId(id).options());
  if (user.isPending) return <p>Loading...</p>;
  if (user.error) return <p>Something went wrong.</p>;
  return <h2>{user.data.name}</h2>;
}

export const App = () => (
  <NyxProvider client={nyx}>
    <UserCard id="1" />
    <UserCard id="1" />
  </NyxProvider>
);`,
        note: "Adapt the import path of your nyx module to your project.",
      },
    ],
    tutor: {
      hook: "Two components, one request, no state management code.",
      talkingPoints: [
        "The provider only supplies the client.",
        "Options objects come from the generated client.",
      ],
      demo: ["Build the component in a Vite app.", "Open the Network tab and show one request."],
      pitfalls: ["Creating a new client on every render."],
      exercise: "Show the same user in a header and a profile card.",
      outro: "Next: Suspense and mutations in React.",
    },
    docs: [
      { title: "React", href: "/docs/react/" },
      { title: "React and Vite", href: "/docs/integrations/react-vite/" },
    ],
  }),
  ep({
    number: 18,
    slug: "react-mutations-suspense",
    module: "react",
    level: "intermediate",
    minutes: 11,
    title: "useMutation, Suspense and error boundaries",
    summary: "Forms that write, screens that suspend, and failures that stay contained.",
    goals: [
      "Use useMutation with invalidates",
      "Use useSuspenseQuery with a boundary",
      "Show pending and error states in forms",
    ],
    prerequisites: ["Episode 17", "Episode 10"],
    outline: [
      { at: "0:00", title: "useMutation", notes: "mutate, isPending, error." },
      { at: "4:00", title: "Suspense", notes: "useSuspenseQuery removes the pending branch." },
      { at: "7:00", title: "Error boundaries", notes: "Throwing queries need a boundary." },
      { at: "9:30", title: "Choosing", notes: "Suspense for screens, flags for widgets." },
    ],
    samples: [
      {
        kind: "code",
        lang: "tsx",
        title: "NewUser.tsx",
        code: `import { useMutation } from "@nyxapi/react";
import { api } from "./nyx";

export function NewUser() {
  const create = useMutation(api.users.create.options());
  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate({ name: "Ada" }); }}>
      <button disabled={create.isPending}>Create</button>
      {create.error && <p role="alert">Could not create the user.</p>}
    </form>
  );
}`,
        note: "Confirm the generated operation name in your own client.",
      },
    ],
    tutor: {
      hook: "Every form has three states you forget: waiting, failed and done.",
      talkingPoints: ["Disable the button while pending.", "Use role=alert for errors."],
      demo: ["Build the form and break the server."],
      pitfalls: ["Suspense without an error boundary."],
      exercise: "Add a boundary around a suspending list.",
      outro: "Next: optimistic UI in React.",
    },
    docs: [{ title: "React", href: "/docs/react/" }],
  }),
  ep({
    number: 19,
    slug: "react-optimistic-infinite",
    module: "react",
    level: "advanced",
    minutes: 12,
    title: "Optimistic UI and infinite lists in React",
    summary: "Combine optimistic updates with useInfiniteQuery for a responsive feed.",
    goals: [
      "Apply an optimistic update from a hook",
      "Render pages from useInfiniteQuery",
      "Handle rollback in the UI",
    ],
    prerequisites: ["Episode 11", "Episode 12", "Episode 18"],
    outline: [
      { at: "0:00", title: "The feed", notes: "Pages flatten into one list." },
      { at: "4:00", title: "Optimistic like", notes: "onMutate patches the page cache." },
      { at: "8:00", title: "Failure", notes: "Roll back and notify." },
    ],
    samples: [{ kind: "example", id: "optimisticCreate" }],
    tutor: {
      hook: "A like button should feel instant even on a train.",
      talkingPoints: ["Patch the cached list, not component state.", "Always handle onError."],
      demo: ["Run optimisticCreate, then discuss the React version."],
      pitfalls: ["Mutating cached data in place."],
      exercise: "Add optimistic delete to a list.",
      outro: "Next: server rendering with Next.js.",
    },
    docs: [
      { title: "Techniques", href: "/docs/techniques/" },
      { title: "React", href: "/docs/react/" },
    ],
  }),
  ep({
    number: 20,
    slug: "nextjs-hydration",
    module: "react",
    level: "advanced",
    minutes: 12,
    title: "Server rendering and hydration with Next.js",
    summary:
      "Prefetch on the server, dehydrate the cache, hydrate on the client. A pattern, not a package.",
    goals: [
      "Prefetch with a per-request client",
      "Dehydrate and hydrate the cache",
      "Avoid sharing one client across users",
    ],
    prerequisites: ["Episode 17"],
    outline: [
      { at: "0:00", title: "The idea", notes: "Server fetches, client starts warm." },
      { at: "3:00", title: "Per-request clients", notes: "Run perUserClients." },
      { at: "6:00", title: "dehydrate and hydrate", notes: "Walk the Next.js guide." },
      { at: "10:00", title: "Be honest", notes: "There is no dedicated Next.js package yet." },
    ],
    samples: [{ kind: "example", id: "perUserClients" }],
    tutor: {
      hook: "Fast first paint without a second fetch.",
      talkingPoints: [
        "Never share a client between requests.",
        "The Next.js guide is a pattern built on dehydrate and hydrate.",
      ],
      demo: ["Follow the Next.js integration page in a fresh app."],
      pitfalls: ["A module-level client on the server."],
      exercise: "Prefetch one page and confirm no client request fires.",
      outro: "Next module: schemas and code generation.",
    },
    docs: [
      { title: "Next.js", href: "/docs/integrations/nextjs/" },
      { title: "React", href: "/docs/react/" },
    ],
  }),
];

const M5: Episode[] = [
  ep({
    number: 21,
    slug: "cli-config",
    module: "schemas",
    level: "intermediate",
    minutes: 10,
    title: "The nyx CLI and nyx.config.json",
    summary: "init, generate, watch, check and validate, plus the config file.",
    goals: [
      "Use generate, --watch and --check",
      "Validate a schema before generating",
      "Read every config option",
    ],
    prerequisites: ["Episode 2"],
    outline: [
      { at: "0:00", title: "Commands", notes: "init, generate, validate." },
      { at: "3:00", title: "Watch mode", notes: "Regenerate on schema change." },
      { at: "5:00", title: "Check mode", notes: "Fails CI if generated code is stale." },
      { at: "7:30", title: "Config", notes: "Open the CLI page option table." },
    ],
    samples: [
      {
        kind: "code",
        lang: "bash",
        title: "terminal",
        code: `nyx validate ./openapi.yaml
nyx generate --watch
nyx generate --check`,
      },
    ],
    tutor: {
      hook: "One command keeps your client and your API in lockstep.",
      talkingPoints: [
        "validate takes the path or URL positionally.",
        "--check exits non-zero when output would change.",
      ],
      demo: ["Edit the schema with watch running."],
      pitfalls: ["Forgetting to commit generated output."],
      exercise: "Add generate --check to a script in package.json.",
      outro: "Next: Swagger and OpenAPI details.",
    },
    docs: [
      { title: "CLI", href: "/docs/cli/" },
      { title: "Configuration", href: "/docs/config/" },
    ],
  }),
  ep({
    number: 22,
    slug: "openapi-swagger",
    module: "schemas",
    level: "intermediate",
    minutes: 10,
    title: "OpenAPI and Swagger in practice",
    summary: "Real-world schemas: references, tags, enums and what the generator does with them.",
    goals: [
      "Generate from OpenAPI 3 and Swagger 2",
      "Understand how tags and operationIds name calls",
      "Handle unusual schemas",
    ],
    prerequisites: ["Episode 21"],
    outline: [
      { at: "0:00", title: "Inputs", notes: "File or URL; JSON or YAML." },
      { at: "3:00", title: "Naming", notes: "operationId, tags and overrides." },
      { at: "6:30", title: "Edge cases", notes: "Unions, enums and nullable." },
    ],
    samples: [
      {
        kind: "code",
        lang: "bash",
        title: "terminal",
        code: `nyx generate --input https://example.com/openapi.json --output ./src/api`,
      },
    ],
    tutor: {
      hook: "Your schema is a contract. Let us read it like one.",
      talkingPoints: ["Read the codegen page for supported features.", "State limits honestly."],
      demo: ["Generate from a public schema."],
      pitfalls: ["Schemas without operationIds produce long names."],
      exercise: "Add operationIds to a schema and regenerate.",
      outro: "Next: GraphQL and tRPC.",
    },
    docs: [{ title: "Code generation", href: "/docs/codegen/" }],
  }),
  ep({
    number: 23,
    slug: "graphql-trpc",
    module: "schemas",
    level: "intermediate",
    minutes: 11,
    title: "GraphQL and tRPC adapters",
    summary: "Use the same cache with GraphQL operations and a tRPC router.",
    goals: [
      "Run a GraphQL query through NyxAPI",
      "Adapt a tRPC client",
      "Know what each adapter does not do",
    ],
    prerequisites: ["Episode 7"],
    outline: [
      { at: "0:00", title: "GraphQL", notes: "@nyxapi/graphql." },
      { at: "5:00", title: "tRPC", notes: "@nyxapi/trpc." },
      { at: "9:00", title: "Limits", notes: "Read each package's README." },
    ],
    samples: [
      {
        kind: "code",
        lang: "ts",
        title: "graphql.ts",
        code: `// Follow the API in the @nyxapi/graphql README for your installed version.\nimport * as graphql from "@nyxapi/graphql";\nconsole.log(Object.keys(graphql));`,
        note: "Lists the real exports so you can narrate them on camera.",
      },
    ],
    tutor: {
      hook: "One cache, three kinds of API.",
      talkingPoints: [
        "Check the package README on camera; versions move.",
        "Do not claim features not in the README.",
      ],
      demo: ["Install each package and print its exports."],
      pitfalls: ["Copying API shapes from memory."],
      exercise: "Run one operation through each adapter.",
      outro: "Next: runtime validation and CI.",
    },
    docs: [{ title: "GraphQL and tRPC", href: "/docs/graphql/" }],
  }),
  ep({
    number: 24,
    slug: "validation-ci",
    module: "schemas",
    level: "advanced",
    minutes: 10,
    title: "Runtime validation and CI",
    summary:
      "Check responses against the schema at runtime and fail CI when generated code drifts.",
    goals: [
      "Enable response validation",
      "Use generate --check in CI",
      "Read the CI integration page",
    ],
    prerequisites: ["Episode 21"],
    outline: [
      { at: "0:00", title: "Why validate", notes: "Servers drift." },
      { at: "3:00", title: "Enabling", notes: "Config option and ParseError." },
      { at: "6:00", title: "CI", notes: "Walk the workflow on the CI page." },
    ],
    samples: [
      {
        kind: "code",
        lang: "yaml",
        title: ".github/workflows/ci.yml",
        code: `- run: pnpm install --frozen-lockfile\n- run: pnpm nyx generate --check`,
      },
    ],
    tutor: {
      hook: "Types prove what you wrote. Validation proves what you got.",
      talkingPoints: ["Validation costs CPU; say so.", "Never claim results you did not measure."],
      demo: ["Return a wrong shape from the mock and catch it."],
      pitfalls: ["Validating huge payloads on hot paths."],
      exercise: "Add the check to your CI.",
      outro: "Next module: professional practice.",
    },
    docs: [
      { title: "CI", href: "/docs/integrations/ci/" },
      { title: "Code generation", href: "/docs/codegen/" },
    ],
  }),
];

const M6: Episode[] = [
  ep({
    number: 25,
    slug: "authentication",
    module: "pro",
    level: "advanced",
    minutes: 12,
    title: "Authentication and token refresh",
    summary: "Bearer tokens, refreshing on 401 and doing it once for many callers.",
    goals: ["Use getToken", "Refresh on 401 with middleware", "Avoid refresh stampedes"],
    prerequisites: ["Episode 15"],
    outline: [
      { at: "0:00", title: "getToken", notes: "Run headers example." },
      { at: "3:00", title: "Refresh", notes: "Run tokenRefresh." },
      { at: "8:00", title: "Security", notes: "Storage, cookies and logs." },
    ],
    samples: [{ kind: "example", id: "tokenRefresh" }],
    tutor: {
      hook: "An expired token should be a non-event.",
      talkingPoints: ["Refresh once, share the promise.", "Never log tokens."],
      demo: ["Run tokenRefresh against /me."],
      pitfalls: ["Infinite refresh loops."],
      exercise: "Add a retry limit to your refresh flow.",
      outro: "Next: testing without a network.",
    },
    docs: [
      { title: "Authentication", href: "/docs/integrations/auth/" },
      { title: "Security", href: "/docs/security/" },
    ],
  }),
  ep({
    number: 26,
    slug: "testing",
    module: "pro",
    level: "advanced",
    minutes: 11,
    title: "Testing code that uses NyxAPI",
    summary: "Swap the transport, fake routes and assert on requests.",
    goals: ["Replace the transport in tests", "Fake routes", "Assert request counts"],
    prerequisites: ["Episode 8"],
    outline: [
      { at: "0:00", title: "Why not mock fetch", notes: "A transport is one clear seam." },
      { at: "3:00", title: "testingTransport", notes: "Run it." },
      { at: "6:30", title: "fakeRoutes", notes: "Run it." },
    ],
    samples: [
      { kind: "example", id: "testingTransport" },
      { kind: "example", id: "fakeRoutes" },
    ],
    tutor: {
      hook: "Fast, deterministic tests without a server.",
      talkingPoints: ["Create a client per test.", "Disable retries in tests."],
      demo: ["Run both examples."],
      pitfalls: ["Sharing a client between tests."],
      exercise: "Test one component with a fake route.",
      outro: "Next: performance.",
    },
    docs: [{ title: "Testing", href: "/docs/integrations/testing/" }],
  }),
  ep({
    number: 27,
    slug: "performance",
    module: "pro",
    level: "advanced",
    minutes: 10,
    title: "Performance: prefetch, polling and cancellation",
    summary: "Make screens feel fast and stop wasting requests.",
    goals: ["Prefetch on intent", "Poll safely", "Cancel stale requests"],
    prerequisites: ["Episode 8"],
    outline: [
      { at: "0:00", title: "Prefetch", notes: "Run prefetch." },
      { at: "3:00", title: "Polling", notes: "Run polling." },
      { at: "6:00", title: "Cancellation", notes: "Run cancelStale." },
      { at: "8:30", title: "Benchmarks", notes: "Cite the benchmarks page with its caveats." },
    ],
    samples: [
      { kind: "example", id: "prefetch" },
      { kind: "example", id: "polling" },
      { kind: "example", id: "cancelStale" },
    ],
    tutor: {
      hook: "Speed is mostly requests you do not send.",
      talkingPoints: ["Measure before claiming improvements.", "Quote only published benchmarks."],
      demo: ["Run the three examples and watch the network log."],
      pitfalls: ["Polling a hidden tab."],
      exercise: "Add hover prefetch to a link.",
      outro: "Next: devtools and debugging.",
    },
    docs: [
      { title: "Techniques", href: "/docs/techniques/" },
      { title: "Benchmarks", href: "/docs/benchmarks/" },
    ],
  }),
  ep({
    number: 28,
    slug: "devtools",
    module: "pro",
    level: "intermediate",
    minutes: 8,
    title: "Devtools and debugging",
    summary: "Inspect the cache, redact secrets and find out why something refetched.",
    goals: ["Mount NyxDevtools", "Redact sensitive data", "Inspect entries"],
    prerequisites: ["Episode 17"],
    outline: [
      { at: "0:00", title: "Install", notes: "@nyxapi/devtools." },
      { at: "2:00", title: "Props", notes: "client, force, defaultOpen, redact." },
      { at: "5:00", title: "Debug a refetch", notes: "Read the entry state." },
    ],
    samples: [
      {
        kind: "code",
        lang: "tsx",
        title: "App.tsx",
        code: `import { NyxDevtools } from "@nyxapi/devtools";\n\nexport const Dev = () => <NyxDevtools defaultOpen />;`,
        note: "Inside NyxProvider the client is taken from context.",
      },
    ],
    tutor: {
      hook: "Stop guessing what is in your cache.",
      talkingPoints: [
        "Devtools render only in development unless forced.",
        "Use redact for tokens.",
      ],
      demo: ["Open the panel and inspect an entry."],
      pitfalls: ["Forcing devtools in production."],
      exercise: "Find which query refetched on focus.",
      outro: "Last stretch: production.",
    },
    docs: [{ title: "Devtools", href: "/docs/devtools/" }],
  }),
  ep({
    number: 29,
    slug: "best-practices",
    module: "pro",
    level: "advanced",
    minutes: 12,
    title: "Best practices and the production checklist",
    summary: "Project layout, defaults, and what to verify before you ship.",
    goals: [
      "Structure an app in layers",
      "Choose defaults deliberately",
      "Run the production checklist",
    ],
    prerequisites: ["Episodes 1 to 28 recommended"],
    outline: [
      { at: "0:00", title: "Layers", notes: "Walk the AppLayers diagram." },
      { at: "4:00", title: "Defaults", notes: "Read the defaults table." },
      { at: "8:00", title: "Checklist", notes: "Go through it line by line." },
    ],
    samples: [{ kind: "example", id: "dependentQueries" }],
    tutor: {
      hook: "Shipping is a checklist, not a feeling.",
      talkingPoints: ["Keep one nyx module.", "Pin versions; the tool is pre-1.0."],
      demo: ["Open the best practices page."],
      pitfalls: ["Skipping error states."],
      exercise: "Run the checklist on your own app.",
      outro: "Final episode: what is next for NyxAPI and how to contribute.",
    },
    docs: [
      { title: "Best practices", href: "/docs/best-practices/" },
      { title: "Integrations", href: "/docs/integrations/" },
    ],
  }),
  ep({
    number: 30,
    slug: "roadmap-contribute",
    module: "pro",
    level: "beginner",
    minutes: 8,
    title: "The roadmap and how to contribute",
    summary: "Where NyxAPI is going, how to pick an issue and how to make your own tutorial.",
    goals: ["Read the roadmap", "Find a good first issue", "Claim a tutorial episode"],
    prerequisites: ["None"],
    outline: [
      { at: "0:00", title: "Roadmap", notes: "Planned is not shipped; say so." },
      { at: "3:00", title: "Contributing", notes: "Walk CONTRIBUTING.md." },
      { at: "5:30", title: "Tutorials", notes: "Show the contribute page." },
    ],
    samples: [
      {
        kind: "code",
        lang: "bash",
        title: "terminal",
        code: `git clone <your fork>\npnpm install\npnpm check`,
      },
    ],
    tutor: {
      hook: "NyxAPI grows when people like you add to it.",
      talkingPoints: ["Be clear about what exists today.", "Link the roadmap page."],
      demo: ["Open the roadmap and the contribute guide."],
      pitfalls: ["Presenting roadmap items as shipped."],
      exercise: "Claim one episode and post your outline.",
      outro: "Thank you for watching, see you in the docs.",
    },
    docs: [
      { title: "Roadmap", href: "/roadmap/" },
      { title: "Contribute to tutorials", href: "/tutorials/contribute/" },
    ],
  }),
];

export const EPISODES: Episode[] = [...M1, ...M2, ...M3, ...M4, ...M5, ...M6];
export const episodeBySlug = (slug: string): Episode | undefined =>
  EPISODES.find((e) => e.slug === slug);
