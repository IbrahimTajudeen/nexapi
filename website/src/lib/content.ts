"use client";
/**
 * Reads site content for the public pages. When a backend is configured the database wins; when
 * it is not (or it has no rows yet, or the request fails) the pages fall back to the content that
 * ships in the repository, so the site never shows an empty shell.
 */
import { EXAMPLES } from "./examples";
import { GUIDE_EXAMPLES } from "./guide-examples";
import { useCallback, useEffect, useState } from "react";
import { backendMode, loadBackend } from "./backend";
import type {
  IssueRow,
  LimitationRow,
  ListOptions,
  MilestoneRow,
  Person,
  PlannedReleaseRow,
  ReleaseRow,
  TableName,
  Tables,
  TutorialModuleRow,
  TutorialRow,
} from "./backend/types";
import {
  EPISODES,
  MODULES,
  type Episode,
  type Module,
  type Sample,
  type Segment,
} from "../tutorials";
import { RELEASES, type Release } from "../releases";
import {
  LIMITATIONS,
  MILESTONES,
  OPEN_TASKS,
  PLANNED_RELEASES,
  type Limitation,
  type Milestone,
  type PlannedRelease,
  type Task,
} from "../roadmap";

export interface Rows<T> {
  rows: T[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Load a table. `rows` stays null until the first response (or forever when no backend is set). */
export function useRows<T extends TableName>(table: T, options?: ListOptions): Rows<Tables[T]> {
  const [rows, setRows] = useState<Tables[T][] | null>(null);
  const [loading, setLoading] = useState(backendMode !== "none");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(options ?? {});
  useEffect(() => {
    let live = true;
    void (async () => {
      const be = await loadBackend();
      if (!be) {
        if (live) setLoading(false);
        return;
      }
      try {
        const opts: ListOptions = { publishedOnly: true, ...(JSON.parse(key) as ListOptions) };
        const r = await be.list(table, opts);
        if (live) {
          setRows(r);
          setError(null);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not load content.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [table, key, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { rows, loading, error, reload };
}

// ---------- defensive readers for hand-edited JSON ----------
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const objs = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : []);

export function episodeFromRow(row: TutorialRow, people: Person[] = []): Episode {
  const c = row.content;
  const t = obj(c["tutor"]);
  const tutor = people.find((p) => p.id === row.tutor_id);
  const samples: Sample[] = objs(c["samples"]).flatMap((s): Sample[] => {
    if (
      s["kind"] === "example" &&
      typeof s["id"] === "string" &&
      (s["id"] in EXAMPLES || s["id"] in GUIDE_EXAMPLES)
    )
      return [
        {
          kind: "example",
          id: s["id"] as Extract<Sample, { kind: "example" }>["id"],
          ...(typeof s["note"] === "string" ? { note: s["note"] } : {}),
        },
      ];
    if (s["kind"] === "code" && typeof s["code"] === "string") {
      const lang = str(s["lang"], "ts");
      return [
        {
          kind: "code",
          lang: (["ts", "tsx", "bash", "json", "yaml"].includes(lang) ? lang : "ts") as "ts",
          title: str(s["title"], "code"),
          code: s["code"],
          ...(typeof s["note"] === "string" ? { note: s["note"] } : {}),
        },
      ];
    }
    return [];
  });
  const outline: Segment[] = objs(c["outline"]).map((o) => ({
    at: str(o["at"], "0:00"),
    title: str(o["title"]),
    notes: str(o["notes"]),
  }));
  return {
    number: row.number,
    slug: row.slug,
    module: row.module,
    level: row.level,
    minutes: row.minutes,
    title: row.title,
    summary: row.summary,
    goals: strs(c["goals"]),
    prerequisites: strs(c["prerequisites"]),
    outline,
    samples,
    tutor: {
      hook: str(t["hook"]),
      talkingPoints: strs(t["talkingPoints"]),
      demo: strs(t["demo"]),
      pitfalls: strs(t["pitfalls"]),
      exercise: str(t["exercise"]),
      outro: str(t["outro"]),
    },
    docs: objs(c["docs"]).map((d) => ({ title: str(d["title"]), href: str(d["href"]) })),
    status: row.status,
    ...(tutor
      ? {
          tutorName: tutor.name,
          tutorProfile: { name: tutor.name, slug: tutor.slug, avatarUrl: tutor.avatar_url },
        }
      : {}),
    ...(row.video_url ? { videoUrl: row.video_url } : {}),
    ...(row.thumbnail_url ? { thumbnailUrl: row.thumbnail_url } : {}),
  };
}

export const moduleFromRow = (m: TutorialModuleRow): Module => ({
  id: m.id,
  title: m.title,
  level: m.level,
  summary: m.summary,
  outcome: m.outcome,
});

export interface Playlist {
  episodes: Episode[];
  modules: Module[];
  source: "database" | "built-in";
}

/** The tutorial playlist: database rows when present, otherwise the episodes shipped in the repo. */
export function usePlaylist(): Playlist & { loading: boolean; error: string | null } {
  const eps = useRows("tutorials", { orderBy: [{ column: "number" }] });
  const mods = useRows("tutorial_modules", { orderBy: [{ column: "sort" }] });
  const people = useRows("people");
  const loading = eps.loading || mods.loading || people.loading;
  const error = eps.error ?? mods.error ?? people.error;
  if (eps.rows && eps.rows.length > 0 && mods.rows && mods.rows.length > 0) {
    return {
      episodes: eps.rows.map((r) => episodeFromRow(r, people.rows ?? [])),
      modules: mods.rows.map(moduleFromRow),
      source: "database",
      loading,
      error,
    };
  }
  return { episodes: EPISODES, modules: MODULES, source: "built-in", loading, error };
}

export const releaseFromRow = (r: ReleaseRow): Release => ({
  version: r.version,
  date: r.released_on,
  title: r.title,
  summary: r.summary,
  features: r.features.map((f) => ({ label: str(f.label), detail: str(f.detail) })),
  ...(r.fixes.length ? { fixes: r.fixes } : {}),
  ...(r.upgrade.length ? { upgrade: r.upgrade } : {}),
  ...(r.limits.length ? { limits: r.limits } : {}),
});

export function useReleases(): {
  releases: Release[];
  source: "database" | "built-in";
  loading: boolean;
} {
  const r = useRows("releases", {
    orderBy: [
      { column: "released_on", ascending: false },
      { column: "version", ascending: false },
    ],
  });
  if (r.rows && r.rows.length > 0)
    return { releases: r.rows.map(releaseFromRow), source: "database", loading: r.loading };
  return { releases: RELEASES, source: "built-in", loading: r.loading };
}

export interface RoadmapData {
  milestones: Milestone[];
  planned: PlannedRelease[];
  limitations: Limitation[];
  tasks: Task[];
}

export const milestoneFromRow = (m: MilestoneRow): Milestone => ({
  id: m.number,
  title: m.title,
  summary: m.summary,
  items: m.items,
});
export const plannedFromRow = (p: PlannedReleaseRow): PlannedRelease => ({
  version: p.version,
  theme: p.theme,
  items: p.items,
});
export const limitationFromRow = (l: LimitationRow): Limitation => ({
  title: l.title,
  detail: l.detail,
  workaround: l.workaround,
  area: l.area,
});
export const taskFromRow = (t: IssueRow): Task => ({
  title: t.title,
  detail: t.detail,
  area: t.area,
  size: t.size,
  status: t.status,
  ...(t.github_url ? { url: t.github_url } : {}),
});

export function useRoadmap(): RoadmapData & { source: "database" | "built-in"; loading: boolean } {
  const m = useRows("roadmap_milestones", { orderBy: [{ column: "number" }] });
  const p = useRows("planned_releases", { orderBy: [{ column: "sort" }] });
  const l = useRows("limitations", { orderBy: [{ column: "sort" }] });
  const t = useRows("issues", { orderBy: [{ column: "sort" }] });
  const loading = m.loading || p.loading || l.loading || t.loading;
  if (m.rows && m.rows.length > 0) {
    return {
      milestones: m.rows.map(milestoneFromRow),
      planned: (p.rows ?? []).map(plannedFromRow),
      limitations: (l.rows ?? []).map(limitationFromRow),
      tasks: (t.rows ?? []).filter((x) => x.status !== "closed").map(taskFromRow),
      source: "database",
      loading,
    };
  }
  return {
    milestones: MILESTONES,
    planned: PLANNED_RELEASES,
    limitations: LIMITATIONS,
    tasks: OPEN_TASKS,
    source: "built-in",
    loading,
  };
}

/** A site setting stored as a string, or the fallback. */
export function useSettingText(key: string, fallback: string): string {
  const s = useRows("site_settings");
  const v = s.rows?.find((r) => r.key === key)?.value;
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

/** The address of an episode: the pretty static page for built-in episodes, a query-string page for ones added in the admin panel. */
export function episodeHref(slug: string): string {
  return EPISODES.some((e) => e.slug === slug)
    ? `/tutorials/${slug}/`
    : `/tutorials/episode/?slug=${encodeURIComponent(slug)}`;
}
