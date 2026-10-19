import type { Metadata } from "next";
import Link from "next/link";
import { RoadmapView } from "@/components/RoadmapView";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "What NyxAPI has shipped, what is planned next, the limitations that exist today and the tasks open for contributors.",
};

export default function Page() {
  return (
    <div className="wrap roadmap" style={{ padding: "36px 0 80px", maxWidth: 940 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.7rem)" }}>Roadmap</h1>
      <p style={{ color: "var(--muted)", fontSize: "1.15rem" }}>
        What has shipped, what comes next, what does not work yet, and where help is wanted. It
        mirrors <code>ROADMAP.md</code> in the repository. For what each version contained, see{" "}
        <Link href="/releases/">Releases</Link>.
      </p>
      <RoadmapView />
    </div>
  );
}
