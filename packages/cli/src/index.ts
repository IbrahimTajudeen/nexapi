import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  GenerationError,
  generate,
  validateConfig,
  validateSchema,
  type Diagnostic,
  type NyxApiConfig,
} from "@nyxapi/codegen";

export interface CliIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Injectable for tests. */
  fetchText?: (url: string) => Promise<string>;
}

const MAX_REMOTE_BYTES = 10 * 1024 * 1024;

const HELP = `nyxapi: generate typed clients from OpenAPI 3.x

Usage:
  nyxapi generate [--config <file>] [--input <path|url>] [--output <dir>] [--check]
  nyxapi validate [<path|url>] [--config <file>]

Options:
  --config   JSON config file (default: ./nyxapi.config.json when present)
  --input    OpenAPI file (JSON/YAML) or an explicit http(s) URL
  --output   Output directory (default: ./generated)
  --check    Do not write; exit 1 if generated files would change (for CI)
`;

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json, application/yaml, text/yaml, */*" },
  });
  if (!response.ok) throw new Error(`GET ${url} failed with status ${String(response.status)}`);
  const text = await response.text();
  if (text.length > MAX_REMOTE_BYTES) throw new Error("Remote schema is larger than 10 MB");
  return text;
}

function printDiagnostics(io: CliIo, diagnostics: readonly Diagnostic[]): void {
  for (const d of diagnostics) io.stderr(`${d.level} [${d.code}] ${d.message}\n`);
}

/** Runs the CLI and returns the process exit code. Never calls `process.exit`. */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        config: { type: "string" },
        input: { type: "string" },
        output: { type: "string" },
        check: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const command = positionals[0];
  if (values.help || command === undefined) {
    io.stdout(HELP);
    return values.help ? 0 : 2;
  }
  if (command !== "generate" && command !== "validate") {
    io.stderr(`Unknown command "${command}"\n\n${HELP}`);
    return 2;
  }

  try {
    // ---- config -----------------------------------------------------------------------
    let config: NyxApiConfig = {};
    let configDir = io.cwd;
    let configPath = values.config
      ? resolve(io.cwd, values.config)
      : resolve(io.cwd, "nyxapi.config.json");
    try {
      const raw: unknown = JSON.parse(await readFile(configPath, "utf8"));
      const { config: c, problems } = validateConfig(raw);
      if (problems.length > 0) {
        io.stderr(`Invalid config ${configPath}:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`);
        return 2;
      }
      config = c;
      configDir = dirname(configPath);
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      if (values.config || !missing) {
        io.stderr(
          `Cannot read config ${configPath}: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return 2;
      }
      configPath = "";
    }

    // ---- input: remote only when explicitly passed on the command line ----------------------
    const explicit = values.input ?? (command === "validate" ? positionals[1] : undefined);
    let text: string;
    let sourceName: string;
    if (explicit !== undefined && /^https?:\/\//i.test(explicit)) {
      text = await (io.fetchText ?? defaultFetchText)(explicit);
      sourceName = explicit;
    } else {
      const input = explicit ?? config.input;
      if (input === undefined) {
        io.stderr('No input schema: pass --input or set "input" in the config\n');
        return 2;
      }
      if (/^https?:\/\//i.test(input)) {
        io.stderr(
          "Remote schemas must be passed explicitly with --input <url>; they are not allowed in the config file\n",
        );
        return 2;
      }
      const path = resolve(explicit !== undefined ? io.cwd : configDir, input);
      text = await readFile(path, "utf8");
      sourceName = path;
    }

    if (command === "validate") {
      const { model, diagnostics } = validateSchema(text, config, sourceName);
      printDiagnostics(io, diagnostics);
      const errors = diagnostics.filter((d) => d.level === "error").length;
      if (errors > 0) return 1;
      io.stdout(
        `OK: ${String(model.operations.length)} operation(s), ${String(model.schemas.length)} schema(s)\n`,
      );
      return 0;
    }

    const outDir = resolve(
      values.output ? io.cwd : configDir,
      values.output ?? config.output ?? "generated",
    );
    const result = generate(text, config, sourceName);
    printDiagnostics(io, result.diagnostics);

    const stale: string[] = [];
    let written = 0;
    for (const file of result.files) {
      const target = resolve(outDir, file.path);
      const current = await readFile(target, "utf8").catch(() => undefined);
      if (current === file.content) continue;
      if (values.check) {
        stale.push(file.path);
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
      written++;
    }
    if (values.check) {
      if (stale.length > 0) {
        io.stderr(`Generated files are out of date: ${stale.join(", ")}. Run "nyxapi generate".\n`);
        return 1;
      }
      io.stdout("Generated files are up to date\n");
      return 0;
    }
    io.stdout(
      `Generated ${String(result.files.length)} file(s) in ${outDir} (${String(written)} changed)\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof GenerationError) {
      printDiagnostics(io, error.diagnostics);
      io.stderr(`${error.message.split("\n")[0] ?? ""}\n`);
      return 1;
    }
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
