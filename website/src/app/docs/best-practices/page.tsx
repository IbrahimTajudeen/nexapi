import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { AppLayers } from "@/components/Diagrams";
import { Doc, H2, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "Best practices" };

function DoDont({ doing, avoid }: { doing: string[]; avoid: string[] }) {
  return (
    <div className="do-dont">
      <div className="do">
        <h4>Do</h4>
        <ul>
          {doing.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
      <div className="dont">
        <h4>Avoid</h4>
        <ul>
          {avoid.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Doc
      href="/docs/best-practices/"
      title="Best practices"
      lede="Habits that keep a NyxAPI app fast, safe and easy to change. Each rule says why, so you can judge the exceptions yourself."
    >
      <AppLayers />

      <H2>Defaults worth knowing</H2>
      <p>Most surprises come from not knowing a default. These are the ones to remember.</p>
      <Table
        head={["Setting", "Default", "What it means for you"]}
        rows={[
          [
            <code key="1">staleTime</code>,
            "0",
            "Data is stale immediately, so every new observer refetches. Raise it for data that changes rarely.",
          ],
          [
            <code key="2">gcTime</code>,
            "5 minutes",
            "Unused entries leave memory after five minutes.",
          ],
          [
            <code key="3">retry (queries)</code>,
            "3, transient only",
            "Network, timeout, 408, 429 and 5xx retry; other 4xx do not.",
          ],
          [
            <code key="4">retry (mutations)</code>,
            "none",
            "Writes are never retried unless you opt in and say they are idempotent.",
          ],
          [
            <code key="5">timeoutMs</code>,
            "none",
            "Requests can wait forever. Set a timeout on the client.",
          ],
          [
            <code key="6">maxResponseBytes</code>,
            "unlimited",
            "Set a limit when you do not control the server.",
          ],
          [
            <code key="7">allowAbsoluteUrls</code>,
            "false",
            "Requests cannot leave the base URL's origin. Keep it that way.",
          ],
          [
            <code key="8">structuralSharing</code>,
            "false",
            "Refetched data replaces the old object. Turn on for large lists in memoized UI.",
          ],
          [
            <code key="9">validateResponses</code>,
            "true (needs generated shapes)",
            "Only does anything when you generated with validation on.",
          ],
          [
            <code key="10">networkMode</code>,
            "online",
            "Fetches pause while offline and resume on reconnect. Mutations are never paused.",
          ],
        ]}
      />

      <H2>Structure</H2>
      <DoDont
        doing={[
          "Create the client in one module and import it everywhere.",
          "Keep generated code in version control and review its diff.",
          "Keep hand-written endpoints in one file, typed, next to the client.",
          "Give each concern one owner: endpoints fetch, the client caches, components display.",
        ]}
        avoid={[
          "Calling fetch directly in components beside NyxAPI: you lose the cache, retries and typed errors.",
          "Creating a client inside a component. It would start with an empty cache on every mount.",
          "Editing files in generated/. Change the schema or the config, then regenerate.",
          "Copying server types by hand when a schema exists.",
        ]}
      />
      <p>
        See <Link href="/docs/codegen/">Code generation</Link> for config and{" "}
        <Link href="/docs/integrations/ci/">CI</Link> for keeping generated code in step with the
        schema.
      </p>

      <H2>Queries and caching</H2>
      <DoDont
        doing={[
          "Set staleTime per kind of data: seconds for feeds, minutes for profiles, Infinity for constants.",
          "Pass the engine's signal to anything you fetch in a custom queryFn.",
          "Use select to shape data for one component, and pass a stable function (defined outside the component).",
          "Use keepPreviousData for paged lists so the screen does not blank between pages.",
          "Use notifyOn when a component reads only one or two result fields.",
        ]}
        avoid={[
          "Copying query results into component state. The cache is the state.",
          "Putting volatile values (timestamps, random ids) in a key. Every render would be a new entry.",
          "Using initialData as a placeholder. It is real cache data and can make a query look fresh; use placeholderData for fake values.",
          "Disabling retries globally to hide flaky servers.",
        ]}
      />
      <Callout kind="read" title="A quick test for a good key">
        If two calls should share a result, do they produce the same key? If they should not, do
        they differ? Print <code>endpoint.key(request)</code> and look.
      </Callout>

      <H2>Mutations</H2>
      <DoDont
        doing={[
          "List what a write makes stale in invalidates, so the screen refreshes itself.",
          "Use helpers.optimistic for instant feedback; it rolls back exactly your own patch.",
          "Use a scope for writes that must stay in order, such as edits to one document.",
          "Retry only idempotent writes, and say so with idempotent: true.",
          "Show the server's message from error.body when a write is rejected.",
        ]}
        avoid={[
          "Blind retries of POST. A timeout does not mean the server did nothing.",
          "Writing to the cache by hand when invalidates would do.",
          "Ignoring onError in optimistic flows. The user must learn that the change did not stick.",
        ]}
      />

      <H2>Errors</H2>
      <DoDont
        doing={[
          "Turn errors into messages in one function, and reuse it.",
          "Branch on error.status for HttpError, and on the class for everything else.",
          "Type the error body of each endpoint so error.body needs no casts.",
          "Treat 401 as a session event, not a screen: refresh once, then sign out.",
        ]}
        avoid={[
          "Showing error.message to users. It is for developers.",
          "Catching and swallowing errors without a log or a visible state.",
          "Sending whole errors to a tracker without checking error.body for personal data.",
        ]}
      />

      <H2>Security</H2>
      <DoDont
        doing={[
          "Keep the base URL fixed and one per backend. The origin is pinned for you.",
          "Provide tokens through getToken so they are read fresh and never stored on the client object.",
          "Create a client per user on a server, and clear the cache on sign-out.",
          "Set maxResponseBytes and timeoutMs for third-party APIs.",
          "Turn on response validation for APIs you do not control.",
        ]}
        avoid={[
          "Secrets in query strings. They are stripped from errors but still travel and are logged by servers.",
          "allowAbsoluteUrls: true. If you need two hosts, create two clients.",
          "A shared client on a server. One visitor's cache and credentials would reach another.",
          "Embedding dehydrated state in HTML without escaping the less-than sign.",
        ]}
      />
      <p>
        Details in <Link href="/docs/security/">Security</Link>. On sign-out:
      </p>
      <Code lang="ts">{`function signOut() {
  nyx.queryClient.clear();   // drop every cached entry
  session.token = null;      // getToken now returns nothing
}`}</Code>

      <H2>Performance</H2>
      <DoDont
        doing={[
          "Share one client in the browser so every component hits the same cache.",
          "Prefetch on hover or focus for the next likely page.",
          "Raise staleTime before reaching for any other tuning. Most wasted requests are stale-by-default.",
          "Measure with the benchmarks and the devtools before optimising.",
        ]}
        avoid={[
          "Polling faster than the data changes.",
          "Fetching a huge list to show ten rows. Page it with infinite queries and maxPages.",
          "Turning on structuralSharing everywhere. It costs a deep compare on every refetch.",
        ]}
      />
      <p>
        See <Link href="/docs/benchmarks/">Benchmarks</Link> for what is measured, and what is not.
      </p>

      <H2>Teams and releases</H2>
      <DoDont
        doing={[
          "Run nyx generate --check in CI so the schema and generated code cannot drift.",
          "Pin NyxAPI packages to one version across the repo; they share a version number.",
          "Read the Releases page before upgrading. NyxAPI is pre-1.0, so minor versions can change the API.",
          "Add a runnable test for each custom endpoint using a function transport.",
        ]}
        avoid={[
          "Regenerating by hand and committing without reading the diff.",
          "Mixing package versions: core 0.1.x with an adapter from another line.",
        ]}
      />

      <H2>Production checklist</H2>
      <ul className="checklist">
        <li>The base URL comes from configuration, not from user input.</li>
        <li>A timeout is set on the client, and large or untrusted responses have a size limit.</li>
        <li>Tokens come from getToken; 401 is handled in one place.</li>
        <li>On a server, every request or user gets its own client.</li>
        <li>Sign-out clears the cache.</li>
        <li>Every mutation lists what it invalidates, or has a reason not to.</li>
        <li>Error messages are mapped in one function; unexpected errors are logged.</li>
        <li>Generated code is committed, and CI runs nyx generate --check.</li>
        <li>Pages that show lists use paging or maxPages.</li>
        <li>Tests use a function transport, not the real network.</li>
      </ul>
      <p>
        Learn the techniques behind these rules in <Link href="/docs/techniques/">Techniques</Link>,
        and see them applied in the <Link href="/docs/integrations/">integration guides</Link>.
      </p>
    </Doc>
  );
}
