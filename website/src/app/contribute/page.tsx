import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { REPO_URL } from "@/site";

export const metadata: Metadata = {
  title: "Contribute",
  description:
    "NyxAPI is open source and looking for contributors. Here is how to set up, what to work on, and how we work.",
};

const AREAS: [string, string][] = [
  [
    "Try it on your schema",
    "Run nyxapi validate on a real OpenAPI document and report anything that is rejected or generated wrongly. Large and unusual schemas are the most valuable.",
  ],
  [
    "Framework guides",
    "NestJS is verified on real output. ASP.NET Core needs someone with the .NET SDK to replace our hand-written fixture with real Swashbuckle output. FastAPI, Spring, Laravel and others have no guide yet.",
  ],
  [
    "Next.js and server components",
    "Streaming server rendering works. First-class support for the App Router and server components is not built.",
  ],
  [
    "Devtools",
    "A per-request timeline needs a transport-level hook, and the panel is intentionally minimal.",
  ],
  [
    "Browser testing",
    "Tests run in Node and jsdom. A real-browser matrix would catch what they cannot.",
  ],
  [
    "Benchmarks",
    "Real-browser rendering, long-session memory, and mutation or rollback comparisons are not measured yet.",
  ],
  [
    "Docs and translations",
    "Fix what is unclear, add recipes, translate pages. Every example on this site is executed by a test, so keep them runnable.",
  ],
];

export default function Page() {
  return (
    <div className="wrap" style={{ padding: "36px 0 80px", maxWidth: 900 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.7rem)" }}>Contribute to NyxAPI</h1>
      <p style={{ color: "var(--muted)", fontSize: "1.15rem" }}>
        NyxAPI is open source under the MIT licence, and it is looking for contributors. The engine,
        generator, React adapter and devtools exist and are tested. What it needs now is people who
        use it, break it, and make it better.
      </p>
      <div className="cta-row">
        {REPO_URL ? (
          <>
            <a className="btn primary" href={REPO_URL} rel="noopener">
              Open the repository
            </a>
            <a className="btn" href={`${REPO_URL}/issues`} rel="noopener">
              Browse issues
            </a>
          </>
        ) : (
          <Callout kind="note">
            This site was built without a repository address. Set <code>NEXT_PUBLIC_REPO_URL</code>{" "}
            when you build it and the links to the code and issues appear here and in the header.
          </Callout>
        )}
      </div>

      <h2 style={{ marginTop: 36 }}>Ways to help</h2>
      <div className="grid cols-2">
        {AREAS.map(([t, d]) => (
          <div className="card" key={t}>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 36 }} id="setup">
        Set up in two minutes
      </h2>
      <p>
        Needs Node.js 22.12 or newer and pnpm 10. Get the code from the repository, or from the{" "}
        <Link href="/install/#source">source download</Link>.
      </p>
      <Code lang="bash" title="terminal">{`pnpm install
pnpm check                              # lint, type-check, tests, build, generated-code check
pnpm --filter @nyxapi/website dev       # this website, with hot reload`}</Code>
      <p>
        If <code>pnpm check</code> passes, you are ready. It runs the whole suite, and it is what
        runs in CI.
      </p>

      <h2 style={{ marginTop: 36 }}>Where things live</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            {[
              [
                "packages/core",
                "HTTP client, query cache, mutations. No React, no runtime dependencies.",
              ],
              ["packages/codegen", "OpenAPI to TypeScript. Pure functions, no file access."],
              ["packages/cli", "The nyxapi command."],
              ["packages/react", "Hooks over the core cache."],
              ["packages/devtools", "Cache inspector and React panel."],
              ["fixtures/openapi", "Test schemas, including real NestJS output."],
              ["tests", "End-to-end tests against a real local HTTP server."],
              ["benchmarks", "Reproducible comparisons with their method written down."],
              ["website", "This site. Its examples are executed by tests."],
            ].map(([p, d]) => (
              <tr key={p}>
                <th style={{ width: 200 }}>
                  <code>{p}</code>
                </th>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Start with the architecture and API design notes in <code>docs/ARCHITECTURE.md</code> and{" "}
        <code>docs/API-DESIGN.md</code>.
      </p>

      <h2 style={{ marginTop: 36 }}>How we work</h2>
      <ul>
        <li>
          Behaviour changes come with tests. Type-level promises come with compile-time tests.
        </li>
        <li>
          No <code>any</code> in public types. Generated output stays deterministic.
        </li>
        <li>Nothing is logged, and errors never contain headers, bodies or query strings.</li>
        <li>
          We do not claim something works until a test or a documented run shows it. That includes
          performance.
        </li>
        <li>
          Open an issue before a large change, keep pull requests to one topic, and run{" "}
          <code>pnpm check</code> first.
        </li>
      </ul>

      <h2 style={{ marginTop: 36 }}>Reporting a security problem</h2>
      <p>
        Please tell the maintainers privately instead of opening a public issue
        {REPO_URL ? (
          <>
            , for example through the repository&apos;s{" "}
            <a href={`${REPO_URL}/security/advisories/new`} rel="noopener">
              private security advisory form
            </a>
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
