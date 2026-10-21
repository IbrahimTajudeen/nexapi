import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("supabase/seed.sql", () => {
  it("is up to date with the site's built-in content", () => {
    const out = execFileSync("node", ["scripts/generate-seed.mjs", "--check"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    });
    expect(out).toMatch(/up to date|ok/i);
  });
});
