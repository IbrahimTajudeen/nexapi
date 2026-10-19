import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, H3 } from "@/components/Doc";
import { PackageInstall } from "@/components/PackageInstall";

export const metadata: Metadata = { title: "Next.js" };

export default function Page() {
  return (
    <Doc
      href="/docs/integrations/nextjs/"
      title="Next.js"
      lede="On the server, every request gets its own client and cache. In the browser there is one. Dehydrate on the server, hydrate in the browser, and the page arrives with its data already in place."
    >
      <Callout kind="warn" title="A pattern, not a package">
        There is no Next.js-specific NyxAPI package yet (it is on the{" "}
        <Link href="/roadmap/">roadmap</Link>). This guide builds the integration by hand from{" "}
        <code>dehydrate</code>, <code>hydrate</code> and <code>NyxProvider</code>, which are
        documented and tested in the core. The file layout below follows the App Router; check it
        against your Next.js version.
      </Callout>

      <H2>The idea</H2>
      <ol>
        <li>
          <strong>Server:</strong> create a client for this request, prefetch what the page needs,
          and <code>dehydrate</code> the cache to JSON.
        </li>
        <li>
          <strong>Browser:</strong> create (once) a client, <code>hydrate</code> it with that JSON,
          and render with hooks. Data is there on the first paint, and normal staleness rules take
          over afterwards.
        </li>
      </ol>
      <p>
        One client per request on the server is not optional: a shared cache would hand one
        visitor&apos;s data, fetched with their token, to the next.
      </p>

      <H2>1. Install</H2>
      <PackageInstall packages="@nyxapi/core @nyxapi/react" />

      <H2>2. A factory that makes clients</H2>
      <Code
        lang="ts"
        title="lib/nyx.ts"
      >{`import { createNyxClient, type NyxClient } from "@nyxapi/core";
import { createApi } from "@/generated";

export function makeClient(token?: string): NyxClient {
  return createNyxClient({
    baseUrl: process.env.NEXT_PUBLIC_API_URL!,
    timeoutMs: 10_000,
    getToken: () => token,
    queryClient: { defaultOptions: { queries: { staleTime: 30_000 } } },
  });
}

let browserClient: NyxClient | undefined;

/** Server: a new client every time. Browser: one client for the life of the page. */
export function getClient(token?: string): NyxClient {
  if (typeof window === "undefined") return makeClient(token);
  return (browserClient ??= makeClient());
}

export const apiFor = (client: NyxClient) => createApi(client);`}</Code>

      <H2>3. Prefetch and dehydrate in a server component</H2>
      <Code lang="tsx" title="app/users/[id]/page.tsx">{`import { cookies } from "next/headers";
import { dehydrate } from "@nyxapi/core";
import { apiFor, makeClient } from "@/lib/nyx";
import { Providers } from "@/app/providers";
import { UserCard } from "./UserCard";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get("token")?.value;

  const nyx = makeClient(token);                 // this request only
  await apiFor(nyx).users.byId(id).get.prefetch(); // never rejects; a failure just means no data yet

  // Escape "<" so the JSON cannot close a script tag.
  const state = JSON.stringify(dehydrate(nyx.queryClient)).replace(/</g, "\\\\u003c");

  return (
    <Providers state={JSON.parse(state)}>
      <UserCard id={id} />
    </Providers>
  );
}`}</Code>
      <Callout kind="note" title="Why the server never shares its client">
        Notice <code>makeClient(token)</code> is called inside the page function. Do not hoist it to
        module scope.
      </Callout>

      <H2>4. Hydrate in a client component</H2>
      <Code lang="tsx" title="app/providers.tsx">{`"use client";
import { hydrate } from "@nyxapi/core";
import { NyxProvider } from "@nyxapi/react";
import { useState, type ReactNode } from "react";
import { getClient } from "@/lib/nyx";

export function Providers({ state, children }: { state: unknown; children: ReactNode }) {
  // Runs once per mount. hydrate() validates the input and never replaces newer data.
  const [nyx] = useState(() => {
    const client = getClient();
    hydrate(client.queryClient, state);
    return client;
  });
  return <NyxProvider client={nyx.queryClient}>{children}</NyxProvider>;
}`}</Code>

      <H2>5. Use hooks as usual</H2>
      <Code lang="tsx" title="app/users/[id]/UserCard.tsx">{`"use client";
import { useQuery } from "@nyxapi/react";
import { apiFor, getClient } from "@/lib/nyx";

export function UserCard({ id }: { id: string }) {
  const api = apiFor(getClient());
  const user = useQuery(api.users.byId(id).get.options());
  return <h1>{user.data?.name ?? "Loading…"}</h1>;
}`}</Code>
      <p>
        The data that was prefetched on the server is already in the browser client&apos;s cache, so{" "}
        <code>user.data</code> is set on the first render. Because the dehydrated entry carries its
        original fetch time, <code>staleTime</code> stays honest: data that is already older than
        the stale time is refreshed in the background.
      </p>

      <H3>What is and is not sent to the browser</H3>
      <ul>
        <li>
          Only confirmed, successful data. Errors, optimistic patches and in-flight requests are
          never dehydrated.
        </li>
        <li>Everything dehydrated is visible to the visitor. Prefetch only what they may see.</li>
        <li>
          The token stays on the server. Do not pass it in <code>state</code>.
        </li>
      </ul>

      <H2>Streaming and Suspense</H2>
      <p>
        With <code>useSuspenseQuery</code> and <code>renderToPipeableStream</code>, Suspense hooks
        wait for data inside the request&apos;s own client. See the{" "}
        <Link href="/docs/react/">React</Link> page for the rules, including how failures reach an
        error boundary.
      </p>

      <H2>Pitfalls</H2>
      <ul className="checklist">
        <li>
          A client created at module scope on the server is shared by all visitors. Create it per
          request.
        </li>
        <li>Forgetting to escape the less-than sign when embedding dehydrated state in HTML.</li>
        <li>Creating a new browser client on every render. Use the singleton above.</li>
        <li>
          Prefetching user-specific data in a page that is cached and shared. Mark such pages
          dynamic.
        </li>
        <li>
          Relying on server prefetch for data that must be fresh at every moment. Keep a short
          staleTime.
        </li>
      </ul>
    </Doc>
  );
}
