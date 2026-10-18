import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "Configuration" };

export default function Page() {
  return (
    <Doc
      href="/docs/config/"
      title="Configuration"
      lede="Everything the generator can be told, in nyx.config.json (nyx.config.json is still read). Unknown keys are rejected so a typo never silently does nothing."
    >
      <Code lang="json" title="nyx.config.json">{`{
  "input": "./openapi.yaml",
  "kind": "auto",
  "output": "./src/api",
  "validation": false,
  "exclude": [],
  "overrides": { "operations": {} },
  "naming": { "paramPrefix": "by", "stripPathPrefix": "" }
}`}</Code>
      <Table
        head={["Key", "Type", "Meaning"]}
        rows={[
          [
            <code key="a">input</code>,
            "string",
            "Local schema file relative to the config file: OpenAPI 3.x or Swagger 2.0 (JSON/YAML), or GraphQL SDL / introspection JSON. URLs go through --input.",
          ],
          [
            <code key="k1">kind</code>,
            '"auto" | "openapi" | "swagger" | "graphql"',
            "What input is. Default auto: detected from the file name and contents.",
          ],
          [
            <code key="k2">documents</code>,
            "string[]",
            "GraphQL only: .graphql operation files or directories. When set, exactly these operations are generated.",
          ],
          [
            <code key="k3">scalars</code>,
            "object",
            <>
              GraphQL only: a TypeScript type per custom scalar, such as{" "}
              <code>{`{ "DateTime": "string" }`}</code>.
            </>,
          ],
          [
            <code key="k4">selectionDepth</code>,
            "1 to 6",
            "GraphQL only: depth of generated default selection sets. Default 2.",
          ],
          [<code key="b">output</code>, "string", "Output directory, relative to the config file."],
          [
            <code key="c">validation</code>,
            "boolean",
            "Also emit shapes.ts so responses are checked at runtime. Default false.",
          ],
          [
            <code key="d">exclude</code>,
            "string[]",
            "operationIds to leave out, for example operations you hand-write.",
          ],
          [
            <code key="e">overrides.operations.&lt;id&gt;.path</code>,
            "string[]",
            <>
              Place an operation at an explicit position, as property names and{" "}
              <code>{"{param}"}</code> references.
            </>,
          ],
          [
            <code key="f">naming.paramPrefix</code>,
            "string",
            <>
              Prefix for path-parameter segments. Default <code>by</code>, giving <code>byId</code>.
            </>,
          ],
          [
            <code key="g">naming.stripPathPrefix</code>,
            "string",
            <>
              Leading path to leave out of the tree, such as <code>/api</code> or{" "}
              <code>/api/v1</code>.
            </>,
          ],
        ]}
      />
      <Callout kind="note" title="Overrides in practice">
        <p>
          <code>{`"overrides": { "operations": { "listUsers": { "path": ["users", "list"] } } }`}</code>{" "}
          makes <code>GET /users</code> available as <code>api.users.list.get()</code>.
        </p>
      </Callout>
      <p>
        A <code>$schema</code> key is allowed for editors;{" "}
        <code>@nyxapi/codegen/config.schema.json</code> describes every key, so an editor can
        autocomplete and flag typos. Any other unknown key is an error.
      </p>
    </Doc>
  );
}
