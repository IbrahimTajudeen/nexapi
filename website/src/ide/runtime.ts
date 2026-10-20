/**
 * Runs files from the virtual file system in the page. TypeScript and JSX are compiled with sucrase
 * (no type checking), modules are loaded through a small CommonJS loader, and the packages below
 * are built in. Only the entry file may use top-level await.
 */
import { transform } from "sucrase";
import * as core from "@nyxapi/core";
import * as codegen from "@nyxapi/codegen";
import { createApi } from "../demo/api/index";
import { createEngine } from "../lib/engine";
import { extname, resolvePath, dirname, type Vfs } from "./vfs";

import { BUILTIN_PACKAGES } from "./packages";
export { BUILTIN_PACKAGES };

export type Level = "log" | "info" | "warn" | "error";
export interface RunIo {
  write: (level: Level, text: string) => void;
  /** An iframe document that React code renders into (`document` inside user code). */
  previewDocument?: Document | undefined;
}

const AsyncFunction = (
  Object.getPrototypeOf(async function () {
    /* constructor access */
  }) as { constructor: unknown }
).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;

const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css"];

export function formatArg(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) {
    const status = (v as { status?: number }).status;
    return `${v.name}: ${v.message}${status === undefined ? "" : ` (status ${String(status)})`}`;
  }
  if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
  try {
    return JSON.stringify(v, null, typeof v === "object" && v !== null ? 2 : 0) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Resolve an import from `fromFile` to a file in the VFS, or null. */
export function resolveFile(vfs: Vfs, fromFile: string, spec: string): string | null {
  const base = resolvePath(dirname(fromFile), spec);
  const tries = [base];
  for (const e of SOURCE_EXT) tries.push(base + e);
  // `./x.js` may point at `./x.ts` in TypeScript projects
  const ext = extname(base);
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs") {
    const stem = base.slice(0, -ext.length);
    tries.push(stem + ".ts", stem + ".tsx");
  }
  for (const e of SOURCE_EXT) tries.push(`${base}/index${e}`);
  return tries.find((t) => vfs.isFile(t)) ?? null;
}

export interface Compiled {
  code: string;
}

export function compile(path: string, source: string): Compiled {
  const ext = extname(path);
  if (ext === ".json" || ext === ".css") return { code: "" };
  const transforms: ("typescript" | "jsx" | "imports")[] = ["imports"];
  if (ext === ".ts" || ext === ".tsx") transforms.push("typescript");
  if (ext === ".tsx" || ext === ".jsx" || ext === ".js") transforms.push("jsx");
  try {
    const out = transform(source, {
      transforms,
      jsxRuntime: "automatic",
      production: true,
      filePath: path,
    });
    return { code: out.code };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new SyntaxError(`${path}: ${msg}`, { cause: e });
  }
}

