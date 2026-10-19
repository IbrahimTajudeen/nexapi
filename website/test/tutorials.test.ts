import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/lib/examples";
import { GUIDE_EXAMPLES } from "../src/lib/guide-examples";
import { EPISODES, MODULES } from "../src/tutorials";

const pageExists = (href: string): boolean => {
  if (href.startsWith("/tutorials/")) return true;
  const dir = href === "/docs/" ? "src/app/docs" : `src/app${href}`;
  return existsSync(new URL(`../${dir}/page.tsx`, import.meta.url));
};
const toSeconds = (t: string): number => {
  const [m, s] = t.split(":").map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
};

describe("tutorial playlist", () => {
  it("numbers episodes 1..N in order with unique slugs", () => {
    EPISODES.forEach((e, i) => expect(e.number).toBe(i + 1));
    expect(new Set(EPISODES.map((e) => e.slug)).size).toBe(EPISODES.length);
  });
  it("uses known modules and fills every field", () => {
    const ids = new Set(MODULES.map((m) => m.id));
    for (const e of EPISODES) {
      expect(ids.has(e.module), e.slug).toBe(true);
      expect(e.goals.length, e.slug).toBeGreaterThan(0);
      expect(e.outline.length, e.slug).toBeGreaterThan(2);
      expect(e.samples.length, e.slug).toBeGreaterThan(0);
      expect(e.tutor.talkingPoints.length, e.slug).toBeGreaterThan(0);
      expect(e.tutor.demo.length, e.slug).toBeGreaterThan(0);
      expect(e.tutor.exercise, e.slug).not.toBe("");
    }
  });
  it("has outline times that increase and fit the length", () => {
    for (const e of EPISODES) {
      const t = e.outline.map((s) => toSeconds(s.at));
      expect(t[0], e.slug).toBe(0);
      t.forEach((v, i) => i > 0 && expect(v, e.slug).toBeGreaterThan(t[i - 1] ?? 0));
      expect(t[t.length - 1] ?? 0, e.slug).toBeLessThan(e.minutes * 60);
    }
  });
  it("references only runnable examples that exist", () => {
    for (const e of EPISODES)
      for (const s of e.samples)
        if (s.kind === "example")
          expect(s.id in EXAMPLES || s.id in GUIDE_EXAMPLES, `${e.slug}: ${s.id}`).toBe(true);
  });
  it("links only to pages that exist", () => {
    for (const e of EPISODES)
      for (const d of e.docs) expect(pageExists(d.href), `${e.slug}: ${d.href}`).toBe(true);
  });
  it("lists a video only when published", () => {
    for (const e of EPISODES) expect(Boolean(e.videoUrl), e.slug).toBe(e.status === "published");
  });
  it("has the beginner-to-advanced progression", () => {
    expect(EPISODES[0]?.level).toBe("beginner");
    expect(EPISODES.some((e) => e.level === "advanced")).toBe(true);
  });
});
