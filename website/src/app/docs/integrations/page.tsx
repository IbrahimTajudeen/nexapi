import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Doc, H2 } from "@/components/Doc";

export const metadata: Metadata = { title: "Integration guides" };

const GUIDES = [
  {
    href: "/docs/integrations/react-vite/",
    title: "React with Vite",
    body: "Client module, hooks, Suspense, a dev proxy and devtools in a single-page app.",
    meta: "Beginner",
  },
  {
    href: "/docs/integrations/nextjs/",
    title: "Next.js",
    body: "Per-request clients on the server, dehydrate and hydrate, and one browser client.",
    meta: "Intermediate",
  },
  {
    href: "/docs/integrations/node-server/",
    title: "Node servers and scripts",
    body: "Express handlers, background jobs and server-side rendering without sharing a cache.",
    meta: "Intermediate",
  },
  {
    href: "/docs/integrations/auth/",
    title: "Authentication",
    body: "Bearer tokens, refresh on 401, cookies, sign-out and per-user clients.",
    meta: "Intermediate",
  },
  {
    href: "/docs/integrations/testing/",
    title: "Testing",
    body: "A function transport, a fake route table, hooks under test and rollback tests.",
    meta: "Beginner",
  },
  {
    href: "/docs/integrations/ci/",
    title: "CI and teams",
    body: "Keep generated code in step with the schema, pin versions and automate updates.",
    meta: "Intermediate",
  },
];

export default function Page() {
  return (
    <Doc
      href="/docs/integrations/"
      title="Integration guides"
      lede="NyxAPI is a small, framework-independent core with a React adapter. These guides show how it fits into the places real apps live: a Vite app, a Next.js app, a Node server, a test suite and a CI pipeline."
    >
      <div className="cards">
        {GUIDES.map((g) => (
          <Link key={g.href} href={g.href} className="card link">
            <h3>{g.title}</h3>
            <p>{g.body}</p>
            <div className="meta">{g.meta}</div>
          </Link>
        ))}
      </div>

      <H2>How these guides are written</H2>
      <p>
        Code that runs in the browser sandbox on this site (the cache, requests, middleware, error
        handling, testing with a fake transport) is run live and checked by this site&apos;s test
        suite. Framework files such as a Vite config or a Next.js layout cannot run here, so they
        are patterns written against the documented APIs. Treat them as a starting point and check
        them against your framework version.
      </p>
      <Callout kind="note" title="Not here yet">
        There are no framework-specific packages beyond React. A Next.js and React Server Components
        integration, Vue and Svelte adapters, and a cache persister are on the{" "}
        <Link href="/roadmap/">roadmap</Link>. Until then, the core works anywhere JavaScript runs
        and the patterns below cover server rendering by hand.
      </Callout>
    </Doc>
  );
}
