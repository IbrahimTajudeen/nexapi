// Reproducible micro/meso benchmarks: NexAPI core vs @tanstack/query-core.
// Run from the repo root:  pnpm build && pnpm bench
// Everything is headless (no React, no network). See README.md for what this does NOT measure.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  QueryClient as TanstackClient,
  QueryObserver as TanstackObserver,
} from "@tanstack/query-core";
import { QueryClient as NexClient, QueryObserver as NexObserver } from "@nexapi/core";

const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 200);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 30);

const version = (name) =>
  JSON.parse(readFileSync(new URL(`./node_modules/${name}/package.json`, import.meta.url), "utf8"))
    .version;

function stats(perOpNs) {
  const s = [...perOpNs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { median: q(0.5), p95: q(0.95), p99: q(0.99), min: s[0], max: s.at(-1) };
}

/** `run()` performs `opsPerSample` operations; returns total ms for the batch (sync or async). */
async function measure(name, opsPerSample, setup, run) {
  const samples = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const ctx = await setup();
    globalThis.gc?.();
    const t0 = performance.now();
    await run(ctx);
    const ms = performance.now() - t0;
    if (i >= WARMUP) samples.push((ms * 1e6) / opsPerSample);
  }
  return { name, opsPerSample, ...stats(samples) };
}

const nexOpts = (key, queryFn, extra = {}) => ({
  queryKey: key,
  queryFn,
  retry: false,
  gcTime: Infinity,
  ...extra,
});
const tanOpts = (key, queryFn, extra = {}) => ({
  queryKey: key,
  queryFn,
  retry: false,
  gcTime: Infinity,
  ...extra,
});
const FOCUS_OFF = { subscribe: () => () => {}, isFocused: () => true };
const mkNex = () =>
  new NexClient({
    focusManager: FOCUS_OFF,
    onlineManager: { subscribe: () => () => {}, isOnline: () => true },
  });
const mkTan = () => new TanstackClient();

const results = [];
const record = (scenario, library, r) => results.push({ scenario, library, ...r });

// 1. Warm-cache reads ------------------------------------------------------------------------------
{
  const OPS = 20_000;
  const payload = { id: 1, name: "x", tags: ["a", "b"] };
  const nex = mkNex();
  await nex.fetchQuery(nexOpts(["user", 1], () => Promise.resolve(payload)));
  const tan = mkTan();
  await tan.fetchQuery(tanOpts(["user", 1], () => Promise.resolve(payload)));
  record(
    "warm read: getData / getQueryData (sync, key hashed each call)",
    "nexapi",
    await measure(
      "",
      OPS,
      () => 0,
      () => {
        for (let i = 0; i < OPS; i++) nex.getData(["user", 1]);
      },
    ),
  );
  record(
    "warm read: getData / getQueryData (sync, key hashed each call)",
    "tanstack",
    await measure(
      "",
      OPS,
      () => 0,
      () => {
        for (let i = 0; i < OPS; i++) tan.getQueryData(["user", 1]);
      },
    ),
  );
  const OPS2 = 5_000;
  record(
    "warm read: fetchQuery on fresh data (async, staleTime=Infinity)",
    "nexapi",
    await measure(
      "",
      OPS2,
      () => 0,
      async () => {
        for (let i = 0; i < OPS2; i++)
          await nex.fetchQuery(
            nexOpts(["user", 1], () => Promise.resolve(payload), { staleTime: Infinity }),
          );
      },
    ),
  );
  record(
    "warm read: fetchQuery on fresh data (async, staleTime=Infinity)",
    "tanstack",
    await measure(
      "",
      OPS2,
      () => 0,
      async () => {
        for (let i = 0; i < OPS2; i++)
          await tan.fetchQuery(
            tanOpts(["user", 1], () => Promise.resolve(payload), { staleTime: Infinity }),
          );
      },
    ),
  );
}

// 2. Cold query + concurrent identical queries (single flight) ---------------------------------------------
for (const N of [1, 1000]) {
  const label =
    N === 1
      ? "cold query: one fetchQuery, resolved queryFn"
      : "concurrent identical: 1000 fetchQuery calls, one key";
  let nexCalls = 0;
  let tanCalls = 0;
  record(
    label,
    "nexapi",
    await measure("", N, mkNex, async (c) => {
      const fn = () => (nexCalls++, Promise.resolve({ ok: true }));
      await Promise.all(Array.from({ length: N }, () => c.fetchQuery(nexOpts(["k"], fn))));
    }),
  );
  record(
    label,
    "tanstack",
    await measure("", N, mkTan, async (c) => {
      const fn = () => (tanCalls++, Promise.resolve({ ok: true }));
      await Promise.all(Array.from({ length: N }, () => c.fetchQuery(tanOpts(["k"], fn))));
    }),
  );
  // correctness guard: a benchmark that does not deduplicate would be measuring the wrong thing
  const expected = WARMUP + SAMPLES;
  if (nexCalls !== expected || tanCalls !== expected)
    throw new Error(
      `dedup check failed for "${label}": nexapi=${nexCalls} tanstack=${tanCalls} expected=${expected}`,
    );
}

