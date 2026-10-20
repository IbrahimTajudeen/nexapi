/**
 * The IDE terminal. A small shell over the virtual file system: file commands, `node`/`tsx` to run
 * files, `nyx generate` and `nyx validate` (the real generator), and npm scripts. Nothing here
 * reaches a real machine or network.
 */
import { GenerationError, generateFrom, type Diagnostic, type NyxApiConfig } from "@nyxapi/codegen";
import { BUILTIN_PACKAGES } from "./packages";
import { FsError, basename, dirname, resolvePath, type Vfs } from "./vfs";

export type OutKind = "out" | "err" | "info";

export interface ShellHost {
  vfs: Vfs;
  print: (kind: OutKind, text: string) => void;
  clear: () => void;
  /** Run a file in the VFS (node, tsx, nyx run, npm start). */
  runFile: (path: string) => Promise<void>;
  open: (path: string) => void;
  /** Ask to reset the workspace. */
  reset: () => Promise<void>;
  /** Create a project from a template. Returns the new folder, or null when unknown. */
  scaffold: (template: string) => string | null;
  templates: () => { id: string; title: string }[];
}

export const VERSION_LINE = "nyx (playground build) using the real @nyxapi/codegen";

const HELP = `Files        ls [-la] [dir]   cd [dir]   pwd   tree [dir]   cat <file>
             touch <file>   mkdir [-p] <dir>   rm [-r] <path>   mv <from> <to>   cp [-r] <from> <to>
             echo text > file     (also >>)   open <file>   clear   history
Run          node <file>   tsx <file>   nyx run <file>   (.js .ts .jsx .tsx, top-level await is fine)
NyxAPI       nyx generate [-i schema] [-o dir]     nyx validate [schema]     nyx --version
Projects     new <template>   templates   packages   npm run <script>
Workspace    reset             wipe everything saved in this browser (asks first)
Tips         Tab completes paths and commands. Up and down arrows walk your history.
             Use && to chain commands.`;

/** Split a command line into words, honouring quotes. Returns the words and any redirection. */
export function tokenize(line: string): {
  words: string[];
  redirect?: { path: string; append: boolean };
} {
  const words: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur !== "" || has) words.push(cur);
      cur = "";
      has = false;
    } else if (ch === ">") {
      if (cur !== "" || has) words.push(cur);
      cur = "";
      has = false;
      const append = line.charAt(i + 1) === ">";
      if (append) i++;
      words.push(append ? ">>" : ">");
    } else cur += ch;
  }
  if (cur !== "" || has) words.push(cur);
  const r = words.findIndex((w) => w === ">" || w === ">>");
  if (r === -1) return { words };
  const target = words[r + 1];
  const rest = words.slice(0, r);
  return target === undefined
    ? { words: rest }
    : { words: rest, redirect: { path: target, append: words[r] === ">>" } };
}

const COMMANDS = [
  "cat",
  "cd",
  "clear",
  "cp",
  "echo",
  "help",
  "history",
  "ls",
  "mkdir",
  "mv",
  "node",
  "npm",
  "nyx",
  "open",
  "new",
  "packages",
  "pnpm",
  "pwd",
  "reset",
  "rm",
  "templates",
  "touch",
  "tree",
  "tsx",
  "yarn",
];

export class Shell {
  cwd: string;
  history: string[] = [];
  constructor(
    private readonly host: ShellHost,
    cwd = "/",
  ) {
    this.cwd = cwd;
  }

  prompt(): string {
    return `${this.cwd === "/" ? "/" : this.cwd} $`;
  }

  private abs(p: string): string {
    return resolvePath(this.cwd, p);
  }

  /** Candidates for Tab. */
  complete(line: string): string[] {
    const m = /^(.*?)(\S*)$/.exec(line);
    const head = m?.[1] ?? "";
    const word = m?.[2] ?? "";
    if (head.trim() === "") return COMMANDS.filter((c) => c.startsWith(word)).map((c) => head + c);
    const slash = word.lastIndexOf("/");
    const dirPart = slash === -1 ? "" : word.slice(0, slash + 1);
    const namePart = slash === -1 ? word : word.slice(slash + 1);
    const dir = this.abs(dirPart === "" ? "." : dirPart);
    try {
      return this.host.vfs
        .list(dir)
        .filter((e) => e.name.startsWith(namePart))
        .map((e) => head + dirPart + e.name + (e.kind === "dir" ? "/" : ""));
    } catch {
      return [];
    }
  }

