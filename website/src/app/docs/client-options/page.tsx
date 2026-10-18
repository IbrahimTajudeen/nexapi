import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "Client options" };

export default function Page() {
  return (
    <Doc
      href="/docs/client-options/"
      title="Client options"
      lede="Settings for createNyxClient: how requests are sent, and how the cache behaves."
    >
      <Code lang="ts">{`import { createNyxClient } from "@nyxapi/core";

const nyx = createNyxClient({
  baseUrl: "https://api.example.com/v1",
  getToken: () => session.token,
  timeoutMs: 10_000,
  queryClient: { defaultOptions: { queries: { staleTime: 30_000 } } },
});`}</Code>

      <H2>HTTP</H2>
      <Table
        head={["Option", "Meaning"]}
        rows={[
          [
            <code key="a">baseUrl</code>,
            "Required. Absolute URL. Its origin is pinned for every request.",
          ],
          [
            <code key="b">transport</code>,
            <>
              A function <code>(Request) =&gt; Promise&lt;Response&gt;</code>. Defaults to global{" "}
              <code>fetch</code>. Use it for tests or custom networking.
            </>,
          ],
          [<code key="c">headers</code>, "Headers sent with every request (lowest precedence)."],
          [
            <code key="d">getToken</code>,
            <>
              Called per request; a returned token is sent as <code>Authorization: Bearer ...</code>
              . May be async.
            </>,
          ],
          [
            <code key="e">middleware</code>,
            "Functions (request, next) => response, outermost first. Call next exactly once.",
          ],
          [<code key="f">timeoutMs</code>, "Default timeout. None by default."],
          [
            <code key="g">credentials</code>,
            <>
              Fetch credentials mode, for cookie sessions. See{" "}
              <Link href="/docs/security/">Security</Link>.
            </>,
          ],
          [
            <code key="h">allowAbsoluteUrls</code>,
            "Dangerous. Lets a path be an absolute URL outside the pinned origin. Generated clients never need it.",
          ],
          [
            <code key="i">validateResponses</code>,
            "Check responses against generated shapes. Default true; only affects endpoints generated with validation.",
          ],
        ]}
      />

      <H2>Middleware example</H2>
      <Code lang="ts">{`const nyx = createNyxClient({
  baseUrl,
  middleware: [
    async (request, next) => {
      const started = performance.now();
      const response = await next(request);
      metrics.timing("api", performance.now() - started);
      return response;
    },
  ],
});`}</Code>
      <Callout kind="warn">
        Do not log the request inside middleware if it carries credentials. NyxAPI itself never
        logs.
      </Callout>

      <H2>Cache defaults</H2>
      <p>
        <code>queryClient</code> accepts a ready <code>QueryClient</code>, or options to create one:
      </p>
      <Table
        head={["Option", "Meaning"]}
        rows={[
          [
            <code key="a">defaultOptions.queries</code>,
            "Defaults for staleTime, gcTime, retry, retryDelay, enabled, refetchOnMount, refetchOnWindowFocus, refetchOnReconnect, structuralSharing.",
          ],
          [
            <code key="b">focusManager</code>,
            "Tells the cache when the window has focus. Defaults to the browser.",
          ],
          [
            <code key="c">onlineManager</code>,
            "Tells the cache when the network is back. Defaults to the browser.",
          ],
          [
            <code key="d">onUpdaterError</code>,
            "Called when an optimistic or cache updater throws; the broken patch is skipped.",
          ],
        ]}
      />
      <p>
        Per-query settings are described on <Link href="/docs/queries/">Queries and caching</Link>.
      </p>

      <H2>Sharing a cache</H2>
      <p>
        Pass an existing <code>QueryClient</code> to give several clients one cache:
      </p>
      <Code lang="ts">{`import { QueryClient, createNyxClient } from "@nyxapi/core";

const cache = new QueryClient();
const a = createNyxClient({ baseUrl: "https://a.example.com", queryClient: cache });
const b = createNyxClient({ baseUrl: "https://b.example.com", queryClient: cache });`}</Code>
    </Doc>
  );
}
