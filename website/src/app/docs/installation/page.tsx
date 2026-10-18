import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, H3 } from "@/components/Doc";
import { PackageInstall } from "@/components/PackageInstall";
import { NODE_MIN, VERSION } from "@/site";

export const metadata: Metadata = { title: "Installation" };

export default function Page() {
  return (
    <Doc
      href="/docs/installation/"
      title="Installation"
      lede="NexAPI is a set of small packages. Install the runtime in your app and the command line tool as a development dependency."
    >
      <H2>Requirements</H2>
      <ul>
        <li>
          Node.js {NODE_MIN} or newer. NexAPI is ESM only, so your project needs{" "}
          <code>&quot;type&quot;: &quot;module&quot;</code> or an ESM-aware bundler.
        </li>
        <li>TypeScript 5.x for the best experience. The generated files are plain TypeScript.</li>
        <li>For the React adapter: React 18 or 19.</li>
        <li>Any modern browser. The only platform APIs used are fetch, AbortController and URL.</li>
      </ul>

      <Callout kind="warn" title={`Version ${VERSION}: not on the npm registry yet`}>
        <p>
          The commands under “From the npm registry” will work once the packages are published.
          Until then, use the tarballs or the source. Both are listed on the{" "}
          <Link href="/install/">Install page</Link>, including a one-line <code>curl</code>{" "}
          installer.
        </p>
      </Callout>

      <H2>From the npm registry</H2>
      <p>The runtime goes in your dependencies:</p>
      <PackageInstall packages="@nexapi/core" />
      <p>The command line tool generates your client, so it is a development dependency:</p>
      <PackageInstall packages="@nexapi/cli" dev />
      <p>Add the React adapter only if you use React:</p>
      <PackageInstall packages="@nexapi/react" />
      <p>And the devtools while you develop:</p>
      <PackageInstall packages="@nexapi/devtools" dev />

      <H2>From tarballs</H2>
      <p>
        Each package is also shipped as a <code>.tgz</code> file from the{" "}
        <Link href="/install/#downloads">downloads section</Link>. Install them by path:
      </p>
      <Code
        lang="bash"
        title="terminal"
      >{`npm install ./nexapi-core-${VERSION}.tgz ./nexapi-react-${VERSION}.tgz
npm install -D ./nexapi-cli-${VERSION}.tgz ./nexapi-codegen-${VERSION}.tgz`}</Code>
      <p>
        The CLI depends on <code>@nexapi/codegen</code>, so install both tarballs together as shown.
      </p>

      <H2>From source</H2>
      <p>Needs pnpm 10 and Git.</p>
      <Code lang="bash" title="terminal">{`git clone <repository-url> nexapi
cd nexapi
pnpm install
pnpm check        # lint, type-check, tests, build, generated-code check`}</Code>
      <p>Then run the CLI straight from the build:</p>
      <Code
        lang="bash"
        title="terminal"
      >{`node packages/cli/dist/cli.js generate --input ./openapi.yaml --output ./src/api`}</Code>

      <H2>Check that it works</H2>
      <Code lang="bash" title="terminal">{`npx nexapi --help`}</Code>
      <p>You should see the usage text for the generate and validate commands.</p>

      <H3>TypeScript settings</H3>
      <p>
        Generated files import each other with <code>.js</code> extensions, which is what Node ESM
        expects. Use <code>&quot;moduleResolution&quot;: &quot;NodeNext&quot;</code> or{" "}
        <code>&quot;Bundler&quot;</code>:
      </p>
      <Code lang="json" title="tsconfig.json">{`{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true
  }
}`}</Code>
    </Doc>
  );
}
