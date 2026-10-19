import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "Techniques and recipes" };

export default function Page() {
  return (
    <Doc
      href="/docs/techniques/"
      title="Techniques and recipes"
      lede="Fourteen solutions to problems every real app meets. Each one states the problem, shows the technique, and runs live against the mock API so you can change it and watch what happens."
    >
      <Table
        head={["I need to…", "Recipe"]}
        rows={[
          [
            "Stop duplicate requests",
            <a key="1" href="#share-one-request-between-many-callers">
              Share one request
            </a>,
          ],
          [
            "Survive a flaky network or server",
            <a key="2" href="#retry-only-what-is-safe">
              Retry only what is safe
            </a>,
          ],
          [
            "Handle expiring tokens",
            <a key="3" href="#refresh-a-token-on-a-401">
              Refresh a token on a 401
            </a>,
          ],
          [
            "Make search-as-you-type cheap",
            <a key="4" href="#cancel-what-nobody-needs-any-more">
              Cancel stale requests
            </a>,
          ],
          [
            "Fetch B once A has answered",
            <a key="5" href="#chain-dependent-requests">
              Chain dependent requests
            </a>,
          ],
          [
            "Keep a screen live",
            <a key="6" href="#poll-while-something-is-watching">
              Poll while watched
            </a>,
          ],
          [
            "Make a form feel instant",
            <a key="7" href="#show-new-rows-instantly">
              Optimistic create
            </a>,
          ],
          [
            "Make navigation feel instant",
            <a key="8" href="#prefetch-before-the-click">
              Prefetch before the click
            </a>,
          ],
          [
            "Serve many users from one process",
            <a key="9" href="#one-client-per-user">
              One client per user
            </a>,
          ],
          [
            "Show friendly error messages",
            <a key="10" href="#one-place-for-error-messages">
              One place for errors
            </a>,
          ],
          [
            "Refresh exactly the right data",
            <a key="11" href="#invalidate-precisely">
              Invalidate precisely
            </a>,
          ],
          [
            "Test without a network",
            <a key="12" href="#test-without-a-network">
              Test with a function
            </a>,
          ],
          [
            "See what is cached",
            <a key="13" href="#look-inside-the-cache">
              Look inside the cache
            </a>,
          ],
          [
            "Cache something that is not HTTP",
            <a key="14" href="#cache-anything-async">
              Cache anything async
            </a>,
          ],
        ]}
      />

      <H2>Share one request between many callers</H2>
      <p>
        <strong>Problem.</strong> Five components mount together and each asks for the same user.
        <br />
        <strong>Technique.</strong> Nothing to do: ask through the query client. Identical requests
        in flight are shared (single flight), and the key decides what “identical” means.
      </p>
      <Runnable id="singleFlight" />

      <H2>Retry only what is safe</H2>
      <p>
        <strong>Problem.</strong> A server blips for a moment and your users see an error.
        <br />
        <strong>Technique.</strong> Reads retry transient failures by default. Tune the count and
        delay per query. Do not retry writes unless they are idempotent.
      </p>
      <Runnable id="retryFlaky" />
      <Callout kind="write" title="Retrying a write">
        <code>{"retry: { idempotent: true, attempts: 2, delay: 200 }"}</code> on a mutation. The{" "}
        <code>idempotent: true</code> is you promising that repeating the request cannot do harm (a
        PUT, or a POST with an idempotency key).
      </Callout>

      <H2>Refresh a token on a 401</H2>
      <p>
        <strong>Problem.</strong> Access tokens expire. Three requests fail with 401 at the same
        moment; you want one refresh, then all three replayed.
        <br />
        <strong>Technique.</strong> Middleware sees every response. Keep one in-flight refresh
        promise, await it, then replay a clone of the original request.
      </p>
      <Runnable id="tokenRefresh" />
      <p>
        More on sessions in <Link href="/docs/integrations/auth/">Authentication</Link>.
      </p>

      <H2>Cancel what nobody needs any more</H2>
      <p>
        <strong>Problem.</strong> A user types quickly and slow early requests finish after fast
        late ones, or waste bandwidth.
        <br />
        <strong>Technique.</strong> Use a key per search term and pass the engine&apos;s{" "}
        <code>signal</code> to your request. When the last watcher of a key leaves, the engine
        cancels it; you can also cancel by hand.
      </p>
      <Runnable id="cancelStale" />

      <H2>Chain dependent requests</H2>
      <p>
        <strong>Problem.</strong> Request B needs data from request A.
        <br />
        <strong>Technique.</strong> With plain functions, <code>await</code> the first. In React,
        pass <code>{"enabled: Boolean(user.data)"}</code> to the second hook so it waits.
      </p>
      <Runnable id="dependentQueries" />
      <Code lang="tsx">{`const user = useQuery(api.users.byId(id).get.options());
const peers = useQuery(
  api.users.list.get.options({ query: { role: [user.data?.role ?? "member"] } }, { enabled: Boolean(user.data) }),
);`}</Code>

      <H2>Poll while something is watching</H2>
      <p>
        <strong>Problem.</strong> A dashboard should stay current without a refresh button.
        <br />
        <strong>Technique.</strong> <code>refetchInterval</code> polls only while the query is
        observed and enabled, and stops when the last watcher unsubscribes. Combine it with{" "}
        <code>refetchOnWindowFocus</code> so a returning tab catches up at once.
      </p>
      <Runnable id="polling" />

      <H2>Show new rows instantly</H2>
      <p>
        <strong>Problem.</strong> Creating an item makes the user wait for the server before it
        appears.
        <br />
        <strong>Technique.</strong> Patch the cached list in <code>onMutate</code> with a temporary
        row, then invalidate so the real list replaces it. If the request fails, only your patch is
        rolled back.
      </p>
      <Runnable id="optimisticCreate" />

      <H2>Prefetch before the click</H2>
      <p>
        <strong>Problem.</strong> A detail page shows a spinner after every navigation.
        <br />
        <strong>Technique.</strong> Prefetch on hover or focus. The next navigation reads the cache.{" "}
        <code>prefetch</code> never rejects, so a failure is silent and the page fetches normally.
      </p>
      <Runnable id="prefetch" />
      <Code lang="tsx">{`<Link
  href={\`/users/\${id}\`}
  onPointerEnter={() => void api.users.byId(id).get.prefetch(undefined, { staleTime: 30_000 })}
>
  {name}
</Link>`}</Code>

      <H2>One client per user</H2>
      <p>
        <strong>Problem.</strong> A server handles many users. One shared cache would leak one
        user&apos;s data to another.
        <br />
        <strong>Technique.</strong> Create a client per request or session, with that user&apos;s
        token. Nothing in NyxAPI is global.
      </p>
      <Runnable id="perUserClients" />

      <H2>One place for error messages</H2>
      <p>
        <strong>Problem.</strong> Every screen formats errors differently.
        <br />
        <strong>Technique.</strong> Write one function that maps the error classes to messages, and
        use it everywhere. Because every NyxAPI error extends <code>NyxError</code>, anything left
        over is truly unexpected.
      </p>
      <Runnable id="explainErrors" />

      <H2>Invalidate precisely</H2>
      <p>
        <strong>Problem.</strong> After a change you refetch too much, or too little.
        <br />
        <strong>Technique.</strong> Keys are <code>[METHOD, path, params, request?]</code>, so a
        shorter key is a prefix that matches a whole family:
      </p>
      <Runnable id="cacheKeys" />
      <Table
        head={["To refresh", "Call"]}
        rows={[
          ["One user", <code key="a">api.users.byId(&quot;1&quot;).get.invalidate()</code>],
          [
            "One variant of the list",
            <code key="b">api.users.list.get.invalidate({"{ query: { page: 2 } }"})</code>,
          ],
          ["Every variant of the list", <code key="c">api.users.list.get.invalidate()</code>],
          [
            "Everything under /users",
            <code key="d">{'qc.invalidateQueries(["GET", "/users"])'}</code>,
          ],
          [
            "Only observed lists",
            <code key="e">
              {'qc.invalidateQueries({ queryKey: ["GET", "/users"], active: true })'}
            </code>,
          ],
          [
            "By your own rule",
            <code key="f">qc.invalidateQueries({"{ predicate: (q) => … }"})</code>,
          ],
        ]}
      />

      <H2>Test without a network</H2>
      <p>
        <strong>Problem.</strong> Tests that hit a server are slow and flaky; mocking libraries add
        weight.
        <br />
        <strong>Technique.</strong> The transport is just a function from a <code>Request</code> to
        a <code>Response</code>. Pass your own. See{" "}
        <Link href="/docs/integrations/testing/">Testing</Link> for a full setup.
      </p>
      <Runnable id="testingTransport" />

      <H2>Look inside the cache</H2>
      <p>
        <strong>Problem.</strong> Something is stale, or not cached, and you cannot see why.
        <br />
        <strong>Technique.</strong> <code>findAll()</code> lists every entry with its state. In an
        app, the <Link href="/docs/devtools/">devtools</Link> panel does this for you.
      </p>
      <Runnable id="inspect" />

      <H2>Cache anything async</H2>
      <p>
        <strong>Problem.</strong> A value comes from a SDK, a database or a computation, and you
        want the same caching.
        <br />
        <strong>Technique.</strong> A key and a function. See{" "}
        <Link href="/docs/manual/">Manual queries</Link> for operations that also get{" "}
        <code>options</code>, <code>key</code> and <code>invalidate</code>.
      </p>
      <Runnable id="customFetcher" />
    </Doc>
  );
}
