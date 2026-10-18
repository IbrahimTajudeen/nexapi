// Writes repository, bugs and homepage into every published package.json.
// npm provenance requires `repository.url` to match the GitHub repository that publishes.
//
//   node scripts/set-repository.mjs owner/repo        (or set GITHUB_REPOSITORY)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const slug = process.argv[2] ?? process.env.GITHUB_REPOSITORY;
if (!slug || !/^[\w.-]+\/[\w.-]+$/.test(slug)) {
  console.error("Usage: node scripts/set-repository.mjs owner/repo");
  process.exit(1);
}
const base = `https://github.com/${slug}`;
for (const dir of readdirSync(join(root, "packages"))) {
  const file = join(root, "packages", dir, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.repository = { type: "git", url: `git+${base}.git`, directory: `packages/${dir}` };
  pkg.bugs = { url: `${base}/issues` };
  pkg.homepage = `${base}#readme`;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`${pkg.name}: ${pkg.repository.url}`);
}
