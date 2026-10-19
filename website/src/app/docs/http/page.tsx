import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { RequestFlow } from "@/components/Diagrams";
import { Doc, H2, H3, Table } from "@/components/Doc";
import { OptionLab } from "@/components/OptionLab";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "HTTP requests and methods" };

export default function Page() {
  return (
    <Doc
      href="/docs/http/"
      title="HTTP requests and methods"
      lede="Everything NyxAPI sends starts as one request: a method, a path, and optional parameters, headers and a body. This page covers each part, what NyxAPI does with it, and how to see exactly what went over the wire."
    >
      <RequestFlow />

      <H2>Two ways to send a request</H2>
      <Table
        head={["You call", "What you get", "Use it for"]}
        rows={[
          [
            <code key="a">api.users.byId(&quot;1&quot;).get()</code>,
            "A generated, typed endpoint",
            "Everyday calls when you have a schema.",
          ],
          [
            <code key="b">nyx.query(def) / nyx.mutation(def)</code>,
            "A hand-written endpoint with keys, options and invalidation",
            <>
              Calls without a schema. See{" "}
              <Link key="b2" href="/docs/manual/">
                Manual queries
              </Link>
              .
            </>,
          ],
          [
            <code key="c">nyx.http.request(spec)</code>,
            "The raw HTTP client: no cache, no keys",
            "One-off calls, uploads, health checks, glue code.",
          ],
        ]}
      />
      <p>
        All three share one HTTP client: the same base URL and pinned origin, token, middleware,
        timeout, size limit and error types. Only the raw client skips the cache.
      </p>
      <Code lang="ts">{`const result = await nyx.http.request<{ ok: boolean }>({
  method: "post",
  path: "/jobs/{id}/retry",
  params: { id: "42" },
  query: { dryRun: false },
  headers: { "x-request-id": crypto.randomUUID() },
  body: { reason: "stuck" },
  timeoutMs: 10_000,
});`}</Code>

      <H2>Choosing a method</H2>
      <p>
        The method tells everyone, including caches and proxies, what a request means. NyxAPI also
        uses it to decide how to treat the call.
      </p>
      <Table
        head={["Method", "Means", "Body", "Safe to repeat", "In NyxAPI"]}
        rows={[
          [
            <code key="1">GET</code>,
            "Read a resource",
            "No",
            "Yes",
            "A query: cached, shared, retried on transient failures.",
          ],
          [
            <code key="2">POST</code>,
            "Create, or run an action",
            "Usually",
            "No",
            "A mutation: run once, never silently retried.",
          ],
          [
            <code key="3">PUT</code>,
            "Replace a resource",
            "Yes",
            "Yes",
            "A mutation. Opt in to retries because repeating it gives the same result.",
          ],
          [
            <code key="4">PATCH</code>,
            "Change part of a resource",
            "Yes",
            "Depends",
            "A mutation. Retry only if your PATCH is idempotent.",
          ],
          [
            <code key="5">DELETE</code>,
            "Remove a resource",
            "Rarely",
            "Yes",
            "A mutation. Often answers 204: use response: none.",
          ],
          [
            <code key="6">HEAD</code>,
            "A GET without the body",
            "No",
            "Yes",
            "Raw client only. HEAD has no body, so use response: none.",
          ],
          [
            <code key="7">OPTIONS</code>,
            "Which methods are allowed",
            "No",
            "Yes",
            "Raw client; browsers send their own for CORS preflight.",
          ],
        ]}
      />
      <Callout kind="write" title="Why mutations are not retried by default">
        If a POST times out you cannot know whether the server created the order. Retrying could
        create two. Retries for mutations are opt-in and must say they are idempotent:{" "}
        <code>{"retry: { idempotent: true, attempts: 2 }"}</code>. Queries retry transient failures
        (network trouble, timeouts, 408, 429, 5xx) up to three times by default.
      </Callout>

      <H2>Try every method</H2>
      <p>
        The mock API has an <code>/echo</code> route that answers any method and reports what it
        received. Change a setting, press Run, and read the result.
      </p>
      <OptionLab id="http" />
      <Runnable id="httpMethods" />

      <H2>Paths and path parameters</H2>
      <p>
        The path is a template joined to the base URL. Placeholders are filled from{" "}
        <code>params</code> and encoded strictly, so a value can never add a slash or climb out of
        its segment.
      </p>
      <Table
        head={["You pass", "Sent as"]}
        rows={[
          [
            <code key="a">{"/users/{id}"} + id: &quot;42&quot;</code>,
            <code key="a2">/users/42</code>,
          ],
          [<code key="b">id: &quot;a b/c&quot;</code>, <code key="b2">/users/a%20b%2Fc</code>],
          [
            <code key="c">id: &quot;..&quot;</code>,
            "Rejected with RequestError before anything is sent.",
          ],
          [<code key="d">id: &quot;&quot;</code>, "Rejected with RequestError."],
          [<code key="e">a missing placeholder</code>, "Rejected with RequestError that names it."],
          [
            <code key="f">https://other.example/x</code>,
            <>
              Refused: it would leave the pinned origin (unless <code>allowAbsoluteUrls</code> is
              on).
            </>,
          ],
        ]}
      />

      <H2>Query strings</H2>
      <p>
        Values may be strings, numbers, booleans, <code>Date</code>s (sent as ISO strings) or arrays
        of those. <code>undefined</code> and <code>null</code> are skipped, and a number that is not
        finite is rejected. Arrays repeat the parameter by default; <code>queryStyles</code> changes
        that per parameter:
      </p>
      <Runnable id="queryStyles" />
      <p>
        The delimited styles (<code>csv</code>, <code>space</code>, <code>pipe</code>) need an array
        and reject a value that already contains the delimiter, because the result would be
        ambiguous. <code>deepObject</code> needs an object of primitives whose keys contain no
        brackets. Each mistake raises <code>RequestError</code> before anything is sent.
      </p>
      <Table
        head={["Style", "Array [admin, member] becomes", "Typical OpenAPI"]}
        rows={[
          [
            "default (exploded)",
            <code key="a">role=admin&amp;role=member</code>,
            "style: form, explode: true",
          ],
          ["csv", <code key="b">role=admin,member</code>, "style: form, explode: false"],
          ["space", <code key="c">role=admin member</code>, "style: spaceDelimited"],
          ["pipe", <code key="d">role=admin|member</code>, "style: pipeDelimited"],
          ["deepObject", <code key="e">filter[role]=admin</code>, "style: deepObject (objects)"],
        ]}
      />

      <H2>Headers and authentication</H2>
      <p>
        Headers can be set on the client (sent with every request), per request, and from a token
        function. A per-request header wins over a client header with the same name, and{" "}
        <code>getToken</code> sets <code>Authorization: Bearer …</code> fresh for every request, so
        a refreshed token is picked up without rebuilding anything.
      </p>
      <Runnable id="headerPrecedence" />
      <Callout kind="warn" title="Credentials are never logged">
        Errors carry the method and a sanitized URL (origin and path only). They never include
        request headers or bodies, so printing an error cannot leak a token.
      </Callout>
      <p>
        For cookies, set <code>credentials</code> on the client (<code>&quot;include&quot;</code>{" "}
        for a cross-origin API that answers with CORS credential headers). Browsers do not let
        scripts set a <code>Cookie</code> header, so this is the only way to use cookie sessions.
        See <Link href="/docs/integrations/auth/">Authentication</Link> for refresh flows.
      </p>

      <H2>Request bodies</H2>
      <p>
        <code>bodyKind</code> picks the encoding and sets the matching <code>Content-Type</code>.
      </p>
      <Runnable id="bodyKinds" />
      <Table
        head={["bodyKind", "Body you pass", "Content-Type sent"]}
        rows={[
          [<code key="a">json</code>, "Any JSON-serializable value", "application/json"],
          [
            <code key="b">urlencoded</code>,
            "A plain object of primitives or arrays",
            "application/x-www-form-urlencoded",
          ],
          [
            <code key="c">form-data</code>,
            "A plain object (Blobs and Files become file parts; arrays repeat the field) or a FormData",
            "multipart/form-data with a generated boundary",
          ],
          [
            <code key="d">binary</code>,
            "A Blob, ArrayBuffer or typed array",
            "The Blob's own type, or application/octet-stream",
          ],
          [<code key="e">text</code>, "A string", "text/plain; charset=utf-8"],
        ]}
      />
      <Callout kind="note" title="Content-Type for form-data">
        NyxAPI removes any <code>Content-Type</code> header for <code>form-data</code> so{" "}
        <code>fetch</code> can add the multipart boundary itself. A hand-set value would make the
        boundary wrong and the server could not parse the body. For the other kinds, a header you
        set yourself is respected.
      </Callout>
      <p>
        A body must match its kind: a <code>text</code> body must be a string, a <code>binary</code>{" "}
        body a Blob, ArrayBuffer or typed array, and <code>urlencoded</code> and{" "}
        <code>form-data</code> bodies a plain object. Anything else raises <code>RequestError</code>{" "}
        before a request is made. GET and HEAD cannot carry a body at all (fetch refuses).
      </p>

      <H2>Reading responses</H2>
      <Runnable id="responseKinds" />
      <Table
        head={["response", "Result", "Use for"]}
        rows={[
          [
            <code key="a">json</code>,
            "Parsed JSON. An empty or malformed body raises ParseError.",
            "Almost every API (default).",
          ],
          [<code key="b">text</code>, "A string", "Plain text, CSV, HTML, health checks."],
          [<code key="c">blob</code>, "A Blob with its content type", "Images, PDFs, downloads."],
          [
            <code key="d">none</code>,
            "undefined. The body is cancelled unread.",
            "204 No Content, HEAD, fire-and-forget.",
          ],
        ]}
      />
      <p>
        A 204 or 205 response is always treated as empty, whatever you ask for. Set{" "}
        <code>maxResponseBytes</code> on the client to stop a misbehaving server from exhausting
        memory: a larger body is cancelled and raises <code>ResponseTooLargeError</code>.
      </p>

      <H2>Status codes and errors</H2>
      <Table
        head={["The server answers", "You get", "Retried by default (queries)"]}
        rows={[
          ["2xx", "The decoded body", "n/a"],
          [
            "400, 401, 403, 404, 409, 422",
            <>
              <code key="a">HttpError</code> with status and the parsed body
            </>,
            "No",
          ],
          [
            "408, 429",
            <>
              <code key="b">HttpError</code>
            </>,
            "Yes",
          ],
          [
            "500, 502, 503, 504",
            <>
              <code key="c">HttpError</code>
            </>,
            "Yes",
          ],
          ["No answer at all", <code key="d">NetworkError</code>, "Yes"],
          ["Too slow", <code key="e">TimeoutError</code>, "Yes"],
          ["2xx but not valid JSON", <code key="f">ParseError</code>, "No"],
        ]}
      />
      <Code lang="ts">{`try {
  await nyx.http.request({ method: "get", path: "/users/{id}", params: { id: "99" } });
} catch (error) {
  if (error instanceof HttpError && error.status === 404) {
    console.log(error.body); // the server's JSON, parsed
  } else {
    throw error;
  }
}`}</Code>
      <p>
        See <Link href="/docs/errors/">Errors</Link> to try each failure, and the{" "}
        <Link href="/docs/api/">API reference</Link> for every field.
      </p>

      <H2>Timeouts and cancellation</H2>
      <p>
        <code>timeoutMs</code> (per request or on the client) aborts a slow request with{" "}
        <code>TimeoutError</code>. For your own cancellation, pass an <code>AbortSignal</code>;
        aborting raises the platform&apos;s <code>AbortError</code>. Inside a cached query the
        engine owns the signal and cancels the request when the last observer leaves.
      </p>
      <Code lang="ts">{`const controller = new AbortController();
const pending = nyx.http.request({ method: "get", path: "/reports/big", signal: controller.signal, timeoutMs: 30_000 });
cancelButton.onclick = () => controller.abort();`}</Code>

      <H3>Middleware</H3>
      <p>
        Middleware wraps every request and response, outermost first. Use it for logging, tracing
        headers and token refresh. See <Link href="/docs/techniques/">Techniques</Link> for a
        refresh-on-401 recipe that is run and tested on that page.
      </p>
      <Code lang="ts">{`const nyx = createNyxClient({
  baseUrl: "https://api.example.com/v1",
  middleware: [
    async (request, next) => {
      const started = performance.now();
      const response = await next(request);
      console.log(request.method, new URL(request.url).pathname, response.status, Math.round(performance.now() - started), "ms");
      return response;
    },
  ],
});`}</Code>
      <p>
        Next: <Link href="/docs/techniques/">Techniques and recipes</Link>.
      </p>
    </Doc>
  );
}