// 3. Large cache lookups ----------------------------------------------------------------------------------
{
  const SIZE = 50_000;
  const OPS = 20_000;
  const nex = mkNex();
  const tan = mkTan();
  for (let i = 0; i < SIZE; i++) {
    nex.setData(["item", i, { v: 1 }], { i });
    tan.setQueryData(["item", i, { v: 1 }], { i });
  }
  const picks = Array.from({ length: OPS }, (_, i) => (i * 7919) % SIZE);
  record(
    `large cache: ${SIZE} entries, point lookup`,
    "nexapi",
    await measure(
      "",
      OPS,
      () => 0,
      () => {
        for (const i of picks) nex.getData(["item", i, { v: 1 }]);
      },
    ),
  );
  record(
    `large cache: ${SIZE} entries, point lookup`,
    "tanstack",
    await measure(
      "",
      OPS,
      () => 0,
      () => {
        for (const i of picks) tan.getQueryData(["item", i, { v: 1 }]);
      },
    ),
  );
}

// 4. Many observers on one key, one write --------------------------------------------------------------------
{
  const OBSERVERS = 5_000;
  const run = async (mk, Observer, opts, write) => {
    const client = mk();
    let hits = 0;
    let done;
    const target = OBSERVERS;
    const unsubs = [];
    for (let i = 0; i < OBSERVERS; i++) {
      const o = new Observer(
        client,
        opts(["shared"], () => new Promise(() => {}), { enabled: false }),
      );
      unsubs.push(
        o.subscribe(() => {
          if (++hits === target) done?.();
        }),
      );
    }
    hits = 0;
    const finished = new Promise((r) => (done = r));
    const t0 = performance.now();
    write(client);
    await finished; // TanStack notifies through its batching scheduler, so we wait for the last listener
    const ms = performance.now() - t0;
    unsubs.forEach((u) => u());
    return ms;
  };
  const samples = { nexapi: [], tanstack: [] };
  for (let i = 0; i < Math.max(10, WARMUP / 3) + Math.min(SAMPLES, 40); i++) {
    const a = await run(mkNex, NexObserver, nexOpts, (c) => c.setData(["shared"], { v: i }));
    const b = await run(mkTan, TanstackObserver, tanOpts, (c) =>
      c.setQueryData(["shared"], { v: i }),
    );
    if (i >= Math.max(10, WARMUP / 3)) {
      samples.nexapi.push((a * 1e6) / OBSERVERS);
      samples.tanstack.push((b * 1e6) / OBSERVERS);
    }
  }
  const label = `${OBSERVERS} observers on one key: setData → last listener called`;
  record(label, "nexapi", { name: "", opsPerSample: OBSERVERS, ...stats(samples.nexapi) });
  record(label, "tanstack", { name: "", opsPerSample: OBSERVERS, ...stats(samples.tanstack) });
}

// ---- report ---------------------------------------------------------------------------------------------
const env = {
  node: process.version,
  v8: process.versions.v8,
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  cpu: os.cpus()[0]?.model,
  cores: os.cpus().length,
  memoryGB: Math.round(os.totalmem() / 2 ** 30),
  samples: SAMPLES,
  warmup: WARMUP,
  versions: {
    "@tanstack/query-core": version("@tanstack/query-core"),
    "@nexapi/core": JSON.parse(
      readFileSync(new URL("../packages/core/package.json", import.meta.url), "utf8"),
    ).version,
  },
  policy:
    "retry=false, gcTime=Infinity, staleTime as stated per scenario, focus/online managers inert",
  date: new Date().toISOString(),
};
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)} µs` : `${n.toFixed(0)} ns`);
const scenarios = [...new Set(results.map((r) => r.scenario))];
let md = `| scenario | library | median / op | p95 | p99 |\n|---|---|---|---|---|\n`;
for (const s of scenarios)
  for (const r of results.filter((x) => x.scenario === s))
    md += `| ${s} | ${r.library} | ${fmt(r.median)} | ${fmt(r.p95)} | ${fmt(r.p99)} |\n`;
console.log(`\n${JSON.stringify(env, null, 2)}\n\n${md}`);
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./results/latest.json", import.meta.url),
  JSON.stringify({ env, results }, null, 2) + "\n",
);
writeFileSync(new URL("./results/latest.md", import.meta.url), md);
