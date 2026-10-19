import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { OptionLab } from "@/components/OptionLab";
import { Doc, H2, Table } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "Errors" };

export default function Page() {
  return (
    <Doc
      href="/docs/errors/"
      title="Errors"
      lede="Every failure is one of a few classes. Responses you documented in your schema become types you can narrow."
    >
      <H2>The error classes</H2>
      <Table
        head={["Class", "When", "Useful fields"]}
        rows={[
          [
            <code key="a">HttpError</code>,
            "The server answered with a status outside 2xx.",
            <>
              <code>status</code>, <code>body</code>, <code>method</code>, <code>url</code>
            </>,
          ],
          [
            <code key="b">NetworkError</code>,
            "No response: connection failure, DNS, CORS.",
            <code key="b2">cause</code>,
          ],
          [
            <code key="c">TimeoutError</code>,
            "The request ran longer than the configured timeout.",
            <code key="c2">timeoutMs</code>,
          ],
          [
            <code key="d">ParseError</code>,
            "A 2xx response could not be read as the expected format.",
            <code key="d2">status</code>,
          ],
          [
            <code key="e">ResponseValidationError</code>,
            "A response parsed fine but does not match the schema (opt-in).",
            <code key="e2">issues</code>,
          ],
          [<code key="f">CancelledError</code>, "The request was cancelled.", ""],
        ]}
      />
      <p>
        All of them extend <code>NyxError</code>. Import them from <code>@nyxapi/core</code>.
      </p>

      <H2>Narrow by status</H2>
      <p>
        For each operation, the documented error responses are generated as a type. After checking{" "}
        <code>instanceof HttpError</code> and the status, <code>error.body</code> has the shape your
        schema promised:
      </p>
      <Runnable id="typedError" />
      <Code lang="ts" title="typed (TypeScript)">{`try {
  await api.auth.login.post({ email, password });
} catch (error) {
  if (error instanceof HttpError && error.status === 401) {
    error.body.message; // string, from the ApiError schema
  }
}`}</Code>
      <Callout kind="note" title="Use instanceof, not error.name">
        TypeScript can narrow with <code>instanceof</code> and with <code>status</code>. It cannot
        narrow on <code>error.name</code>, which is just a string.
      </Callout>

      <H2>What the types do not promise</H2>
      <ul>
        <li>
          The types describe your schema, not what a server might do. A server can return an
          undocumented status.
        </li>
        <li>
          Statuses documented as ranges (<code>5XX</code>) or <code>default</code> carry{" "}
          <code>status: number</code>, so they do not narrow to a literal.
        </li>
        <li>
          Operations with no documented errors get an <code>unknown</code> body.
        </li>
        <li>Error bodies and request bodies are never validated.</li>
      </ul>

      <H2>Errors never leak secrets</H2>
      <p>
        Error messages include the method and the URL <em>without</em> its query string, and never
        request headers or bodies. A query string can contain tokens, so it is stripped before
        anything is put in an error. You can log an error safely.
      </p>

      <H2>Try every failure</H2>
      <p>
        Pick a failure mode and run it. The output shows the class that was raised and the fields
        you can branch on.
      </p>
      <OptionLab id="errors" />
    </Doc>
  );
}
