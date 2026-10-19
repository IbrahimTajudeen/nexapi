import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMITATIONS, MILESTONES, OPEN_TASKS, PLANNED_RELEASES } from "../src/roadmap";

const md = readFileSync(new URL("../../ROADMAP.md", import.meta.url), "utf8");
const core = JSON.parse(
  readFileSync(new URL("../../packages/core/package.json", import.meta.url), "utf8"),
) as { version: string };

const newer = (a: string, b: string): boolean => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

describe("roadmap page data matches ROADMAP.md", () => {
  it("has every milestone, by number and title", () => {
    for (const m of MILESTONES)
      expect(md.toLowerCase(), `milestone ${m.id}`).toContain(
        `milestone ${m.id}: ${m.title.toLowerCase()}`,
      );
  });
  it("lists every open item verbatim", () => {
    for (const m of MILESTONES)
      for (const i of m.items.filter((x) => x.status !== "shipped"))
        expect(md, `open item: ${i.text}`).toContain(i.text);
  });
  it("plans releases after the current version, in order", () => {
    let previous = core.version;
    for (const r of PLANNED_RELEASES) {
      expect(newer(r.version, previous), `${r.version} should follow ${previous}`).toBe(true);
      previous = r.version;
    }
  });
  it("has unique titles and no empty text", () => {
    for (const list of [LIMITATIONS.map((l) => l.title), OPEN_TASKS.map((t) => t.title)])
      expect(new Set(list).size).toBe(list.length);
    for (const l of LIMITATIONS) expect(l.workaround.length).toBeGreaterThan(5);
  });
});
