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
- Persisters (save the cache to storage) and an offline mutation queue.

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
- Open: real-browser rendering, hydration, long-session memory, mutation/rollback comparisons; re-run the engine benchmark against 0.1.0 (the last run used 0.0.1); reduce memory per cache entry (about 1206 bytes against 992 for TanStack in the last run).
- Profile real workloads before considering normalized entities (not planned until evidence exists).

## Milestone 6: release

- ✅ LICENSE, package READMEs, `pnpm smoke:pack` (pack → empty-project install → CLI generate → strict type-check → run), CI step, `docs/RELEASING.md`.
- Done: changesets with a fixed-version group, npm provenance in the release workflow, `repository` fields written from the GitHub repository by `scripts/set-repository.mjs`, publish metadata and LICENSE in every package, docs site, size budgets (`benchmarks/size.mjs`). See `docs/RELEASING.md`.
- ✅ First publish: 0.1.0 is on npm (all seven packages).
- Open: browser matrix tests.

## Milestone 7: more than OpenAPI ✅ (0.1.0)

- ✅ Swagger 2.0 input (converted to OpenAPI 3), GraphQL generator and `@nyxapi/graphql` runtime (SDL, introspection JSON or endpoint; own documents; custom scalars), `@nyxapi/trpc` adapter, protocol-neutral operations in core.
- ✅ `nyx` command (global install, `init`, `generate --watch`, `--version`), kind detection, `nyx.config.json` with an editor JSON schema.
- ✅ Hardening: `maxResponseBytes`, bounded CLI downloads and redirects, `__proto__` property keys, alias cycles.
- Open: GraphQL subscriptions, uploads and persisted queries; tRPC subscriptions; a live GraphQL demo in the playground.

## Milestone 8: more frameworks

- Exploring: a Vue adapter, then Svelte and Solid adapters. The core is already framework independent; adapters are what is missing.

## Milestone 9: website, playground and community ✅ (site only, not a package release)

- ✅ In-browser playground: code editor, terminal, virtual file system saved in the browser, React preview and NyxAPI templates.
- ✅ Video tutorial playlist with tutor briefs, and a contributor guide.
- ✅ Backend for the website on Supabase (Postgres, row-level security, email sign-in) with Cloudinary for images: an admin panel for people, tutorials, releases, roadmap, issues, guides, announcements, media and settings, invites with admin, editor and contributor roles, an activity log, and a public Community page (Hall of Fame and tutors).
- Open: Signed Cloudinary uploads and deletes through an Edge Function. Today the browser uses an unsigned upload preset and removing a library entry does not delete the file in Cloudinary.
- Open: Invite emails sent automatically. Today an invite is recorded and the admin tells the person to sign in.

## Open items, in full

This list mirrors the Roadmap page on the website (`website/src/roadmap.ts`); a test keeps the two in step.

### Milestone 2: Cache completeness

- useIsFetching and useQueries hooks (planned)
- Next.js and React Server Components integration (planned)
- Persisters (save the cache to storage) and an offline mutation queue (planned)

### Milestone 3: Codegen breadth

- Remote-schema caching (planned)
- Split output per tag (planned)

### Milestone 4: Devtools and diagnostics

- Per-request timeline (needs a transport-level hook) (planned)
- Richer devtools UI (planned)

### Milestone 5: Performance evidence

- Re-run the engine benchmark against 0.1.0 (the last run used 0.0.1) (planned)
- Real-browser rendering, hydration, long-session memory, mutation and rollback comparisons (planned)
- Reduce memory per cache entry (about 1206 bytes against 992 for TanStack in the last run) (planned)
- Normalized entities (not-planned)

### Milestone 6: Release

- Browser matrix tests (planned)

### Milestone 7: More than OpenAPI

- GraphQL subscriptions, uploads and persisted queries (planned)
- tRPC subscriptions (planned)
- A live GraphQL demo in the playground (planned)

### Milestone 8: More frameworks

- Vue adapter (exploring)
- Svelte and Solid adapters (exploring)

### Milestone 9: Website, playground and community

- Signed Cloudinary uploads and deletes through an Edge Function (planned)
- Invite emails sent automatically (planned)

## Naming

The project was renamed from NexAPI to NyxAPI before any public release. Packages are `@nyxapi/*`, the CLI is `nyx` (`nyxapi` still works as an alias), the config file is `nyx.config.json` (`nyxapi.config.json` is still read), and environment variables use the `NYXAPI_` prefix. Nothing was published under the old name.
