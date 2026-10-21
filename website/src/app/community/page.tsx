import type { Metadata } from "next";
import Link from "next/link";
import { CommunityView } from "@/components/CommunityView";

export const metadata: Metadata = {
  title: "Community",
  description:
    "The maintainers, contributors and tutors who build and teach NyxAPI, with their photos and links.",
};

export default function Page() {
  return (
    <div className="wrap community" style={{ padding: "36px 0 96px" }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.7rem)" }}>Community</h1>
      <CommunityView />
      <p className="muted" style={{ marginTop: 40 }}>
        Want to see your name here? Read <Link href="/contribute/">how to contribute</Link>.
      </p>
    </div>
  );
}
