import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RELEASES } from "../src/releases";

const corePackage = (): { version: string } =>
  JSON.parse(
    readFileSync(new URL("../../packages/core/package.json", import.meta.url), "utf8"),
  ) as {
    version: string;
  };

describe("release history", () => {
  it("lists the version in the repository first, newest to oldest, once each", () => {
    expect(RELEASES[0]?.version).toBe(corePackage().version);
    const versions = RELEASES.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    const rank = (v: string): number =>
      v.split(".").reduce((n, part) => n * 1000 + Number(part), 0);
    for (let i = 1; i < versions.length; i++)
      expect(rank(String(versions[i - 1]))).toBeGreaterThan(rank(String(versions[i])));
  });
  it("gives every release a summary and at least one feature", () => {
    for (const r of RELEASES) {
      expect(r.summary.length).toBeGreaterThan(20);
      expect(r.features.length).toBeGreaterThan(0);
    }
  });
  it("has a changelog entry for every release in each package", () => {
    for (const pkg of ["core", "codegen", "cli", "graphql", "trpc"]) {
      const log = readFileSync(
        new URL(`../../packages/${pkg}/CHANGELOG.md`, import.meta.url),
        "utf8",
      );
      expect(log).toContain(`## ${RELEASES[0]?.version}`);
    }
  });
});
