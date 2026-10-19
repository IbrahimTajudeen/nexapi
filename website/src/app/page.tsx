import Link from "next/link";
import { Code } from "@/components/Code";
import { Console } from "@/components/Console";
import { EXAMPLES } from "@/lib/examples";
import { NODE_MIN, REPO_URL, VERSION } from "@/site";

const presets = [
  { label: "Typed errors", code: EXAMPLES.typedError.code },
  { label: "Optimistic update", code: EXAMPLES.optimistic.code },
  { label: "Roll back on failure", code: EXAMPLES.rollback.code },
  { label: "Retries", code: EXAMPLES.retries.code },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <div className="pill-row">
              <span className="pill">
                <b>Open source</b> MIT
              </span>
              <span className="pill">
                <b>v{VERSION}</b> pre-1.0
              </span>
              <span className="pill">
                <b>TypeScript</b> first
              </span>
            </div>
            <h1>Your API schema, as a typed client that caches for you.</h1>
            <p className="lead">
              NyxAPI generates a fluent TypeScript client from OpenAPI, Swagger or GraphQL (and
              adapts tRPC), then handles caching, retries and optimistic updates. It works without
              React, and comes with a React adapter when you want one.
            </p>
            <div className="cta-row">
              <Link className="btn primary" href="/docs/quick-start/">
                Start the quick start
              </Link>
              <Link className="btn" href="/playground/">
                Open the playground
              </Link>
              <Link className="btn" href="/install/">
                Install
              </Link>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              The code panel is the real engine running in your browser against a mock API. Edit it
              and press Run.
            </p>
          </div>
          <div>
            <Console
              code={EXAMPLES.singleFlight.code}
              presets={presets}
              title="try-it.js"
              rows={9}
            />
          </div>
        </div>
      </section>

      <section className="section alt" id="how-it-works">
        <div className="wrap">
          <h2>From schema to typed call in three steps</h2>
          <p className="sub">
            You keep one source of truth, the OpenAPI file your backend already publishes.
            Everything else is generated and checked by the compiler.
          </p>
          <div className="split">
            <ol className="steps" style={{ margin: 0 }}>
              <li>
                <strong>Point NyxAPI at your schema.</strong> A local file or a URL, JSON or YAML.
              </li>
              <li>
                <strong>Generate the client.</strong> The output is plain TypeScript with a stable,
                reviewable shape. Run <code>nyx generate --check</code> in CI to catch drift.
              </li>
              <li>
                <strong>Call your API.</strong> Path segments are properties, path parameters are
                function calls, and every response and error is typed.
              </li>
            </ol>
            <div>
              <Code
                lang="bash"
                title="terminal"
              >{`nyx generate --input ./openapi.yaml --output ./src/api`}</Code>
              <Code lang="ts" title="app.ts">{`import { createNyxClient } from "@nyxapi/core";
import { createApi } from "./api/index.js";

const nyx = createNyxClient({ baseUrl: "https://api.example.com/v1" });
const api = createApi(nyx);

const user = await api.users.byId("42").get();
//    ^? { id: string; name: string; role: "admin" | "member" }

const session = await api.auth.login.post({ email, password });`}</Code>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="wrap">
          <h2>One engine for reading and writing</h2>
          <p className="sub">
            Blue marks reads (queries) and green marks writes (mutations), here and throughout the
            documentation.
          </p>
          <div className="grid cols-3">
            <div className="card read-bar">
              <h3>Queries that behave</h3>
              <p>
                Identical requests share one network call. Data stays fresh for as long as you say,
                expires from memory when unused, and refetches on focus or reconnect. Retries cover
                temporary failures only.
              </p>
            </div>
            <div className="card write-bar">
              <h3>Mutations you can trust</h3>
              <p>
                Optimistic updates are patches, so a failed request removes exactly its own change.
                Retrying a write is off by default, and turning it on requires you to say the
                operation is safe to repeat.
              </p>
            </div>
            <div className="card">
              <h3>Types from the schema</h3>
              <p>
                Documented error responses become a union you can narrow by status. Optional
                response validation checks what the server actually sent, reporting positions and
                types, never values.
              </p>
            </div>
            <div className="card read-bar">
              <h3>Pagination in both directions</h3>
              <p>
                Infinite queries load forward and backward, keep memory bounded with a page limit,
                and never race each other.
              </p>
            </div>
            <div className="card write-bar">
              <h3>Ordered when it matters</h3>
              <p>
                Mutations that share a scope run one after another in the order you submitted them.
              </p>
            </div>
            <div className="card">
              <h3>Safe by default</h3>
              <p>
                The base origin is pinned, tokens never reach another origin, and errors never carry
                headers, bodies or query strings.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="wrap split">
          <div>
            <h2>Use it with React, or without</h2>
            <p className="sub" style={{ marginBottom: 18 }}>
              The engine has no dependency on React. The adapter adds hooks, Suspense and server
              rendering on top of the same cache, so a React component and a plain script share one
              source of truth.
            </p>
            <ul style={{ paddingLeft: "1.2em", color: "var(--muted)", margin: 0 }}>
              <li>
                <code>useQuery</code>, <code>useMutation</code>, <code>useInfiniteQuery</code>
              </li>
              <li>
                <code>useSuspenseQuery</code> and <code>useSuspenseInfiniteQuery</code>
              </li>
              <li>Streaming server rendering with a per-request client</li>
              <li>A cache inspector and a small devtools panel</li>
            </ul>
          </div>
          <Code
            lang="tsx"
            title="UserCard.tsx"
          >{`function UserCard({ userId }: { userId: string }) {
  const user = useQuery(api.users.byId(userId).get.options());
  const rename = useMutation(
    api.users.byId(userId).patch.options(undefined, {
      onMutate: (patch, { optimistic }) => {
        optimistic(api.users.byId(userId).get.key(), (old) =>
          old ? { ...old, ...patch } : old,
        );
      },
      invalidates: [api.users.byId(userId).get.key()],
    }),
  );

  if (user.isPending) return <p>Loading…</p>;
  return (
    <button onClick={() => rename.mutate({ name: "Ada Lovelace" })}>
      {user.data?.name}
    </button>
  );
}`}</Code>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>Works with the backend you already have</h2>
          <p className="sub">
            If your server publishes an OpenAPI or Swagger document or a GraphQL schema, NyxAPI can
            generate a client from it; if it is tRPC, you wrap the client you already have. Nothing
            about your backend has to change.
          </p>
          <div className="grid cols-2">
            <Link className="card link" href="/docs/adapters/">
              <h3>NestJS</h3>
              <p>
                Verified against real <code>@nestjs/swagger</code> output.
              </p>
            </Link>
            <Link className="card link" href="/docs/adapters/">
              <h3>ASP.NET Core</h3>
              <p>
                Swashbuckle output is supported; the bundled fixture is hand-written and labelled as
                such.
              </p>
            </Link>
            <Link className="card link" href="/docs/graphql/">
              <h3>GraphQL and tRPC</h3>
              <p>
                Typed queries and mutations from a schema, or typed keys for every tRPC procedure,
                on the same cache as REST. Subscriptions are not supported.
              </p>
            </Link>
            <Link className="card link" href="/docs/schemas/">
              <h3>Anything else</h3>
              <p>
                Any server that emits OpenAPI 3.x can be tried. Constructs NyxAPI cannot represent
                are reported as clear errors or warnings, never skipped silently.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="wrap">
          <h2>Honest about where it stands</h2>
          <p className="sub">
            NyxAPI is at version {VERSION}. It is pre-1.0, so the API can still change between minor
            versions; <Link href="/releases/">the release history</Link> says what each version
            contains and which are on npm. Performance is measured against TanStack Query and RTK
            Query in the repository, with the caveats written next to the numbers and no claim that
            one tool is better.
          </p>
          <div className="grid cols-3">
            <Link className="card link" href="/install/">
              <h3>Install today</h3>
              <p>Use the tarballs or the source. Requires Node {NODE_MIN} or newer.</p>
            </Link>
            <Link className="card link" href="/docs/benchmarks/">
              <h3>See how it is measured</h3>
              <p>Method, scenarios, and what the benchmarks do not show.</p>
            </Link>
            <Link className="card link" href="/beginners/">
              <h3>New to this?</h3>
              <p>
                A guided path from an empty folder to a working client, locally or in the browser.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <section className="section alt" id="learn">
        <div className="wrap">
          <h2>Learn NyxAPI your way</h2>
          <p className="sub">
            Read the guides, run live examples, or follow a 30-episode video playlist plan from
            first install to production.
          </p>
          <div className="grid cols-3">
            <Link className="card link" href="/docs/manual/">
              <h3>No schema? Start here</h3>
              <p>Define endpoints by hand and cover every HTTP method, body and response.</p>
            </Link>
            <Link className="card link" href="/docs/techniques/">
              <h3>Techniques and best practices</h3>
              <p>
                Retries, token refresh, polling, optimistic updates, testing and a production
                checklist.
              </p>
            </Link>
            <Link className="card link" href="/tutorials/">
              <h3>Tutorials and playlist</h3>
              <p>Beginner to professional episodes. Tutors can claim one and record it.</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="section" id="contribute">
        <div className="wrap">
          <div className="contrib">
            <h2>NyxAPI is open source and needs contributors</h2>
            <p className="sub" style={{ marginBottom: 20 }}>
              The core, code generator, React adapter and devtools are written and tested, and there
              is plenty left: more framework guides, more schema edge cases, browser test matrices,
              Next.js and server components integration, and real-world feedback. If you use
              OpenAPI, your bug reports are a contribution.
            </p>
            <div className="cta-row">
              <Link className="btn primary" href="/contribute/">
                How to contribute
              </Link>
              {REPO_URL && (
                <a className="btn" href={REPO_URL} rel="noopener">
                  View the source
                </a>
              )}
              <Link className="btn" href="/docs/">
                Read the docs first
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
