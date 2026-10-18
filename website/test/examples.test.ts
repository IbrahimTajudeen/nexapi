import { describe, expect, it } from "vitest";
import { createEngine } from "../src/lib/engine";
import { EXAMPLES } from "../src/lib/examples";
import { formatValue, runSnippet } from "../src/lib/run";

describe("site examples run against the real engine and say what the docs say", () => {
  for (const [id, example] of Object.entries(EXAMPLES)) {
    it(id, async () => {
      const engine = createEngine();
      engine.server.latency = 120;
      const lines: string[] = [];
      await runSnippet(engine, example.code, (...v) => lines.push(v.map(formatValue).join(" ")));
      const text = lines.join("\n");
      let from = 0;
      for (const part of example.expect) {
        const at = text.indexOf(part, from);
        expect(at, `"${part}" not found (in order) in:\n${text}`).toBeGreaterThanOrEqual(0);
        from = at + part.length;
      }
    });
  }
});

import { readFileSync } from "node:fs";
import { generate } from "@nexapi/codegen";
import { SAMPLE_SCHEMA } from "../src/lib/sample-schema";

describe("playground sample schema", () => {
  it("is identical to the fixture and generates a client", () => {
    const fixture = readFileSync(
      new URL("../../fixtures/openapi/basic.yaml", import.meta.url),
      "utf8",
    );
    expect(SAMPLE_SCHEMA).toBe(fixture);
    const { files } = generate(SAMPLE_SCHEMA, { validation: true });
    expect(files.map((f) => f.path).sort()).toEqual([
      "client.ts",
      "index.ts",
      "shapes.ts",
      "types.ts",
    ]);
  });
});
