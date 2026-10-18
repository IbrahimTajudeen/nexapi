import { watch as fsWatch } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  GenerationError,
  detectKind,
  generateFrom,
  introspectionQuery,
  validateConfig,
  type Diagnostic,
  type GraphQLDocumentInput,
  type NyxApiConfig,
} from "@nyxapi/codegen";

export interface FetchOptions {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
}

export interface CliIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Injectable for tests. */
  fetchText?: (url: string, options: FetchOptions) => Promise<string>;
  /** Stops `generate --watch`. */
  signal?: AbortSignal;
}

export const MAX_REMOTE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const CONFIG_NAMES = ["nyx.config.json", "nyxapi.config.json"] as const;

const HELP = `nyx: generate typed clients from OpenAPI, Swagger 2.0 or GraphQL schemas

Usage:
  nyx init [--input <path>] [--output <dir>] [--force]
  nyx generate [--watch] [--check] [--config <file>] [--input <path|url>] [--output <dir>]
  nyx validate [<path|url>] [--config <file>]
  nyx --version

Options:
  --config    JSON config file (default: ./nyx.config.json, or ./nyxapi.config.json)
  --input     Schema file (OpenAPI/Swagger JSON or YAML, GraphQL SDL or introspection JSON)
              or an explicit http(s) URL (a GraphQL endpoint URL is introspected)
  --kind      openapi | swagger | graphql (default: detected)
  --output    Output directory (default: ./generated)
  --header    "Name: value" sent when fetching a remote schema (repeatable; never logged)
  --timeout   Remote fetch timeout in seconds (default 15)
  --watch     Regenerate when the schema, documents or config change
  --check     Do not write; exit 1 if generated files would change (for CI)
  --force     init: overwrite an existing config
  -v, --version
`;

