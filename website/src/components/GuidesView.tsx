"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRows } from "../lib/content";
import { Markdown } from "./Markdown";

export function GuidesList() {
  const { rows, loading, error } = useRows("pages", {
    orderBy: [{ column: "sort" }, { column: "title" }],
  });
  const list = (rows ?? []).filter((p) => p.show_in_nav);
  const sections = [...new Set(list.map((p) => p.section))];
  if (loading) return <p className="muted">Loading guides…</p>;
  if (error) return <p role="alert">Could not load the guides. {error}</p>;
  if (list.length === 0)
    return (
      <div className="community-empty">
        <h2>No guides published yet</h2>
        <p>
          Written guides from the team will appear here. In the meantime the{" "}
          <Link href="/docs/">documentation</Link> and <Link href="/tutorials/">tutorials</Link>{" "}
          cover everything.
        </p>
      </div>
    );
  return (
    <>
      {sections.map((s) => (
        <section key={s} style={{ marginTop: 28 }}>
          <h2>{s}</h2>
          <div className="cards">
            {list
              .filter((p) => p.section === s)
              .map((p) => (
                <Link
                  key={p.id}
                  className="card"
                  href={`/guides/read/?slug=${encodeURIComponent(p.slug)}`}
                >
                  <h3>{p.title}</h3>
                  <p>{p.summary}</p>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function GuideReader() {
  const slug = useSearchParams().get("slug") ?? "";
  const { rows, loading } = useRows("pages");
  const page = rows?.find((p) => p.slug === slug);
  if (!page)
    return (
      <div className="wrap doc" style={{ padding: "36px 0 80px", maxWidth: 780 }}>
        <p>
          <Link href="/guides/">Guides</Link>
        </p>
        <h1>{loading ? "Loading…" : "Guide not found"}</h1>
        {!loading && (
          <p>
            That guide does not exist or is not published.{" "}
            <Link href="/guides/">See all guides</Link>.
          </p>
        )}
      </div>
    );
  return (
    <article className="wrap doc" style={{ padding: "36px 0 80px", maxWidth: 780 }}>
      <p className="muted">
        <Link href="/guides/">Guides</Link> / {page.section}
      </p>
      <h1>{page.title}</h1>
      {page.summary && <p className="lede">{page.summary}</p>}
      <Markdown>{page.body}</Markdown>
    </article>
  );
}
