import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, H3 } from "@/components/Doc";
import { PackageInstall } from "@/components/PackageInstall";

export const metadata: Metadata = { title: "React with Vite" };

export default function Page() {
  return (
    <Doc
      href="/docs/integrations/react-vite/"
      title="React with Vite"
      lede="A single-page app is the simplest home for NyxAPI: one client in the browser, hooks in components, and nothing to hydrate."
    >
      <H2>1. Install</H2>
      <PackageInstall packages="@nyxapi/core @nyxapi/react" />
      <PackageInstall packages="@nyxapi/cli" dev />
      <p>
        React 18 or 19 is a peer dependency. If you have a schema, generate the client (see{" "}
        <Link href="/docs/quick-start/">Quick start</Link>); if not, use{" "}
        <Link href="/docs/manual/">manual endpoints</Link>. The rest of this guide is the same.
      </p>

      <H2>2. Create one client</H2>
      <p>
        Put the client in its own module. Read the base URL from an environment variable so each
        environment points at its own backend.
      </p>
      <Code lang="ts" title="src/api/client.ts">{`import { createNyxClient } from "@nyxapi/core";
import { createApi } from "./generated"; // from nyx generate

export const nyx = createNyxClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "/api",
  timeoutMs: 15_000,
  getToken: () => sessionStorage.getItem("token"),
  queryClient: { defaultOptions: { queries: { staleTime: 30_000 } } },
});

export const api = createApi(nyx);`}</Code>
      <Callout kind="note" title="Where to keep the token">
        Which storage is right is a security decision for your app. An httpOnly cookie that scripts
        cannot read is safer against script injection; see{" "}
        <Link href="/docs/integrations/auth/">Authentication</Link> for both approaches.
      </Callout>
      <Code lang="bash" title=".env.development">{`VITE_API_URL=/api`}</Code>

      <H2>3. Use it in components</H2>
      <p>Hooks need no provider because endpoint options already carry their client:</p>
      <Code
        lang="tsx"
        title="src/UserCard.tsx"
      >{`import { useMutation, useQuery } from "@nyxapi/react";
import { api } from "./api/client";

export function UserCard({ id }: { id: string }) {
  const user = useQuery(api.users.byId(id).get.options());
  const rename = useMutation(
    api.users.byId(id).patch.options(undefined, {
      invalidates: [api.users.byId(id).get.key()],
    }),
  );

  if (user.isPending) return <p>Loading…</p>;
  if (user.isError && !user.data) return <p>Could not load this user.</p>;

  return (
    <section>
      <h2>{user.data?.name}</h2>
      <button disabled={rename.isPending} onClick={() => rename.mutate({ name: "Ada Lovelace" })}>
        {rename.isPending ? "Saving…" : "Rename"}
      </button>
      {user.isFetching && <small>Refreshing…</small>}
    </section>
  );
}`}</Code>

      <H2>4. Loading and error states with Suspense</H2>
      <Code lang="tsx" title="src/App.tsx">{`import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { api } from "./api/client";

export function App() {
  return (
    <ErrorBoundary
      fallback={<p>Something went wrong.</p>}
      onReset={() => void api.users.byId("1").get.invalidate()}
    >
      <Suspense fallback={<p>Loading…</p>}>
        <Profile id="1" />
      </Suspense>
    </ErrorBoundary>
  );
}`}</Code>
      <p>
        <code>useSuspenseQuery</code> never returns undefined data and sends a failed first load to
        the error boundary. Details are on the <Link href="/docs/react/">React</Link> page.
      </p>

      <H2>5. Talk to the backend in development</H2>
      <p>
        If your API is on another origin, a dev proxy avoids CORS during development: the browser
        thinks everything is same-origin.
      </p>
      <Code lang="ts" title="vite.config.ts">{`import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true, rewrite: (p) => p.replace(/^\\/api/, "") },
    },
  },
});`}</Code>
      <p>
        In production, either serve the API under the same origin or have it answer CORS requests.
        For cookies across origins, set <code>credentials: &quot;include&quot;</code> on the client
        and have the server send the CORS credential headers.
      </p>

      <H2>6. Add the devtools</H2>
      <Code lang="tsx">{`import { NyxDevtools } from "@nyxapi/devtools/react";
import { nyx } from "./api/client";

// renders nothing in production unless you force it
<NyxDevtools client={nyx.queryClient} />`}</Code>
      <p>
        See <Link href="/docs/devtools/">Devtools</Link> for the exact props and what it shows.
      </p>

      <H3>Checklist</H3>
      <ul className="checklist">
        <li>One client module, imported everywhere.</li>
        <li>Base URL from an environment variable; a timeout is set.</li>
        <li>Mutations list what they invalidate.</li>
        <li>Error boundary and Suspense (or explicit isPending and isError branches).</li>
        <li>Sign-out calls nyx.queryClient.clear().</li>
      </ul>
    </Doc>
  );
}
