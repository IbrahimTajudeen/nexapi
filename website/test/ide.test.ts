import { describe, expect, it } from "vitest";
import { Vfs, resolvePath } from "../src/ide/vfs";
import { Shell, tokenize, type OutKind } from "../src/ide/shell";
import { createSession, resolveFile, type Level } from "../src/ide/runtime";
import { TEMPLATES, EXAMPLE_IDS, exampleFile } from "../src/ide/templates";

describe("vfs", () => {
  it("resolves paths", () => {
    expect(resolvePath("/a/b", "../c")).toBe("/a/c");
    expect(resolvePath("/a", "/x/./y")).toBe("/x/y");
    expect(resolvePath("/", "..")).toBe("/");
  });
  it("writes, lists, moves, copies and removes", () => {
    const v = new Vfs();
    v.write("/p/src/a.ts", "a");
    expect(v.isDir("/p/src")).toBe(true);
    v.copy("/p", "/q", true);
    expect(v.read("/q/src/a.ts")).toBe("a");
    v.move("/q", "/r");
    expect(v.exists("/q")).toBe(false);
    expect(v.read("/r/src/a.ts")).toBe("a");
    expect(() => v.remove("/p")).toThrow(/not empty/);
    v.remove("/p", true);
    expect(v.exists("/p/src/a.ts")).toBe(false);
    expect(() => v.move("/r", "/r/inside")).toThrow();
  });
  it("round-trips a snapshot and picks unique names", () => {
    const v = new Vfs();
    v.write("/a.txt", "1");
    v.mkdir("/empty");
    const w = new Vfs(v.snapshot());
    expect(w.read("/a.txt")).toBe("1");
    expect(w.isDir("/empty")).toBe(true);
    expect(w.uniqueName("/", "a.txt")).toBe("a-2.txt");
  });
  it("refuses a file where a directory is needed", () => {
    const v = new Vfs();
    v.write("/f", "x");
    expect(() => v.write("/f/g", "y")).toThrow();
  });
});

function makeShell(vfs = new Vfs()) {
  const out: { kind: OutKind; text: string }[] = [];
  const ran: string[] = [];
  const shell = new Shell({
    vfs,
    print: (kind, text) => out.push({ kind, text }),
    clear: () => out.splice(0),
    runFile: async (p) => void ran.push(p),
    open: () => undefined,
    reset: async () => undefined,
    scaffold: () => null,
    templates: () => [],
  });
  return { shell, out, ran, vfs };
}
const text = (o: { text: string }[]): string => o.map((x) => x.text).join("\n");

describe("shell", () => {
  it("tokenizes quotes and redirects", () => {
    expect(tokenize('echo "a b" c > out.txt')).toEqual({
      words: ["echo", "a b", "c"],
      redirect: { path: "out.txt", append: false },
    });
    expect(tokenize("echo x >> f").redirect?.append).toBe(true);
  });
  it("runs file commands and redirects output", async () => {
    const { shell, out, vfs } = makeShell();
    await shell.exec("mkdir -p app/src && cd app && echo hello > a.txt && cat a.txt");
    expect(shell.cwd).toBe("/app");
    expect(text(out)).toBe("hello");
    await shell.exec("echo more >> a.txt");
    expect(vfs.read("/app/a.txt")).toBe("hello\nmore\n");
    await shell.exec("cp a.txt b.txt && mv b.txt src/ && ls src");
    expect(text(out).endsWith("b.txt")).toBe(true);
    await shell.exec("rm -r src");
    expect(vfs.exists("/app/src")).toBe(false);
  });
  it("stops a && chain on failure and reports unknown commands", async () => {
    const { shell, out } = makeShell();
    await shell.exec("cat nope && echo never");
    expect(out.some((o) => o.kind === "err")).toBe(true);
    expect(text(out)).not.toContain("never");
    await shell.exec("frobnicate");
    expect(text(out)).toContain("command not found");
  });
  it("completes paths and commands", async () => {
    const { shell, vfs } = makeShell();
    vfs.write("/src/index.ts", "");
    expect(shell.complete("ca")).toEqual(["cat"]);
    expect(shell.complete("cat src/i")).toEqual(["cat src/index.ts"]);
  });
  it("runs npm scripts through the shell", async () => {
    const { shell, ran, vfs } = makeShell();
    vfs.write("/p/package.json", JSON.stringify({ scripts: { start: "tsx index.ts" } }));
    vfs.write("/p/index.ts", "");
    await shell.exec("cd p && npm start");
    expect(ran).toEqual(["/p/index.ts"]);
  });
  it("is honest that packages cannot be installed", async () => {
    const { shell, out } = makeShell();
    await shell.exec("npm install lodash");
    expect(text(out)).toContain("cannot install lodash");
    await shell.exec("npm install react");
    expect(text(out)).toContain("already built in");
  });
  it("generates a client with the real generator", async () => {
    const vfs = new Vfs();
    for (const t of TEMPLATES.filter((x) => x.id === "generate"))
      for (const [p, c] of Object.entries(t.files)) vfs.write(`/g/${p}`, c);
    const { shell, out } = makeShell(vfs);
    await shell.exec("cd g && nyx validate");
    expect(text(out)).toContain("is valid");
    await shell.exec("nyx generate");
    expect(vfs.isFile("/g/src/api/client.ts")).toBe(true);
  });
});

