import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Code } from "@/components/Code";
import { Runnable } from "@/components/Runnable";
import { EPISODES, MODULES, episodeBySlug } from "@/tutorials";

export function generateStaticParams() {
  return EPISODES.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const e = episodeBySlug(slug);
  return e
    ? { title: `Episode ${e.number}: ${e.title}`, description: e.summary }
    : { title: "Tutorial" };
}

const STATUS = {
  open: "Open: no tutor yet",
  claimed: "A tutor is recording this",
  published: "Published",
} as const;

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = episodeBySlug(slug);
  if (!e) notFound();
  const i = EPISODES.indexOf(e);
  const prev = EPISODES[i - 1];
  const next = EPISODES[i + 1];
  const mod = MODULES.find((m) => m.id === e.module);
  const t = e.tutor;
  return (
    <article className="wrap doc" style={{ padding: "36px 0 80px", maxWidth: 860 }}>
      <p style={{ color: "var(--muted)" }}>
        <Link href="/tutorials/">Tutorials</Link> / {mod?.title}
      </p>
      <h1>
        Episode {e.number}: {e.title}
      </h1>
      <p className="lede">{e.summary}</p>
      <p style={{ color: "var(--muted)" }}>
        <span className={`level ${e.level}`}>{e.level}</span> · about {e.minutes} minutes ·{" "}
        {STATUS[e.status]}
        {e.tutorName ? ` (${e.tutorName})` : ""}
      </p>
      {e.videoUrl ? (
        <p>
          <a href={e.videoUrl} rel="noopener noreferrer">
            Watch the video
          </a>
        </p>
      ) : (
        <p className="callout">
          There is no video for this episode yet. The notes below are written so a learner can read
          along, or so a tutor can record it.{" "}
          <Link href="/tutorials/contribute/">How to claim it.</Link>
        </p>
      )}

      <h2>What you will learn</h2>
      <ul>
        {e.goals.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <h2>Before you start</h2>
      <ul>
        {e.prerequisites.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>

      <h2>Outline and timings</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Segment</th>
              <th>What to cover</th>
            </tr>
          </thead>
          <tbody>
            {e.outline.map((s) => (
              <tr key={s.at}>
                <td>
                  <code>{s.at}</code>
                </td>
                <td>{s.title}</td>
                <td>{s.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Code samples</h2>
      {e.samples.map((s, n) =>
        s.kind === "example" ? (
          <div key={n}>
            <Runnable id={s.id} />
            {s.note && <p style={{ color: "var(--muted)" }}>{s.note}</p>}
          </div>
        ) : (
          <div key={n}>
            <Code lang={s.lang} title={s.title}>
              {s.code}
            </Code>
            {s.note && <p style={{ color: "var(--muted)" }}>{s.note}</p>}
          </div>
        ),
      )}

      <h2>Tutor notes</h2>
      <h3>Opening hook</h3>
      <p>{t.hook}</p>
      <h3>Talking points</h3>
      <ul>
        {t.talkingPoints.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <h3>Demo steps</h3>
      <ol>
        {t.demo.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <h3>Common pitfalls</h3>
      <ul>
        {t.pitfalls.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <h3>Exercise for viewers</h3>
      <p>{t.exercise}</p>
      <h3>Closing line</h3>
      <p>{t.outro}</p>

      <h2>Read next in the docs</h2>
      <ul>
        {e.docs.map((d) => (
          <li key={d.href}>
            <Link href={d.href}>{d.title}</Link>
          </li>
        ))}
      </ul>

      <nav className="pager" aria-label="Previous and next episodes">
        {prev ? (
          <Link href={`/tutorials/${prev.slug}/`}>
            <small>Previous</small>
            {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/tutorials/${next.slug}/`} className="next">
            <small>Next</small>
            {next.title}
          </Link>
        )}
      </nav>
    </article>
  );
}
