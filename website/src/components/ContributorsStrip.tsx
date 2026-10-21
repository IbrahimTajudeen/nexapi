"use client";

import Link from "next/link";
import { useRows } from "../lib/content";
import { Avatar } from "./Avatar";

/** Faces from the Hall of Fame on the home page. Renders nothing until people are published, so the page never shows an empty box. */
export function ContributorsStrip() {
  const { rows } = useRows("people", { orderBy: [{ column: "sort" }, { column: "name" }] });
  const people = [...(rows ?? [])]
    .sort((a, b) => Number(b.featured) - Number(a.featured))
    .slice(0, 12);
  if (people.length === 0) return null;
  return (
    <section className="section" aria-labelledby="home-people-h">
      <div className="wrap">
        <h2 id="home-people-h">Built by the community</h2>
        <p className="sub">Maintainers, contributors and tutors who make NyxAPI what it is.</p>
        <ul className="home-people">
          {people.map((p) => (
            <li key={p.id}>
              <Link href={`/community/#${p.slug}`}>
                <Avatar name={p.name} url={p.avatar_url} size={64} />
                <span>{p.name}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p>
          <Link href="/community/">Meet everyone →</Link>
        </p>
      </div>
    </section>
  );
}
