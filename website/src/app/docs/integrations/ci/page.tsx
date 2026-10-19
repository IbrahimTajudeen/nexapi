import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "CI and teams" };

export default function Page() {
  return (
    <Doc
      href="/docs/integrations/ci/"
      title="CI and teams"
      lede="Generated code is only trustworthy if it cannot drift from the schema. A one-line check in CI guarantees it, and a few conventions keep a team's NyxAPI usage consistent."
    >
      <H2>Keep generated code in version control</H2>
      <p>
        Commit the generated folder. Reviewers see exactly what a schema change did to your types,
        and builds need no network access. Treat the generated folder as read-only.
      </p>

      <H2>Fail the build when code is stale</H2>
      <p>
        <code>nyx generate --check</code> regenerates in memory and compares it with what is on
        disk. It exits <code>0</code> when everything is current and <code>1</code> when files are
        stale, without writing anything.
      </p>
      <Code lang="json" title="package.json">{`{
  "scripts": {
    "api": "nyx generate",
    "api:check": "nyx generate --check"
  }
}`}</Code>
      <Code lang="yaml" title=".github/workflows/ci.yml">{`name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm api:check     # generated code matches the schema
      - run: pnpm typecheck
      - run: pnpm test`}</Code>

      <H2>Validate a schema before you trust it</H2>
      <Code lang="bash">{`nyx validate ./openapi.yaml`}</Code>
      <p>
        <code>validate</code> reports problems without writing files, which makes it a good
        pre-commit or pull-request check on the repository that owns the schema.
      </p>

      <H2>Update from a remote schema on a schedule</H2>
      <p>
        If the backend publishes its schema at a URL, a scheduled job can regenerate and open a pull
        request, so changes arrive as a reviewable diff instead of a surprise:
      </p>
      <Code lang="yaml" title=".github/workflows/schema-update.yml">{`name: schema-update
on:
  schedule: [{ cron: "0 6 * * 1" }]
  workflow_dispatch:
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm nyx generate --input https://api.example.com/openapi.json
      - uses: peter-evans/create-pull-request@v6
        with:
          title: "chore: update generated API client"
          branch: chore/api-client`}</Code>
      <Callout kind="note" title="Remote fetching is bounded">
        The CLI limits download size and redirects, and passes headers you give it with{" "}
        <code>--header</code>. Keep tokens in CI secrets, never in the config file. See the{" "}
        <Link href="/docs/cli/">CLI</Link> page.
      </Callout>

      <H2>Conventions for a team</H2>
      <Table
        head={["Convention", "Why"]}
        rows={[
          ["One client module", "One place for the base URL, timeout, token and defaults."],
          [
            "Pin all @nyxapi packages to the same version",
            "They are released together under one version number.",
          ],
          [
            "Read the Releases page before upgrading",
            "NyxAPI is pre-1.0; a minor version can change the API.",
          ],
          ["Review generated diffs", "A schema change is an API change for your app."],
          [
            "Test custom endpoints with a function transport",
            "Fast, offline and exercises the real engine.",
          ],
          [
            "Document every nyx.config.json override",
            "Overrides rename things; future you will wonder why.",
          ],
        ]}
      />

      <H2>Monorepos</H2>
      <p>
        Generate into a shared package (for example <code>packages/api-client</code>) and have apps
        depend on it. Run <code>api:check</code> in that package&apos;s CI only; apps just import
        it. If several backends exist, give each its own config file and output folder, and pass{" "}
        <code>--config</code> to pick one.
      </p>

      <H2>Checklist</H2>
      <ul className="checklist">
        <li>Generated folder committed and marked read-only in review.</li>
        <li>nyx generate --check runs on every pull request.</li>
        <li>Packages pinned to one version.</li>
        <li>Schema updates arrive as pull requests.</li>
        <li>Secrets only in CI secrets.</li>
      </ul>
    </Doc>
  );
}
