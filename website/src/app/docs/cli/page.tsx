import type { Metadata } from "next";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "CLI" };

export default function Page() {
  return (
    <Doc
      href="/docs/cli/"
      title="CLI"
      lede="The nyx command generates and validates clients from OpenAPI, Swagger 2.0 and GraphQL. It reads your config file, writes files, and exits with a status your CI can act on."
    >
      <H2>Install</H2>
      <p>
        Install once and run <code>nyx</code> from anywhere, with no <code>npx</code> or{" "}
        <code>pnpm</code> prefix. <code>nyxapi</code> is kept as an alias.
      </p>
      <Code lang="bash" title="terminal">{`npm install -g @nyxapi/cli
nyx --version`}</Code>
      <p>
        Or per project: <code>npm i -D @nyxapi/cli</code>, then use <code>nyx</code> in package
        scripts (or <code>npx nyx</code> in a shell). If the command is not found after a global
        install, your npm global <code>bin</code> directory is not on <code>PATH</code>; run{" "}
        <code>npm prefix -g</code> and add its <code>bin</code> folder (on Windows, the folder
        itself).
      </p>

      <H2>Usage</H2>
      <Code
        lang="text"
        copy={false}
        title="nyx --help"
      >{`nyx init [--input <path>] [--output <dir>] [--force]
nyx generate [--watch] [--check] [--config <file>] [--input <path|url>] [--output <dir>]
nyx validate [<path|url>] [--config <file>]
nyx --version`}</Code>

      <H2>init</H2>
      <p>
        Writes <code>nyx.config.json</code> in the current folder, using a schema file it finds (
        <code>openapi.yaml</code>, <code>swagger.json</code>, <code>schema.graphql</code> and so on)
        or the <code>--input</code> you give. It refuses to overwrite an existing config unless you
        pass <code>--force</code>.
      </p>

      <H2>generate</H2>
      <p>Reads a schema and writes the client into the output directory.</p>
      <Table
        head={["Flag", "Meaning"]}
        rows={[
          [
            <code key="a">--config</code>,
            <>
              A JSON config file. Defaults to <code>./nyx.config.json</code>, then{" "}
              <code>./nyxapi.config.json</code>.
            </>,
          ],
          [
            <code key="b">--input</code>,
            "A schema file (OpenAPI/Swagger JSON or YAML, GraphQL SDL or introspection JSON) or an explicit http(s) URL. Overrides the config.",
          ],
          [
            <code key="k">--kind</code>,
            <>
              <code>openapi</code>, <code>swagger</code> or <code>graphql</code>. Default: detected.
              With a GraphQL URL the endpoint is introspected.
            </>,
          ],
          [
            <code key="c">--output</code>,
            <>
              Output directory. Default <code>./generated</code>. Overrides the config.
            </>,
          ],
          [
            <code key="w">--watch</code>,
            "Regenerate whenever the schema, documents or config change. Errors are printed and watching continues. Ctrl+C stops.",
          ],
          [
            <code key="d">--check</code>,
            "Write nothing; exit 1 if any generated file would change.",
          ],
          [
            <code key="h">--header</code>,
            <>
              <code>&quot;Name: value&quot;</code> sent when fetching a remote schema. Repeatable.
              Never logged and never sent to another origin after a redirect.
            </>,
          ],
          [<code key="t">--timeout</code>, "Remote fetch timeout in seconds. Default 15."],
        ]}
      />
      <Code lang="bash" title="terminal">{`nyx generate --input ./openapi.yaml --output ./src/api
nyx generate --input ./schema.graphql --output ./src/gql
nyx generate --watch
nyx generate --check`}</Code>

      <H2>validate</H2>
      <p>
        Parses the schema and runs the whole generator without writing, printing every error and
        warning.
      </p>
      <Code lang="bash" title="terminal">{`nyx validate ./openapi.yaml
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
        the config. Downloads are capped at 10 MB while streaming, redirects are limited to 5 and a
        redirect from https to http is refused.
      </p>

      <H2>In package.json</H2>
      <Code lang="json" title="package.json">{`{
  "scripts": {
    "api:generate": "nyx generate",
    "api:check": "nyx generate --check"
  }
}`}</Code>
    </Doc>
  );
}
