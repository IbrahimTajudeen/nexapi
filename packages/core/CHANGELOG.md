# @nyxapi/core

## 0.1.0

### Minor Changes

- NyxAPI 0.1.0 adds GraphQL, tRPC and Swagger 2.0 and a global `nyx` command.

  **More than OpenAPI.** The generator now reads OpenAPI 3.0/3.1, Swagger 2.0 (converted to OpenAPI 3 first) and GraphQL (SDL files, introspection JSON, or a live endpoint). `kind` is detected automatically and can be forced.

  **GraphQL.** `nyx generate` turns a schema into a typed client (`api.query.user({ id })`, `api.mutation.createPost(...)`). Result types are derived from the exact selection set that is sent, so type and query cannot drift. Bring your own `.graphql` documents with `documents`, map custom scalars with `scalars`, and tune default selection depth with `selectionDepth`. The new `@nyxapi/graphql` runtime sends the requests through the same origin-pinned HTTP client, cache, retries and optimistic updates as REST. Subscriptions are not supported and are reported as a warning.

  **tRPC.** The new `@nyxapi/trpc` wraps any tRPC v11 client so every procedure gets `options`, `key`, `prefetch` and `invalidate` on one shared cache. Types are read from the client you pass in.

  **`nyx` command.** The CLI installs as `nyx` (and still as `nyxapi`): `npm i -g @nyxapi/cli`, then `nyx init`, `nyx generate --watch`, `nyx validate`, `nyx --version`. `nyx.config.json` is preferred; `nyxapi.config.json` still works.

  **Core.** Protocol-neutral operations (`createQueryOperation`, `createMutationOperation`), `NyxError.retryable`, `OperationError`, and `maxResponseBytes` to cap response bodies (`ResponseTooLargeError`).

  **Fixes and hardening.** Schema properties named `__proto__` no longer break generated response shapes. Circular schema aliases are reported as `REF_CYCLE` instead of failing later. The CLI streams remote schemas with a 10 MB cap, follows at most 5 redirects, refuses https→http downgrades, and never sends `--header` credentials to another origin. `validateSchema` no longer builds the resource tree twice. Unused internals were removed.
