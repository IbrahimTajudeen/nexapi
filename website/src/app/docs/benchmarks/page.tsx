import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "Benchmarks" };

export default function Page() {
  return (
    <Doc
      href="/docs/benchmarks/"
      title="Benchmarks"
      lede="Performance is measured against TanStack Query and RTK Query, with the method written down. These numbers show what was measured on one machine. They are not a ranking."
    >
      <Callout kind="warn" title="Read this before the numbers">
        <ul style={{ margin: 0 }}>
          <li>
            NyxAPI does <strong>less</strong> per operation than TanStack Query: no scheduler
            batching, no tracked-property result proxies, structural sharing is opt-in, and there
            are no persisters. A faster number can simply mean fewer features.
          </li>
          <li>
            RTK Query is a different design (a Redux slice with frame-batched notifications). Its
            numbers reflect that plus Redux.
          </li>
          <li>
            These were one run on a small shared VM (Node 22.22, 2 cores). Absolute figures will
            differ on your hardware. Compare ratios over several runs on your own machine.
          </li>
          <li>No performance-superiority claim is made.</li>
        </ul>
      </Callout>

      <H2>Run them yourself</H2>
      <Code lang="bash" title="terminal">{`pnpm build
pnpm --filter @nyxapi/benchmarks bench           # headless engine comparison
pnpm --filter @nyxapi/benchmarks bench:react     # React, jsdom, three libraries
pnpm --filter @nyxapi/benchmarks bench:memory    # retained heap, fresh process each
pnpm --filter @nyxapi/benchmarks size            # bundle size and budgets`}</Code>
      <p>
        Each result file records the Node and V8 versions, OS, CPU, library versions, cache policy
        and sample counts, so a number always travels with the conditions that produced it.
      </p>

      <H2>Method</H2>
      <ul>
        <li>
          The headless benchmarks compare <code>@nyxapi/core</code> with{" "}
          <code>@tanstack/query-core</code>, pinned, with no React and no network.
        </li>
        <li>
          Both sides use the same policy: no retries, no garbage collection, inert focus and online
          managers.
        </li>
        <li>
          A sample is a batch of operations timed with <code>performance.now()</code>. We report
          median, p95 and p99 per operation after warm-up, with garbage collection forced between
          samples.
        </li>
        <li>
          The sharing scenarios assert the query function ran exactly once and abort otherwise,
          because a benchmark that does not share requests would measure the wrong thing.
        </li>
      </ul>

      <H2>Headless engine</H2>
      <p>Per operation, lower is faster. Sample run:</p>
      <Table
        head={["Scenario", "NyxAPI", "TanStack Query"]}
        rows={[
          ["Warm read, getData (key hashed each call)", "167 ns", "695 ns"],
          ["Warm read, fetchQuery on fresh data", "465 ns", "1.42 µs"],
          ["Cold query, one fetchQuery", "212 µs", "203 µs"],
          ["1000 concurrent identical fetchQuery calls", "738 ns", "1.51 µs"],
          ["50 000 entries, point lookup", "1.29 µs", "2.01 µs"],
          ["5 000 observers, setData to last listener", "129 ns", "839 ns"],
        ]}
      />
      <p>
        The last row is not like for like: NyxAPI notifies listeners synchronously, while TanStack
        batches through its scheduler.
      </p>

      <H2>React, 500 components</H2>
      <p>
        jsdom with React production builds, so this is React plus library overhead, with no layout
        or paint. Medians:
      </p>
      <Table
        head={["Scenario", "Library", "Mount", "One write", "Renders at mount"]}
        rows={[
          ["Same key (1 request)", "NyxAPI", "26 ms", "8.4 ms", "1000"],
          ["Same key (1 request)", "TanStack Query", "46 ms", "19.6 ms", "1000"],
          ["Same key (1 request)", "RTK Query", "154 ms", "36.8 ms", "1500"],
          ["Distinct keys (500 requests)", "NyxAPI", "28 ms", "2.6 ms", "1000"],
          ["Distinct keys (500 requests)", "TanStack Query", "157 ms", "3.1 ms", "1000"],
          ["Distinct keys (500 requests)", "RTK Query", "513 ms", "24.3 ms", "1500"],
        ]}
      />
      <p>
        RTK Query&apos;s update time includes its frame batching by design. This benchmark also
        found a real redundant render in NyxAPI on mount (an extra notification), which is fixed and
        covered by a test.
      </p>

      <H2>Memory</H2>
      <p>
        Retained heap after two forced collections, median of 7 fresh processes, 20 000 entries and
        2 000 observers:
      </p>
      <Table
        head={["Library", "Bytes per cache entry", "Bytes per observer"]}
        rows={[
          ["NyxAPI", "1206", "624"],
          ["TanStack Query", "990", "1505"],
        ]}
      />
      <p>
        NyxAPI retained more per entry and less per observer in these runs. Neither is better; they
        trade differently.
      </p>

      <H2>Bundle size</H2>
      <p>What an app imports, tree-shaken, minified and gzipped, React excluded:</p>
      <Table
        head={["Entry", "Minified", "Gzip"]}
        rows={[
          ["NyxAPI: createNyxClient (HTTP + QueryClient)", "24.4 KiB", "8.5 KiB"],
          ["NyxAPI: React app (client + useQuery + provider)", "19.2 KiB", "6.5 KiB"],
          ["TanStack: query-core QueryClient", "23.9 KiB", "7.1 KiB"],
          ["TanStack: React app (client + useQuery + provider)", "32.2 KiB", "9.7 KiB"],
          ["RTK Query: React createApi + store", "73.4 KiB", "25.8 KiB"],
        ]}
      />
      <p>
        The entries are not feature-equivalent. NyxAPI&apos;s first row includes its HTTP client and
        endpoint runtime, which TanStack Query does not have. NyxAPI entries have budgets in CI that
        fail the build when exceeded.
      </p>

      <H2>Not measured yet</H2>
      <ul>
        <li>Real browser rendering and hydration cost.</li>
        <li>Memory growth over a long session.</li>
        <li>Mutation invalidation and optimistic rollback comparisons.</li>
      </ul>
    </Doc>
  );
}
