import type { Metadata } from "next";
import Link from "next/link";
import { TutorialsView } from "@/components/TutorialsView";
import { EPISODES } from "@/tutorials";

export const metadata: Metadata = {
  title: "Tutorials",
  description:
    "A 30-episode video playlist guide for NyxAPI, from first install to production, with code samples and tutor notes for every episode.",
};

export default function Page() {
  const minutes = EPISODES.reduce((n, e) => n + e.minutes, 0);
  const published = EPISODES.filter((e) => e.status === "published").length;
  return (
    <div className="wrap" style={{ padding: "36px 0 80px", maxWidth: 1040 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.7rem)" }}>Tutorials</h1>
      <p style={{ color: "var(--muted)", fontSize: "1.15rem", maxWidth: 760 }}>
        A playlist plan that takes you from never having heard of NyxAPI to running it in
        production. Each episode has goals, a timed outline, a code sample and full notes for the
        person recording it. Learners can follow along in the docs; tutors can pick any open episode
        and make the video.
      </p>
      <ul className="stats-line" style={{ color: "var(--muted)" }}>
        <li>
          {EPISODES.length} episodes, about {Math.round(minutes / 60)} hours in total
        </li>
        <li>{published} published so far. Videos appear here once a maintainer links them.</li>
      </ul>
      <p>
        <Link href="/tutorials/contribute/">Want to record one? Read the tutor guide.</Link>
      </p>
      <TutorialsView />
    </div>
  );
}
