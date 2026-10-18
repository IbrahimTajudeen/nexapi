import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";
import { PackageInstall } from "@/components/PackageInstall";

export const metadata: Metadata = { title: "Devtools" };

export default function Page() {
  return (
    <Doc
      href="/docs/devtools/"
      title="Devtools"
      lede="See what is in your cache while you build: which queries exist, what state they are in, who is watching, and what just happened."
    >
      <H2>Install</H2>
      <PackageInstall packages="@nyxapi/devtools" dev />

      <H2>The React panel</H2>
      <Code lang="tsx">{`import { NyxProvider } from "@nyxapi/react";
import { NyxDevtools } from "@nyxapi/devtools/react";

<NyxProvider client={nyx.queryClient}>
  <App />
  <NyxDevtools />
</NyxProvider>`}</Code>
      <p>
        A small button opens the panel. Each query shows its key, status, fetch status and number of
        observers, with buttons to refetch, invalidate or remove it. Data is hidden until you click{" "}
        <strong>data</strong> on that row.
      </p>
      <Callout kind="note" title="Off in production">
        The panel renders nothing when <code>process.env.NODE_ENV === &quot;production&quot;</code>.
        Pass <code>force</code> to show it anyway.
      </Callout>
      <Table
        head={["Prop", "Meaning"]}
        rows={[
          [<code key="a">client</code>, "A QueryClient. Defaults to the one from NyxProvider."],
          [<code key="b">defaultOpen</code>, "Start expanded."],
          [<code key="c">force</code>, "Render in production builds."],
          [<code key="d">redact</code>, "Control what the data view may show (see below)."],
        ]}
      />

      <H2>The inspector, without React</H2>
      <p>
        The panel is built on <code>createInspector</code>, which works anywhere:
      </p>
      <Code lang="ts">{`import { createInspector } from "@nyxapi/devtools";

const inspector = createInspector(nyx.queryClient, {
  maxEvents: 200,
  redact: (key, data) => (key[1] === "/auth/login" ? "[hidden]" : data),
});

inspector.subscribe(() => {
  const { queries, events } = inspector.snapshot();
  console.table(queries.map((q) => ({ key: JSON.stringify(q.key), status: q.status, observers: q.observers })));
});`}</Code>
      <ul>
        <li>
          <code>snapshot()</code> lists queries (status, observers, errors by name and message,
          timestamps), mutations in flight and the most recent events: added, fetch started,
          success, error, invalidated, removed. It is the same object until something changes, so it
          works with <code>useSyncExternalStore</code>.
        </li>
        <li>
          <code>inspectData(hash)</code> returns one entry&apos;s data through your{" "}
          <code>redact</code> function.
        </li>
        <li>
          <code>refetch</code>, <code>invalidate</code> and <code>remove</code> act on one entry.
          Call <code>dispose()</code> when done.
        </li>
      </ul>

      <H2>Private by default</H2>
      <p>
        Snapshots never contain cached data, variables or credentials, because data can be large and
        personal. Data is read only when you ask for one entry, and always through{" "}
        <code>redact</code>.
      </p>
    </Doc>
  );
}
