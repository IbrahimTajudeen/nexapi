// React render benchmarks: NexAPI vs TanStack Query vs RTK Query, in jsdom with React production builds.
// Run: pnpm build && pnpm --filter @nexapi/benchmarks bench:react
// jsdom has no layout/paint, so this measures React work + library overhead only, not browser rendering.
process.env.NODE_ENV = "production";
import { JSDOM } from "jsdom";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";

const dom = new JSDOM("<!doctype html><div id=root></div>", { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.requestAnimationFrame = (cb) => dom.window.requestAnimationFrame(cb);
globalThis.cancelAnimationFrame = (id) => dom.window.cancelAnimationFrame(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const { createElement: h, Fragment } = await import("react");
const { flushSync } = await import("react-dom");
const { createRoot } = await import("react-dom/client");
const nexCore = await import("@nexapi/core");
const nexReact = await import("@nexapi/react");
const tan = await import("@tanstack/react-query");
const rtkq = await import("@reduxjs/toolkit/query/react");
const { configureStore } = await import("@reduxjs/toolkit");
const { Provider } = await import("react-redux");

const SAMPLES = Number(process.env.BENCH_SAMPLES ?? 25);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 5);
const N = Number(process.env.BENCH_COMPONENTS ?? 500);
const pkgVersion = (n) =>
  JSON.parse(readFileSync(new URL(`./node_modules/${n}/package.json`, import.meta.url), "utf8"))
    .version;

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(pred, what) {
  const t0 = performance.now();
  while (!pred()) {
    if (performance.now() - t0 > 10_000) throw new Error(`timeout waiting for ${what}`);
    await tick();
  }
}

/** Each adapter: mount(keys) -> {unmount, write(i, v), fetchCalls()} with N Item components. */
function counters() {
  return { renders: 0, committed: new Map() };
}

function adapters() {
  const payload = (v) => ({ id: 1, v });

  const nexapi = {
    name: "nexapi",
    setup(c, keyOf) {
      let calls = 0;
      const client = new nexCore.QueryClient({
        focusManager: { subscribe: () => () => {}, isFocused: () => true },
        onlineManager: { subscribe: () => () => {}, isOnline: () => true },
      });
      function Item({ i }) {
        c.renders++;
        const q = nexReact.useQuery({
          queryKey: keyOf(i),
          queryFn: () => (calls++, Promise.resolve(payload(0))),
          retry: false,
          gcTime: Infinity,
          staleTime: Infinity,
        });
        return h("i", { "data-v": q.data?.v ?? "" });
      }
      return {
        Item,
        wrap: (child) => h(nexReact.NexProvider, { client }, child),
        write: (i, v) => client.setData(keyOf(i), payload(v)),
        calls: () => calls,
      };
    },
  };

  const tanstack = {
    name: "tanstack",
    setup(c, keyOf) {
      let calls = 0;
      const client = new tan.QueryClient();
      function Item({ i }) {
        c.renders++;
        const q = tan.useQuery({
          queryKey: keyOf(i),
          queryFn: () => (calls++, Promise.resolve(payload(0))),
          retry: false,
          gcTime: Infinity,
          staleTime: Infinity,
        });
        return h("i", { "data-v": q.data?.v ?? "" });
      }
      return {
        Item,
        wrap: (child) => h(tan.QueryClientProvider, { client }, child),
        write: (i, v) => client.setQueryData(keyOf(i), payload(v)),
        calls: () => calls,
      };
    },
  };

  const rtk = {
    name: "rtk-query",
    setup(c, keyOf) {
      let calls = 0;
      const api = rtkq.createApi({
        reducerPath: "api",
        baseQuery: rtkq.fakeBaseQuery(),
        keepUnusedDataFor: 3600,
        endpoints: (b) => ({
          item: b.query({
            queryFn: () => (calls++, Promise.resolve({ data: payload(0) })),
          }),
        }),
      });
      const store = configureStore({
        reducer: { [api.reducerPath]: api.reducer },
        middleware: (gd) =>
          gd({ serializableCheck: false, immutableCheck: false }).concat(api.middleware),
      });
      // RTK Query args are serialized; use the numeric key (or 0 for the shared scenario).
      const argOf = (i) => keyOf(i)[1];
      function Item({ i }) {
        c.renders++;
        const q = api.useItemQuery(argOf(i));
        return h("i", { "data-v": q.data?.v ?? "" });
      }
      return {
        Item,
        wrap: (child) => h(Provider, { store }, child),
        write: (i, v) => store.dispatch(api.util.upsertQueryData("item", argOf(i), payload(v))),
        calls: () => calls,
      };
    },
  };
  return [nexapi, tanstack, rtk];
}

const rootEl = document.getElementById("root");
const seen = (el) => [...el.querySelectorAll("i")].map((n) => n.getAttribute("data-v"));

async function scenario(kind, adapter) {
  const c = counters();
  const keyOf = kind === "shared" ? () => ["item", 0] : (i) => ["item", i];
  const a = adapter.setup(c, keyOf);
  const root = createRoot(rootEl);
  const items = Array.from({ length: N }, (_, i) => h(a.Item, { key: i, i }));
  const t0 = performance.now();
  flushSync(() => root.render(a.wrap(h(Fragment, null, ...items))));
  await until(() => seen(rootEl).filter((v) => v === "0").length === N, "initial data");
  const mountMs = performance.now() - t0;
  const expectedCalls = kind === "shared" ? 1 : N;
  if (a.calls() !== expectedCalls)
    throw new Error(
      `${adapter.name}/${kind}: expected ${expectedCalls} requests, got ${a.calls()}`,
    );
  const rendersAfterMount = c.renders;

  // one write; time until every subscribed component shows it
  const t1 = performance.now();
  a.write(0, 1);
  const want = kind === "shared" ? N : 1;
  await until(() => seen(rootEl).filter((v) => v === "1").length === want, "update");
  const updateMs = performance.now() - t1;
  const updateRenders = c.renders - rendersAfterMount;
  root.unmount();
  await tick();
  return { mountMs, updateMs, updateRenders, mountRenders: rendersAfterMount };
}

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))];
const results = [];
for (const kind of ["shared", "distinct"]) {
  for (const adapter of adapters()) {
    const runs = [];
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      globalThis.gc?.();
      const r = await scenario(kind, adapter);
      if (i >= WARMUP) runs.push(r);
    }
    results.push({
      scenario:
        kind === "shared"
          ? `${N} components, same key: mount (1 request) / 1 write`
          : `${N} components, distinct keys: mount (${N} requests) / write to 1 key`,
      library: adapter.name,
      mountMsMedian: med(runs.map((r) => r.mountMs)),
      mountMsP95: p95(runs.map((r) => r.mountMs)),
      updateMsMedian: med(runs.map((r) => r.updateMs)),
      updateMsP95: p95(runs.map((r) => r.updateMs)),
      mountRenders: med(runs.map((r) => r.mountRenders)),
      updateRenders: med(runs.map((r) => r.updateRenders)),
    });
  }
}