  async exec(line: string): Promise<void> {
    const trimmed = line.trim();
    if (trimmed === "") return;
    if (this.history[this.history.length - 1] !== trimmed) this.history.push(trimmed);
    for (const part of trimmed.split("&&")) {
      const ok = await this.single(part.trim());
      if (!ok) return;
    }
  }

  private err(text: string): false {
    this.host.print("err", text);
    return false;
  }

  /** Runs one command. Returns false on failure so `&&` stops. */
  private async single(line: string): Promise<boolean> {
    const { words, redirect } = tokenize(line);
    const [cmd, ...args] = words;
    if (cmd === undefined) return true;
    let captured: string[] | null = null;
    const host: ShellHost = redirect
      ? {
          ...this.host,
          print: (kind, text) => {
            if (kind === "out") (captured ??= []).push(text);
            else this.host.print(kind, text);
          },
        }
      : this.host;
    try {
      const ok = await this.dispatch(host, cmd, args, redirect);
      if (redirect) {
        const path = this.abs(redirect.path);
        const text = (captured ?? []).join("\n");
        const prev = redirect.append && this.host.vfs.isFile(path) ? this.host.vfs.read(path) : "";
        this.host.vfs.write(path, prev + (captured === null ? "" : text + "\n"));
      }
      return ok;
    } catch (e) {
      if (e instanceof FsError) return this.err(`${cmd}: ${e.message}`);
      return this.err(`${cmd}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async dispatch(
    host: ShellHost,
    cmd: string,
    args: string[],
    redirect?: { path: string; append: boolean },
  ): Promise<boolean> {
    const vfs = this.host.vfs;
    const flags = args.filter((a) => /^-[a-zA-Z]+$/.test(a)).join("");
    const rest = args.filter((a) => !/^-[a-zA-Z]+$/.test(a));
    switch (cmd) {
      case "help":
        host.print("out", HELP);
        return true;
      case "clear":
        this.host.clear();
        return true;
      case "pwd":
        host.print("out", this.cwd);
        return true;
      case "history":
        this.history.forEach((h, i) => host.print("out", `${String(i + 1).padStart(4)}  ${h}`));
        return true;
      case "echo":
        host.print("out", rest.join(" ") + (flags && !rest.length ? flags : ""));
        return true;
      case "cd": {
        const target = this.abs(rest[0] ?? "/");
        if (!vfs.isDir(target)) return this.err(`cd: ${rest[0] ?? "/"}: no such directory`);
        this.cwd = target;
        return true;
      }
      case "ls": {
        const target = this.abs(rest[0] ?? ".");
        const entries = vfs.isFile(target)
          ? [{ name: basename(target), path: target, kind: "file" as const }]
          : vfs.list(target);
        const all = flags.includes("a");
        const shown = entries.filter((e) => all || !e.name.startsWith("."));
        if (flags.includes("l"))
          for (const e of shown)
            host.print(
              "out",
              `${e.kind === "dir" ? "d" : "-"}  ${String(e.kind === "dir" ? vfs.filesUnder(e.path).length : vfs.read(e.path).length).padStart(7)}  ${e.name}${e.kind === "dir" ? "/" : ""}`,
            );
        else host.print("out", shown.map((e) => e.name + (e.kind === "dir" ? "/" : "")).join("  "));
        return true;
      }
      case "tree":
        for (const l of vfs.tree(this.abs(rest[0] ?? "."))) host.print("out", l);
        return true;
      case "cat": {
        if (rest.length === 0) return this.err("cat: missing file");
        for (const f of rest) host.print("out", vfs.read(this.abs(f)).replace(/\n$/, ""));
        return true;
      }
      case "touch":
        if (rest.length === 0) return this.err("touch: missing file");
        for (const f of rest) if (!vfs.exists(this.abs(f))) vfs.write(this.abs(f), "");
        return true;
      case "mkdir":
        if (rest.length === 0) return this.err("mkdir: missing directory");
        for (const d of rest) vfs.mkdir(this.abs(d), flags.includes("p"));
        return true;
      case "rm":
        if (rest.length === 0) return this.err("rm: missing path");
        for (const p of rest) vfs.remove(this.abs(p), /[rR]/.test(flags));
        return true;
      case "mv": {
        const [a, b] = rest;
        if (a === undefined || b === undefined) return this.err("usage: mv <from> <to>");
        const to = vfs.isDir(this.abs(b)) ? `${this.abs(b)}/${basename(a)}` : this.abs(b);
        vfs.move(this.abs(a), to);
        return true;
      }
      case "cp": {
        const [a, b] = rest;
        if (a === undefined || b === undefined) return this.err("usage: cp [-r] <from> <to>");
        const to = vfs.isDir(this.abs(b)) ? `${this.abs(b)}/${basename(a)}` : this.abs(b);
        vfs.copy(this.abs(a), to, flags.includes("r") || flags.includes("R"));
        return true;
      }
      case "open":
        if (!rest[0]) return this.err("open: missing file");
        if (!vfs.isFile(this.abs(rest[0]))) return this.err(`open: ${rest[0]}: no such file`);
        this.host.open(this.abs(rest[0]));
        return true;
      case "node":
      case "tsx":
        return this.run(rest[0], cmd);
      case "reset":
        await this.host.reset();
        this.cwd = "/";
        return true;
      case "packages":
        host.print("out", "Built in (no install needed):\n  " + BUILTIN_PACKAGES.join("\n  "));
        return true;
      case "templates":
        for (const t of this.host.templates()) host.print("out", `${t.id.padEnd(16)} ${t.title}`);
        return true;
      case "new": {
        const id = rest[0];
        if (!id) return this.err("usage: new <template>   (see: templates)");
        const dir = this.host.scaffold(id);
        if (dir === null) return this.err(`new: unknown template "${id}". Try: templates`);
        this.cwd = dir;
        host.print("info", `Created ${dir} and moved into it.`);
        return true;
      }
      case "nyx":
        return this.nyx(host, rest, redirect);
      case "npm":
      case "pnpm":
      case "yarn":
        return this.pkg(host, cmd, rest);
      default:
        return this.err(`${cmd}: command not found. Type help.`);
    }
  }

  private async run(file: string | undefined, cmd: string): Promise<boolean> {
    if (!file) return this.err(`usage: ${cmd} <file>`);
    const path = this.abs(file);
    if (!this.host.vfs.isFile(path)) return this.err(`${cmd}: ${file}: no such file`);
    try {
      await this.host.runFile(path);
      return true;
    } catch (e) {
      return this.err(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    }
  }

  private async pkg(host: ShellHost, tool: string, args: string[]): Promise<boolean> {
    const sub = args[0];
    if (
      sub === "run" ||
      (tool === "yarn" && sub && !["add", "install"].includes(sub)) ||
      sub === "start" ||
      sub === "test"
    ) {
      const name = sub === "run" || tool === "yarn" ? (sub === "run" ? args[1] : sub) : sub;
      const pj = this.nearestPackageJson();
      if (!pj) return this.err(`${tool}: no package.json found here or above`);
      let scripts: Record<string, string>;
      try {
        scripts =
          (JSON.parse(this.host.vfs.read(pj)) as { scripts?: Record<string, string> }).scripts ??
          {};
      } catch {
        return this.err(`${tool}: ${pj} is not valid JSON`);
      }
      if (!name) {
        for (const [k, v] of Object.entries(scripts)) host.print("out", `${k}: ${v}`);
        return true;
      }
      const script = scripts[name];
      if (script === undefined) return this.err(`${tool}: no script named "${name}" in ${pj}`);
      const prev = this.cwd;
      this.cwd = dirname(pj);
      host.print("info", `> ${script}`);
      try {
        await this.exec(script);
      } finally {
        this.cwd = prev;
      }
      return true;
    }
    if (sub === "install" || sub === "i" || sub === "add") {
      const names = args.slice(1).filter((a) => !a.startsWith("-"));
      if (names.length === 0) {
        host.print(
          "info",
          "Nothing to install: the playground has its packages built in. Type: packages",
        );
        return true;
      }
      const missing = names.filter(
        (n) => !(BUILTIN_PACKAGES as readonly string[]).includes(n.replace(/@[^/@]+$/, "")),
      );
      if (missing.length === 0) {
        host.print(
          "info",
          `${names.join(", ")} ${names.length === 1 ? "is" : "are"} already built in. Import ${names.length === 1 ? "it" : "them"} directly.`,
        );
        return true;
      }
      return this.err(
        `${tool} ${sub}: cannot install ${missing.join(", ")}. The playground cannot download packages; it ships these: ${BUILTIN_PACKAGES.join(", ")}.`,
      );
    }
    host.print("info", `${tool}: only "run <script>", "start" and "install" are understood here.`);
    return true;
  }

  private nearestPackageJson(): string | null {
    let d = this.cwd;
    for (;;) {
      const p = d === "/" ? "/package.json" : `${d}/package.json`;
      if (this.host.vfs.isFile(p)) return p;
      if (d === "/") return null;
      d = dirname(d);
    }
  }

  private async nyx(
    host: ShellHost,
    args: string[],
    _redirect?: { path: string; append: boolean },
  ): Promise<boolean> {
    const vfs = this.host.vfs;
    const sub = args[0];
    if (sub === undefined || sub === "--help" || sub === "-h") {
      host.print(
        "out",
        "nyx generate [-i schema] [-o dir] | nyx validate [schema] | nyx run <file> | nyx --version",
      );
      return true;
    }
    if (sub === "--version" || sub === "-v") {
      host.print("out", VERSION_LINE);
      return true;
    }
    if (sub === "run") return this.run(args[1], "nyx run");
    if (sub !== "generate" && sub !== "validate") return this.err(`nyx: unknown command "${sub}"`);

    const opt = (long: string, short: string): string | undefined => {
      const i = args.findIndex((a) => a === long || a === short);
      return i === -1 ? undefined : args[i + 1];
    };
    let config: NyxApiConfig & { input?: string; output?: string } = {};
    const cfgPath = this.abs("nyx.config.json");
    if (vfs.isFile(cfgPath)) {
      try {
        config = JSON.parse(vfs.read(cfgPath)) as typeof config;
      } catch {
        return this.err("nyx: nyx.config.json is not valid JSON");
      }
    }
    const positional =
      sub === "validate" ? args.slice(1).find((a) => !a.startsWith("-")) : undefined;
    const input = opt("--input", "-i") ?? positional ?? config.input;
    if (!input)
      return this.err('nyx: no schema. Pass -i <file> or set "input" in nyx.config.json.');
    const inPath = this.abs(input);
    if (!vfs.isFile(inPath))
      return this.err(
        `nyx: ${input}: no such file (remote URLs are not available in the playground)`,
      );
    const output = opt("--output", "-o") ?? config.output ?? "./src/api";
    const { input: _i, output: _o, ...generatorConfig } = config;
    const show = (ds: readonly Diagnostic[]): void => {
      for (const d of ds)
        host.print(d.level === "error" ? "err" : "info", `${d.level} ${d.code}: ${d.message}`);
    };
    try {
      const result = await generateFrom(vfs.read(inPath), generatorConfig, {
        sourceName: basename(inPath),
      });
      show(result.diagnostics);
      if (sub === "validate") {
        host.print(
          "out",
          `${input} is valid: ${String(result.model.operations.length)} operations.`,
        );
        return true;
      }
      const outDir = this.abs(output);
      for (const f of result.files) vfs.write(`${outDir}/${f.path}`, f.content);
      host.print("out", `Generated ${String(result.files.length)} files in ${output}:`);
      for (const f of result.files) host.print("out", `  ${output.replace(/\/$/, "")}/${f.path}`);
      return true;
    } catch (e) {
      if (e instanceof GenerationError) {
        show(e.diagnostics);
        return false;
      }
      throw e;
    }
  }
}
