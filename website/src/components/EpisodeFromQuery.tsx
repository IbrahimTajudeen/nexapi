"use client";

import { useSearchParams } from "next/navigation";
import { EpisodeView } from "./EpisodeView";

/** Episodes added in the admin panel have no pre-built page, so they are opened as /tutorials/episode/?slug=… */
export function EpisodeFromQuery() {
  const slug = useSearchParams().get("slug") ?? "";
  return <EpisodeView slug={slug} />;
}
