/**
 * Roadmap, known limitations and open tasks shown on /roadmap. This mirrors ROADMAP.md at the
 * repository root; `test/roadmap.test.ts` checks the two stay in step (every milestone title and
 * every open item must appear in ROADMAP.md) and that the planned releases come after the
 * current version.
 */
export type Status = "shipped" | "partial" | "planned" | "exploring" | "not-planned";
export type Area =
  | "core"
  | "react"
  | "codegen"
  | "graphql"
  | "trpc"
  | "devtools"
  | "performance"
  | "docs"
  | "release";

export interface Item {
  text: string;
  status: Status;
  area: Area;
}
export interface Milestone {
  id: number;
  title: string;
  summary: string;
  items: Item[];
}

export const STATUS_LABEL: Record<Status, string> = {
  shipped: "Shipped",
  partial: "Partly done",
  planned: "Planned",
  exploring: "Exploring",
  "not-planned": "Not planned",
};

export const AREA_LABEL: Record<Area, string> = {
  core: "Core engine",
  react: "React",
  codegen: "Code generation",
  graphql: "GraphQL",
  trpc: "tRPC",
  devtools: "Devtools",
  performance: "Performance",
  docs: "Docs and site",
  release: "Release",
};

export const MILESTONES: Milestone[] = [
  {
    id: 1,
    title: "Vertical slice",
    summary: "The first end-to-end path from a schema to a cached, typed call.",
    items: [
      {
        text: "Monorepo with strict TypeScript, ESLint, Prettier, Vitest and CI",
        status: "shipped",
        area: "release",
      },
      {
        text: "OpenAPI to typed TypeScript, with config overrides and CLI generate, validate and --check",
        status: "shipped",
        area: "codegen",
      },
      {
        text: "Fetch runtime: middleware, auth provider, timeouts, abort, typed errors, origin safety",
        status: "shipped",
        area: "core",
      },
      {
        text: "Query cache: keys, single flight, staleness, invalidation, GC, retries, cancel, focus and reconnect",
        status: "shipped",
        area: "core",
      },
      {
        text: "Mutations: lifecycle, scopes, patch-based optimistic updates, opt-in retries",
        status: "shipped",
        area: "core",
      },
      {
        text: "React: useQuery, useMutation and NyxProvider, safe for server rendering",
        status: "shipped",
        area: "react",
      },
    ],
  },
  {
    id: 2,
    title: "Cache completeness",
    summary: "The features teams expect from a mature client cache.",
    items: [
      {
        text: "Paused fetches when offline (networkMode), initialData, placeholderData, refetchInterval",
        status: "shipped",
        area: "core",
      },
      {
        text: "Dehydrate and hydrate, useSuspenseQuery, streaming server rendering",
        status: "shipped",
        area: "react",
      },
      {
        text: "Infinite queries in core and React, with previous pages and maxPages",
        status: "shipped",
        area: "core",
      },
      { text: "Key-prefix index for fast filtering", status: "shipped", area: "performance" },
      { text: "useIsFetching and useQueries hooks", status: "planned", area: "react" },
      { text: "Next.js and React Server Components integration", status: "planned", area: "react" },
      {
        text: "Persisters (save the cache to storage) and an offline mutation queue",
        status: "planned",
        area: "core",
      },
    ],
  },
  {
    id: 3,
    title: "Codegen breadth",
    summary: "Handle more of what real schemas contain.",
    items: [
      {
        text: "Multipart, urlencoded, binary and text bodies; text and binary responses",
        status: "shipped",
        area: "codegen",
      },
      {
        text: "Response status discrimination and optional runtime response validation",
        status: "shipped",
        area: "codegen",
      },
      {
        text: "NestJS and ASP.NET Core through their OpenAPI output",
        status: "shipped",
        area: "codegen",
      },
      { text: "Watch mode for the CLI", status: "shipped", area: "codegen" },
      { text: "Remote-schema caching", status: "planned", area: "codegen" },
      { text: "Split output per tag", status: "planned", area: "codegen" },
    ],
  },
  {
    id: 4,
    title: "Devtools and diagnostics",
    summary: "See what the cache is doing while you build.",
    items: [
      {
        text: "Headless inspector and a minimal React panel with a redact hook",
        status: "shipped",
        area: "devtools",
      },
      {
        text: "Per-request timeline (needs a transport-level hook)",
        status: "planned",
        area: "devtools",
      },
      { text: "Richer devtools UI", status: "planned", area: "devtools" },
    ],
  },
  {
    id: 5,
    title: "Performance evidence",
    summary: "Measured, reproducible numbers, with losses reported next to wins.",
    items: [
      {
        text: "Engine, React render, memory and bundle-size benchmarks against TanStack Query and RTK Query",
        status: "shipped",
        area: "performance",
      },
      {
        text: "Re-run the engine benchmark against 0.1.0 (the last run used 0.0.1)",
        status: "planned",
        area: "performance",
      },
      {
        text: "Real-browser rendering, hydration, long-session memory, mutation and rollback comparisons",
        status: "planned",
        area: "performance",
      },
      {
        text: "Reduce memory per cache entry (about 1206 bytes against 992 for TanStack in the last run)",
        status: "planned",
        area: "performance",
      },
      { text: "Normalized entities", status: "not-planned", area: "performance" },
    ],
  },
  {
    id: 6,
    title: "Release",
    summary: "Ship it safely and keep shipping.",
    items: [
      {
        text: "License, package READMEs, pack-and-install smoke test, changesets, provenance, docs site, size budgets",
        status: "shipped",
        area: "release",
      },
      {
        text: "First publish to npm (0.1.0, all seven packages)",
        status: "shipped",
        area: "release",
      },
      { text: "Browser matrix tests", status: "planned", area: "release" },
    ],
  },
  {
    id: 7,
    title: "More than OpenAPI",
    summary: "One tool for every API style a team meets.",
    items: [
      { text: "Swagger 2.0 input, converted to OpenAPI 3", status: "shipped", area: "codegen" },
      {
        text: "GraphQL generator and @nyxapi/graphql runtime (SDL, introspection JSON or endpoint; own documents; custom scalars)",
        status: "shipped",
        area: "graphql",
      },
      {
        text: "@nyxapi/trpc adapter and protocol-neutral operations in core",
        status: "shipped",
        area: "trpc",
      },
      {
        text: "nyx command, kind detection and nyx.config.json with an editor schema",
        status: "shipped",
        area: "codegen",
      },
      {
        text: "Hardening: maxResponseBytes, bounded downloads, __proto__ keys, alias cycles",
        status: "shipped",
        area: "core",
      },
      {
        text: "GraphQL subscriptions, uploads and persisted queries",
        status: "planned",
        area: "graphql",
      },
      { text: "tRPC subscriptions", status: "planned", area: "trpc" },
      { text: "A live GraphQL demo in the playground", status: "planned", area: "docs" },
    ],
  },
  {
    id: 8,
    title: "More frameworks",
    summary: "The core is framework independent; adapters are what is missing.",
    items: [
      { text: "Vue adapter", status: "exploring", area: "react" },
      { text: "Svelte and Solid adapters", status: "exploring", area: "react" },
    ],
  },
  {
    id: 9,
    title: "Website, playground and community",
    summary: "The site around the library: learn, try it, and meet the people behind it.",
    items: [
      {
        text: "In-browser playground with editor, terminal, saved files and React preview",
        status: "shipped",
        area: "docs",
      },
      { text: "Video tutorial playlist and contributor guide", status: "shipped", area: "docs" },
      {
        text: "Supabase and Cloudinary backend with an admin panel, invites, roles, activity log and a public Community page",
        status: "shipped",
        area: "docs",
      },
      {
        text: "Signed Cloudinary uploads and deletes through an Edge Function",
        status: "planned",
        area: "docs",
      },
      { text: "Invite emails sent automatically", status: "planned", area: "docs" },
    ],
  },
];

