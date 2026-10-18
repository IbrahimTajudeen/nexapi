import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { run, type CliIo } from "../src/index.js";

const fixtureDir = new URL("../../../fixtures/openapi/", import.meta.url);
let dir: string;
let out: string;
let err: string;
const io = (extra: Partial<CliIo> = {}): CliIo => ({
  cwd: dir,
  stdout: (t) => void (out += t),
  stderr: (t) => void (err += t),
  ...extra,
});

beforeEach(async () => {
  out = "";
  err = "";
  dir = await mkdtemp(join(tmpdir(), "syncapi-cli-"));
  await cp(new URL("basic.yaml", fixtureDir), join(dir, "api.yaml"));
  await writeFile(
    join(dir, "syncapi.config.json"),
    JSON.stringify({
      input: "api.yaml",
      output: "gen",
      overrides: { operations: { listUsers: { path: ["users", "list"] } } },
    }),
  );
});

describe("syncapi generate", () => {
  it("writes files, then a second run changes nothing (no irrelevant diffs)", async () => {
    expect(await run(["generate"], io())).toBe(0);
    expect(out).toContain("3 changed");
    const first = await readFile(join(dir, "gen/client.ts"), "utf8");
    out = "";
    expect(await run(["generate"], io())).toBe(0);
    expect(out).toContain("0 changed");
    expect(await readFile(join(dir, "gen/client.ts"), "utf8")).toBe(first);
  });

  it("--check passes when up to date, fails (and writes nothing) when stale", async () => {
    expect(await run(["generate", "--check"], io())).toBe(1); // nothing generated yet
    expect(err).toContain("out of date");
    await expect(readFile(join(dir, "gen/client.ts"), "utf8")).rejects.toThrow();
    await run(["generate"], io());
    out = "";
    expect(await run(["generate", "--check"], io())).toBe(0);
    await writeFile(join(dir, "gen/types.ts"), "// tampered\n");
    expect(await run(["generate", "--check"], io())).toBe(1);
  });

  it("fails with all diagnostics and a non-zero code on an invalid schema", async () => {
    await writeFile(
      join(dir, "api.yaml"),
      "openapi: 3.0.3\ninfo: {title: t, version: '1'}\npaths:\n  /u/{id}:\n    get:\n      operationId: a\n      responses:\n        '404': {description: x}\n",
    );
    expect(await run(["generate"], io())).toBe(1);
    expect(err).toContain("MISSING_PATH_PARAMETER");
    expect(err).toContain("NO_SUCCESS_RESPONSE");
  });

  it("reads remote schemas only when passed explicitly with --input", async () => {
    const yaml = await readFile(join(dir, "api.yaml"), "utf8");
    const seen: string[] = [];
    const fetchText = (url: string): Promise<string> => (seen.push(url), Promise.resolve(yaml));
    expect(
      await run(
        ["generate", "--input", "https://example.test/openapi.yaml", "--output", "remote-gen"],
        io({ fetchText }),
      ),
    ).toBe(0);
    expect(seen).toEqual(["https://example.test/openapi.yaml"]);
    await readFile(join(dir, "remote-gen/index.ts"), "utf8");

    await writeFile(
      join(dir, "syncapi.config.json"),
      JSON.stringify({ input: "https://example.test/openapi.yaml" }),
    );
    expect(await run(["generate"], io({ fetchText }))).toBe(2);
    expect(err).toContain("explicitly");
    expect(seen).toHaveLength(1); // never fetched from the config
  });

  it("rejects an invalid config and unknown commands/flags", async () => {
    await writeFile(join(dir, "syncapi.config.json"), JSON.stringify({ bogus: true }));
    expect(await run(["generate"], io())).toBe(2);
    expect(err).toContain('unknown config key "bogus"');
    expect(await run(["frobnicate"], io())).toBe(2);
    expect(await run(["generate", "--nope"], io())).toBe(2);
    expect(await run([], io())).toBe(2);
    expect(await run(["--help"], io())).toBe(0);
  });
});

describe("syncapi validate", () => {
  it("accepts a good schema and rejects a bad one", async () => {
    expect(await run(["validate"], io())).toBe(0);
    expect(out).toContain("OK: 8 operation(s), 7 schema(s)");
    await writeFile(join(dir, "bad.yaml"), "swagger: '2.0'\n");
    expect(await run(["validate", "bad.yaml"], io())).toBe(1);
    expect(err).toContain("UNSUPPORTED_VERSION");
  });
});
