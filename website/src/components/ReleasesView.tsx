"use client";

import { NpmStatus } from "./NpmStatus";
import { useReleases } from "../lib/content";

/** Renders `code` spans in release text. */
function Inline({ text }: { text: string }) {
  return (
    <>{text.split("`").map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>
  );
}

export function ReleasesView() {
  const { releases: RELEASES } = useReleases();
  return (
    <>
      <nav aria-label="Versions" className="pill-row" style={{ margin: "18px 0 8px" }}>
        {RELEASES.map((r) => (
          <a className="pill" key={r.version} href={`#v${r.version}`}>
            <b>v{r.version}</b>
          </a>
        ))}
      </nav>

      {RELEASES.map((r, i) => (
        <section className="release" key={r.version} id={`v${r.version}`}>
          <header className="release-head">
            <h2>
              v{r.version}
              {i === 0 && <span className="badge live">newest</span>}
            </h2>
            <NpmStatus version={r.version} />
            <span className="release-date">{r.date ?? "initial release"}</span>
          </header>
          <h3 className="release-title">
            <Inline text={r.title} />
          </h3>
          <p>
            <Inline text={r.summary} />
          </p>

          <h4>What it added</h4>
          <ul className="release-list">
            {r.features.map((f) => (
              <li key={f.label}>
                <b>
                  <Inline text={f.label} />.
                </b>{" "}
                <Inline text={f.detail} />
              </li>
            ))}
          </ul>

          {r.fixes && (
            <>
              <h4>Fixes and hardening</h4>
              <ul className="release-list">
                {r.fixes.map((f) => (
                  <li key={f}>
                    <Inline text={f} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.upgrade && (
            <>
              <h4>Upgrading</h4>
              <ul className="release-list">
                {r.upgrade.map((f) => (
                  <li key={f}>
                    <Inline text={f} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.limits && (
            <>
              <h4>Not in this version</h4>
              <ul className="release-list">
                {r.limits.map((f) => (
                  <li key={f}>
                    <Inline text={f} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </>
  );
}
