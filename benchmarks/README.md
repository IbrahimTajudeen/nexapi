# Benchmarks

```bash
pnpm build && pnpm bench            # BENCH_SAMPLES=200 BENCH_WARMUP=30 by default
```

Output: a table on stdout plus `benchmarks/results/latest.{json,md}` (git-ignored; results are machine specific).
Each result file records Node/V8 version, OS, CPU, library versions, cache policy, sample counts and a date.

## Method

- Headless: `@nexapi/core` vs `@tanstack/query-core` (pinned in `package.json`). No React, no network, no timers in `queryFn`s (they resolve immediately).
- Identical policy on both sides: `retry: false`, `gcTime: Infinity`, inert focus/online managers; `staleTime` as stated per scenario.
- Each _sample_ is a batch of operations timed with `performance.now()`; we report per-operation **median, p95, p99** across samples after warm-up. GC is forced between samples (`--expose-gc`).
- The dedup scenarios assert that the `queryFn` ran exactly once per sample and abort the run otherwise: a benchmark that doesn't deduplicate would measure the wrong thing.

## What is compared

| Scenario                     | Notes                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Warm-cache reads             | sync `getData`/`getQueryData` and async `fetchQuery` on fresh data |
| Cold query                   | one `fetchQuery` with an immediately-resolving `queryFn`           |
| Concurrent identical queries | 1000 `fetchQuery` calls on one key                                 |
| Large cache lookup           | 50 000 entries, point lookups                                      |
| Many observers               | 5 000 observers on one key, one write, time to the _last_ listener |

## React, memory and bundle size

```bash
pnpm --filter @nexapi/benchmarks bench:react    # NexAPI vs TanStack Query vs RTK Query, jsdom, React production build
pnpm --filter @nexapi/benchmarks bench:memory   # retained heap, one fresh process per measurement
pnpm --filter @nexapi/benchmarks size           # esbuild minified+gzip; fails if a NexAPI entry exceeds size-budget.json
```

- **React** (`react.mjs`): 500 components mounted via `createRoot`; scenarios are "all on one key" (asserts exactly 1 request) and "each on its own key" (asserts 500 requests). We time mount-to-data and one cache write to the last visible update, and count component renders. jsdom has no layout or paint, so this is React plus library overhead only. Compared hooks: `@nexapi/react` `useQuery`, `@tanstack/react-query` `useQuery`, RTK Query generated hook (custom `queryFn`, store with serializable/immutable checks off).
- **Memory** (`memory.mjs`): `heapUsed` after two forced GCs, median of 7 fresh processes, for 20 000 cache entries and 2 000 subscribed observers. The figure includes the stored payload.
- **Size** (`size.mjs`): what an app imports, tree-shaken, react/react-dom excluded. Entries are not feature-equivalent (see below). Budgets for NexAPI entries live in `size-budget.json` (~20 % headroom over the current size).

## Not measured yet (do not infer anything about these)

- Real browser rendering, hydration cost, and long-session memory growth.
- Mutation invalidation and optimistic rollback comparisons.
- RTK Query headless (it requires a store; it appears only in the React and size benchmarks).

## Reading the results honestly

- NexAPI does **less** per operation than TanStack Query by design and by current maturity: no `notifyManager` batching, no tracked-property result proxies, structural sharing is opt-in, no persisters/devtools hooks. A faster number can simply mean fewer features. In particular, in the observer scenario NexAPI notifies synchronously whereas TanStack batches through its scheduler, so the two measure different notification semantics.
- Samples come from a small shared VM (see the recorded environment); absolute numbers will differ elsewhere. Compare ratios across several runs on your own hardware before drawing conclusions.
- RTK Query is a different design (normalized-by-endpoint Redux slice, auto-batched notifications on animation frames), so its numbers reflect that architecture plus Redux, and its update latency includes its frame batching. Do not read them as a verdict on RTK Query.
- Memory: NexAPI retained more per cache entry than TanStack Query in our runs and less per observer. Neither is "better"; they trade differently.
- The size comparison counts what is imported, and NexAPI's first entry includes its HTTP client and endpoint runtime, which TanStack Query does not have.
- The React scenario found one real redundant render in NexAPI (an extra notification on mount); it is fixed and covered by a test. After the fix render counts match TanStack Query's in these scenarios.
- No performance-superiority claim is made anywhere in this repository. If a claim is ever added, it must cite a specific scenario in a committed result file.