/** GET/POST with a hard byte cap (streamed), a timeout and a bounded, downgrade-safe redirect chain. */
async function defaultFetchText(url: string, options: FetchOptions): Promise<string> {
  let current = new URL(url);
  let headers = options.headers ?? {};
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current, {
      method: options.method ?? "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: {
        accept: "application/json, application/yaml, text/yaml, text/plain, */*",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(options.body === undefined ? {} : { body: options.body }),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error(`Redirect from ${current.origin} without a location`);
      const next = new URL(location, current);
      if (current.protocol === "https:" && next.protocol !== "https:")
        throw new Error("Refusing a redirect from https to http");
      if (next.origin !== current.origin) headers = {}; // never send credentials to another origin
      current = next;
      continue;
    }
    if (!response.ok)
      throw new Error(
        `${options.method ?? "GET"} ${current.origin}${current.pathname} failed with status ${String(response.status)}`,
      );
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Remote schema is larger than ${String(options.maxBytes / 1024 / 1024)} MB`);
    }
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > options.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(
          `Remote schema is larger than ${String(options.maxBytes / 1024 / 1024)} MB`,
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error(`Too many redirects (more than ${String(MAX_REDIRECTS)})`);
}

function printDiagnostics(io: CliIo, diagnostics: readonly Diagnostic[]): void {
  for (const d of diagnostics) io.stderr(`${d.level} [${d.code}] ${d.message}\n`);
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function packageVersion(): Promise<string> {
  try {
    const raw = await readFile(new URL("../package.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Files named by `documents`: each entry is a file or a directory (searched recursively for .graphql/.gql). */
async function readDocuments(
  entries: readonly string[],
  baseDir: string,
): Promise<GraphQLDocumentInput[]> {
  const files: string[] = [];
  const walk = async (path: string): Promise<void> => {
    const info = await stat(path);
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        await walk(join(path, name));
      }
    } else if ([".graphql", ".gql"].includes(extname(path).toLowerCase())) files.push(path);
  };
  for (const entry of entries) await walk(resolve(baseDir, entry));
  files.sort();
  return Promise.all(
    files.map(async (path) => ({ name: path, text: await readFile(path, "utf8") })),
  );
}

interface Loaded {
  config: NyxApiConfig;
  configDir: string;
  configPath: string;
}

async function loadConfig(io: CliIo, explicit: string | undefined): Promise<Loaded | number> {
  const candidates = explicit
    ? [resolve(io.cwd, explicit)]
    : CONFIG_NAMES.map((n) => resolve(io.cwd, n));
  for (const configPath of candidates) {
    let rawText: string;
    try {
      rawText = await readFile(configPath, "utf8");
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      if (explicit || !missing) {
        io.stderr(
          `Cannot read config ${configPath}: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return 2;
      }
      continue;
    }
    try {
      const { config, problems } = validateConfig(JSON.parse(rawText));
      if (problems.length > 0) {
        io.stderr(`Invalid config ${configPath}:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`);
        return 2;
      }
      return { config, configDir: dirname(configPath), configPath };
    } catch (error) {
      io.stderr(
        `Cannot read config ${configPath}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return 2;
    }
  }
  return { config: {}, configDir: io.cwd, configPath: "" };
}

interface Options {
  command: string;
  positionals: string[];
  values: {
    config?: string | undefined;
    input?: string | undefined;
    kind?: string | undefined;
    output?: string | undefined;
    header?: string[] | undefined;
    timeout?: string | undefined;
    check: boolean;
    watch: boolean;
    force: boolean;
  };
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
        kind: { type: "string" },
        output: { type: "string" },
        header: { type: "string", multiple: true },
        timeout: { type: "string" },
        check: { type: "boolean", default: false },
        watch: { type: "boolean", short: "w", default: false },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.version) {
    io.stdout(`${await packageVersion()}\n`);
    return 0;
  }
  const command = positionals[0];
  if (values.help || command === undefined) {
    io.stdout(HELP);
    return values.help ? 0 : 2;
  }
  if (command !== "generate" && command !== "validate" && command !== "init") {
    io.stderr(`Unknown command "${command}"\n\n${HELP}`);
    return 2;
  }
  if (values.kind !== undefined && !["openapi", "swagger", "graphql"].includes(values.kind)) {
    io.stderr('--kind must be "openapi", "swagger" or "graphql"\n');
    return 2;
  }
  const timeoutSeconds = values.timeout === undefined ? 15 : Number(values.timeout);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 600) {
    io.stderr("--timeout must be a number of seconds between 0 and 600\n");
    return 2;
  }
  const options: Options = { command, positionals, values };

  try {
    if (command === "init") return await init(io, options);
    const loaded = await loadConfig(io, values.config);
    if (typeof loaded === "number") return loaded;
    if (values.kind !== undefined) loaded.config.kind = values.kind as NyxApiConfig["kind"];
    if (values.watch && command === "generate")
      return await watchLoop(io, options, loaded, timeoutSeconds);
    return await once(io, options, loaded, timeoutSeconds);
  } catch (error) {
    return reportError(io, error);
  }
}

function reportError(io: CliIo, error: unknown): number {
  if (error instanceof GenerationError) {
    printDiagnostics(io, error.diagnostics);
    io.stderr(`${error.message.split("\n")[0] ?? ""}\n`);
    return 1;
  }
  io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
  return 1;
}

async function init(io: CliIo, { values }: Options): Promise<number> {
  const target = resolve(io.cwd, "nyx.config.json");
  const legacy = resolve(io.cwd, "nyxapi.config.json");
  if (!values.force && ((await exists(target)) || (await exists(legacy)))) {
    io.stderr("A config already exists here. Use --force to overwrite nyx.config.json\n");
    return 1;
  }
  const config: Record<string, unknown> = {
    $schema: "https://unpkg.com/@nyxapi/codegen/config.schema.json",
  };
  if (values.input !== undefined) config["input"] = values.input;
  else {
    const guesses = [
      "openapi.yaml",
      "openapi.yml",
      "openapi.json",
      "swagger.json",
      "schema.graphql",
      "schema.gql",
    ];
    for (const g of guesses)
      if (await exists(resolve(io.cwd, g))) {
        config["input"] = g;
        break;
      }
    config["input"] ??= "openapi.yaml";
  }
  config["output"] = values.output ?? "src/api";
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`);
  io.stdout(
    `Created nyx.config.json (input: ${String(config["input"])}, output: ${String(config["output"])})\nNext: run "nyx generate"\n`,
  );
  return 0;
}

