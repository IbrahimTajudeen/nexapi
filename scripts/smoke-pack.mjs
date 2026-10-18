// Packs every publishable package, installs the tarballs into an empty project, then proves the
// result works from outside the monorepo: generate a client with the CLI, type-check it with
// strict TypeScript, and call it. Run `pnpm build` first. Usage: node scripts/smoke-pack.mjs
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packages = ["core", "codegen", "cli", "react", "devtools"];
const work = mkdtempSync(join(tmpdir(), "nyxapi-smoke-"));
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
const step = (name) => console.log(`- ${name}`);
const fail = (message) => {
  console.error(`smoke-pack FAILED: ${message}`);
  process.exitCode = 1;
};

try {
  const tarballs = {};
  step("pack");
  const packDir = join(work, "tarballs");
  mkdirSync(packDir);
  for (const name of packages) {
    run("pnpm", ["pack", "--pack-destination", packDir], join(root, "packages", name));
  }
  for (const file of readdirSync(packDir)) {
    const name = /^nyxapi-(\w+)-/.exec(file)?.[1];
    if (name) tarballs[name] = join(packDir, file);
  }
  for (const name of packages) if (!tarballs[name]) throw new Error(`no tarball for ${name}`);

  step("inspect tarball contents");
  for (const name of packages) {
    const listing = run("tar", ["-tzf", tarballs[name]], work).split("\n").filter(Boolean);
    const bad = listing.filter((f) => /\/(src|test)\//.test(f) || f.endsWith(".tsbuildinfo"));
    if (bad.length > 0) fail(`${name} ships non-distribution files: ${bad.slice(0, 3).join(", ")}`);
    if (
      !listing.includes("package/package.json") ||
      !listing.some((f) => f.startsWith("package/dist/"))
    )
      fail(`${name} is missing package.json or dist/`);
    if (name !== "cli" && !listing.includes("package/README.md")) fail(`${name} has no README`);
    const manifest = JSON.parse(
      run("tar", ["-xzOf", tarballs[name], "package/package.json"], work),
    );
    const leaked = Object.values({ ...manifest.dependencies, ...manifest.peerDependencies }).filter(
      (v) => String(v).startsWith("workspace:"),
    );
    if (leaked.length > 0) fail(`${name} still has workspace: dependency specs`);
  }

  step("install into an empty project");
  const app = join(work, "app");
  mkdirSync(app);
  const overrides = Object.fromEntries(
    packages.map((n) => [`@nyxapi/${n}`, `file:${tarballs[n]}`]),
  );
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify(
      {
        name: "smoke-app",
        private: true,
        type: "module",
        dependencies: {
          ...overrides,
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "@types/react": "^19.0.0",
          typescript: "~5.9.3",
        },
        overrides,
      },
      null,
      2,
    ),
  );
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], app);

  step("generate a client with the installed CLI");
  cpSync(join(root, "fixtures/openapi/basic.yaml"), join(app, "openapi.yaml"));
  writeFileSync(
    join(app, "nyxapi.config.json"),
    JSON.stringify({ input: "openapi.yaml", output: "src/api", validation: true }),
  );
  run("npx", ["nyxapi", "generate"], app);
  run("npx", ["nyxapi", "generate", "--check"], app);

  step("type-check and run a consumer (strict, NodeNext)");
  mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(
    join(app, "src/main.ts"),
    `import { createNyxClient, HttpError } from "@nyxapi/core";
import { createApi } from "./api/index.js";
import { createInspector } from "@nyxapi/devtools";

const nyx = createNyxClient({
  baseUrl: "https://api.test/v1",
  transport: async (req) => {
    const path = new URL(req.url).pathname;
    return path.endsWith("/users/42")
      ? Response.json({ id: "42", name: "Ada", role: "admin" })
      : Response.json({ code: "nope", message: "x" }, { status: 404 });
  },
});
const api = createApi(nyx);
const inspector = createInspector(nyx.queryClient);
const user = await api.users.byId("42").get();
const name: string = user.name;
const missing = await api.users.byId("1").get().catch((e: unknown) => e);
if (!Array.isArray(inspector.snapshot().queries) || name !== "Ada" || !(missing instanceof HttpError) || missing.status !== 404) process.exit(1);
console.log("consumer ok");
`,
  );
  writeFileSync(
    join(app, "src/hooks.tsx"),
    `import { useQuery, useSuspenseQuery } from "@nyxapi/react";
import { NyxDevtools } from "@nyxapi/devtools/react";
import type { Api } from "./api/index.js";
export function Name({ api }: { api: Api }) {
  const q = useQuery(api.users.byId("1").get.options());
  const s = useSuspenseQuery(api.users.byId("1").get.options());
  return <p>{q.data?.name}{s.data.name}<NyxDevtools /></p>;
}
`,
  );
  writeFileSync(
    join(app, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noUncheckedIndexedAccess: true,
        jsx: "react-jsx",
        skipLibCheck: false,
        outDir: "out",
        rootDir: "src",
        types: ["node"],
      },
      include: ["src"],
    }),
  );
  // @types/node only to give `process` a type in the consumer
  run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--loglevel=error", "--no-save", "@types/node@22"],
    app,
  );
  run("npx", ["tsc", "-p", "."], app);
  const out = run("node", ["out/main.js"], app).trim();
  if (out !== "consumer ok") fail(`unexpected consumer output: ${out}`);
  else console.log("smoke-pack OK");
} catch (error) {
  const text =
    error && typeof error === "object" && "stderr" in error
      ? `${error.stderr}\n${error.stdout}`
      : "";
  fail(`${error instanceof Error ? error.message : String(error)}\n${text}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
