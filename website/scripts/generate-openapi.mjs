// Writes openapi/site-api.json from the table spec (src/server). The website's own client in
// src/api is generated from that file with `nyx generate`. Run: node scripts/generate-openapi.mjs
// Add --check to fail when the committed file is out of date.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../openapi/site-api.json", import.meta.url));
const { buildOpenApi } = await import(new URL("../src/server/openapi.ts", import.meta.url).href);
const text = JSON.stringify(buildOpenApi(), null, 2) + "\n";

if (process.argv.includes("--check")) {
  if (!existsSync(out) || readFileSync(out, "utf8") !== text) {
    console.error(
      "openapi/site-api.json is out of date. Run: node website/scripts/generate-openapi.mjs",
    );
    process.exit(1);
  }
  console.log("openapi/site-api.json is up to date");
} else {
  mkdirSync(new URL("../openapi", import.meta.url), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote openapi/site-api.json (${String(text.split("\n").length)} lines)`);
}
