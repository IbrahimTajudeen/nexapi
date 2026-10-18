import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, H3, Table } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "The fluent API" };

export default function Page() {
  return (
    <Doc
      href="/docs/fluent-api/"
      title="The fluent API"
      lede="The generated client mirrors your URL structure. If you can read the path, you can write the call."
    >
      <H2>How paths become calls</H2>
      <Table
        head={["OpenAPI operation", "Generated call"]}
        rows={[
          [<code key="1">POST /auth/login</code>, <code key="1b">api.auth.login.post(body)</code>],
          [
            <code key="2">GET /users/{"{id}"}</code>,
            <code key="2b">api.users.byId(id).get()</code>,
          ],
          [
            <code key="3">PATCH /users/{"{id}"}</code>,
            <code key="3b">api.users.byId(id).patch(body)</code>,
          ],
          [
            <code key="4">DELETE /users/{"{id}"}</code>,
            <code key="4b">api.users.byId(id).delete()</code>,
          ],
          [
            <code key="5">GET /users/{"{id}"}/avatar</code>,
            <code key="5b">api.users.byId(id).avatar.get()</code>,
          ],
        ]}
      />
      <p>The rules are small:</p>
      <ul>
        <li>
          Plain segments become camelCase properties: <code>/exports/users</code> is{" "}
          <code>api.exports.users</code>.
        </li>
        <li>
          A <code>{"{param}"}</code> segment becomes <code>by</code> plus the parameter name, as a
          function that takes exactly that parameter. One parameter per function means chains read
          left to right.
        </li>
        <li>
          HTTP methods are properties: <code>get</code>, <code>head</code>, <code>post</code>,{" "}
          <code>put</code>, <code>patch</code>, <code>delete</code>.
        </li>
        <li>
          Missing <code>operationId</code>s are filled in for you, for example{" "}
          <code>GET /users/{"{id}"}/posts</code> becomes <code>getUsersByIdPosts</code>.
        </li>
      </ul>
      <Callout kind="warn" title="Conflicts are errors, not surprises">
        If two paths would end up at the same property, generation fails and tells you which
        operations clash. Resolve it with an <Link href="/docs/config/">override</Link>. Nothing is
        silently overwritten.
      </Callout>

      <H2>Arguments</H2>
      <Code lang="text" copy={false} title="argument order">{`query endpoint     get(request?)
mutation endpoint  post(body, request?)     or     delete(request?)`}</Code>
      <ul>
        <li>
          <code>request</code> holds <code>query</code>, <code>headers</code> and, on direct calls,{" "}
          <code>signal</code>. It is required only when some part of it is required.
        </li>
        <li>
          The <strong>body comes first</strong> for mutations, so{" "}
          <code>api.auth.login.post(loginBody)</code> reads naturally.
        </li>
        <li>
          Path parameters are never part of <code>request</code>. You supply them as you navigate.
        </li>
      </ul>
      <Runnable id="list" />

      <H2>Everything an endpoint can do</H2>
      <p>
        Each query endpoint, such as <code>api.users.byId(&quot;1&quot;).get</code>, is a function
        with extra methods:
      </p>
      <Table
        head={["Call", "What it does"]}
        rows={[
          [<code key="a">get(request?)</code>, "Send the request now. Does not use the cache."],
          [
            <code key="b">get.options(request?, config?)</code>,
            "Describe the query, to give to the query client or a React hook.",
          ],
          [
            <code key="c">get.key(request?)</code>,
            "The cache key. Without a request it is the prefix shared by every variant.",
          ],
          [
            <code key="d">get.prefetch(request?, config?)</code>,
            "Fill the cache if the data is not fresh. Never throws.",
          ],
          [
            <code key="e">get.invalidate(request?)</code>,
            "Mark cached data stale, and refetch it if something is watching.",
          ],
        ]}
      />
      <p>
        Mutation endpoints have <code>post(body, request?)</code>, <code>options()</code> and{" "}
        <code>key()</code>.
      </p>

      <H3>Why config is the second argument of options</H3>
      <p>
        <code>options(request, config)</code> keeps the position of <code>config</code> the same for
        every endpoint, so it can never be mistaken for request input. For an endpoint with no
        request parameters you write <code>options(undefined, {"{ staleTime: 30_000 }"})</code>.
      </p>

      <H2>Direct calls and cached calls</H2>
      <p>
        Calling <code>get()</code> sends a request every time and does not touch the cache. To get
        sharing and caching, give the endpoint&apos;s options to the query client:
      </p>
      <Code lang="ts">{`// direct: always a network request
const user = await api.users.byId("42").get();

// cached: shared, fresh for 30 seconds
const cached = await nex.queryClient.fetchQuery(
  api.users.byId("42").get.options(undefined, { staleTime: 30_000 }),
);`}</Code>
      <Callout kind="read">
        <p>
          React hooks use the cached form. <Link href="/docs/queries/">Queries and caching</Link>{" "}
          explains the rules in full.
        </p>
      </Callout>

      <H2>Hand-written endpoints</H2>
      <p>
        If an operation is not in your schema, or you excluded it, you can define one with{" "}
        <code>nex.query</code> or <code>nex.mutation</code>. The generated client is built from
        exactly these calls.
      </p>
      <Code lang="ts">{`const health = nex.query<NoRequest, { ok: boolean }, unknown>({
  method: "get",
  path: "/health",
});
await health();`}</Code>
    </Doc>
  );
}
