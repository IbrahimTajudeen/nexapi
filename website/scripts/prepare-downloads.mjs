// Builds the files served under /downloads: package tarballs, a source archive, checksums, an installer
// script and a manifest. Runs before `next build` so the site always ships what the repo contains.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipDirectory } from "./zip.mjs";

const site = fileURLToPath(new URL("..", import.meta.url));
const repo = join(site, "..");
const out = join(site, "public/downloads");
const PACKAGES = ["core", "codegen", "cli", "react", "devtools"];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32", // pnpm is a .cmd shim on Windows
  });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log("building packages");
run("pnpm", ["build"], repo);

const version = JSON.parse(readFileSync(join(repo, "packages/core/package.json"), "utf8")).version;
const files = [];
for (const name of PACKAGES) {
  const dir = join(repo, "packages", name);
  run("pnpm", ["pack", "--pack-destination", out], dir);
}
for (const file of readdirSync(out).sort()) files.push({ file, kind: "package" });

// Source archive: tracked-looking files only (no dependencies, build output or dev artifacts).
const stage = mkdtempSync(join(tmpdir(), "nyxapi-src-"));
const srcDir = join(stage, "nyxapi");
mkdirSync(srcDir, { recursive: true });
const skip = new Set([
  "node_modules",
  "dist",
  ".git",
  ".next",
  "out",
  ".stage",
  "downloads",
  "results",
  ".tsbuildinfo",
  "next-env.d.ts",
]);
cpSync(repo, srcDir, {
  recursive: true,
  filter: (src) => {
    const base = basename(src);
    return (
      !skip.has(base) &&
      !base.endsWith(".tsbuildinfo") &&
      !base.endsWith(".zip") &&
      !base.endsWith(".tgz")
    );
  },
});
const zip = `nyxapi-source-${version}.zip`;
zipDirectory(stage, "nyxapi", join(out, zip));
rmSync(stage, { recursive: true, force: true });
files.push({ file: zip, kind: "source" });

// Starter project for beginners: self-contained, with the NyxAPI tarballs vendored inside.
{
  const stage = mkdtempSync(join(tmpdir(), "nyxapi-starter-"));
  const dir = join(stage, "nyxapi-starter");
  cpSync(join(site, "starter"), dir, {
    recursive: true,
    filter: (src) => !src.endsWith("README.template.md"),
  });
  mkdirSync(join(dir, "vendor"));
  for (const name of ["core", "codegen", "cli"])
    cpSync(
      join(out, `nyxapi-${name}-${version}.tgz`),
      join(dir, "vendor", `nyxapi-${name}-${version}.tgz`),
    );
  const v = (n) => `file:./vendor/nyxapi-${n}-${version}.tgz`;
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "nyxapi-starter",
        private: true,
        type: "module",
        scripts: {
          api: "node server.mjs",
          generate: "nyxapi generate",
          "generate:check": "nyxapi generate --check",
          start: "tsx src/main.ts",
          check: "tsc --noEmit",
        },
        dependencies: { "@nyxapi/core": v("core") },
        devDependencies: {
          "@nyxapi/cli": v("cli"),
          "@nyxapi/codegen": v("codegen"),
          tsx: "^4.20.0",
          typescript: "~5.9.3",
          "@types/node": "^22.0.0",
        },
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(dir, "README.md"),
    readFileSync(join(site, "starter/README.template.md"), "utf8").replaceAll(
      "__VERSION__",
      version,
    ),
  );
  const starterZip = `nyxapi-starter-${version}.zip`;
  zipDirectory(stage, "nyxapi-starter", join(out, starterZip));
  rmSync(stage, { recursive: true, force: true });
  files.push({ file: starterZip, kind: "starter" });
}

const manifest = files.map((f) => {
  const buf = readFileSync(join(out, f.file));
  return {
    ...f,
    bytes: statSync(join(out, f.file)).size,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
});
writeFileSync(
  join(out, "SHA256SUMS"),
  manifest.map((m) => `${m.sha256}  ${m.file}`).join("\n") + "\n",
);

const installer = readFileSync(join(site, "scripts/install.sh.template"), "utf8").replaceAll(
  "__VERSION__",
  version,
);
writeFileSync(join(out, "install.sh"), installer, { mode: 0o755 });
// also at the site root so the documented URL (/install.sh) works
writeFileSync(join(site, "public/install.sh"), installer, { mode: 0o755 });

mkdirSync(join(site, "src/generated"), { recursive: true });
writeFileSync(
  join(site, "src/generated/downloads.json"),
  JSON.stringify({ version, files: manifest }, null, 2) + "\n",
);

run("node", [join(site, "scripts/build-search.mjs")], site);
console.log(`downloads: ${manifest.length} files, version ${version}`);
