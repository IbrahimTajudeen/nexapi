import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { DownloadsTable } from "@/components/DownloadsTable";
import { PackageInstall } from "@/components/PackageInstall";
import { SiteCommand } from "@/components/SiteCommand";
import { Tabs } from "@/components/Tabs";
import { NODE_MIN, VERSION } from "@/site";

export const metadata: Metadata = {
  title: "Install and downloads",
  description:
    "Install NyxAPI with a one-line curl command, with npm, pnpm, yarn or bun, or download the packages and source.",
};

const PS = `$site = "{{site}}"
$files = "core", "cli", "codegen" | ForEach-Object { "nyxapi-$_-${VERSION}.tgz" }
New-Item -ItemType Directory -Force .nyxapi | Out-Null
foreach ($f in $files) { curl.exe -fsSL "$site/downloads/$f" -o ".nyxapi/$f" }
npm install ".nyxapi/nyxapi-core-${VERSION}.tgz"
npm install -D ".nyxapi/nyxapi-cli-${VERSION}.tgz" ".nyxapi/nyxapi-codegen-${VERSION}.tgz"`;

export default function Page() {
  return (
    <div className="wrap" style={{ padding: "36px 0 80px", maxWidth: 900 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.7rem)" }}>Install and download</h1>
      <p style={{ color: "var(--muted)", fontSize: "1.15rem" }}>
        Choose whichever way suits you. All of them give you the same packages. You need Node.js{" "}
        {NODE_MIN} or newer.
      </p>

      <Callout kind="note" title={`Version ${VERSION}, pre-1.0`}>
        <p>
          The API can change between minor versions. The <Link href="/releases/">Releases</Link>{" "}
          page lists every version and shows which ones are on npm right now. If a version is not on
          npm yet, the curl installer and tarballs below install it from this site.
        </p>
      </Callout>

      <h2 id="global" style={{ marginTop: 36 }}>
        The <code>nyx</code> command, installed globally
      </h2>
      <p>
        Install the CLI once and run <code>nyx</code> directly, with no <code>npx</code> or package
        manager prefix:
      </p>
      <PackageInstall packages="@nyxapi/cli" global />
      <Code lang="bash" title="terminal">{`nyx --version
nyx init
nyx generate --watch`}</Code>
      <p className="hint">
        <code>nyxapi</code> works as an alias. Not found after installing? Add the folder printed by{" "}
        <code>npm prefix -g</code> (its <code>bin</code> subfolder on macOS and Linux) to your{" "}
        <code>PATH</code>.
      </p>

      <h2 id="curl" style={{ marginTop: 36 }}>
        One command with curl
      </h2>
      <p>
        Run this inside your project folder (the one with a <code>package.json</code>). It downloads
        the packages from this site, checks their SHA-256 sums, saves them in{" "}
        <code>./.nyxapi/</code> and installs them with your package manager.
      </p>
      <SiteCommand>{`curl -fsSL {{site}}/install.sh | sh -s -- {{site}}`}</SiteCommand>
      <p>
        It detects npm, pnpm, yarn or bun from your lockfile. To also install the React adapter and
        devtools:
      </p>
      <SiteCommand>{`curl -fsSL {{site}}/install.sh | NYXAPI_PACKAGES="core react cli codegen devtools graphql trpc" sh -s -- {{site}}`}</SiteCommand>
      <p className="hint">
        Prefer to read before you run? Open <a href="/install.sh">install.sh</a>. It is short, only
        downloads from the site you give it, and verifies checksums before installing anything. Set{" "}
        <code>NYXAPI_PM</code> to force a package manager.
      </p>

      <h2 id="windows" style={{ marginTop: 36 }}>
        Windows (PowerShell)
      </h2>
      <SiteCommand lang="text" title="PowerShell">
        {PS}
      </SiteCommand>

      <h2 id="npm" style={{ marginTop: 36 }}>
        From the npm registry (once published)
      </h2>
      <p>Runtime:</p>
      <PackageInstall packages="@nyxapi/core" />
      <p>Command line tool:</p>
      <PackageInstall packages="@nyxapi/cli" dev />
      <p>React adapter and devtools:</p>
      <PackageInstall packages="@nyxapi/react" />
      <PackageInstall packages="@nyxapi/devtools" dev />

      <h2 id="downloads" style={{ marginTop: 36 }}>
        Downloads
      </h2>
      <p>
        Each package as a tarball, plus the full source. Verify a download against{" "}
        <a href="/downloads/SHA256SUMS">SHA256SUMS</a>.
      </p>
      <DownloadsTable />
      <Tabs
        group="dl"
        tabs={[
          {
            id: "curl",
            label: "curl",
            content: (
              <SiteCommand>{`curl -fsSLO {{site}}/downloads/nyxapi-core-${VERSION}.tgz
curl -fsSLO {{site}}/downloads/SHA256SUMS
sha256sum --check --ignore-missing SHA256SUMS`}</SiteCommand>
            ),
          },
          {
            id: "mac",
            label: "macOS",
            content: (
              <SiteCommand>{`curl -fsSLO {{site}}/downloads/nyxapi-core-${VERSION}.tgz
curl -fsSLO {{site}}/downloads/SHA256SUMS
shasum -a 256 -c SHA256SUMS 2>&1 | grep core`}</SiteCommand>
            ),
          },
          {
            id: "ps",
            label: "PowerShell",
            content: (
              <SiteCommand
                lang="text"
                title="PowerShell"
              >{`curl.exe -fsSLO "{{site}}/downloads/nyxapi-core-${VERSION}.tgz"
(Get-FileHash nyxapi-core-${VERSION}.tgz -Algorithm SHA256).Hash.ToLower()
# compare with the line for this file in SHA256SUMS`}</SiteCommand>
            ),
          },
        ]}
      />
      <p>Install tarballs by path. The CLI needs the codegen tarball next to it:</p>
      <Code lang="bash" title="terminal">{`npm install ./nyxapi-core-${VERSION}.tgz
npm install -D ./nyxapi-cli-${VERSION}.tgz ./nyxapi-codegen-${VERSION}.tgz`}</Code>

      <h2 id="source" style={{ marginTop: 36 }}>
        From source
      </h2>
      <SiteCommand>{`curl -fsSLO {{site}}/downloads/nyxapi-source-${VERSION}.zip
unzip nyxapi-source-${VERSION}.zip && cd nyxapi
pnpm install && pnpm check`}</SiteCommand>
      <p>
        <code>pnpm check</code> runs lint, type-checks, all tests, the build and the generated-code
        check. Source requires pnpm 10.
      </p>

      <h2 id="verify" style={{ marginTop: 36 }}>
        Check the install
      </h2>
      <Code lang="bash" title="terminal">{`npx nyx --help`}</Code>
      <p>
        Then follow the <Link href="/docs/quick-start/">quick start</Link>, or the slower{" "}
        <Link href="/beginners/">beginners guide</Link>.
      </p>
    </div>
  );
}