export interface PlannedRelease {
  version: string;
  theme: string;
  items: string[];
}

/** A suggested order, not a commitment. Dates are deliberately absent. */
export const PLANNED_RELEASES: PlannedRelease[] = [
  {
    version: "0.1.1",
    theme: "Fixes and housekeeping",
    items: [
      "Re-run the engine benchmark against 0.1.0 and publish the results",
      "Profile memory per entry and single-key writes, and fix what the profile shows",
    ],
  },
  {
    version: "0.2.0",
    theme: "React parity",
    items: [
      "useQueries and useIsFetching",
      "Persister and offline mutation queue",
      "Real-browser and hydration benchmarks",
    ],
  },
  {
    version: "0.3.0",
    theme: "Protocol completeness",
    items: [
      "GraphQL subscriptions, uploads and persisted queries",
      "tRPC subscriptions",
      "Live GraphQL demo, remote-schema caching and split output per tag",
    ],
  },
  {
    version: "0.4.0",
    theme: "Reach",
    items: [
      "Vue adapter, then Svelte or Solid based on demand",
      "Next.js and RSC integration",
      "Per-request timeline and richer devtools",
    ],
  },
];

export interface Limitation {
  title: string;
  detail: string;
  workaround: string;
  area: Area;
}

/** Things that do not work today, stated plainly. Each is true of the current release. */
export const LIMITATIONS: Limitation[] = [
  {
    title: "React only",
    detail: "The core runs anywhere, but the only UI adapter is React.",
    workaround: "Use the core directly (QueryObserver and subscribe) in other frameworks.",
    area: "react",
  },
  {
    title: "No useQueries or useIsFetching",
    detail:
      "Running a dynamic list of queries in one hook, and a global fetching indicator hook, are not available yet.",
    workaround: "Use queryClient.isFetching() and subscribeCache(), or one useQuery per component.",
    area: "react",
  },
  {
    title: "No persistence or offline mutation queue",
    detail:
      "The cache lives in memory. Paused fetches resume on reconnect, but queued mutations are not saved.",
    workaround: "Use dehydrate and hydrate with your own storage.",
    area: "core",
  },
  {
    title: "GraphQL subscriptions, uploads and persisted queries",
    detail:
      "Subscriptions are skipped with a warning during generation. Multipart uploads and persisted queries are not generated.",
    workaround: "Call those operations with your own client and share the cache through keys.",
    area: "graphql",
  },
  {
    title: "tRPC subscriptions",
    detail: "Queries and mutations are typed; subscriptions are not.",
    workaround: "Use the tRPC client's own subscription API.",
    area: "trpc",
  },
  {
    title: "Cookie parameters are not generated",
    detail:
      "OpenAPI parameters with in: cookie are deliberately skipped, because browsers do not let scripts set a Cookie header.",
    workaround: "Use the credentials client option for cookie sessions.",
    area: "codegen",
  },
  {
    title: "Only successful responses are validated",
    detail:
      "With validation on, success bodies are checked against generated shapes. Error bodies and request bodies are not.",
    workaround: "Validate request bodies in your own code or with a schema library before sending.",
    area: "codegen",
  },
  {
    title: "Prefix filters that start with an object scan the whole cache",
    detail:
      "Filters whose first key element is a primitive use a fast bucket. Object-rooted or empty prefixes check every entry.",
    workaround: "Keep keys primitive-first, which generated keys already are.",
    area: "performance",
  },
  {
    title: "Memory per cache entry is higher than TanStack Query",
    detail:
      "In the last benchmark run an entry retained about 1206 bytes against 992. Observers are lighter (624 against 1504 bytes).",
    workaround: "Matters only for very large caches; lower gcTime to bound them.",
    area: "performance",
  },
  {
    title: "Benchmarks come from one machine",
    detail:
      "All numbers are from a 2-core Xeon on Node 22 and jsdom, and the engine run predates 0.1.0. Treat ratios as indicative.",
    workaround: "Run pnpm bench on your own hardware; see the benchmarks page.",
    area: "performance",
  },
  {
    title: "The devtools panel is minimal",
    detail:
      "It lists queries and events and can refetch, invalidate and remove. There is no request timeline.",
    workaround: "Use createInspector headless and build your own view.",
    area: "devtools",
  },
  {
    title: "The ASP.NET Core fixture is hand-written",
    detail:
      "NestJS output is verified on real @nestjs/swagger output; the ASP.NET sample was written by hand.",
    workaround: "Run nyx validate on your real document and report anything it rejects.",
    area: "codegen",
  },
];