const env = {
  node: process.version,
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  cpu: os.cpus()[0]?.model,
  react: pkgVersion("react"),
  jsdom: pkgVersion("jsdom"),
  versions: {
    "@tanstack/react-query": pkgVersion("@tanstack/react-query"),
    "@reduxjs/toolkit": pkgVersion("@reduxjs/toolkit"),
    "react-redux": pkgVersion("react-redux"),
    "@nexapi/react": JSON.parse(
      readFileSync(new URL("../packages/react/package.json", import.meta.url), "utf8"),
    ).version,
  },
  components: N,
  samples: SAMPLES,
  warmup: WARMUP,
  date: new Date().toISOString(),
};
const f = (n) => `${n.toFixed(1)} ms`;
let md = `| scenario | library | mount median | mount p95 | update median | update p95 | renders at mount | renders per update |\n|---|---|---|---|---|---|---|---|\n`;
for (const r of results)
  md += `| ${r.scenario} | ${r.library} | ${f(r.mountMsMedian)} | ${f(r.mountMsP95)} | ${f(r.updateMsMedian)} | ${f(r.updateMsP95)} | ${r.mountRenders} | ${r.updateRenders} |\n`;
console.log(`\n${JSON.stringify(env, null, 2)}\n\n${md}`);
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./results/react.json", import.meta.url),
  JSON.stringify({ env, results }, null, 2) + "\n",
);
writeFileSync(new URL("./results/react.md", import.meta.url), md);
process.exit(0);
