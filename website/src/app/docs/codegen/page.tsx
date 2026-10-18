import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, H3, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "Code generation" };

export default function Page() {
  return (
    <Doc
      href="/docs/codegen/"
      title="Code generation"
      lede="The generator reads an OpenAPI 3.x document and writes plain TypeScript. The same schema and settings always produce byte-identical files."
    >
      <H2>Running it</H2>
      <Code
        lang="bash"
        title="terminal"
      >{`npx nexapi generate --input ./openapi.yaml --output ./src/api
npx nexapi generate --input https://example.com/openapi.json --output ./src/api
npx nexapi validate ./openapi.yaml`}</Code>
      <p>
        A remote schema is fetched only when you pass its URL explicitly with <code>--input</code>.
        A URL written in a config file is rejected, so a config you cloned from somewhere can never
        make your machine fetch something unexpected.
      </p>

      <H2>What is generated</H2>
      <Table
        head={["File", "Contents"]}
        rows={[
          [
            <code key="a">types.ts</code>,
            "An interface or type for every schema, plus request, response and error types per operation.",
          ],
          [
            <code key="b">client.ts</code>,
            <>
              The <code>createApi(nex)</code> function that builds the resource tree.
            </>,
          ],
          [<code key="c">index.ts</code>, "Re-exports the two files above."],
          [
            <code key="d">shapes.ts</code>,
            <>
              Only with <code>&quot;validation&quot;: true</code>: plain data describing each
              response.
            </>,
          ],
        ]}
      />
      <p>
        The files start with an <code>auto-generated</code> header and are meant to be committed.
        They contain no timestamps and iterate in a fixed order, so a regeneration that changes
        nothing produces no diff.
      </p>

      <H2>Configuration file</H2>
      <p>
        Put a <code>nexapi.config.json</code> next to your <code>package.json</code> and the CLI
        picks it up. Paths inside are relative to the file.
      </p>
      <Code lang="json" title="nexapi.config.json">{`{
  "input": "./openapi.yaml",
  "output": "./src/api",
  "validation": true,
  "naming": { "stripPathPrefix": "/api" },
  "overrides": {
    "operations": { "listUsers": { "path": ["users", "list"] } }
  },
  "exclude": ["internalDebugDump"]
}`}</Code>
      <p>
        Every option is described on the <Link href="/docs/config/">configuration reference</Link>.
      </p>

      <H2>Renaming and resolving conflicts</H2>
      <p>
        By default the tree follows your paths. When two operations collide, or you simply prefer
        another name, place an operation explicitly:
      </p>
      <Code lang="json">{`{ "overrides": { "operations": { "listUsers": { "path": ["users", "list"] } } } }`}</Code>
      <p>
        With that, <code>GET /users</code> is <code>api.users.list.get()</code> instead of{" "}
        <code>api.users.get()</code>. Path parameters in an override are written{" "}
        <code>{"{id}"}</code> and must match the operation&apos;s parameters in order.
      </p>

      <H3>Shared path prefixes</H3>
      <p>
        If every route starts with <code>/api</code>, set <code>naming.stripPathPrefix</code> so you
        write <code>api.users</code> instead of <code>api.api.users</code>. Only the property names
        change; requests still go to the full path.
      </p>

      <H2>Checking responses at runtime</H2>
      <p>
        With <code>&quot;validation&quot;: true</code> the generator also writes a description of
        each JSON response. At runtime the client compares what the server sent with what the schema
        promised, and rejects with a <code>ResponseValidationError</code> when they differ.
      </p>
      <Table
        head={["Checked", "Not checked"]}
        rows={[
          [
            "Types, required properties, enums and literals, arrays, unions, intersections",
            "Extra properties the server adds (they are allowed on purpose)",
          ],
          [
            "Declared types of additional properties",
            "integer, format, length, pattern and range rules",
          ],
        ]}
      />
      <Callout kind="note" title="Reports never contain your data">
        An issue lists a path, what was expected and what was received (a type name), never the
        value. Responses may carry personal data, and errors tend to end up in logs.
      </Callout>
      <p>
        Validation errors are never retried, because the same response would fail the same way. Turn
        validation off for one client with{" "}
        <code>createNexClient({"{ validateResponses: false }"})</code>.
      </p>

      <H2>What is supported</H2>
      <ul>
        <li>
          OpenAPI 3.0 and 3.1, in JSON or YAML, with local <code>$ref</code>s.
        </li>
        <li>
          Request bodies: JSON, <code>multipart/form-data</code>,{" "}
          <code>application/x-www-form-urlencoded</code>, text and binary.
        </li>
        <li>Responses: JSON, text, binary (as a Blob), and empty (such as 204).</li>
        <li>
          Query parameter styles: exploded arrays (default), comma-separated, space- and
          pipe-delimited, and <code>deepObject</code>.
        </li>
        <li>
          Typed errors from every documented status code, including <code>default</code> and ranges
          like <code>5XX</code>.
        </li>
      </ul>
      <Callout kind="warn" title="Cookie parameters">
        Browsers do not let scripts set a <code>Cookie</code> header, so cookie parameters are left
        out of request types and the generator warns. For cookie sessions use{" "}
        <code>createNexClient({'{ credentials: "include" }'})</code>.
      </Callout>
      <p>
        Anything the generator cannot represent is reported as an error or a warning with a code,
        such as <code>UNSUPPORTED_BODY_SCHEMA</code>. It does not silently skip or guess. Run{" "}
        <code>nexapi validate</code> to see them all without writing files.
      </p>

      <H2>Use it in CI</H2>
      <Code lang="bash" title="terminal">{`npx nexapi generate --check`}</Code>
      <p>
        <code>--check</code> writes nothing and exits with status 1 when the files on disk are out
        of date. Add it next to your tests so a schema change cannot land without its regenerated
        client.
      </p>

      <H2>From code</H2>
      <p>
        The generator is also a library with no file access, which is how the{" "}
        <Link href="/playground/">playground</Link> runs it in your browser:
      </p>
      <Code lang="ts">{`import { generate } from "@nexapi/codegen";

const { files, diagnostics } = generate(schemaText, { validation: true });
for (const file of files) console.log(file.path, file.content.length);`}</Code>
    </Doc>
  );
}
