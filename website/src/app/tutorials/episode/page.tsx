import type { Metadata } from "next";
import { Suspense } from "react";
import { EpisodeFromQuery } from "@/components/EpisodeFromQuery";

export const metadata: Metadata = { title: "Tutorial" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EpisodeFromQuery />
    </Suspense>
  );
}
