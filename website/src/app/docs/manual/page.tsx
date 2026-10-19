import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { ChooseApproach } from "@/components/Diagrams";
import { Doc, H2, H3, Table } from "@/components/Doc";
import { OptionLab } from "@/components/OptionLab";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "Manual queries (no schema)" };

export default function Page() {
  return (
    <Doc
      href="/docs/manual/"
      title="Manual queries (no schema)"
      lede="No OpenAPI file, no GraphQL schema, no generator? You still get the cache, retries, cancellation, optimistic updates and typed errors. Describe each endpoint in a few lines and NyxAPI treats it exactly like a generated one."
    >
      <ChooseApproach />

      <H2>When to define endpoints by hand</H2>
      <Table
        head={["Situation", "Use"]}
        rows={[
          [
            "Your backend publishes an OpenAPI, Swagger or GraphQL schema",
            <>
              <Link key="a" href="/docs/codegen/">
                nyx generate
              </Link>
              : types and paths come for free and cannot drift.
            </>,
          ],
          [
            "A third-party API with no machine-readable schema",
            "Manual endpoints. Write the handful you actually use.",
          ],
          [
            "A prototype, a script, or one-off calls beside a generated client",
            "Manual endpoints. Move to generation when a schema appears.",
          ],
          [
            "Something that is not HTTP (local storage, a database driver, a WebSocket request)",
            <>
              A custom operation or a custom <code key="b">queryFn</code>; see{" "}
              <a key="c" href="#beyond-http">
                Beyond HTTP
              </a>
              .
            </>,
          ],
          [
            "A server that cannot tell you its routes",
            "Manual endpoints. A base URL alone does not reveal routes, so nothing can be generated without a schema.",
          ],
        ]}
      />

      <H2>Your first manual endpoint</H2>
      <p>
        Create the client as usual. Then call <code>nyx.query(definition)</code> for a read, or{" "}
        <code>nyx.mutation(definition)</code> for a write. A definition is a plain object; the
        method and path are all that is required.
      </p>
      <Code lang="ts">{`import { createNyxClient } from "@nyxapi/core";

const nyx = createNyxClient({ baseUrl: "https://api.example.com/v1" });

const getUser = nyx.query({ method: "get", path: "/users/{id}", params: { id: "1" } });
const user = await getUser(); // a plain request`}</Code>
      <p>
        The endpoint is a function with the same extras every generated endpoint has:{" "}
        <code>options()</code> for the cache and hooks, <code>key()</code>, <code>prefetch()</code>{" "}
        and <code>invalidate()</code>. Run it:
      </p>
      <Runnable id="manualGet" />

      <H2>The endpoint definition</H2>
      <Table
        head={["Field", "Type", "Meaning"]}
        rows={[
          [
            <code key="a">method</code>,
            <code key="a2">HttpMethod</code>,
            "get, post, put, patch, delete, head or options. Lower case.",
          ],
          [
            <code key="b">path</code>,
            <code key="b2">string</code>,
            <>
              A template such as <code>/users/{"{id}"}</code>. It is joined to the base URL; it
              cannot point at another origin.
            </>,
          ],
          [
            <code key="c">params</code>,
            <code key="c2">Record&lt;string, string | number | boolean&gt;</code>,
            "Values for the placeholders in path. Each value is URL-encoded; an empty value, . or .. is rejected.",
          ],
          [
            <code key="d">hasBody</code>,
            <code key="d2">boolean</code>,
            "For mutations: the first argument is the request body.",
          ],
          [
            <code key="e">bodyKind</code>,
            <code key="e2">
              &quot;json&quot; | &quot;form-data&quot; | &quot;urlencoded&quot; | &quot;binary&quot;
              | &quot;text&quot;
            </code>,
            "How the body is encoded. Default json.",
          ],
          [
            <code key="f">response</code>,
            <code key="f2">
              &quot;json&quot; | &quot;none&quot; | &quot;text&quot; | &quot;blob&quot;
            </code>,
            "How a successful body is read. none for 204 responses. Default json.",
          ],
          [
            <code key="g">queryStyles</code>,
            <code key="g2">Record&lt;string, QueryStyle&gt;</code>,
            "csv, space, pipe or deepObject for chosen query parameters.",
          ],
          [
            <code key="h">operationId</code>,
            <code key="h2">string</code>,
            "An optional name for your own tooling and logs.",
          ],
        ]}
      />
      <Callout kind="note" title="Where does the base URL come from?">
        From <code>createNyxClient</code>. Every request is pinned to that origin, so a definition
        can never send a token somewhere else. See <Link href="/docs/security/">Security</Link>.
      </Callout>

      <H2>Path parameters</H2>
      <p>
        Parameter values belong to the endpoint, so for values that change, wrap the definition in a
        small function. The function is your resource tree:
      </p>
      <Code lang="ts">{`const user = (id: string) => nyx.query({ method: "get", path: "/users/{id}", params: { id } });

await user("1")();                              // direct call
await nyx.queryClient.fetchQuery(user("1").options());  // cached`}</Code>
      <Runnable id="manualFactory" />
      <Callout kind="read" title="options(request, config)">
        <code>options()</code> takes the request first and the cache settings second, so pass{" "}
        <code>undefined</code> when you have no request:{" "}
        <code>{"options(undefined, { staleTime: 60_000 })"}</code>.
      </Callout>

      <H2>Query strings and headers</H2>
      <p>
        These go in the request object you pass when calling. Arrays repeat the parameter; values
        that are <code>undefined</code> or <code>null</code> are skipped. Each distinct request is
        its own cache entry.
      </p>
      <Runnable id="manualQuery" />

      <H2>Writes</H2>
      <p>
        Everything that is not a GET is a mutation. Set <code>hasBody: true</code> when it takes a
        body: the body is the first argument. A mutation runs once, never silently retried, and can
        list the reads it makes stale with <code>invalidates</code>.
      </p>
      <Runnable id="manualMutation" />

      <H3>Every method, one definition at a time</H3>
      <p>
        Pick an endpoint and read the definition NyxAPI needs for it. The generated program is
        editable; change anything and press Run.
      </p>
      <OptionLab id="manual" />

      <H2>Adding types</H2>
      <p>
        A hand-written endpoint takes type arguments, so your editor knows what comes back. The
        engine does not check them at runtime (turn on validation in generated clients for that);
        they describe what you believe the server sends.
      </p>
      <Code
        lang="ts"
        title="api.ts"
      >{`import { createNyxClient, type QueryConfig } from "@nyxapi/core";

export interface User { id: string; name: string; email: string | null }
export interface Page<T> { items: T[]; total: number }
export interface ApiError { code: string; message: string }

export const nyx = createNyxClient({ baseUrl: "https://api.example.com/v1" });

// nyx.query<Request, Data, ErrorBody>
export const user = (id: string) =>
  nyx.query<Record<never, never>, User, ApiError>({
    method: "get",
    path: "/users/{id}",
    params: { id },
  });

export const users = nyx.query<{ query?: { limit?: number; role?: string[] } }, Page<User>, ApiError>({
  method: "get",
  path: "/users",
});

// nyx.mutation<Request, Body, Data, ErrorBody>
export const createUser = nyx.mutation<Record<never, never>, { name: string; email?: string }, User, ApiError>({
  method: "post",
  path: "/users",
  hasBody: true,
});`}</Code>
      <Table
        head={["Type argument", "Meaning"]}
        rows={[
          [
            <code key="a">Request</code>,
            <>
              The shape of what you pass when calling: <code>{"{ query?: …, headers?: … }"}</code>.
              Use <code>Record&lt;never, never&gt;</code> when there is none.
            </>,
          ],
          [<code key="b">Body</code>, "Mutations only: the type of the request body."],
          [<code key="c">Data</code>, "What a successful response contains."],
          [
            <code key="d">ErrorBody</code>,
            <>
              The JSON the server sends on failure. It appears as <code>error.body</code> on an{" "}
              <code>HttpError</code>.
            </>,
          ],
        ]}
      />
      <p>
        With these in place, <code>users({'{ query: { limit: "10" } }'})</code> is a compile error
        (the limit must be a number) and <code>created.name</code> is a string. Typing the error
        body lets you narrow failures without casts, as in <Link href="/docs/errors/">Errors</Link>.
      </p>

      <H2>The same cache and the same hooks</H2>
      <p>
        <code>options()</code> returns ordinary query options, so everything on{" "}
        <Link href="/docs/queries/">Queries and caching</Link>,{" "}
        <Link href="/docs/mutations/">Mutations</Link> and <Link href="/docs/react/">React</Link>{" "}
        applies unchanged:
      </p>
      <Code lang="tsx">{`import { useQuery, useMutation } from "@nyxapi/react";

function Team() {
  const team = useQuery(users.options({ query: { role: ["admin"] } }, { staleTime: 30_000 }));
  const add = useMutation(createUser.options(undefined, { invalidates: [users.key()] }));
  // ...
}`}</Code>

      <H2>Beyond HTTP</H2>
      <p>
        The cache does not care where data comes from. Give the query client a key and any async
        function and it will cache, share and cancel it. Pass the abort signal on to whatever you
        call so cancellation actually stops the work:
      </p>
      <Runnable id="customFetcher" />
      <p>
        To get the full endpoint surface (<code>options</code>, <code>key</code>,{" "}
        <code>prefetch</code>, <code>invalidate</code>) for something that is not HTTP, wrap it as
        an operation. This is how the GraphQL and tRPC adapters are built:
      </p>
      <Runnable id="customOperation" />

      <H2>Errors from hand-written endpoints</H2>
      <p>
        They are the same typed errors a generated client raises: <code>HttpError</code> with the
        parsed body, <code>NetworkError</code>, <code>TimeoutError</code> and the rest. The URL on
        an error never includes the query string, because it can hold secrets.
      </p>
      <Runnable id="manualTypedError" />

      <H2>Moving to a generated client later</H2>
      <ol>
        <li>
          Get or write a schema. An OpenAPI file for a third-party API is fine, and so is a trimmed
          one with only the routes you use.
        </li>
        <li>
          Run <code>nyx init</code> and <code>nyx generate</code>; see{" "}
          <Link href="/docs/codegen/">Code generation</Link>.
        </li>
        <li>
          Replace your <code>user(id)</code> helpers with <code>api.users.byId(id).get</code>. Keys
          are built the same way (<code>[METHOD, path, params, request?]</code>), so cached data and
          invalidations keep lining up while you migrate one file at a time.
        </li>
        <li>Delete the hand-written types. The compiler lists every call that no longer fits.</li>
      </ol>

      <H2>Common mistakes</H2>
      <div className="do-dont">
        <div className="do">
          <h4>Do</h4>
          <ul>
            <li>Keep definitions in one module so paths and types live in one place.</li>
            <li>
              Create endpoints once; calling <code>nyx.query</code> per render is wasteful.
            </li>
            <li>
              Pass <code>signal</code> to every request inside a custom <code>queryFn</code>.
            </li>
            <li>Type the error body you actually receive.</li>
          </ul>
        </div>
        <div className="dont">
          <h4>Do not</h4>
          <ul>
            <li>
              Build paths by string concatenation. Use placeholders and <code>params</code>.
            </li>
            <li>Put secrets in query strings. They are stripped from errors but still sent.</li>
            <li>
              Use <code>allowAbsoluteUrls</code> to reach a second host. Make a second client.
            </li>
            <li>
              Forget <code>hasBody: true</code>. Without it the first argument is not a body.
            </li>
          </ul>
        </div>
      </div>
      <p>
        Next: <Link href="/docs/http/">HTTP requests and methods</Link> covers every request setting
        in depth.
      </p>
    </Doc>
  );
}
