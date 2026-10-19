import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2 } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "Node servers and scripts" };

export default function Page() {
  return (
    <Doc
      href="/docs/integrations/node-server/"
      title="Node servers and scripts"
      lede="NyxAPI runs anywhere with fetch, which includes Node 22 and later. On a server the one rule is isolation: a client per user or request, never a shared cache."
    >
      <H2>Requirements</H2>
      <p>
        Node 22.12 or later. The HTTP client uses the platform&apos;s <code>fetch</code>, so nothing
        else is needed. Node&apos;s fetch has no cookie jar, so server-side cookie sessions need a
        token or your own header handling.
      </p>

      <H2>A client per request</H2>
      <Runnable id="perUserClients" />
      <Code lang="ts" title="server.ts">{`import express from "express";
import { createNyxClient } from "@nyxapi/core";
import { createApi } from "./generated";

const app = express();

app.get("/profile", async (req, res) => {
  // New client, new cache, this user's token. Nothing is shared between requests.
  const nyx = createNyxClient({
    baseUrl: process.env.API_URL!,
    timeoutMs: 8_000,
    maxResponseBytes: 5_000_000,
    getToken: () => req.header("authorization")?.replace(/^Bearer /, ""),
  });
  const api = createApi(nyx);

  try {
    const me = await api.users.byId("me").get({ signal: AbortSignal.timeout(10_000) });
    res.json(me);
  } catch (error) {
    res.status(502).json({ message: "Upstream request failed" }); // do not forward error.body blindly
  }
});

app.listen(3000);`}</Code>
      <Callout kind="warn" title="Do not forward upstream errors blindly">
        An error body from another service may contain details you did not intend to expose.
        Translate errors into your own messages; see{" "}
        <Link href="/docs/techniques/">One place for error messages</Link>.
      </Callout>

      <H2>When a shared client is fine</H2>
      <p>
        A shared client is safe when every request uses the same identity and the cached data is the
        same for everyone: a service account reading public reference data, for instance. In that
        case a long <code>staleTime</code> gives you an in-process cache. If any request uses a
        different user&apos;s token, use a separate client.
      </p>

      <H2>Scripts and background jobs</H2>
      <Code lang="ts" title="sync.ts">{`import { createNyxClient } from "@nyxapi/core";

const nyx = createNyxClient({
  baseUrl: process.env.API_URL!,
  getToken: () => process.env.API_TOKEN,
  timeoutMs: 30_000,
  queryClient: { defaultOptions: { queries: { retry: 5, retryDelay: 500 } } },
});

// No cache needed for a one-off: use the raw client.
const page = await nyx.http.request<{ items: unknown[]; total: number }>({
  method: "get",
  path: "/orders",
  query: { updatedSince: new Date(Date.now() - 86_400_000) },
});
console.log(page.total);`}</Code>
      <p>
        Dates in query values are sent as ISO strings. Retries and delays apply to queries that go
        through the query client; the raw client sends exactly one request.
      </p>

      <H2>Server-side rendering</H2>
      <p>
        With <code>renderToPipeableStream</code>, Suspense hooks wait for data inside the
        request&apos;s own client, and <code>dehydrate</code> carries the result to the browser. The
        full recipe is in <Link href="/docs/react/">React</Link> and its Next.js variant is in{" "}
        <Link href="/docs/integrations/nextjs/">Next.js</Link>.
      </p>

      <H2>Shutdown</H2>
      <p>
        Long-lived clients attach focus and online listeners. Call{" "}
        <code>nyx.queryClient.dispose()</code> when you discard one, and <code>clear()</code> to
        drop cached data.
      </p>

      <H2>Checklist</H2>
      <ul className="checklist">
        <li>A client per user or request, created inside the handler.</li>
        <li>timeoutMs and maxResponseBytes set for upstream services you do not control.</li>
        <li>Errors translated before they reach your own clients.</li>
        <li>An abort signal tied to the incoming request when the caller can disconnect.</li>
        <li>Secrets only in getToken and environment variables, never in URLs.</li>
      </ul>
    </Doc>
  );
}
