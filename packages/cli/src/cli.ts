#!/usr/bin/env node
import { run } from "./index.js";

const code = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (t) => void process.stdout.write(t),
  stderr: (t) => void process.stderr.write(t),
});
process.exitCode = code;
