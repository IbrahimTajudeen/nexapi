"use client";
import Link from "next/link";
import { useState } from "react";
import { episodeHref, usePlaylist } from "@/lib/content";
import type { Level } from "@/tutorials";

const FILTERS: { id: "all" | Level; label: string }[] = [
  { id: "all", label: "All levels" },
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

const STATUS = {
  open: "Open for a tutor",
  claimed: "Being recorded",
  published: "Published",
} as const;

export function TutorialsView() {
  const { episodes: EPISODES, modules: MODULES } = usePlaylist();
  const [level, setLevel] = useState<"all" | Level>("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const shown = EPISODES.filter(
    (e) => (level === "all" || e.level === level) && (!onlyOpen || e.status === "open"),
  );
  return (
    <div>
      <div className="filters" role="group" aria-label="Filter episodes">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={level === f.id ? "chip active" : "chip"}
            aria-pressed={level === f.id}
            onClick={() => setLevel(f.id)}
          >
            {f.label}
          </button>
        ))}
        <label className="chip-check">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />
          Only episodes that need a tutor
        </label>
      </div>
      <p aria-live="polite" style={{ color: "var(--muted)" }}>
        Showing {shown.length} of {EPISODES.length} episodes.
      </p>
      {MODULES.map((m) => {
        const eps = shown.filter((e) => e.module === m.id);
        if (eps.length === 0) return null;
        return (
          <section key={m.id} style={{ marginTop: 34 }}>
            <h2 style={{ marginBottom: 4 }}>{m.title}</h2>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              {m.summary} <strong>Outcome:</strong> {m.outcome}
            </p>
            <div className="cards">
              {eps.map((e) => (
                <Link key={e.slug} href={episodeHref(e.slug)} className="card">
                  <span className="meta">
                    Episode {e.number} · {e.minutes} min ·{" "}
                    <span className={`level ${e.level}`}>{e.level}</span>
                  </span>
                  <h3>{e.title}</h3>
                  <p>{e.summary}</p>
                  <span className="meta">{STATUS[e.status]}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