async function runIn(files: Record<string, string>, entry: string) {
  const vfs = new Vfs();
  for (const [p, c] of Object.entries(files)) vfs.write(p, c);
  const lines: [Level, string][] = [];
  const session = await createSession(vfs, { write: (l, t) => lines.push([l, t]) });
  await session.run(entry);
  session.dispose();
  return lines.map(([, t]) => t);
}

describe("runtime", () => {
  it("compiles TypeScript, resolves relative imports and supports top-level await", async () => {
    const out = await runIn(
      {
        "/a/index.ts":
          'import { twice } from "./util.js";\nconst n: number = await Promise.resolve(21);\nconsole.log(twice(n));',
        "/a/util.ts": "export const twice = (n: number): number => n * 2;",
      },
      "/a/index.ts",
    );
    expect(out).toEqual(["42"]);
  });
  it("gives code the mock API through playground, fetch and the legacy globals", async () => {
    const out = await runIn(
      {
        "/a.ts":
          'import { api } from "playground";\nconst u = await api.users.byId("1").get();\nconsole.log(u.name);\nconst r = await fetch("/users/1");\nconsole.log(r.status);\nlog(typeof nyx);',
      },
      "/a.ts",
    );
    expect(out).toEqual(["Ada Lovelace", "200", "object"]);
  });
  it("lets user code declare names that match the injected globals", async () => {
    const out = await runIn(
      {
        "/a.ts":
          'import { createNyxClient } from "@nyxapi/core";\nconst nyx = createNyxClient({ baseUrl: "https://x.test" });\nconst api = 1, log = 2;\nconsole.log(typeof nyx, api + log);',
      },
      "/a.ts",
    );
    expect(out).toEqual(["object 3"]);
  });
  it("reports a missing package clearly", async () => {
    await expect(
      runIn({ "/a.ts": 'import x from "lodash";\nconsole.log(x)' }, "/a.ts"),
    ).rejects.toThrow(/not available in the playground/);
  });
  it("reports syntax errors with the file name", async () => {
    await expect(runIn({ "/bad.ts": "const = ;" }, "/bad.ts")).rejects.toThrow(/bad\.ts/);
  });
  it("imports JSON", async () => {
    const out = await runIn(
      { "/a.ts": 'import d from "./d.json";\nconsole.log(d.n);', "/d.json": '{"n":7}' },
      "/a.ts",
    );
    expect(out).toEqual(["7"]);
  });
  it("resolves index files and .js to .ts", () => {
    const v = new Vfs();
    v.write("/x/index.ts", "");
    v.write("/x/y.ts", "");
    expect(resolveFile(v, "/main.ts", "./x")).toBe("/x/index.ts");
    expect(resolveFile(v, "/x/main.ts", "./y.js")).toBe("/x/y.ts");
  });
});

describe("templates", () => {
  it("every template's entry file exists", () => {
    for (const t of TEMPLATES) expect(t.files[t.open], t.id).toBeDefined();
  });
  it("runs the basics and manual templates to completion", async () => {
    for (const id of ["basics", "manual"]) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const files = Object.fromEntries(Object.entries(t.files).map(([p, c]) => [`/${id}/${p}`, c]));
      const out = await runIn(files, `/${id}/${t.open}`);
      expect(out.length, id).toBeGreaterThan(1);
      if (id === "basics") expect(out).toContain("Requests sent to the server: 2");
    }
  });
  it("runs the generated-client template end to end", async () => {
    const t = TEMPLATES.find((x) => x.id === "generate")!;
    const vfs = new Vfs();
    for (const [p, c] of Object.entries(t.files)) vfs.write(`/g/${p}`, c);
    const { shell } = makeShell(vfs);
    await shell.exec("cd g && nyx generate");
    const lines: string[] = [];
    const s = await createSession(vfs, { write: (_l, t2) => lines.push(t2) });
    await s.run("/g/use.ts");
    expect(lines).toEqual(["Ada Lovelace"]);
  });
  it("turns every docs example into a runnable file", async () => {
    expect(EXAMPLE_IDS.length).toBeGreaterThan(30);
    const f = exampleFile("manualQuery")!;
    const out = await runIn({ [f.path]: f.content }, f.path);
    expect(out.join("\n")).toContain("2 admins");
  });
});
