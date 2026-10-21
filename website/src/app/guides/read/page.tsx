import type { Metadata } from "next";
import { Suspense } from "react";
import { GuideReader } from "@/components/GuidesView";

export const metadata: Metadata = { title: "Guide" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <GuideReader />
    </Suspense>
  );
}
