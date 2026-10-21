"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRows, useSettingText } from "../lib/content";
import type { Person } from "../lib/backend/types";
import { Avatar } from "./Avatar";
import { SocialLinks } from "./SocialLinks";

const byOrder = (a: Person, b: Person): number =>
  Number(b.featured) - Number(a.featured) || a.sort - b.sort || a.name.localeCompare(b.name);

const INTRO =
  "NyxAPI is built in the open by the people below: maintainers who steer it, contributors who fix and document it, and tutors who teach it on video.";
const TUTORS_INTRO =
  "Tutors record the video episodes. Each one chose a topic they know well and walked it through from scratch.";

export function PersonCard({ person, episodes }: { person: Person; episodes?: number }) {
  return (
    <article className="person-card" id={person.slug}>
      <Avatar name={person.name} url={person.avatar_url} size={84} />
      <div className="person-body">
        <h3>{person.name}</h3>
        {person.headline && <p className="person-headline">{person.headline}</p>}
        {person.location && <p className="person-meta">{person.location}</p>}
        {person.bio && <p className="person-bio">{person.bio}</p>}
        {person.contributions.length > 0 && (
          <ul className="person-tags">
            {person.contributions.slice(0, 4).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        {episodes !== undefined && episodes > 0 && (
          <p className="person-meta">
            <Link href="/tutorials/">
              {episodes} episode{episodes === 1 ? "" : "s"} published
            </Link>
          </p>
        )}
        <SocialLinks name={person.name} socials={person.socials} website={person.website} />
      </div>
    </article>
  );
}

export function CommunityView() {
  const people = useRows("people", { orderBy: [{ column: "sort" }, { column: "name" }] });
  const tutorials = useRows("tutorials");
  const intro = useSettingText("community.intro", INTRO);
  const tutorsIntro = useSettingText("tutors.intro", TUTORS_INTRO);

  const { team, tutors } = useMemo(() => {
    const all = [...(people.rows ?? [])].sort(byOrder);
    return {
      team: all.filter((p) => p.roles.includes("maintainer") || p.roles.includes("contributor")),
      tutors: all.filter((p) => p.roles.includes("tutor")),
    };
  }, [people.rows]);

  const episodes = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tutorials.rows ?? [])
      if (t.tutor_id && t.status === "published") m.set(t.tutor_id, (m.get(t.tutor_id) ?? 0) + 1);
    return m;
  }, [tutorials.rows]);

  const maintainers = team.filter((p) => p.roles.includes("maintainer"));
  const contributors = team.filter((p) => !p.roles.includes("maintainer"));
  const empty = !people.loading && team.length === 0 && tutors.length === 0;

  return (
    <>
      <p className="lead">{intro}</p>
      {people.loading && <p className="muted">Loading the community…</p>}
      {people.error && <p role="alert">Could not load the community right now. {people.error}</p>}
      {empty && (
        <div className="community-empty">
          <h2>Be the first name here</h2>
          <p>
            Contributors and tutors appear on this page with their photo and links once an admin
            publishes their profile. Fix a small issue or record an episode and you are in.
          </p>
          <p>
            <Link className="btn primary" href="/contribute/">
              Start contributing
            </Link>
          </p>
        </div>
      )}
      {maintainers.length > 0 && (
        <section aria-labelledby="maintainers">
          <h2 id="maintainers">Maintainers</h2>
          <div className="person-grid">
            {maintainers.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        </section>
      )}
      {contributors.length > 0 && (
        <section aria-labelledby="hall">
          <h2 id="hall">Hall of Fame</h2>
          <p className="muted">Everyone who has helped make NyxAPI better.</p>
          <div className="person-grid">
            {contributors.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        </section>
      )}
      {tutors.length > 0 && (
        <section aria-labelledby="tutors">
          <h2 id="tutors">Tutors</h2>
          <p className="muted">{tutorsIntro}</p>
          <div className="person-grid tutors">
            {tutors.map((p) => (
              <PersonCard key={p.id} person={p} episodes={episodes.get(p.id) ?? 0} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
