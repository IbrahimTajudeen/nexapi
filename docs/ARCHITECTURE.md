# Architecture

```
OpenAPI 3.x (JSON/YAML)
   │  @nexapi/codegen  parse ──▶ normalized ApiModel (IR) ──▶ validate + name ──▶ emit
   ▼
generated/{types,client,index}.ts      ← committed, readable, deterministic
   │  createApi(nexClient)  → plain objects + real functions (no Proxy)
   ▼
@nexapi/core
   NexClient ── HttpClient (Fetch transport, middleware, auth, timeouts, URL safety)
        └────── QueryClient ── Query entries ── QueryObserver(s) ◀── @nexapi/react (useSyncExternalStore)
                    └───────── MutationCache / Mutation / MutationObserver
```

## Packages

| Package            | Responsibility                                                                                      | Depends on                             |
| ------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `@nexapi/core`     | HTTP runtime, query cache, mutations, endpoint contracts. **No React, no runtime dependencies.**    | –                                      |
| `@nexapi/codegen`  | OpenAPI → IR → TypeScript. Pure functions (`generate(text, config)`), no file I/O.                  | `yaml`                                 |
| `@nexapi/cli`      | `nexapi generate                                                                                    | validate`, file I/O, `--check` for CI. | codegen |
| `@nexapi/react`    | `useQuery`, `useMutation`, `NexProvider`. Thin: one observer per hook, no second cache.             | core, react (peer)                     |
| `@nexapi/devtools` | Cache inspector (`createInspector`) and minimal React panel, built on `QueryClient.subscribeCache`. | –                                      |

## Core design

### Query entry (`Query`)

State: `data, error, status (pending|success|error), fetchStatus (idle|fetching), dataUpdatedAt, errorUpdatedAt, failureCount, isInvalidated`.
Private: confirmed `#base`, ordered optimistic `#patches`, current `#run` (fetch generation), `#writeStamp`, GC timer.

Transitions (all through one `#set`, see the diagram in `query.ts`):

- `fetch` → `fetchStatus: fetching` (status unchanged ⇒ background refetch keeps data).
- success → `status: success`, error cleared, `isInvalidated: false`.
- failure → `status: error`, **data kept**, `fetchStatus: idle`.
- cancel → `fetchStatus: idle`, nothing else changes.
- `setData` → success, bumps `#writeStamp`.

### Concurrency rules

1. **Single flight.** A second `fetch` joins the in-flight run (same promise).
2. **Generations.** Every run is an object; results apply only if `this.#run === run`. A run replaced by `cancelRefetch` (invalidation) is aborted and its callers _follow the replacement's result_.
3. **Writes beat older requests.** A run records `#writeStamp` at start; if a manual write happened meanwhile its response is discarded.
4. **Consumers, not observers, own cancellation.** The request is aborted only when no observer _and_ no imperative caller (`fetchQuery`/`prefetch`) needs it. The abort check is deferred one microtask so React Strict Mode's unmount→remount doesn't kill the request.
5. **Abort always settles.** The `queryFn` result is raced against the abort signal, so cancelling releases waiting callers even if the function ignores the signal.
6. **GC** never removes observed or in-flight queries; the timer is re-armed when they finish and `unref`'d so it never keeps Node alive.

### Optimistic updates: patches, not snapshots

Visible data = `patches.reduce(apply, base)`. Each optimistic update is a pure function layered on the confirmed `base`:

- _Rollback_ removes exactly that patch ⇒ a failure can never erase a newer success.
- A server response replaces `base` but keeps still-pending patches on top.
- _Commit_ folds a patch into `base` once it is the oldest patch; until then it stays layered. Committed patches that the server must already have seen (committed before the fetch started, tracked with a logical clock) are dropped on fetch success to avoid double application.
- Mutations in the same `scope` run their network calls serially in submit order while `onMutate` (the optimistic part) runs immediately.

### HTTP

`Transport = (Request) => Promise<Response>`; middleware is onion-style over standard `Request`/`Response`. URL building sets `url.pathname` (never `new URL(path, base)`), rejects `.`/`..`/empty path params, absolute and protocol-relative paths, and re-checks the origin. Errors carry method + origin/path only (no query string, headers or bodies).

## Codegen design

`model.ts` builds the IR (collecting _all_ diagnostics), `tree.ts` places operations into the resource tree and detects collisions/ambiguity, `emit.ts` prints deterministic code (sorted schemas/operations/children, no timestamps). See `docs/API-DESIGN.md` for naming rules. Future NestJS/ASP.NET sources only need to produce an `ApiModel`.

## Hardest risks and how they are addressed

| Risk                                                 | Mitigation                                             | Evidence                                                    |
| ---------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Endpoint type ergonomics (call vs options vs config) | Fixed argument grammar, compile-time tests             | `core/test/endpoint.test-d.ts`, `tests/generated.test-d.ts` |
| Request races                                        | generations + write stamps + consumer-based cancel     | `query-client.test.ts › request races`                      |
| Overlapping optimistic updates                       | patch layering                                         | `mutation.test.ts › optimistic updates`                     |
| Unsafe mutation retries                              | opt-in `{ idempotent: true }`, type + runtime enforced | `mutation.test.ts › retry safety`                           |
| SSR data leaks                                       | no globals; client per request                         | `e2e.test.ts`, `react.test.tsx › server rendering`          |
| URL/origin safety                                    | pathname assignment + checks                           | `http.test.ts › buildUrl`                                   |

## Prefix lookup index

`QueryClient` keeps entries in a hash map and, additionally, in buckets keyed by the primitive first element of the key. `findAll`/`invalidate`/`cancel` with a prefix whose first element is a string, number, boolean or null only inspect that bucket; each candidate is still verified with the real prefix match, so the index can only narrow, never change, results. Prefixes that are empty or start with an object/array, and entries with such keys, use the full scan. Indexing follows entry creation, removal, `clear()` and GC. A one-off local measurement with 50,000 entries gave roughly 0.006 ms per indexed lookup versus 2.4 ms for a full scan (single machine, not a benchmark claim).
