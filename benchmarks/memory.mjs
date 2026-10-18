// Retained heap for a populated cache. Each measurement runs in a fresh child process.
// Run: pnpm build && pnpm --filter @nexapi/benchmarks bench:memory
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ENTRIES = Number(process.env.BENCH_ENTRIES ?? 20_000);
const RUNS = Number(process.env.BENCH_RUNS ?? 7);
const OBSERVED = Number(process.env.BENCH_OBSERVED ?? 2_000);

if (process.argv[2] === "child") {
  const lib = process.argv[3];
  const payload = (i) => ({ id: i, name: `user-${i}`, tags: ["a", "b", "c"], nested: { n: i } });
  const gc = () => {
    globalThis.gc();
    globalThis.gc();
  };
  let client;
  let observers = [];
  let keep;
  if (lib === "nexapi") {
    const core = await import("@nexapi/core");
    client = new core.QueryClient({
      focusManager: { subscribe: () => () => {}, isFocused: () => true },
      onlineManager: { subscribe: () => () => {}, isOnline: () => true },
    });
    gc();
    const base = process.memoryUsage().heapUsed;
    for (let i = 0; i < ENTRIES; i++) client.setData(["item", i, { v: 1 }], payload(i));
    gc();
    const entries = process.memoryUsage().heapUsed;
    for (let i = 0; i < OBSERVED; i++) {
      const o = new core.QueryObserver(client, {
        queryKey: ["item", i, { v: 1 }],
        queryFn: () => Promise.resolve(payload(i)),
        staleTime: Infinity,
        gcTime: Infinity,
      });
      o.subscribe(() => {});
      observers.push(o);
    }
    gc();
    console.log(
      JSON.stringify({
        entries: entries - base,
        observers: process.memoryUsage().heapUsed - entries,
      }),
    );
    keep = [client, observers];
  } else {
    const tq = await import("@tanstack/query-core");
    client = new tq.QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    gc();
    const base = process.memoryUsage().heapUsed;
    for (let i = 0; i < ENTRIES; i++) client.setQueryData(["item", i, { v: 1 }], payload(i));
    gc();
    const entries = process.memoryUsage().heapUsed;
    for (let i = 0; i < OBSERVED; i++) {
      const o = new tq.QueryObserver(client, {
        queryKey: ["item", i, { v: 1 }],
        queryFn: () => Promise.resolve(payload(i)),
        staleTime: Infinity,
        gcTime: Infinity,
      });
      o.subscribe(() => {});
      observers.push(o);
    }
    gc();
    console.log(
      JSON.stringify({
        entries: entries - base,
        observers: process.memoryUsage().heapUsed - entries,
      }),
    );
    keep = [client, observers];
  }
  void keep;
  process.exit(0);
}

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const rows = [];
for (const lib of ["nexapi", "tanstack"]) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const r = spawnSync(
      process.execPath,
      ["--expose-gc", fileURLToPath(import.meta.url), "child", lib],
      {
        encoding: "utf8",
        env: { ...process.env, BENCH_ENTRIES: String(ENTRIES), BENCH_OBSERVED: String(OBSERVED) },
      },
    );
    if (r.status !== 0) throw new Error(r.stderr);
    runs.push(JSON.parse(r.stdout.trim().split("\n").at(-1)));
  }
  rows.push({
    library: lib,
    bytesPerEntry: med(runs.map((r) => r.entries)) / ENTRIES,
    bytesPerObserver: med(runs.map((r) => r.observers)) / OBSERVED,
  });
}
const version = (n) =>
  JSON.parse(readFileSync(new URL(`./node_modules/${n}/package.json`, import.meta.url), "utf8"))
    .version;
const env = {
  node: process.version,
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  entries: ENTRIES,
  observers: OBSERVED,
  runs: RUNS,
  versions: { "@tanstack/query-core": version("@tanstack/query-core") },
  note: "heapUsed after two forced GCs; payload {id,name,tags[3],nested} is included in the per-entry figure",
  date: new Date().toISOString(),
};
let md = `| library | retained bytes / cache entry (median) | retained bytes / observer (median) |\n|---|---|---|\n`;
for (const r of rows)
  md += `| ${r.library} | ${r.bytesPerEntry.toFixed(0)} | ${r.bytesPerObserver.toFixed(0)} |\n`;
console.log(`\n${JSON.stringify(env, null, 2)}\n\n${md}`);
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./results/memory.json", import.meta.url),
  JSON.stringify({ env, rows }, null, 2) + "\n",
);
writeFileSync(new URL("./results/memory.md", import.meta.url), md);