async function readInput(
  io: CliIo,
  { command, positionals, values }: Options,
  { config, configDir }: Loaded,
  timeoutSeconds: number,
): Promise<{ text: string; sourceName: string } | number> {
  const explicit = values.input ?? (command === "validate" ? positionals[1] : undefined);
  const fetchText = io.fetchText ?? defaultFetchText;
  const headers: Record<string, string> = {};
  for (const raw of values.header ?? []) {
    const index = raw.indexOf(":");
    if (index <= 0) {
      io.stderr('--header must look like "Name: value"\n');
      return 2;
    }
    headers[raw.slice(0, index).trim()] = raw.slice(index + 1).trim();
  }
  const base = { headers, timeoutMs: timeoutSeconds * 1000, maxBytes: MAX_REMOTE_BYTES };
  if (explicit !== undefined && /^https?:\/\//i.test(explicit)) {
    if (config.kind === "graphql") {
      // an endpoint, not a file: ask the server for its schema
      const text = await fetchText(explicit, {
        ...base,
        method: "POST",
        body: JSON.stringify({ query: await introspectionQuery() }),
      });
      return { text, sourceName: explicit };
    }
    return { text: await fetchText(explicit, base), sourceName: explicit };
  }
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
  return { text: await readFile(path, "utf8"), sourceName: path };
}

async function once(
  io: CliIo,
  options: Options,
  loaded: Loaded,
  timeoutSeconds: number,
): Promise<number> {
  const { command, values } = options;
  const { config, configDir } = loaded;
  const input = await readInput(io, options, loaded, timeoutSeconds);
  if (typeof input === "number") return input;
  const { text, sourceName } = input;
  const graphql = detectKind(text, config, sourceName) === "graphql";
  const documents =
    graphql && config.documents ? await readDocuments(config.documents, configDir) : [];

  const outDir = resolve(
    values.output ? io.cwd : configDir,
    values.output ?? config.output ?? "generated",
  );
  const result = await generateFrom(text, config, { documents, sourceName });
  printDiagnostics(io, result.diagnostics);

  if (command === "validate") {
    io.stdout(
      graphql
        ? `OK: ${String(documents.length === 0 ? "default" : documents.length)} operation source(s), ${String(result.files.length)} file(s) would be generated\n`
        : `OK: ${String(result.model.operations.length)} operation(s), ${String(result.model.schemas.length)} schema(s)\n`,
    );
    return 0;
  }

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
      io.stderr(`Generated files are out of date: ${stale.join(", ")}. Run "nyx generate".\n`);
      return 1;
    }
    io.stdout("Generated files are up to date\n");
    return 0;
  }
  io.stdout(
    `Generated ${String(result.files.length)} file(s) in ${outDir} (${String(written)} changed)\n`,
  );
  return 0;
}

/** Regenerate whenever an input file changes, until `io.signal` aborts. Errors are reported, not fatal. */
async function watchLoop(
  io: CliIo,
  options: Options,
  loaded: Loaded,
  timeoutSeconds: number,
): Promise<number> {
  const input = options.values.input ?? loaded.config.input;
  if (input === undefined || /^https?:\/\//i.test(input)) {
    io.stderr("--watch needs a local input file\n");
    return 2;
  }
  const base = options.values.input !== undefined ? io.cwd : loaded.configDir;
  const targets = [resolve(base, input), ...(loaded.configPath ? [loaded.configPath] : [])];
  for (const d of loaded.config.documents ?? []) targets.push(resolve(loaded.configDir, d));

  const pass = async (): Promise<void> => {
    const code = await once(io, options, loaded, timeoutSeconds).catch((e: unknown) =>
      reportError(io, e),
    );
    if (code !== 0) io.stderr("Waiting for changes...\n");
  };
  await pass();
  io.stdout("Watching for changes (Ctrl+C to stop)\n");
  await new Promise<void>((done) => {
    let timer: NodeJS.Timeout | undefined;
    let running = false;
    let again = false;
    const trigger = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (running) {
          again = true;
          return;
        }
        running = true;
        void pass().finally(() => {
          running = false;
          if (again) {
            again = false;
            trigger();
          }
        });
      }, 150);
    };
    const watchers = targets.flatMap((target) => {
      try {
        return [fsWatch(target, { recursive: true }, trigger)];
      } catch {
        return [];
      }
    });
    const stop = (): void => {
      clearTimeout(timer);
      for (const w of watchers) w.close();
      done();
    };
    if (io.signal?.aborted) stop();
    io.signal?.addEventListener("abort", stop, { once: true });
    if (!io.signal) {
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    }
  });
  return 0;
}
