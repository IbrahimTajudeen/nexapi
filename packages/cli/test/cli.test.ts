import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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
  dir = await mkdtemp(join(tmpdir(), "nyxapi-cli-"));
  await cp(new URL("basic.yaml", fixtureDir), join(dir, "api.yaml"));
  await writeFile(
    join(dir, "nyxapi.config.json"),
    JSON.stringify({
      input: "api.yaml",
      output: "gen",
      overrides: { operations: { listUsers: { path: ["users", "list"] } } },
    }),
  );
});

describe("nyx generate", () => {
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
      join(dir, "nyxapi.config.json"),
      JSON.stringify({ input: "https://example.test/openapi.yaml" }),
    );
    expect(await run(["generate"], io({ fetchText }))).toBe(2);
    expect(err).toContain("explicitly");
    expect(seen).toHaveLength(1); // never fetched from the config
  });

  it("rejects an invalid config and unknown commands/flags", async () => {
    await writeFile(join(dir, "nyxapi.config.json"), JSON.stringify({ bogus: true }));
    expect(await run(["generate"], io())).toBe(2);
    expect(err).toContain('unknown config key "bogus"');
    expect(await run(["frobnicate"], io())).toBe(2);
    expect(await run(["generate", "--nope"], io())).toBe(2);
    expect(await run([], io())).toBe(2);
    expect(await run(["--help"], io())).toBe(0);
  });
});

describe("nyx validate", () => {
  it("accepts a good schema and rejects a bad one", async () => {
    expect(await run(["validate"], io())).toBe(0);
    expect(out).toContain("OK: 8 operation(s), 7 schema(s)");
    await writeFile(join(dir, "bad.yaml"), "info: {}\n");
    expect(await run(["validate", "bad.yaml"], io())).toBe(1);
    expect(err).toContain("UNSUPPORTED_VERSION");
  });
});

describe("nyx init / version / config discovery", () => {
  it("prints the package version", async () => {
    expect(await run(["--version"], io())).toBe(0);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
  it("init writes nyx.config.json once, then needs --force", async () => {
    await rm(join(dir, "nyxapi.config.json"));
    expect(await run(["init", "--input", "api.yaml", "--output", "out"], io())).toBe(0);
    const written = JSON.parse(await readFile(join(dir, "nyx.config.json"), "utf8")) as Record<
      string,
      string
    >;
    expect(written["input"]).toBe("api.yaml");
    expect(await run(["init"], io())).toBe(1);
    expect(await run(["init", "--force"], io())).toBe(0);
  });
  it("prefers nyx.config.json over the legacy nyxapi.config.json", async () => {
    await writeFile(
      join(dir, "nyx.config.json"),
      JSON.stringify({ input: "api.yaml", output: "new" }),
    );
    expect(await run(["generate"], io())).toBe(0);
    await readFile(join(dir, "new/index.ts"), "utf8");
  });
});

describe("nyx with GraphQL and Swagger", () => {
  it("generates a GraphQL client from SDL, detected automatically", async () => {
    await cp(new URL("../graphql/blog.graphql", fixtureDir), join(dir, "schema.graphql"));
    expect(await run(["generate", "--input", "schema.graphql", "--output", "gql"], io())).toBe(0);
    const client = await readFile(join(dir, "gql/client.ts"), "utf8");
    expect(client).toContain("@nyxapi/graphql");
    expect(client).toContain("createPost");
  });
  it("uses `documents` from the config", async () => {
    await cp(new URL("../graphql/blog.graphql", fixtureDir), join(dir, "schema.graphql"));
    await cp(new URL("../graphql/ops.graphql", fixtureDir), join(dir, "ops.graphql"));
    await writeFile(
      join(dir, "nyx.config.json"),
      JSON.stringify({
        input: "schema.graphql",
        output: "gql",
        documents: ["ops.graphql"],
        scalars: { DateTime: "string" },
      }),
    );
    expect(await run(["generate"], io())).toBe(0);
    const client = await readFile(join(dir, "gql/client.ts"), "utf8");
    expect(client).toContain("getUser");
    expect(client).not.toContain("deletePost");
  });
  it("converts Swagger 2.0", async () => {
    await cp(new URL("../swagger/petstore2.yaml", fixtureDir), join(dir, "swagger.yaml"));
    await rm(join(dir, "nyxapi.config.json")); // its override names an operation Swagger's petstore lacks
    expect(await run(["generate", "--input", "swagger.yaml", "--output", "sw"], io())).toBe(0);
    expect(await readFile(join(dir, "sw/client.ts"), "utf8")).toContain("listPets");
  });
});

describe("nyx generate --watch", () => {
  it("regenerates when the schema changes and stops on abort", async () => {
    const controller = new AbortController();
    const done = run(["generate", "--watch"], io({ signal: controller.signal }));
    await waitFor(() => out.includes("Watching"));
    const yaml = (await readFile(join(dir, "api.yaml"), "utf8")).replace(
      "title: ",
      "title: Renamed ",
    );
    out = "";
    await writeFile(join(dir, "api.yaml"), yaml);
    await waitFor(() => out.includes("Generated"));
    controller.abort();
    expect(await done).toBe(0);
  });
});

describe("remote schema fetching", () => {
  let server: Server;
  let base: string;
  let hits = 0;
  beforeEach(async () => {
    hits = 0;
    const yaml = await readFile(join(dir, "api.yaml"), "utf8");
    server = createServer((req, res) => {
      hits++;
      if (req.url === "/ok") res.writeHead(200, { "content-type": "text/yaml" }).end(yaml);
      else if (req.url === "/redirect") res.writeHead(302, { location: "/ok" }).end();
      else if (req.url === "/loop") res.writeHead(302, { location: "/loop" }).end();
      else if (req.url === "/big") res.writeHead(200).end("x".repeat(11 * 1024 * 1024));
      else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    return () => void server.close();
  });
  it("follows a redirect", async () => {
    expect(await run(["validate", `${base}/redirect`], io())).toBe(0);
  });
  it("stops after too many redirects", async () => {
    expect(await run(["validate", `${base}/loop`], io())).toBe(1);
    expect(err).toContain("Too many redirects");
    expect(hits).toBeLessThanOrEqual(7);
  });
  it("rejects oversized bodies while streaming", async () => {
    expect(await run(["validate", `${base}/big`], io())).toBe(1);
    expect(err).toContain("larger than 10 MB");
  });
  it("validates --timeout and --header", async () => {
    expect(await run(["validate", `${base}/ok`, "--timeout", "0"], io())).toBe(2);
    expect(await run(["validate", `${base}/ok`, "--header", "nocolon"], io())).toBe(2);
  });
});

async function waitFor(check: () => boolean, ms = 4000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
}