export interface Task {
  title: string;
  detail: string;
  area: Area;
  size: "small" | "medium" | "large";
  /** Only set for tasks managed in the admin panel. */
  status?: "open" | "claimed" | "closed";
  url?: string;
}

/** Contributions that would move the project forward, roughly smallest first. */
export const OPEN_TASKS: Task[] = [
  {
    title: "Run nyx validate on real OpenAPI documents",
    detail: "Try public or private schemas and report what fails with a minimal reproduction.",
    area: "codegen",
    size: "small",
  },
  {
    title: "Re-run the benchmarks on your hardware",
    detail: "Share pnpm bench, bench:react and bench:memory output with your CPU and Node version.",
    area: "performance",
    size: "small",
  },
  {
    title: "Add a GraphQL demo to the playground",
    detail: "A mock GraphQL endpoint in the browser so the GraphQL docs can be run live.",
    area: "docs",
    size: "medium",
  },
  {
    title: "Implement useIsFetching",
    detail: "A hook over queryClient.isFetching() with a stable subscription.",
    area: "react",
    size: "medium",
  },
  {
    title: "Implement useQueries",
    detail: "Observe a dynamic list of queries in one hook with per-query results.",
    area: "react",
    size: "medium",
  },
  {
    title: "Split generated output per tag",
    detail:
      "An output option that writes one file per OpenAPI tag while keeping imports deterministic.",
    area: "codegen",
    size: "medium",
  },
  {
    title: "Cache remote schemas",
    detail:
      "Store a fetched schema with its ETag so repeated generation does not download it again.",
    area: "codegen",
    size: "medium",
  },
  {
    title: "Profile memory per cache entry",
    detail: "Find what each entry retains beyond its data and shrink it.",
    area: "performance",
    size: "medium",
  },
  {
    title: "Persister API",
    detail:
      "Save and restore the cache through a storage interface, with versioning and a size limit.",
    area: "core",
    size: "large",
  },
  {
    title: "Vue adapter",
    detail: "Composables over QueryObserver with reactive options.",
    area: "react",
    size: "large",
  },
  {
    title: "GraphQL subscriptions",
    detail: "Generate typed subscription helpers over a pluggable transport.",
    area: "graphql",
    size: "large",
  },
];
