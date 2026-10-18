import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "GraphQL" };

export default function Page() {
  return (
    <Doc
      href="/docs/graphql/"
      title="GraphQL"
      lede="Point the generator at a GraphQL schema and get a typed client that uses the same cache, retries and optimistic updates as the REST client."
    >
      <H2>Generate</H2>
      <p>
        The input can be an SDL file, an introspection result saved as JSON, or a live endpoint. The
        kind is detected from the file; <code>--kind graphql</code> forces it.
      </p>
      <Code lang="bash" title="terminal">{`nyx generate --input ./schema.graphql --output ./src/gql
nyx generate --input https://api.example.com/graphql --kind graphql --output ./src/gql
# an endpoint that needs a token to introspect:
nyx generate --input https://api.example.com/graphql --kind graphql --header "Authorization: Bearer $TOKEN"`}</Code>
      <p>
        Generated code imports <code>@nyxapi/graphql</code>, so install it next to{" "}
        <code>@nyxapi/core</code>: <code>npm i @nyxapi/core @nyxapi/graphql</code>.
      </p>

      <H2>Use</H2>
      <Code title="src/main.ts">{`import { GraphQLClient } from "@nyxapi/graphql";
import { createApi } from "./gql/index.js";

const client = new GraphQLClient({
  url: "https://api.example.com/graphql",
  getToken: () => token,
});
const api = createApi(client);

const user = await api.query.user({ id: "1" });   // typed result, or null
user?.posts[0]?.title;

const created = await api.mutation.createPost({ input: { title: "Hello" } });`}</Code>
      <p>
        Every query has the same helpers as a REST endpoint: <code>.options()</code> for{" "}
        <code>useQuery</code>, <code>.key()</code>, <code>.prefetch()</code> and{" "}
        <code>.invalidate()</code>. Mutations have <code>.options()</code> and <code>.key()</code>.
        Operations without variables take no argument; operations whose variables are all optional
        take an optional one.
      </p>
      <Code title="with React">{`const { data } = useQuery(api.query.user.options({ id: "1" }));
const rename = useMutation(api.mutation.createPost.options({ invalidates: [api.query.users.key()] }));`}</Code>

      <H2>Types come from the query</H2>
      <p>
        The result type of each operation is derived from the exact selection set that is sent, not
        from the schema type. If the document asks for <code>id</code> and <code>name</code>, the
        type has exactly those. Aliases, fragments, <code>@skip</code> and <code>@include</code>{" "}
        (the field becomes optional) and unions are handled. For interfaces and unions, the result
        is a union you narrow on <code>__typename</code>, which the default documents always select.
      </p>
      <Code title="narrowing">{`for (const hit of await api.query.search({ text: "ada" })) {
  if (hit.__typename === "User") console.log(hit.name);
  else console.log(hit.title);
}`}</Code>

      <H2>Your own documents</H2>
      <p>
        By default one operation is generated per root field of the schema, with a default selection
        of scalar fields and objects up to <code>selectionDepth</code> levels (default 2). Fields
        that need required arguments are skipped. To control the selection yourself, write normal{" "}
        <code>.graphql</code> operation files and list them:
      </p>
      <Code lang="json" title="nyx.config.json">{`{
  "input": "./schema.graphql",
  "output": "./src/gql",
  "documents": ["./src/queries"],
  "scalars": { "DateTime": "string" }
}`}</Code>
      <p>
        When <code>documents</code> is set, exactly those operations are generated, validated
        against the schema first (an invalid document fails generation with the validator&apos;s
        message). Every operation needs a name; it becomes the property name, camel-cased, and the
        operation name sent to the server. Fragments can live in any listed file, and only the
        fragments an operation uses are sent with it.
      </p>

      <H2>Config keys</H2>
      <Table
        head={["Key", "Meaning"]}
        rows={[
          [
            <code key="a">kind</code>,
            <>
              Force <code>graphql</code> when detection guesses wrong.
            </>,
          ],
          [
            <code key="b">documents</code>,
            "Files or directories (searched for .graphql and .gql) with your operations.",
          ],
          [
            <code key="c">scalars</code>,
            <>
              A TypeScript type per custom scalar, such as <code>{`{ "DateTime": "string" }`}</code>
              . Unmapped scalars are typed <code>unknown</code> and reported as a warning.
            </>,
          ],
          [
            <code key="d">selectionDepth</code>,
            "How deep generated default selections go, 1 to 6. Default 2.",
          ],
        ]}
      />

      <H2>Errors</H2>
      <p>
        A response with <code>errors</code> rejects with <code>GraphQLError</code>: its{" "}
        <code>errors</code> array has each message, path and extensions, and <code>code</code> is{" "}
        <code>extensions.code</code> of the first one. It is not retried, because it is the
        server&apos;s deliberate answer. Network failures, timeouts, HTTP errors and oversized
        responses use the same typed errors and retry rules as REST.
      </p>
      <Code title="error handling">{`import { GraphQLError } from "@nyxapi/graphql";

try {
  await api.query.user({ id: "1" });
} catch (error) {
  if (error instanceof GraphQLError && error.code === "UNAUTHENTICATED") signOut();
}`}</Code>
      <p>
        With <code>errorPolicy: &quot;all&quot;</code> a response that has both <code>data</code>{" "}
        and <code>errors</code> resolves with the data instead of rejecting.
      </p>

      <H2>Security</H2>
      <p>
        Requests go through the same origin-pinned HTTP client as REST: the GraphQL URL&apos;s
        origin is fixed for the client, tokens are sent only to it, a URL that contains a username
        or password is refused, and <code>maxResponseBytes</code> bounds what a server can make you
        read. Generated documents are sent as plain strings with variables separate, so values are
        never interpolated into a query.
      </p>

      <Callout kind="warn" title="Not supported">
        <p>
          Subscriptions are not supported: the generator skips them and prints a warning that says
          how many it skipped. File uploads over GraphQL (the multipart request spec) and persisted
          queries are not built either.
        </p>
      </Callout>
      <p>
        Every behavior on this page is covered by <code>tests/graphql.e2e.test.ts</code>, which runs
        the generated client against a real graphql-js server.
      </p>
    </Doc>
  );
}
