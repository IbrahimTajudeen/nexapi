import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2 } from "@/components/Doc";
import { Runnable } from "@/components/Runnable";

export const metadata: Metadata = { title: "Testing" };

export default function Page() {
  return (
    <Doc
      href="/docs/integrations/testing/"
      title="Testing"
      lede="The network is one function: a Request goes in and a Response comes out. Replace it and your tests are fast, offline and free of mocking libraries."
    >
      <H2>The transport is a function</H2>
      <p>
        Every NyxAPI client takes an optional <code>transport</code>. Pass a function and nothing
        touches the network, yet middleware, retries, errors, keys and the cache all run for real.
        That means your tests exercise the actual engine.
      </p>
      <Runnable id="testingTransport" />

      <H2>A fake route table</H2>
      <p>
        For anything beyond one call, a small helper that maps <code>METHOD /path</code> to a
        response is enough. It also records the calls, so you can assert how many requests were
        made:
      </p>
      <Runnable id="fakeRoutes" />
      <Code
        lang="ts"
        title="test/fake-api.ts"
      >{`export function fakeApi(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: string[] = [];
  const transport = async (request: Request): Promise<Response> => {
    const key = \`\${request.method} \${new URL(request.url).pathname}\`;
    calls.push(key);
    const hit = routes[key];
    return new Response(JSON.stringify(hit?.body ?? { message: "no route" }), {
      status: hit ? (hit.status ?? 200) : 404,
      headers: { "content-type": "application/json" },
    });
  };
  return { transport, calls };
}`}</Code>

      <H2>A test, start to finish</H2>
      <Code lang="ts" title="user.test.ts">{`import { createNyxClient } from "@nyxapi/core";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/generated";
import { fakeApi } from "./fake-api";

describe("users", () => {
  it("shares one request between simultaneous callers", async () => {
    const fake = fakeApi({ "GET /v1/users/1": { body: { id: "1", name: "Ada" } } });
    const nyx = createNyxClient({ baseUrl: "https://api.test/v1", transport: fake.transport });
    const api = createApi(nyx);

    const options = api.users.byId("1").get.options();
    const [a, b] = await Promise.all([
      nyx.queryClient.fetchQuery(options),
      nyx.queryClient.fetchQuery(options),
    ]);

    expect(a.name).toBe("Ada");
    expect(b).toBe(a);
    expect(fake.calls).toEqual(["GET /v1/users/1"]);
  });
});`}</Code>
      <Callout kind="note" title="Use a fresh client in every test">
        Create the client inside the test (or in <code>beforeEach</code>). A shared client carries
        cache entries from one test into the next.
      </Callout>

      <H2>Failures and retries</H2>
      <p>
        Return an error status and assert on the typed error. Turn retries off so a failing test is
        quick, or keep them to test the retry policy:
      </p>
      <Code lang="ts">{`const nyx = createNyxClient({
  baseUrl: "https://api.test/v1",
  transport: fake.transport,
  queryClient: { defaultOptions: { queries: { retry: false } } },
});

await expect(api.users.byId("99").get()).rejects.toMatchObject({ status: 404 });`}</Code>

      <H2>Optimistic updates and rollback</H2>
      <p>
        Make the fake server reject the write, start the mutation, and assert the cache twice: once
        while the request is pending (the optimistic value), once after it fails (rolled back). The{" "}
        <Link href="/docs/mutations/">mutations</Link> page runs exactly this scenario. Control the
        timing with a promise you resolve by hand rather than with timers:
      </p>
      <Code lang="ts">{`let release!: () => void;
const gate = new Promise<void>((resolve) => (release = resolve));
const transport = async () => {
  await gate;
  return new Response(JSON.stringify({ message: "Name cannot be empty" }), {
    status: 422,
    headers: { "content-type": "application/json" },
  });
};
// ...start the mutation, expect the optimistic name, then:
release();
// ...await the mutation's rejection, expect the original name again`}</Code>

      <H2>Testing React components</H2>
      <p>
        Render with your usual test library. Because hooks use the client bound to the endpoint
        options, pass the test client when you build the API and no provider is needed. Wait for the
        data with your library&apos;s async queries; do not sleep.
      </p>
      <Code lang="tsx">{`import { render, screen } from "@testing-library/react";

it("shows the user", async () => {
  const fake = fakeApi({ "GET /v1/users/1": { body: { id: "1", name: "Ada" } } });
  const api = createApi(createNyxClient({ baseUrl: "https://api.test/v1", transport: fake.transport }));

  render(<UserName api={api} id="1" />);
  expect(await screen.findByText("Ada")).toBeInTheDocument();
});`}</Code>
      <p>
        Pass the <code>api</code> object into the component (or provide it through your own context)
        so each test controls its own client.
      </p>

      <H2>Checklist</H2>
      <ul className="checklist">
        <li>A function transport in every test; no real network.</li>
        <li>A fresh client per test.</li>
        <li>retry: false unless the test is about retries.</li>
        <li>Assert request counts to prove caching and single flight.</li>
        <li>Control timing with promises, not setTimeout.</li>
      </ul>
    </Doc>
  );
}
