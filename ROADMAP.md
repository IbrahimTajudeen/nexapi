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
- Dehydrate/hydrate ✅ (`dehydrate`, `hydrate`, `initialData`); `useSuspenseQuery` + streaming SSR (`renderToPipeableStream`) ✅; a suspense variant of `useInfiniteQuery` and Next.js/RSC integration still open.
- ✅ Key-prefix index (first element): prefix filters that start with a primitive look only at their bucket; object-rooted or empty prefixes still scan.
- Infinite queries in core + `useInfiniteQuery` ✅ (refetch re-requests all loaded pages; `getPreviousPageParam`/`fetchPreviousPage` and `maxPages` ✅).
- `useIsFetching`, `useQueries`.

## Milestone 3: codegen breadth

- ✅ Multipart/urlencoded/binary/text request bodies and text/binary responses. Cookies still open. (`deepObject`, comma/space/pipe-delimited query styles ✅)
- ✅ Response status discrimination (`HttpError<X, 401> | HttpError<Y, 404>` via `ErrorCase`).
- ✅ Optional runtime response validation (`"validation": true` in the codegen config). Error bodies and request bodies are not validated.
- Remote-schema caching, watch mode, split output per tag.
- Additional sources producing `ApiModel`: NestJS (decorators/Swagger), ASP.NET Core (ApiExplorer / OpenAPI document).

## Milestone 4: devtools & diagnostics

- `@syncapi/devtools`: cache inspector, request timeline, redacted by default.

## Milestone 5: performance evidence

- React render/commit benchmarks, Redux Toolkit Query comparison, memory/allocation methodology.
- Profile real workloads before considering normalized entities (not planned until evidence exists).

## Milestone 6: release

- ✅ LICENSE, package READMEs, `pnpm smoke:pack` (pack → empty-project install → CLI generate → strict type-check → run), CI step, `docs/RELEASING.md`.
- Open: changesets, npm provenance, `repository` manifest field (needs the real URL), CHANGELOG, docs site, browser matrix tests, size-limit budgets.