const REQUIRE_RE = /require\((["'])([^"']+)\1\)/g;

type Exports = Record<string, unknown>;

export interface Session {
  server: ReturnType<typeof createEngine>["server"];
  run: (entry: string) => Promise<unknown>;
  dispose: () => void;
}

/**
 * A run session owns one mock server and one module cache. Create a new session to start clean.
 * `react` packages are imported lazily so the editor loads quickly.
 */
export async function createSession(vfs: Vfs, io: RunIo): Promise<Session> {
  const engine = createEngine();
  const [react, reactJsx, reactDom, reactDomClient, nyxReact, devtools] = await Promise.all([
    import("react"),
    import("react/jsx-runtime"),
    import("react-dom"),
    import("react-dom/client"),
    import("@nyxapi/react"),
    import("@nyxapi/devtools/react"),
  ]);
  const builtins: Record<string, unknown> = {
    "@nyxapi/core": core,
    "@nyxapi/codegen": codegen,
    "@nyxapi/react": nyxReact,
    "@nyxapi/devtools/react": devtools,
    react,
    "react/jsx-runtime": reactJsx,
    "react-dom": reactDom,
    "react-dom/client": reactDomClient,
    playground: {
      nyx: engine.nyx,
      api: engine.api,
      server: engine.server,
      core,
      createApi,
      createEngine,
    },
  };

  const base = "https://api.example.com/v1";
  const mockFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, base + "/");
    return engine.server.transport(new Request(url, init));
  };
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const consoleShim = Object.fromEntries(
    (["log", "info", "warn", "error", "debug"] as const).map((k) => [
      k,
      (...args: unknown[]) => io.write(k === "debug" ? "log" : k, args.map(formatArg).join(" ")),
    ]),
  );
  const log = consoleShim["log"];

  const cache = new Map<string, { exports: Exports }>();
  const injectedCss = new Set<string>();

  const load = async (path: string, stack: string[]): Promise<Exports> => {
    const cached = cache.get(path);
    if (cached) return cached.exports;
    const mod = { exports: {} as Exports };
    cache.set(path, mod);
    const source = vfs.read(path);
    const ext = extname(path);
    if (ext === ".json") {
      try {
        mod.exports = { default: JSON.parse(source) as unknown, __esModule: true };
      } catch (e) {
        throw new SyntaxError(`${path}: ${e instanceof Error ? e.message : "invalid JSON"}`, {
          cause: e,
        });
      }
      return mod.exports;
    }
    if (ext === ".css") {
      const doc = io.previewDocument;
      if (doc && !injectedCss.has(path)) {
        injectedCss.add(path);
        const style = doc.createElement("style");
        style.setAttribute("data-file", path);
        style.textContent = source;
        doc.head.appendChild(style);
      }
      return mod.exports;
    }
    const { code } = compile(path, source);
    const deps = new Map<string, unknown>();
    for (const m of code.matchAll(REQUIRE_RE)) {
      const spec = m[2] ?? "";
      if (deps.has(spec)) continue;
      if (spec.startsWith(".") || spec.startsWith("/")) {
        const target = resolveFile(vfs, path, spec);
        if (!target) throw new Error(`${path}: cannot find module "${spec}"`);
        deps.set(spec, await load(target, [...stack, path]));
      } else if (spec in builtins) {
        deps.set(spec, builtins[spec]);
      } else {
        throw new Error(
          `${path}: package "${spec}" is not available in the playground. Built in: ${BUILTIN_PACKAGES.join(", ")}.`,
        );
      }
    }
    const req = (spec: string): unknown => {
      if (!deps.has(spec)) throw new Error(`${path}: cannot find module "${spec}"`);
      const dep = deps.get(spec);
      // CommonJS interop for default imports of built-ins such as `import React from "react"`
      if (typeof dep === "object" && dep !== null && !("__esModule" in dep) && !("default" in dep))
        return { ...dep, default: dep, __esModule: true };
      return dep;
    };
    const win = io.previewDocument?.defaultView ?? undefined;
    const fn = new AsyncFunction(
      "exports",
      "require",
      "module",
      "console",
      "fetch",
      "document",
      "api",
      "nyx",
      "core",
      "log",
      "sleep",
      "server",
      "window",
      // Run the module inside an inner function so user code may declare its own `nyx`, `api`, `log`...
      "return (async () => {\n" + code + "\n})();",
    );
    await fn(
      mod.exports,
      req,
      mod,
      consoleShim,
      mockFetch,
      io.previewDocument ?? (typeof document === "undefined" ? undefined : document),
      engine.api,
      engine.nyx,
      core,
      log,
      sleep,
      engine.server,
      win ?? (typeof window === "undefined" ? undefined : window),
    );
    return mod.exports;
  };

  return {
    server: engine.server,
    run: async (entry) => {
      cache.clear();
      injectedCss.clear();
      return load(entry, []);
    },
    dispose: () => {
      engine.nyx.queryClient.clear();
    },
  };
}
