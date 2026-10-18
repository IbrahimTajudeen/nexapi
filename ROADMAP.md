# Roadmap

## Milestone 1: vertical slice ✅ (this repository state)

- Monorepo, strict TS, ESLint, Prettier, Vitest, compile-time tests, CI workflow.
- OpenAPI → IR → deterministic TS (types, resource tree, callable endpoints); config overrides; CLI `generate/validate/--check`.
- Fetch runtime (middleware, auth provider, timeouts, abort, typed errors, origin safety).
- Query cache: keys, single flight, staleness, invalidation, GC, retries, cancel, focus/reconnect, subscriptions, selectors.
- Mutations: lifecycle, scopes, patch-based optimistic updates, opt-in retries.
- React: `useQuery`, `useMutation`, `NyxProvider`; SSR-safe.
- Benchmarks (headless, vs `@tanstack/query-core`).

## Milestone 2: cache completeness

- ✅ `paused` fetch status when offline (`networkMode`). (`initialData` ✅, `placeholderData`/`keepPreviousData` ✅, `refetchInterval` ✅)
- Dehydrate/hydrate ✅ (`dehydrate`, `hydrate`, `initialData`); `useSuspenseQuery` + streaming SSR (`renderToPipeableStream`) ✅; `useSuspenseInfiniteQuery` ✅; Next.js/RSC integration still open.
- ✅ Key-prefix index (first element): prefix filters that start with a primitive look only at their bucket; object-rooted or empty prefixes still scan.
- Infinite queries in core + `useInfiniteQuery` ✅ (refetch re-requests all loaded pages; `getPreviousPageParam`/`fetchPreviousPage` and `maxPages` ✅).
- `useIsFetching`, `useQueries`.

## Milestone 3: codegen breadth

- ✅ Multipart/urlencoded/binary/text request bodies and text/binary responses. Cookies: `credentials` client option ✅ (cookie _parameters_ are deliberately not generated; see API-DESIGN). (`deepObject`, comma/space/pipe-delimited query styles ✅)
- ✅ Response status discrimination (`HttpError<X, 401> | HttpError<Y, 404>` via `ErrorCase`).
- ✅ Optional runtime response validation (`"validation": true` in the codegen config). Error bodies and request bodies are not validated.
- Remote-schema caching, watch mode, split output per tag.
- ✅ NestJS and ASP.NET Core via their OpenAPI output (`docs/ADAPTERS.md`; NestJS verified on real `@nestjs/swagger` output, the ASP.NET fixture is hand-written, see the note there). Direct source-level adapters were considered and rejected.

## Milestone 4: devtools & diagnostics

- ✅ `@nyxapi/devtools`: headless `createInspector` (query rows, bounded event log, refetch/invalidate/remove, `redact` hook) and a minimal React `NyxDevtools` panel. Cached data is never in snapshots and is shown only on request; the panel renders nothing in production unless `force`d.
- Open: per-request timeline (needs a transport-level hook), and a richer UI.

## Milestone 5: performance evidence

- ✅ React render benchmarks (NyxAPI vs TanStack Query vs RTK Query, jsdom), memory benchmark (fresh process per sample), bundle-size measurement with budgets for NyxAPI entries (`benchmarks/README.md`). Results are machine specific and make no superiority claim.
- Open: real-browser rendering, hydration, long-session memory, mutation/rollback comparisons.
- Profile real workloads before considering normalized entities (not planned until evidence exists).

## Milestone 6: release

- ✅ LICENSE, package READMEs, `pnpm smoke:pack` (pack → empty-project install → CLI generate → strict type-check → run), CI step, `docs/RELEASING.md`.
- Open: changesets, npm provenance, `repository` manifest field (needs the real URL), CHANGELOG, docs site, browser matrix tests. (Size budgets: done via `benchmarks/size.mjs`.)

## Naming

The project was renamed from NexAPI to NyxAPI before any public release. Packages are `@nyxapi/*`, the CLI is `nyxapi`, the config file is `nyxapi.config.json`, and environment variables use the `NYXAPI_` prefix. Nothing was published under the old name.
