import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, H3, Table } from "@/components/Doc";
import { PackageInstall } from "@/components/PackageInstall";

export const metadata: Metadata = { title: "React" };

export default function Page() {
  return (
    <Doc
      href="/docs/react/"
      title="React"
      lede="The React adapter is thin on purpose. Hooks subscribe to the same cache the rest of NexAPI uses, so there is no second copy of your data."
    >
      <H2>Install</H2>
      <PackageInstall packages="@nexapi/react" />
      <p>React 18 or 19 is a peer dependency.</p>

      <H2>useQuery</H2>
      <p>
        Pass an endpoint&apos;s <code>options()</code>. The options already carry their client, so
        no provider is needed:
      </p>
      <Code lang="tsx">{`import { useQuery } from "@nexapi/react";

function UserName({ id }: { id: string }) {
  const user = useQuery(api.users.byId(id).get.options(undefined, { staleTime: 30_000 }));

  if (user.isPending) return <p>Loading…</p>;
  if (user.isError && !user.data) return <p>Could not load: {user.error?.message}</p>;
  return <p>{user.data?.name}</p>;
}`}</Code>
      <Table
        head={["Field", "Meaning"]}
        rows={[
          [<code key="a">data</code>, "The cached value, or undefined before the first load."],
          [
            <code key="b">status</code>,
            <>
              <code>pending</code> (no data yet), <code>success</code> or <code>error</code>.
            </>,
          ],
          [
            <code key="c">fetchStatus</code>,
            <>
              <code>fetching</code>, <code>paused</code> (waiting for the network) or{" "}
              <code>idle</code>.
            </>,
          ],
          [<code key="d">isLoading</code>, "First load: pending and fetching."],
          [<code key="e">isFetching</code>, "Any fetch, including background refreshes."],
          [<code key="f">isStale</code>, "The data is past its staleTime."],
          [<code key="g">refetch()</code>, "Fetch again now."],
        ]}
      />
      <Callout kind="read" title="Results keep their identity">
        The returned object stays the same until something observable changes, so it is safe in
        dependency arrays. Use <code>notifyOn</code> to wake a component only for the fields it
        uses.
      </Callout>

      <H2>useMutation</H2>
      <Code lang="tsx">{`import { useMutation } from "@nexapi/react";

function Rename({ id }: { id: string }) {
  const rename = useMutation(
    api.users.byId(id).patch.options(undefined, {
      invalidates: [api.users.byId(id).get.key()],
    }),
  );

  return (
    <button disabled={rename.isPending} onClick={() => rename.mutate({ name: "Ada Lovelace" })}>
      {rename.isPending ? "Saving…" : "Rename"}
    </button>
  );
}`}</Code>
      <Callout kind="write">
        <code>mutate</code> never throws; read <code>error</code> from the result.{" "}
        <code>mutateAsync</code> returns the promise and rejects on failure. Both are stable
        functions.
      </Callout>
      <p>
        For optimistic updates and ordering see <Link href="/docs/mutations/">Mutations</Link>; it
        all works the same in hooks.
      </p>

      <H2>Infinite lists</H2>
      <p>
        <code>useInfiniteQuery</code> mirrors the engine&apos;s{" "}
        <Link href="/docs/pagination/">infinite queries</Link> and adds <code>fetchNextPage</code>,{" "}
        <code>hasNextPage</code> and <code>isFetchingNextPage</code>.
      </p>

      <H2>Suspense</H2>
      <p>
        <code>useSuspenseQuery</code> suspends until data exists, so <code>data</code> is never
        undefined, and throws a failed first load to the nearest error boundary.
      </p>
      <Code lang="tsx">{`<ErrorBoundary fallback={<p>Something went wrong.</p>}>
  <Suspense fallback={<p>Loading…</p>}>
    <Profile id="1" />
  </Suspense>
</ErrorBoundary>

function Profile({ id }: { id: string }) {
  const user = useSuspenseQuery(api.users.byId(id).get.options());
  return <p>{user.data.name}</p>; // data is always defined here
}`}</Code>
      <ul>
        <li>
          Stale data renders at once and refreshes in the background. A failed background refresh
          keeps the data.
        </li>
        <li>
          After an error boundary resets, call <code>api.users.byId(id).get.invalidate()</code> in
          the reset handler so the next render fetches again.
        </li>
        <li>
          <code>staleTime</code> is raised to at least one second, so data that just arrived is not
          refetched on mount.
        </li>
        <li>
          <code>useSuspenseInfiniteQuery</code> suspends for the first page only. Loading more pages
          never falls back to Suspense: watch <code>isFetchingNextPage</code>.
        </li>
      </ul>

      <H2>Placeholder data</H2>
      <p>
        Show something while a query has no data, without writing it to the cache. With{" "}
        <code>keepPreviousData</code>, the previous page stays visible while the next key loads:
      </p>
      <Code lang="tsx">{`import { keepPreviousData } from "@nexapi/core";

const users = useQuery(
  api.users.list.get.options({ query: { page } }, { placeholderData: keepPreviousData }),
);
users.isPlaceholder; // true while showing the previous page`}</Code>

      <H2>Server rendering</H2>
      <p>
        Create <strong>one client per request</strong> so one visitor&apos;s cache and credentials
        never reach another. Nothing fetches during <code>renderToString</code>; with{" "}
        <code>renderToPipeableStream</code>, Suspense hooks wait for data inside the request&apos;s
        own client.
      </p>
      <Code lang="tsx" title="server">{`import { createNexClient, dehydrate } from "@nexapi/core";
import { NexProvider } from "@nexapi/react";

export async function render(request: Request) {
  const nex = createNexClient({ baseUrl: process.env.API_URL!, getToken: () => tokenFrom(request) });
  const api = createApi(nex);
  await api.users.byId("1").get.prefetch();

  const state = JSON.stringify(dehydrate(nex.queryClient)).replace(/</g, "\\\\u003c");
  // render <NexProvider client={nex.queryClient}><App /></NexProvider> and embed \`state\` in the HTML
}`}</Code>
      <Code lang="tsx" title="browser">{`import { hydrate } from "@nexapi/core";

hydrate(nex.queryClient, window.__NEX_STATE__); // validated before anything is written`}</Code>
      <H3>What is dehydrated</H3>
      <p>
        Only confirmed, successful data. Never errors, optimistic patches or requests in flight.
        Hydrated input is treated as untrusted: its shape is validated, and an entry never replaces
        newer data already in the cache.
      </p>

      <H2>NexProvider</H2>
      <p>
        Optional. Wrap your tree in <code>{"<NexProvider client={nex.queryClient}>"}</code> when you
        build query options by hand without a bound client. Generated endpoint options need no
        provider.
      </p>
    </Doc>
  );
}
