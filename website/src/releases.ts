/**
 * Release history shown on /releases. Add a new entry at the top for every release; the build
 * test checks that the newest entry matches the version in packages/core/package.json, and the
 * page shows npm's own publish status for each version, so it can never claim an unpublished
 * version is out.
 */
export interface Release {
  version: string;
  /** ISO date the version was prepared in the repository (not the npm publish time). */
  date: string | null;
  title: string;
  summary: string;
  /** Short, factual bullets. Each one is something a user can check. */
  features: { label: string; detail: string }[];
  /** Fixes and hardening that do not add features. */
  fixes?: string[];
  /** Things that changed in a way that needs a user action (none are breaking in 0.x unless listed). */
  upgrade?: string[];
  /** What this release deliberately does not do. */
  limits?: string[];
}

export const RELEASES: Release[] = [
  {
    version: "0.1.0",
    date: "2026-10-18",
    title: "GraphQL, tRPC, Swagger 2.0 and a global `nyx` command",
    summary:
      "NyxAPI is no longer OpenAPI-only. One CLI generates typed clients from OpenAPI, Swagger 2.0 and GraphQL, tRPC clients get the same cache, and the command works directly as `nyx`.",
    features: [
      {
        label: "GraphQL generator and runtime",
        detail:
          "SDL files, introspection JSON or a live endpoint become `api.query.user({ id })` and `api.mutation.createPost(...)`. Result types are derived from the exact selection set that is sent. New package: @nyxapi/graphql.",
      },
      {
        label: "Your own GraphQL documents",
        detail:
          "`documents` points at .graphql files; exactly those operations are generated, with fragments attached, validated against the schema.",
      },
      {
        label: "tRPC adapter",
        detail:
          "@nyxapi/trpc puts any tRPC v11 client on the NyxAPI cache: typed keys, options, prefetch, invalidate and engine-backed mutations. No code generation.",
      },
      {
        label: "Swagger 2.0 input",
        detail:
          "Swagger documents are converted to OpenAPI 3 first (host/basePath, body and formData parameters, collection formats, x-nullable) and use the same generator.",
      },
      {
        label: "`nyx` command",
        detail:
          "`npm i -g @nyxapi/cli` then `nyx init`, `nyx generate --watch`, `nyx validate`, `nyx --version`. `nyxapi` still works as an alias; nyx.config.json is preferred over nyxapi.config.json.",
      },
      {
        label: "Input kind detection",
        detail:
          "OpenAPI, Swagger and GraphQL are detected from the file; `--kind` or `kind` forces one. New config keys: kind, documents, scalars, selectionDepth. A JSON schema for editors ships in @nyxapi/codegen.",
      },
      {
        label: "Protocol-neutral operations in core",
        detail:
          "createQueryOperation and createMutationOperation give any protocol the same options, key, prefetch, invalidate, single-flight and optimistic updates.",
      },
      {
        label: "Response size cap",
        detail:
          "`maxResponseBytes` rejects oversized bodies with ResponseTooLargeError while streaming.",
      },
    ],
    fixes: [
      "Schema properties named __proto__ no longer break generated response shapes.",
      "Circular schema aliases are reported as REF_CYCLE instead of failing later.",
      "The CLI streams remote schemas with a 10 MB cap, follows at most 5 redirects, refuses https to http downgrades and never sends --header credentials to another origin.",
      "validateSchema no longer builds the resource tree twice.",
      "Unused internal exports and helpers were removed.",
    ],
    upgrade: [
      "Install the CLI globally (npm i -g @nyxapi/cli) or keep using npx nyx; npx nyxapi still works.",
      "Rename nyxapi.config.json to nyx.config.json when convenient. The old name keeps working.",
      "Swagger 2.0 documents that were rejected before are now accepted.",
    ],
    limits: [
      "GraphQL subscriptions are not supported and are reported as a warning.",
      "tRPC is a typed adapter over your own client, not a generator; subscriptions are not wrapped.",
      "Swagger security definitions are not converted; authentication stays on the client.",
    ],
  },
  {
    version: "0.0.1",
    date: null,
    title: "First release",
    summary:
      "The OpenAPI-to-TypeScript generator, the fluent typed client, a framework-independent query and mutation engine, React hooks and devtools.",
    features: [
      {
        label: "OpenAPI 3.0 and 3.1 generator",
        detail: "Deterministic output: the same schema and config always produce the same bytes.",
      },
      {
        label: "Fluent typed API",
        detail:
          'api.users.byId("42").get(), with .options(), .key(), .prefetch() and .invalidate().',
      },
      {
        label: "Query and mutation engine",
        detail:
          "Single-flight requests, freshness, retries, cancellation, garbage collection, infinite queries, dehydrate/hydrate and patch-based optimistic updates.",
      },
      { label: "React adapter", detail: "Hooks, Suspense and server rendering support." },
      { label: "Devtools", detail: "A cache inspector and a minimal React panel." },
      {
        label: "Secure HTTP client",
        detail:
          "Origin pinning, middleware, timeouts, no credential logging, typed errors by status.",
      },
      {
        label: "Optional response validation",
        detail: "Generated runtime shapes can verify responses against the schema.",
      },
      { label: "CLI", detail: "nyxapi generate, nyxapi validate and a --check mode for CI." },
    ],
    limits: ["OpenAPI 3.x only.", "REST over HTTP only."],
  },
];
