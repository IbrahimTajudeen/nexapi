import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { OptionLab } from "@/components/OptionLab";
import { Doc, H2, H3, Table } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "Queries and caching" };

export default function Page() {
  return (
    <Doc
      href="/docs/queries/"
      title="Queries and caching"
      lede="A query is a read you want to cache. The query client remembers results, shares requests, and decides when data needs refreshing."
    >
      <Callout kind="read" title="Reads">
        Everything on this page is about reading data. Writes are in{" "}
        <Link href="/docs/mutations/">Mutations</Link>.
      </Callout>

      <H2>Fetch through the cache</H2>
      <p>
        Every NyxAPI client has a query client at <code>nyx.queryClient</code>. Hand it an
        endpoint&apos;s <code>options()</code> and it fetches, stores and shares the result:
      </p>
      <Code lang="ts">{`const options = api.users.byId("1").get.options();
const user = await nyx.queryClient.fetchQuery(options);`}</Code>

      <H2>One request for many callers</H2>
      <p>
        When several parts of your app ask for the same thing at the same time, only one request
        goes out and everyone receives the result. This is called single flight. Five callers, one
        request:
      </p>
      <Runnable id="singleFlight" />
      <p>
        “The same thing” is decided by the cache key, which is built from the HTTP method, the path
        template, the path parameters and the request options. Object key order does not matter, so{" "}
        <code>{"{ a: 1, b: 2 }"}</code> and <code>{"{ b: 2, a: 1 }"}</code> are the same query.
      </p>

      <H2>Freshness</H2>
      <p>
        <code>staleTime</code> says how long data counts as fresh, in milliseconds. While data is
        fresh, asking for it again is answered from the cache with no request. The default is 0,
        meaning data is stale immediately, so each new observer refreshes it. Use{" "}
        <code>Infinity</code> for data that never goes stale.
      </p>
      <Runnable id="freshness" />
      <Table
        head={["Option", "Default", "Meaning"]}
        rows={[
          [<code key="a">staleTime</code>, "0", "How long fetched data is fresh."],
          [
            <code key="b">gcTime</code>,
            "5 minutes",
            "How long an unused entry stays in memory before being removed. Infinity keeps it.",
          ],
          [
            <code key="c">retry</code>,
            "3 for transient failures",
            "false, a number, or a function (failureCount, error) => boolean.",
          ],
          [<code key="d">retryDelay</code>, "exponential", "A number of ms, or a function."],
          [
            <code key="e">enabled</code>,
            "true",
            "When false, a watching hook does not fetch by itself.",
          ],
          [
            <code key="f">refetchOnWindowFocus</code>,
            "true",
            "Refetch stale data when the tab regains focus.",
          ],
          [
            <code key="g">refetchOnReconnect</code>,
            "true",
            "Refetch stale data when the network comes back.",
          ],
          [
            <code key="h">refetchInterval</code>,
            "off",
            "Poll every N ms while something is watching.",
          ],
          [<code key="i">select</code>, "none", "Derive what you observe from the cached data."],
          [
            <code key="j">placeholderData</code>,
            "none",
            "Show this while there is no data yet. It is never written to the cache. A function receives the previous query's data, so keepPreviousData keeps the old page on screen while a new key loads.",
          ],
          [
            <code key="k">initialData</code>,
            "none",
            "Seeds the cache entry when it is first created (a value or a function). Ignored if the entry already exists.",
          ],
          [
            <code key="l">initialDataUpdatedAt</code>,
            "now",
            "When the seed was produced, in ms since the epoch. An older time makes it go stale sooner.",
          ],
          [
            <code key="m">refetchOnMount</code>,
            "true",
            "Whether a newly mounted observer refetches stale data. false uses whatever is cached.",
          ],
          [
            <code key="n">networkMode</code>,
            '"online"',
            '"online": while offline a fetch waits with fetchStatus "paused" and resumes on reconnect. "always": never waits.',
          ],
          [
            <code key="o">structuralSharing</code>,
            "false",
            "Reuse unchanged parts of refetched data so object identities stay stable.",
          ],
          [
            <code key="p">notifyOn</code>,
            "all fields",
            "Only notify listeners when one of these result fields changes.",
          ],
          [
            <code key="q">meta</code>,
            "none",
            "Free-form data passed to the query function context, for your own middleware or logging.",
          ],
        ]}
      />
      <p>
        Set defaults for every query when you create the client, and override per query through the
        second argument of <code>options()</code>:
      </p>
      <Code lang="ts">{`const nyx = createNyxClient({
  baseUrl: "https://api.example.com/v1",
  queryClient: { defaultOptions: { queries: { staleTime: 30_000 } } },
});

api.users.byId("1").get.options(undefined, { staleTime: 5 * 60_000 });`}</Code>

      <H2>Retries</H2>
      <p>
        By default a failed read is retried up to three times, but only when retrying could help:
        network failures, timeouts, and the statuses 408, 429 and 5xx. A 404 or a validation error
        would fail the same way again, so they are not retried.
      </p>
      <Runnable id="retries" />

      <H2>Invalidation</H2>
      <p>
        Invalidating marks cached data as stale. If something is watching the query (a React
        component, for example) it refetches right away; otherwise the next request refetches. Pass
        a request to target one variant, or none to target every variant of the route:
      </p>
      <Code lang="ts">{`await api.users.byId("1").get.invalidate();          // every variant for user 1
await api.users.list.get.invalidate({ query: { page: 2 } }); // one variant

// or by key prefix, across routes
await nyx.queryClient.invalidateQueries(["GET", "/users"]);`}</Code>

      <H2>Reading and writing the cache directly</H2>
      <Runnable id="prefetch" />
      <Code lang="ts">{`nyx.queryClient.getData(key);                 // read, never fetches
nyx.queryClient.setData(key, (old) => ({ ...old, name: "New" })); // write confirmed data
nyx.queryClient.removeQueries(filter);        // delete entries
nyx.queryClient.clear();                      // delete everything`}</Code>
      <p>
        A manual <code>setData</code> beats any request that started before it, so a slow response
        cannot overwrite a newer write.
      </p>

      <H2>Cache keys</H2>
      <p>
        You rarely write keys by hand, because every endpoint has a <code>key()</code> method. The
        shape is useful to know when you filter:
      </p>
      <Runnable id="cacheKeys" />
      <p>
        Keys can hold strings, finite numbers, booleans, null, dates, arrays and plain objects.
        Anything else throws, so two different values can never silently collide. Filters match
        array prefixes, with objects compared as deep partials.
      </p>

      <H2>Cancelling</H2>
      <p>
        Every request carries an <code>AbortSignal</code>. A request is cancelled only when nobody
        is waiting for it any more: no watching component and no caller of <code>fetchQuery</code>.
        Cancelling always settles waiting callers, even when your function ignores the signal.
      </p>
      <Code lang="ts">{`nyx.queryClient.cancelQueries(api.users.byId("1").get.key());`}</Code>

      <H3>Looking inside</H3>
      <Runnable id="inspect" />
      <p>
        For a live view while you develop, see <Link href="/docs/devtools/">Devtools</Link>.
      </p>

      <H2>Offline</H2>
      <p>
        In a browser that reports it is offline, a fetch waits instead of failing. The query shows{" "}
        <code>fetchStatus: &quot;paused&quot;</code> and continues when the connection returns,
        still as one shared request. Set <code>networkMode: &quot;always&quot;</code> to opt out.
        Mutations are never paused, because quietly queueing a write for later is unsafe.
      </p>

      <H2>Try every query option</H2>
      <p>
        Switch one option at a time and run it. The output and the network panel show exactly what
        changes.
      </p>
      <OptionLab id="query" />
    </Doc>
  );
}
