import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2 } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";
import { Table } from "@/components/Doc";
import { VERSION } from "@/site";

export const metadata: Metadata = { title: "Introduction" };

export default function Page() {
  return (
    <Doc
      href="/docs/"
      title="Introduction"
      lede="NyxAPI turns an OpenAPI, Swagger or GraphQL schema into a typed TypeScript client (or wraps your tRPC client), and gives it a cache, retries and optimistic updates. Here is what each piece does and how they fit."
    >
      <Callout kind="warn" title="Early development">
        NyxAPI is at version {VERSION}. It is pre-1.0, so the API can still change between minor
        versions. See <Link href="/releases/">Releases</Link> for what each version contains and
        which are on npm, and <Link href="/docs/installation/">Installation</Link> to get started.
      </Callout>

      <H2>What you get</H2>
      <Table
        head={["Package", "What it does"]}
        rows={[
          [
            <code key="a">@nyxapi/core</code>,
            "The HTTP client, the query cache and the mutation engine. No React, no runtime dependencies.",
          ],
          [
            <code key="b">@nyxapi/codegen</code>,
            "Reads OpenAPI 3.x, Swagger 2.0 or GraphQL and produces TypeScript. Pure functions: text in, files out.",
          ],
          [
            <code key="c">@nyxapi/cli</code>,
            <>
              The <code>nyx</code> command: <code>init</code>, <code>generate</code> (with{" "}
              <code>--watch</code>) and <code>validate</code>.
            </>,
          ],
          [
            <code key="g">@nyxapi/graphql</code>,
            "Runtime for generated GraphQL clients: same cache, retries and optimistic updates as REST.",
          ],
          [
            <code key="t">@nyxapi/trpc</code>,
            "Wraps a tRPC client so every procedure gets typed keys, prefetch and invalidation.",
          ],
          [
            <code key="d">@nyxapi/react</code>,
            "Hooks over the same cache: useQuery, useMutation, useInfiniteQuery and Suspense variants.",
          ],
          [
            <code key="e">@nyxapi/devtools</code>,
            "A cache inspector and a small React panel for development.",
          ],
        ]}
      />

      <H2>How the pieces fit</H2>
      <p>
        You describe your API once: an OpenAPI or Swagger file, a GraphQL schema, or a tRPC router.
        The CLI generates a client from it. That client talks to your server through the core
        package, which keeps a cache of everything it has fetched. React hooks, if you use them,
        read from that same cache instead of keeping their own copy.
      </p>
      <Code lang="text" copy={false} title="data flow">{`openapi.yaml
   │  nyx generate
   ▼
src/api/*.ts           readable, deterministic, safe to commit
   │  createApi(nyx)
   ▼
@nyxapi/core           HTTP client  →  query cache  →  mutations
   ▲
@nyxapi/react          hooks subscribe to the cache`}</Code>

      <H2>Try it right now</H2>
      <p>
        Every example in these docs is editable and runs in your browser against a small in-memory
        API. Nothing is sent over the network. Press Run:
      </p>
      <Runnable id="firstCall" />
      <p>
        The code you see is the real client generated from <code>fixtures/openapi/basic.yaml</code>.
        Try changing the id to <code>"99"</code> and see what happens, then read about{" "}
        <Link href="/docs/errors/">typed errors</Link>.
      </p>

      <H2>Reads are blue, writes are green</H2>
      <p>
        Through the docs, blue callouts are about queries (reading data) and green callouts are
        about mutations (changing data). They follow different rules on purpose: reads can be
        repeated and shared freely, while writes must never run twice by accident.
      </p>
      <Callout kind="read" title="Reads">
        Identical requests are shared, results are cached, and failures can be retried.
      </Callout>
      <Callout kind="write" title="Writes">
        Each write runs once. Retrying is off unless you declare the operation safe to repeat.
      </Callout>

      <H2>Where to go next</H2>
      <ul>
        <li>
          <Link href="/docs/quick-start/">Quick start</Link>: a working typed call in five minutes.
        </li>
        <li>
          <Link href="/beginners/">Beginners</Link>: a slower, step-by-step path with a local
          server.
        </li>
        <li>
          <Link href="/docs/queries/">Queries and caching</Link> and{" "}
          <Link href="/docs/mutations/">Mutations</Link>: the engine.
        </li>
        <li>
          <Link href="/playground/">Playground</Link>: write your own code, or generate a client
          from your own schema.
        </li>
      </ul>
    </Doc>
  );
}
