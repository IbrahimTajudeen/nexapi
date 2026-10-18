# Benchmarks

```bash
pnpm build && pnpm bench            # BENCH_SAMPLES=200 BENCH_WARMUP=30 by default
```

Output: a table on stdout plus `benchmarks/results/latest.{json,md}` (git-ignored; results are machine specific).
Each result file records Node/V8 version, OS, CPU, library versions, cache policy, sample counts and a date.

## Method

- Headless: `@syncapi/core` vs `@tanstack/query-core` (pinned in `package.json`). No React, no network, no timers in `queryFn`s (they resolve immediately).
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

## Not measured yet (do not infer anything about these)

- React renders and commits (needs a React harness for both libraries).
- **Redux Toolkit Query**: it requires a Redux store and is hook-first, so a fair headless comparison is not possible; it will be added together with the React benchmarks.
- Memory use and allocations (needs `--heap-prof`/`process.memoryUsage` methodology and repeated isolated runs).
- Mutation invalidation and optimistic rollback comparisons.

## Reading the results honestly

- syncapi does **less** per operation than TanStack Query by design and by current maturity: no `notifyManager` batching, no tracked-property result proxies, structural sharing is opt-in, no persisters/devtools hooks. A faster number can simply mean fewer features. In particular, in the observer scenario syncapi notifies synchronously whereas TanStack batches through its scheduler, so the two measure different notification semantics.
- Samples come from a small shared VM (see the recorded environment); absolute numbers will differ elsewhere. Compare ratios across several runs on your own hardware before drawing conclusions.
- No performance-superiority claim is made anywhere in this repository. If a claim is ever added, it must cite a specific scenario in a committed result file.
