import type { Metadata } from "next";
import { GuidesList } from "@/components/GuidesView";

export const metadata: Metadata = {
  title: "Guides",
  description: "Written guides from the NyxAPI team.",
};

export default function Page() {
  return (
    <div className="wrap" style={{ padding: "36px 0 80px", maxWidth: 940 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.7rem)" }}>Guides</h1>
      <p style={{ color: "var(--muted)", fontSize: "1.15rem" }}>
        Articles from the team on using and contributing to NyxAPI.
      </p>
      <GuidesList />
    </div>
  );
}
