import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "Authentication" };

export default function Page() {
  return (
    <Doc
      href="/docs/integrations/auth/"
      title="Authentication"
      lede="NyxAPI does not own your login flow. It gives you the hooks to attach credentials safely: a token function, per-request headers, cookies and middleware for refresh."
    >
      <H2>Choose a session style</H2>
      <Table
        head={["Style", "How it works", "NyxAPI setting", "Watch out for"]}
        rows={[
          [
            "Bearer token",
            "A token goes in the Authorization header",
            <code key="a">getToken</code>,
            "Where you store the token is your security decision.",
          ],
          [
            "Cookie session",
            "The browser sends an httpOnly cookie",
            <code key="b">credentials</code>,
            "CORS credential headers and CSRF protection on the server.",
          ],
          [
            "API key header",
            "A fixed key for server-to-server calls",
            <code key="c">headers</code>,
            "Never ship a key to a browser.",
          ],
        ]}
      />

      <H2>Bearer tokens</H2>
      <p>
        <code>getToken</code> runs for every request and a returned token becomes{" "}
        <code>Authorization: Bearer …</code>. Because it is read fresh, a refreshed token is used by
        the next request without rebuilding the client.
      </p>
      <Code lang="ts">{`const nyx = createNyxClient({
  baseUrl: "https://api.example.com/v1",
  getToken: () => session.accessToken, // may also be async
});`}</Code>
      <p>
        See it set the header: the example below sends a token and shows what the server received.
      </p>
      <Runnable id="headerPrecedence" />

      <H2>Refresh on 401, once</H2>
      <p>
        Access tokens expire. The recipe below keeps a single in-flight refresh so several failing
        requests trigger one refresh, then replays each request with the new token.
      </p>
      <Runnable id="tokenRefresh" />
      <Callout kind="warn" title="Refresh failures must end the session">
        If the refresh itself is rejected, do not loop. Clear the session, clear the cache and send
        the user to sign in. A 403 is different: the user is known but not allowed, so refreshing
        will not help.
      </Callout>

      <H2>Cookies</H2>
      <p>
        Browsers do not let scripts set a <code>Cookie</code> header, so for cookie sessions set{" "}
        <code>credentials</code>. Use <code>&quot;include&quot;</code> when the API is on another
        origin (the server must answer with CORS credential headers) and{" "}
        <code>&quot;same-origin&quot;</code> otherwise.
      </p>
      <Code lang="ts">{`const nyx = createNyxClient({
  baseUrl: "https://api.example.com/v1",
  credentials: "include",
});`}</Code>
      <p>
        NyxAPI applies <code>credentials</code> only to requests to the configured origin. A request
        that leaves it (which needs <code>allowAbsoluteUrls</code>) always uses{" "}
        <code>&quot;omit&quot;</code>, so a cookie can never follow a request to another host.
      </p>

      <H2>Signing in and out</H2>
      <Code lang="ts">{`async function signIn(email: string, password: string) {
  const session = await api.auth.login.post({ email, password });
  tokenStore.set(session.token);
  await nyx.queryClient.invalidateQueries(); // refetch anything that was loaded signed-out
}

function signOut() {
  tokenStore.clear();
  nyx.queryClient.clear(); // never keep one user's data for the next
}`}</Code>

      <H2>On a server: one client per user</H2>
      <p>
        Never share a client between users. Create one per request with that user&apos;s token. The
        example shows two clients with different tokens and separate caches:
      </p>
      <Runnable id="perUserClients" />

      <H2>Security notes</H2>
      <ul className="checklist">
        <li>Tokens go through getToken or headers, never into URLs or query strings.</li>
        <li>Errors never contain request headers, so logging an error does not leak a token.</li>
        <li>The origin is pinned: a path cannot redirect a token to another host.</li>
        <li>Sign-out clears the cache.</li>
        <li>Server code creates a client per user or request.</li>
      </ul>
      <p>
        Read more in <Link href="/docs/security/">Security</Link>.
      </p>
    </Doc>
  );
}
