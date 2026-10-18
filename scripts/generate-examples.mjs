// Regenerates (or, with --check, verifies) every example's generated client.
// Usage: node scripts/generate-examples.mjs [--check]   (run `pnpm build` first)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "packages/cli/dist/cli.js");
const extra = process.argv.includes("--check") ? ["--check"] : [];
let failed = false;
for (const name of readdirSync(join(root, "examples")).sort()) {
  const config = join(root, "examples", name, "nyxapi.config.json");
  if (!existsSync(config)) continue;
  try {
    const out = execFileSync("node", [cli, "generate", "--config", config, ...extra], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    process.stdout.write(`${name}: ${out}`);
  } catch (error) {
    failed = true;
    process.stderr.write(`${name}: ${error.stderr || error.message}\n`);
  }
}
if (failed) process.exitCode = 1;
