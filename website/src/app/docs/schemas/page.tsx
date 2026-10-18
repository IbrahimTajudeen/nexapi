import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "Schema formats" };

export default function Page() {
  return (
    <Doc
      href="/docs/schemas/"
      title="Schema formats"
      lede="NyxAPI generates from OpenAPI 3.x, Swagger 2.0 and GraphQL, and adapts tRPC without generating anything. This page says what is supported for each and how the kind is chosen."
    >
      <H2>What works with what</H2>
      <Table
        head={["Source", "How", "Result"]}
        rows={[
          [
            "OpenAPI 3.0 and 3.1",
            <>
              <code key="a">nyx generate</code>
            </>,
            <>
              Fluent client: <code>api.users.byId(&quot;42&quot;).get()</code>
            </>,
          ],
          [
            "Swagger 2.0",
            <>
              <code key="b">nyx generate</code> (converted to OpenAPI 3 first)
            </>,
            "The same fluent client",
          ],
          [
            "GraphQL",
            <>
              <code key="c">nyx generate</code>, see <a href="/docs/graphql/">GraphQL</a>
            </>,
            <>
              <code>api.query.user(...)</code>, <code>api.mutation.createPost(...)</code>
            </>,
          ],
          [
            "tRPC",
            <>
              <code key="d">createNyxTrpc(client)</code>, see <a href="/docs/trpc/">tRPC</a>
            </>,
            <>
              <code>api.users.byId.query(...)</code>, no generation
            </>,
          ],
        ]}
      />

      <H2>How the kind is chosen</H2>
      <p>
        <code>nyx generate</code> decides in this order: the <code>kind</code> config key or{" "}
        <code>--kind</code> flag; then the file name (<code>.graphql</code>, <code>.graphqls</code>,{" "}
        <code>.gql</code>); then the contents: JSON with <code>__schema</code> is a GraphQL
        introspection result, a document with an <code>swagger</code> key is Swagger, anything else
        is read as OpenAPI. Run <code>nyx validate</code> to see what it made of a file.
      </p>

      <H2>Swagger 2.0</H2>
      <p>
        Swagger documents are rewritten to OpenAPI 3.0 in memory and then go through the one
        generator, so naming, overrides, validation and CI checks behave identically. The conversion
        covers:
      </p>
      <ul>
        <li>
          <code>host</code>, <code>basePath</code> and <code>schemes</code> becoming the server URL
        </li>
        <li>
          <code>definitions</code>, <code>parameters</code> and <code>responses</code> references
        </li>
        <li>
          <code>in: body</code> parameters becoming request bodies, using <code>consumes</code>
        </li>
        <li>
          <code>in: formData</code> becoming <code>multipart/form-data</code> (when there is a file)
          or <code>application/x-www-form-urlencoded</code>
        </li>
        <li>
          <code>collectionFormat</code> (<code>csv</code>, <code>ssv</code>, <code>pipes</code>,{" "}
          <code>multi</code>) becoming query styles
        </li>
        <li>
          <code>produces</code> and <code>consumes</code> at document and operation level,{" "}
          <code>type: file</code>, <code>x-nullable</code> and string <code>discriminator</code>
        </li>
      </ul>
      <Callout kind="note">
        <p>
          Security definitions are not converted; authentication is configured on the client with{" "}
          <code>getToken</code> or middleware. A construct the converter cannot represent produces a
          warning with the operation it came from, never a silent change.
        </p>
      </Callout>

      <H2>Remote schemas</H2>
      <Code lang="bash" title="terminal">{`nyx generate --input https://api.example.com/openapi.json
nyx generate --input https://api.example.com/graphql --kind graphql`}</Code>
      <p>
        A URL is accepted only on the command line, never from the config file. Downloads are capped
        at 10 MB while streaming, redirects are limited to 5, a redirect from https to http is
        refused, and credentials given with <code>--header</code> are not sent to another origin.
      </p>

      <H2>Not supported</H2>
      <p>
        GraphQL subscriptions, external <code>$ref</code> files in OpenAPI (only local{" "}
        <code>#/...</code> references), and gRPC, SOAP or WebSocket APIs. Each is reported with a
        clear message instead of generating something wrong.
      </p>
    </Doc>
  );
}
