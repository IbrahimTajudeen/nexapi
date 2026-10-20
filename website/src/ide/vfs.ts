/** A small in-memory file system for the playground IDE. Pure data, so it is easy to test and to save. */

export interface Snapshot {
  files: Record<string, string>;
  dirs: string[];
}

export class FsError extends Error {
  constructor(
    readonly code: "ENOENT" | "EEXIST" | "EISDIR" | "ENOTDIR" | "EINVAL",
    message: string,
  ) {
    super(message);
    this.name = "FsError";
  }
}

/** Resolve `input` against `cwd` into a clean absolute path ("/a/b"). */
export function resolvePath(cwd: string, input: string): string {
  const raw = input.startsWith("/") ? input : `${cwd}/${input}`;
  const out: string[] = [];
  for (const part of raw.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

export const dirname = (p: string): string =>
  p.lastIndexOf("/") <= 0 ? "/" : p.slice(0, p.lastIndexOf("/"));
export const basename = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
export const extname = (p: string): string => {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i <= 0 ? "" : b.slice(i);
};
const join = (dir: string, name: string): string => (dir === "/" ? `/${name}` : `${dir}/${name}`);

export interface Entry {
  name: string;
  path: string;
  kind: "file" | "dir";
}

export class Vfs {
  private files = new Map<string, string>();
  private dirs = new Set<string>(["/"]);
  private listeners = new Set<() => void>();
  /** Increases on every change, so React can tell when to re-render. */
  version = 0;

  constructor(snapshot?: Snapshot) {
    if (snapshot) this.load(snapshot);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  load(snapshot: Snapshot): void {
    this.files = new Map(Object.entries(snapshot.files));
    this.dirs = new Set(["/", ...snapshot.dirs]);
    for (const f of this.files.keys()) this.ensureParents(f);
    this.changed();
  }
  snapshot(): Snapshot {
    return {
      files: Object.fromEntries([...this.files].sort(([a], [b]) => a.localeCompare(b))),
      dirs: [...this.dirs].filter((d) => d !== "/").sort(),
    };
  }

  private ensureParents(path: string): void {
    let d = dirname(path);
    while (d !== "/" && !this.dirs.has(d)) {
      this.dirs.add(d);
      d = dirname(d);
    }
  }

  isFile(p: string): boolean {
    return this.files.has(p);
  }
  isDir(p: string): boolean {
    return this.dirs.has(p);
  }
  exists(p: string): boolean {
    return this.isFile(p) || this.isDir(p);
  }

  read(p: string): string {
    const v = this.files.get(p);
    if (v !== undefined) return v;
    throw this.isDir(p)
      ? new FsError("EISDIR", `${p}: is a directory`)
      : new FsError("ENOENT", `${p}: no such file`);
  }

  write(p: string, content: string): void {
    if (p === "/" || this.isDir(p)) throw new FsError("EISDIR", `${p}: is a directory`);
    const parent = dirname(p);
    if (this.files.has(parent)) throw new FsError("ENOTDIR", `${parent}: not a directory`);
    this.ensureParents(p);
    this.files.set(p, content);
    this.changed();
  }

  mkdir(p: string, recursive = false): void {
    if (this.isFile(p)) throw new FsError("EEXIST", `${p}: a file with that name exists`);
    if (this.isDir(p)) {
      if (recursive) return;
      throw new FsError("EEXIST", `${p}: already exists`);
    }
    const parent = dirname(p);
    if (!this.isDir(parent) && !recursive)
      throw new FsError("ENOENT", `${parent}: no such directory (use mkdir -p)`);
    if (this.isFile(parent)) throw new FsError("ENOTDIR", `${parent}: not a directory`);
    this.dirs.add(p);
    this.ensureParents(p);
    this.changed();
  }

  list(dir: string): Entry[] {
    if (!this.isDir(dir)) {
      throw this.isFile(dir)
        ? new FsError("ENOTDIR", `${dir}: not a directory`)
        : new FsError("ENOENT", `${dir}: no such directory`);
    }
    const out: Entry[] = [];
    for (const d of this.dirs)
      if (d !== "/" && dirname(d) === dir) out.push({ name: basename(d), path: d, kind: "dir" });
    for (const f of this.files.keys())
      if (dirname(f) === dir) out.push({ name: basename(f), path: f, kind: "file" });
    return out.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1,
    );
  }

  /** Every file at or below `dir`. */
  filesUnder(dir: string): string[] {
    const prefix = dir === "/" ? "/" : dir + "/";
    return [...this.files.keys()].filter((f) => f.startsWith(prefix)).sort();
  }

  remove(p: string, recursive = false): void {
    if (p === "/") throw new FsError("EINVAL", "cannot remove the root");
    if (this.isFile(p)) {
      this.files.delete(p);
    } else if (this.isDir(p)) {
      const prefix = p + "/";
      const hasChildren =
        [...this.files.keys()].some((f) => f.startsWith(prefix)) ||
        [...this.dirs].some((d) => d.startsWith(prefix));
      if (hasChildren && !recursive)
        throw new FsError("EINVAL", `${p}: directory is not empty (use rm -r)`);
      for (const f of [...this.files.keys()]) if (f.startsWith(prefix)) this.files.delete(f);
      for (const d of [...this.dirs]) if (d === p || d.startsWith(prefix)) this.dirs.delete(d);
    } else throw new FsError("ENOENT", `${p}: no such file or directory`);
    this.changed();
  }

  /** Move or rename a file or directory. The destination must not exist. */
  move(from: string, to: string): void {
    if (!this.exists(from)) throw new FsError("ENOENT", `${from}: no such file or directory`);
    if (this.exists(to)) throw new FsError("EEXIST", `${to}: already exists`);
    if (to === from || to.startsWith(from + "/"))
      throw new FsError("EINVAL", `cannot move ${from} into itself`);
    if (this.isFile(from)) {
      this.files.set(to, this.files.get(from) ?? "");
      this.files.delete(from);
      this.ensureParents(to);
    } else {
      const prefix = from + "/";
      this.dirs.add(to);
      for (const d of [...this.dirs]) {
        if (d.startsWith(prefix)) {
          this.dirs.delete(d);
          this.dirs.add(to + d.slice(from.length));
        }
      }
      this.dirs.delete(from);
      for (const f of [...this.files.keys()]) {
        if (f.startsWith(prefix)) {
          this.files.set(to + f.slice(from.length), this.files.get(f) ?? "");
          this.files.delete(f);
        }
      }
      this.ensureParents(to);
    }
    this.changed();
  }

  /** Copy a file, or a directory when `recursive`. The destination must not exist. */
  copy(from: string, to: string, recursive = false): void {
    if (!this.exists(from)) throw new FsError("ENOENT", `${from}: no such file or directory`);
    if (this.exists(to)) throw new FsError("EEXIST", `${to}: already exists`);
    if (this.isFile(from)) {
      this.write(to, this.read(from));
      return;
    }
    if (!recursive) throw new FsError("EISDIR", `${from}: is a directory (use cp -r)`);
    if (to.startsWith(from + "/")) throw new FsError("EINVAL", `cannot copy ${from} into itself`);
    this.dirs.add(to);
    for (const d of [...this.dirs])
      if (d.startsWith(from + "/")) this.dirs.add(to + d.slice(from.length));
    for (const f of [...this.files.keys()])
      if (f.startsWith(from + "/"))
        this.files.set(to + f.slice(from.length), this.files.get(f) ?? "");
    this.ensureParents(to);
    this.changed();
  }

  /** A name like "notes-2.txt" that does not exist yet in `dir`. */
  uniqueName(dir: string, wanted: string): string {
    if (!this.exists(join(dir, wanted))) return wanted;
    const i = wanted.lastIndexOf(".");
    const stem = i > 0 ? wanted.slice(0, i) : wanted;
    const ext = i > 0 ? wanted.slice(i) : "";
    for (let n = 2; ; n++)
      if (!this.exists(join(dir, `${stem}-${String(n)}${ext}`)))
        return `${stem}-${String(n)}${ext}`;
  }

  /** Tree listing used by the `tree` command. */
  tree(dir: string): string[] {
    const lines: string[] = [dir === "/" ? "/" : basename(dir) + "/"];
    const walk = (d: string, prefix: string): void => {
      const entries = this.list(d);
      entries.forEach((e, i) => {
        const last = i === entries.length - 1;
        lines.push(`${prefix}${last ? "└── " : "├── "}${e.name}${e.kind === "dir" ? "/" : ""}`);
        if (e.kind === "dir") walk(e.path, prefix + (last ? "    " : "│   "));
      });
    };
    walk(dir, "");
    return lines;
  }
}
