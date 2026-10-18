import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Console } from "@/components/Console";
import { SiteCommand } from "@/components/SiteCommand";
import { EXAMPLES } from "@/lib/examples";
import { NODE_MIN, VERSION } from "@/site";

export const metadata: Metadata = {
  title: "Beginners",
  description:
    "A gentle path into NyxAPI: try it in your browser, then run a starter project on your own computer.",
};

const WORDS: [string, string][] = [
  ["API", "A server your code talks to over the internet to get or change data."],
  [
    "OpenAPI schema",
    "A file that describes an API: its addresses, what you send, and what comes back. Many backends publish one.",
  ],
  [
    "Client",
    "The code in your app that calls the API. NyxAPI writes this part for you, from the schema.",
  ],
  [
    "Type",
    "TypeScript's description of a value, like “a pet has a name and a species”. It lets your editor catch mistakes before you run anything.",
  ],
  [
    "Cache",
    "A short-term memory for results, so asking for the same thing twice does not hit the server twice.",
  ],
  ["Query", "A read: getting data."],
  ["Mutation", "A write: creating, changing or deleting data."],
];

export default function Page() {
  return (
    <div className="wrap" style={{ padding: "36px 0 80px", maxWidth: 900 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.7rem)" }}>Beginners</h1>
      <p style={{ color: "var(--muted)", fontSize: "1.15rem" }}>
        New to typed API clients? Start here. First you will try NyxAPI in this page with nothing to
        install. Then you will run a small project on your own computer, with an API included.
      </p>

      <h2 style={{ marginTop: 36 }} id="words">
        Words you will see
      </h2>
      <div className="table-wrap">
        <table>
          <tbody>
            {WORDS.map(([w, d]) => (
              <tr key={w}>
                <th style={{ width: 150 }}>{w}</th>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 36 }} id="live">
        Path 1: try it here, right now
      </h2>
      <p>
        This is real NyxAPI code running in your browser against a pretend server. Press{" "}
        <strong>Run</strong>, then change the id <code>&quot;1&quot;</code> to{" "}
        <code>&quot;99&quot;</code> and run it again to see an error.
      </p>
      <Console code={EXAMPLES.firstCall.code} title="my-first-call.js" rows={5} />
      <p>
        There are more examples, a React demo and a generator you can feed your own schema in the{" "}
        <Link href="/playground/">playground</Link>.
      </p>

      <h2 style={{ marginTop: 36 }} id="local">
        Path 2: run it on your computer
      </h2>
      <p>
        You need <a href="https://nodejs.org">Node.js</a> {NODE_MIN} or newer. Check with{" "}
        <code>node --version</code>. The starter project includes a small pet shop API and a
        ready-to-run program, and carries NyxAPI {VERSION} inside it, so it needs no account and no
        registry.
      </p>
      <ol className="steps">
        <li>
          <strong>Download the starter and open it.</strong>
          <SiteCommand>{`curl -fsSLO {{site}}/downloads/nyxapi-starter-${VERSION}.zip
unzip nyxapi-starter-${VERSION}.zip
cd nyxapi-starter`}</SiteCommand>
          No curl? <a href={`/downloads/nyxapi-starter-${VERSION}.zip`}>Download the zip</a> in your
          browser and unzip it.
        </li>
        <li>
          <strong>Install it.</strong>
          <Code lang="bash" title="terminal">{`npm install`}</Code>
        </li>
        <li>
          <strong>Generate the client.</strong> This reads <code>openapi.yaml</code> and writes
          typed code into <code>src/api</code>.
          <Code lang="bash" title="terminal">{`npm run generate`}</Code>
        </li>
        <li>
          <strong>Start the pet shop API</strong> and leave it running.
          <Code lang="bash" title="terminal">{`npm run api`}</Code>
        </li>
        <li>
          <strong>Open a second terminal</strong> in the same folder and run the program.
          <Code lang="bash" title="terminal (second window)">{`npm start`}</Code>
          You will see the pets listed, a new one added, a typed 404 error, and proof that five
          identical requests became one.
        </li>
      </ol>
      <Callout kind="note" title="What was in that program?">
        Open <code>src/main.ts</code>. It is short and commented. Each numbered block prints a
        heading, so you can match the output to the code.
      </Callout>

      <h3 style={{ margin: "28px 0 8px" }}>Experiments</h3>
      <ul>
        <li>
          In <code>src/main.ts</code> change <code>&quot;cat&quot;</code> to{" "}
          <code>&quot;bird&quot;</code>, then run <code>npm run check</code>. TypeScript refuses,
          because the schema only allows cat or dog.
        </li>
        <li>
          Add <code>age: &#123; type: integer &#125;</code> to the <code>Pet</code> schema in{" "}
          <code>openapi.yaml</code>, run <code>npm run generate</code>, and look at{" "}
          <code>src/api/types.ts</code>.
        </li>
        <li>
          In <code>server.mjs</code> change the first pet to <code>name: 42</code> and run{" "}
          <code>npm start</code>. The schema says a name is text, and validation is on in{" "}
          <code>nyx.config.json</code>, so you get a response validation error instead of bad data
          reaching your code.
        </li>
      </ul>

      <h2 style={{ marginTop: 36 }} id="own">
        Path 3: use your own API
      </h2>
      <p>
        You need your backend&apos;s OpenAPI file. NestJS, ASP.NET Core, FastAPI, Spring and many
        others can export one. Put it in a project and follow the{" "}
        <Link href="/docs/quick-start/">quick start</Link>. If your backend is NestJS or ASP.NET,
        see <Link href="/docs/adapters/">how to export the schema</Link>.
      </p>

      <h2 style={{ marginTop: 36 }} id="stuck">
        If something goes wrong
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>You see</th>
              <th>Try this</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>Cannot find module</code> or <code>ERR_MODULE_NOT_FOUND</code>
              </td>
              <td>
                Make sure <code>package.json</code> has{" "}
                <code>&quot;type&quot;: &quot;module&quot;</code> and you ran{" "}
                <code>npm run generate</code> before <code>npm start</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>fetch failed</code> or <code>NetworkError</code>
              </td>
              <td>
                The API is not running. Start it with <code>npm run api</code> in another terminal.
              </td>
            </tr>
            <tr>
              <td>
                <code>EADDRINUSE</code>
              </td>
              <td>
                Port 3000 is busy. Use <code>PORT=3001 npm run api</code> and{" "}
                <code>API_URL=http://localhost:3001 npm start</code>.
              </td>
            </tr>
            <tr>
              <td>Node version errors</td>
              <td>
                Install Node {NODE_MIN} or newer and run <code>npm install</code> again.
              </td>
            </tr>
            <tr>
              <td>
                <code>Generated files are out of date</code>
              </td>
              <td>
                Run <code>npm run generate</code>, and commit the result.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 36 }}>Where next</h2>
      <ul>
        <li>
          <Link href="/docs/fluent-api/">The fluent API</Link>: how paths turn into calls.
        </li>
        <li>
          <Link href="/docs/queries/">Queries and caching</Link> and{" "}
          <Link href="/docs/mutations/">Mutations</Link>.
        </li>
        <li>
          <Link href="/docs/react/">React</Link>, if you build interfaces.
        </li>
      </ul>
    </div>
  );
}
