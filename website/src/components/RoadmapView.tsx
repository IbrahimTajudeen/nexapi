"use client";
import { useMemo, useState } from "react";
import { useRoadmap } from "@/lib/content";
import { AREA_LABEL, STATUS_LABEL, type Area, type Status } from "@/roadmap";
import { VERSION } from "@/site";

const AREAS = Object.keys(AREA_LABEL) as Area[];

function Chips<T extends string>({
  label,
  all,
  value,
  onChange,
  names,
}: {
  label: string;
  all: readonly T[];
  value: T | "all";
  onChange: (v: T | "all") => void;
  names: Record<T, string>;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      <span className="chips-label">{label}</span>
      {(["all", ...all] as (T | "all")[]).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className="chip"
        >
          {v === "all" ? "All" : names[v]}
        </button>
      ))}
    </div>
  );
}

export function RoadmapView() {
  const {
    milestones: MILESTONES,
    planned: PLANNED_RELEASES,
    limitations: LIMITATIONS,
    tasks: OPEN_TASKS,
  } = useRoadmap();
  const STATUSES = (Object.keys(STATUS_LABEL) as Status[]).filter((s) =>
    MILESTONES.some((m) => m.items.some((i) => i.status === s)),
  );
  const [status, setStatus] = useState<Status | "all">("all");
  const [area, setArea] = useState<Area | "all">("all");

  const milestones = useMemo(
    () =>
      MILESTONES.map((m) => ({
        ...m,
        items: m.items.filter(
          (i) => (status === "all" || i.status === status) && (area === "all" || i.area === area),
        ),
      })).filter((m) => m.items.length > 0),
    [MILESTONES, status, area],
  );
  const limitations = LIMITATIONS.filter((l) => area === "all" || l.area === area);
  const tasks = OPEN_TASKS.filter((t) => area === "all" || t.area === area);
  const total = MILESTONES.flatMap((m) => m.items);
  const count = (s: Status) => total.filter((i) => i.status === s).length;

  return (
    <>
      <div className="rm-summary" aria-label="Roadmap summary">
        {STATUSES.map((s) => (
          <div key={s} className={`rm-stat st-${s}`}>
            <b>{count(s)}</b>
            <span>{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>

      <div className="rm-filters">
        <Chips
          label="Status"
          all={STATUSES}
          value={status}
          onChange={setStatus}
          names={STATUS_LABEL}
        />
        <Chips label="Area" all={AREAS} value={area} onChange={setArea} names={AREA_LABEL} />
      </div>

      <h2 id="milestones">Milestones</h2>
      {milestones.length === 0 && <p className="hint">Nothing matches these filters.</p>}
      {milestones.map((m) => (
        <section key={m.id} className="rm-milestone" aria-labelledby={`m${m.id}`}>
          <h3 id={`m${m.id}`}>
            <span className="rm-num">{m.id}</span>
            {m.title}
          </h3>
          <p className="rm-sum">{m.summary}</p>
          <ul className="rm-items">
            {m.items.map((i) => (
              <li key={i.text}>
                <span className={`rm-tag st-${i.status}`}>{STATUS_LABEL[i.status]}</span>
                <span className="rm-text">{i.text}</span>
                <span className="rm-area">{AREA_LABEL[i.area]}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2 id="releases">Planned releases</h2>
      <p className="hint">
        The current release is v{VERSION}. This is a suggested order, not a promise, and no dates
        are given on purpose.
      </p>
      <div className="grid cols-2">
        {PLANNED_RELEASES.map((r) => (
          <div key={r.version} className="card">
            <h3>
              v{r.version} <span className="rm-theme">{r.theme}</span>
            </h3>
            <ul className="rm-plain">
              {r.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h2 id="limitations">Known limitations</h2>
      <p className="hint">
        These are true of the current release. Each has a workaround until it is fixed.
      </p>
      {limitations.length === 0 && <p className="hint">Nothing matches this area.</p>}
      <div className="rm-list">
        {limitations.map((l) => (
          <article key={l.title} className="rm-card">
            <header>
              <h3>{l.title}</h3>
              <span className="rm-area">{AREA_LABEL[l.area]}</span>
            </header>
            <p>{l.detail}</p>
            <p className="rm-work">
              <b>Meanwhile:</b> {l.workaround}
            </p>
          </article>
        ))}
      </div>

      <h2 id="tasks">Open tasks</h2>
      <p className="hint">
        Work that would move the project forward. Pick one and open an issue to say so; see{" "}
        <a href="/contribute/">Contribute</a> for setup.
      </p>
      {tasks.length === 0 && <p className="hint">Nothing matches this area.</p>}
      <div className="rm-list">
        {tasks.map((t) => (
          <article key={t.title} className="rm-card">
            <header>
              <h3>{t.title}</h3>
              <span className={`rm-size sz-${t.size}`}>{t.size}</span>
              <span className="rm-area">{AREA_LABEL[t.area]}</span>
            </header>
            <p>{t.detail}</p>
          </article>
        ))}
      </div>
    </>
  );
}
