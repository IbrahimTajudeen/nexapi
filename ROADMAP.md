# Roadmap

## Milestone 1: vertical slice ✅ (this repository state)

- Monorepo, strict TS, ESLint, Prettier, Vitest, compile-time tests, CI workflow.
- OpenAPI → IR → deterministic TS (types, resource tree, callable endpoints); config overrides; CLI `generate/validate/--check`.
- Fetch runtime (middleware, auth provider, timeouts, abort, typed errors, origin safety).
- Query cache: keys, single flight, staleness, invalidation, GC, retries, cancel, focus/reconnect, subscriptions, selectors.
- Mutations: lifecycle, scopes, patch-based optimistic updates, opt-in retries.
- React: `useQuery`, `useMutation`, `NexProvider`; SSR-safe.
- Benchmarks (headless, vs `@tanstack/query-core`).

## Milestone 2: cache completeness

- ✅ `paused` fetch status when offline (`networkMode`). (`initialData` ✅, `placeholderData`/`keepPreviousData` ✅, `refetchInterval` ✅)
- Dehydrate/hydrate ✅ (`dehydrate`, `hydrate`, `initialData`); streaming/suspense integration still open.
- Key-prefix index (first element) so filtered operations stop scanning every entry.
- Infinite queries in core + `useInfiniteQuery` ✅ (refetch re-requests all loaded pages; `maxPages` and bidirectional paging still open).
- `useIsFetching`, `useQueries`.

## Milestone 3: codegen breadth

- Multipart, binary and text responses; `deepObject`/CSV query styles; cookies.
- ✅ Response status discrimination (`HttpError<X, 401> | HttpError<Y, 404>` via `ErrorCase`).
- Optional runtime validation (opt-in, schema-derived) for responses.
- Remote-schema caching, watch mode, split output per tag.
- Additional sources producing `ApiModel`: NestJS (decorators/Swagger), ASP.NET Core (ApiExplorer / OpenAPI document).

## Milestone 4: devtools & diagnostics

- `@nexapi/devtools`: cache inspector, request timeline, redacted by default.

## Milestone 5: performance evidence

- React render/commit benchmarks, Redux Toolkit Query comparison, memory/allocation methodology.
- Profile real workloads before considering normalized entities (not planned until evidence exists).

## Milestone 6: release

- Changesets, npm provenance, docs site, browser matrix tests, size-limit budgets.
