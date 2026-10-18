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
      lede="Everything the generator can be told, in nyxapi.config.json. Unknown keys are rejected so a typo never silently does nothing."
    >
      <Code lang="json" title="nyxapi.config.json">{`{
  "input": "./openapi.yaml",
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
            "Local OpenAPI file, JSON or YAML, relative to the config file. URLs go through --input.",
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
        A <code>$schema</code> key is allowed for editors. Any other unknown key is an error.
      </p>
    </Doc>
  );
}
