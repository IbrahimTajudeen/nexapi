import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2 } from "@/components/Doc";

export const metadata: Metadata = { title: "tRPC" };

export default function Page() {
  return (
    <Doc
      href="/docs/trpc/"
      title="tRPC"
      lede="If your backend is tRPC, there is nothing to generate: wrap your tRPC client and every procedure gets typed keys, prefetching, invalidation and optimistic mutations on the NyxAPI cache."
    >
      <H2>Wrap your client</H2>
      <Code lang="bash" title="terminal">{`npm i @nyxapi/core @nyxapi/trpc`}</Code>
      <Code title="src/api.ts">{`import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createNyxTrpc } from "@nyxapi/trpc";
import type { AppRouter } from "../server/router";

const trpc = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/trpc" })] });

export const { api, queryClient } = createNyxTrpc(trpc);`}</Code>
      <p>
        The result has the same shape as your router. Types are read from the client you pass in, so
        there is no code generation and nothing to keep in sync, and this package does not import
        tRPC at all.
      </p>

      <H2>Use</H2>
      <Code title="queries">{`const user = await api.users.byId.query({ id: "1" });   // typed from your router
await api.users.byId.query.prefetch({ id: "1" });
const options = api.users.byId.query.options({ id: "1" }, { staleTime: 30_000 });
api.users.byId.query.key({ id: "1" });                  // ["TRPC", "users", "byId", { id: "1" }]
await api.users.byId.query.invalidate({ id: "1" });     // one input
await api.users.byId.query.invalidate();                // every input
await api.ping.query();                                 // no input, no argument`}</Code>
      <Code title="mutations">{`await queryClient.mutate(api.users.rename.mutate.options(), { id: "1", name: "Ada" });`}</Code>
      <p>
        With React, hand the same options to <code>useQuery</code> and <code>useMutation</code> from{" "}
        <code>@nyxapi/react</code>. Concurrent identical calls share one request, and invalidating a
        key refetches whatever is on screen, exactly as with REST and GraphQL.
      </p>

      <H2>Errors and retries</H2>
      <p>
        A failed call rejects with <code>TrpcError</code>, which carries <code>code</code> (such as{" "}
        <code>NOT_FOUND</code>), <code>httpStatus</code> and the procedure path, never the input. It
        is retried by the engine only when it looks transient: no response at all, 408, 429 or any
        5xx. Not found, bad input and unauthorized are never retried.
      </p>

      <Callout kind="note" title="What this is, and is not">
        <p>
          This is a typed adapter, not a generator. Subscriptions are not wrapped (use your tRPC
          client directly for those). Procedures without input are typed with an optional input, so{" "}
          <code>api.ping.query()</code> works and options go in the second position:{" "}
          <code>api.ping.query.options(undefined, config)</code>.
        </p>
      </Callout>
      <p>
        The behavior above is tested against a real <code>@trpc/server</code> in{" "}
        <code>packages/trpc/test</code>.
      </p>
    </Doc>
  );
}
