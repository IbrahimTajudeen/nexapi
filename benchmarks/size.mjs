// Bundle size of what an app actually imports, minified + gzipped, built with esbuild (ESM, tree-shaken).
// Run: pnpm build && pnpm --filter @nexapi/benchmarks size
// Fails (exit 1) when a NexAPI entry exceeds its budget in size-budget.json.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const entries = {
  "nexapi: createNexClient (HTTP + QueryClient)": {
    lib: "nexapi",
    code: `import { createNexClient, QueryClient } from "@nexapi/core"; console.log(createNexClient, QueryClient);`,
  },
  "nexapi: React app (client + useQuery + provider)": {
    lib: "nexapi",
    code: `import { QueryClient } from "@nexapi/core"; import { useQuery, NexProvider } from "@nexapi/react"; console.log(QueryClient, useQuery, NexProvider);`,
  },
  "tanstack: query-core QueryClient": {
    lib: "tanstack",
    code: `import { QueryClient } from "@tanstack/query-core"; console.log(QueryClient);`,
  },
  "tanstack: React app (client + useQuery + provider)": {
    lib: "tanstack",
    code: `import { QueryClient, useQuery, QueryClientProvider } from "@tanstack/react-query"; console.log(QueryClient, useQuery, QueryClientProvider);`,
  },
  "rtk-query: React createApi + store": {
    lib: "rtk-query",
    code: `import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"; import { configureStore } from "@reduxjs/toolkit"; import { Provider } from "react-redux"; console.log(createApi, fetchBaseQuery, configureStore, Provider);`,
  },
};

const results = [];
for (const [name, { lib, code }] of Object.entries(entries)) {
  const out = await build({
    stdin: { contents: code, resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    external: ["react", "react-dom", "react/jsx-runtime", "use-sync-external-store/*"],
    define: { "process.env.NODE_ENV": '"production"' },
    treeShaking: true,
  });
  const bytes = out.outputFiles[0].contents;
  results.push({ name, lib, minified: bytes.length, gzip: gzipSync(bytes).length });
}

const budget = JSON.parse(readFileSync(new URL("./size-budget.json", import.meta.url), "utf8"));
let md = `| entry (react/react-dom excluded) | minified | gzip | budget (gzip) |\n|---|---|---|---|\n`;
let failed = false;
for (const r of results) {
  const b = budget[r.name];
  const over = b !== undefined && r.gzip > b;
  failed ||= over;
  md += `| ${r.name} | ${(r.minified / 1024).toFixed(1)} KiB | ${(r.gzip / 1024).toFixed(1)} KiB | ${b === undefined ? "–" : `${(b / 1024).toFixed(1)} KiB${over ? " **EXCEEDED**" : ""}`} |\n`;
}
console.log(md);
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("./results/size.json", import.meta.url),
  JSON.stringify(results, null, 2) + "\n",
);
writeFileSync(new URL("./results/size.md", import.meta.url), md);
if (failed) process.exit(1);
