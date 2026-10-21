// Builds src/generated/search-index.json from the real page sources, so search can never drift from the docs.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const slug = (t) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const nav = readFileSync(join(root, "src/site.ts"), "utf8");
const pages = [...nav.matchAll(/title: "([^"]+)",\s*href: "([^"]+)",\s*summary: "([^"]+)"/g)].map(
  (m) => ({
    title: m[1],
    href: m[2],
    summary: m[3],
  }),
);

const entries = [];
for (const p of pages) {
  entries.push({ title: p.title, page: "Documentation", href: p.href, text: p.summary });
  const dir = p.href === "/docs/" ? "src/app/docs" : `src/app${p.href}`;
  let source;
  try {
    source = readFileSync(join(root, dir, "page.tsx"), "utf8");
  } catch {
    continue;
  }
  for (const m of source.matchAll(/<H[23]>([^<{]+)<\/H[23]>/g)) {
    const heading = m[1].trim();
    entries.push({ title: heading, page: p.title, href: `${p.href}#${slug(heading)}`, text: "" });
  }
}
const extra = [
  {
    title: "Playground",
    page: "Try it",
    href: "/playground/",
    text: "run code live generate a client from OpenAPI in the browser",
  },
  {
    title: "Beginners",
    page: "Learn",
    href: "/beginners/",
    text: "first steps tutorial local live starter mock server",
  },
  {
    title: "Install and downloads",
    page: "Get it",
    href: "/install/",
    text: "npm pnpm yarn bun curl tarball zip download script",
  },
  {
    title: "Contribute",
    page: "Project",
    href: "/contribute/",
    text: "open source contributors issues pull requests development setup",
  },
  {
    title: "Community",
    page: "Project",
    href: "/community/",
    text: "hall of fame contributors tutors maintainers people team photos social",
  },
  {
    title: "Guides",
    page: "Project",
    href: "/guides/",
    text: "guides articles written by the team",
  },
  {
    title: "Releases",
    page: "Project",
    href: "/releases/",
    text: "versions changelog what is new 0.1.0 0.0.1 release notes graphql trpc swagger nyx npm published",
  },
  {
    title: "Roadmap",
    page: "Project",
    href: "/roadmap/",
    text: "roadmap milestones planned releases known limitations open tasks issues future vue persister useQueries subscriptions",
  },
];
entries.push(...extra);
const tut = readFileSync(join(root, "src/tutorials.ts"), "utf8");
for (const m of tut.matchAll(
  /number: (\d+), slug: "([^"]+)"[\s\S]*?title: "([^"]+)",\s*summary: "([^"]+)"/g,
)) {
  entries.push({
    title: `Episode ${m[1]}: ${m[3]}`,
    page: "Tutorials",
    href: `/tutorials/${m[2]}/`,
    text: m[4],
  });
}
entries.push({
  title: "Tutorials",
  page: "Learn",
  href: "/tutorials/",
  text: "video playlist episodes beginner advanced tutor record contribute",
});
mkdirSync(join(root, "src/generated"), { recursive: true });
writeFileSync(
  join(root, "src/generated/search-index.json"),
  JSON.stringify(entries, null, 1) + "\n",
);
console.log(`search index: ${entries.length} entries`);
