import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2 } from "@/components/Doc";

export const metadata: Metadata = { title: "Security" };

export default function Page() {
  return (
    <Doc
      href="/docs/security/"
      title="Security"
      lede="NexAPI is built so that the easy way to use it is also the safe way. Here is what it does for you, and what is still your job."
    >
      <H2>What NexAPI does</H2>
      <ul>
        <li>
          <strong>The origin is pinned.</strong> Every request goes to the origin of your{" "}
          <code>baseUrl</code>. A path that is an absolute URL is rejected unless you opt in with{" "}
          <code>allowAbsoluteUrls</code>, so a surprising value cannot send a request somewhere
          else.
        </li>
        <li>
          <strong>Credentials stay at home.</strong> The token from <code>getToken</code> is
          attached only to requests to the configured origin. A request that leaves it never carries
          your token or cookies.
        </li>
        <li>
          <strong>Nothing is logged.</strong> The library writes no logs. Errors carry the method
          and the URL without its query string, and never headers or bodies.
        </li>
        <li>
          <strong>Path parameters are encoded strictly.</strong> Values are percent-encoded, so{" "}
          <code>../admin</code> cannot change the route, and empty, <code>.</code> and{" "}
          <code>..</code> are rejected.
        </li>
        <li>
          <strong>Remote schemas need your say-so.</strong> The CLI fetches a URL only when you pass
          it with <code>--input</code>, never from a config file.
        </li>
        <li>
          <strong>Validation reports hold no data.</strong> A response validation issue names a path
          and a type, never a value.
        </li>
        <li>
          <strong>Hydrated state is untrusted.</strong> Its shape is checked before it touches the
          cache.
        </li>
        <li>
          <strong>Writes do not repeat by accident.</strong> Retrying a mutation requires{" "}
          <code>idempotent: true</code>.
        </li>
      </ul>

      <H2>Server rendering: one client per request</H2>
      <Callout kind="warn" title="Never share a client between users">
        A client owns both the credentials and the cache. A module-level client on a server would
        let one visitor&apos;s cached data reach another.
      </Callout>
      <Code lang="ts">{`// per request, not at module scope
const nex = createNexClient({ baseUrl, getToken: () => session.token });`}</Code>
      <p>
        When you embed dehydrated state in HTML, escape <code>&lt;</code> as shown in the{" "}
        <a href="/docs/react/">React guide</a> so the data cannot close a script tag.
      </p>

      <H2>Cookies</H2>
      <p>
        Browsers do not let scripts set a <code>Cookie</code> header. For cookie sessions, set the
        fetch credentials mode:
      </p>
      <Code lang="ts">{`createNexClient({ baseUrl, credentials: "include" }); // cross-origin API with CORS credentials
createNexClient({ baseUrl, credentials: "same-origin" });`}</Code>
      <p>
        The mode applies only to the pinned origin. Outside a browser, send a cookie yourself with
        the client&apos;s <code>headers</code> option.
      </p>

      <H2>Still your job</H2>
      <ul>
        <li>Keep tokens out of URLs and out of the cache key (put them in headers).</li>
        <li>
          Decide what <code>redact</code> should hide before using devtools on real data.
        </li>
        <li>Review generated code when your schema comes from a source you do not control.</li>
        <li>
          Response types describe your schema. Turn on validation if you need to verify the server.
        </li>
      </ul>

      <H2>Reporting a vulnerability</H2>
      <p>
        Please report suspected vulnerabilities privately to the maintainers rather than in a public
        issue. The contribution page has the current contact route.
      </p>
    </Doc>
  );
}
