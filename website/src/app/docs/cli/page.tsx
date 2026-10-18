import type { Metadata } from "next";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "CLI" };

export default function Page() {
  return (
    <Doc
      href="/docs/cli/"
      title="CLI"
      lede="The nyxapi command generates and validates clients. It reads your config file, writes files, and exits with a status your CI can act on."
    >
      <H2>Usage</H2>
      <Code
        lang="text"
        copy={false}
        title="nyxapi --help"
      >{`nyxapi generate [--config <file>] [--input <path|url>] [--output <dir>] [--check]
nyxapi validate [<path|url>] [--config <file>]`}</Code>

      <H2>generate</H2>
      <p>Reads a schema and writes the client into the output directory.</p>
      <Table
        head={["Flag", "Meaning"]}
        rows={[
          [
            <code key="a">--config</code>,
            <>
              A JSON config file. Defaults to <code>./nyxapi.config.json</code> when it exists.
            </>,
          ],
          [
            <code key="b">--input</code>,
            "An OpenAPI file (JSON or YAML) or an explicit http(s) URL. Overrides the config.",
          ],
          [
            <code key="c">--output</code>,
            <>
              Output directory. Default <code>./generated</code>. Overrides the config.
            </>,
          ],
          [
            <code key="d">--check</code>,
            "Write nothing; exit 1 if any generated file would change.",
          ],
        ]}
      />
      <Code lang="bash" title="terminal">{`nyxapi generate --input ./openapi.yaml --output ./src/api
nyxapi generate --check`}</Code>

      <H2>validate</H2>
      <p>
        Parses the schema and runs the whole generator without writing, printing every error and
        warning.
      </p>
      <Code lang="bash" title="terminal">{`nyxapi validate ./openapi.yaml
# OK: 8 operation(s), 7 schema(s)`}</Code>

      <H2>Exit codes</H2>
      <Table
        head={["Code", "Meaning"]}
        rows={[
          [<code key="a">0</code>, "Success. With --check: everything is up to date."],
          [<code key="b">1</code>, "Schema errors, or --check found stale files."],
          [
            <code key="c">2</code>,
            "Bad usage: missing input, unreadable config, or a URL in the config file.",
          ],
        ]}
      />

      <H2>Paths</H2>
      <p>
        Paths in a config file are relative to that file. Paths on the command line are relative to
        where you run the command. A remote URL is accepted only as <code>--input</code>, never from
        the config.
      </p>

      <H2>In package.json</H2>
      <Code lang="json" title="package.json">{`{
  "scripts": {
    "api:generate": "nyxapi generate",
    "api:check": "nyxapi generate --check"
  }
}`}</Code>
    </Doc>
  );
}
