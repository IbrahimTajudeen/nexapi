import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EpisodeView } from "@/components/EpisodeView";
import { EPISODES, episodeBySlug } from "@/tutorials";

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

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!episodeBySlug(slug)) notFound();
  return <EpisodeView slug={slug} />;
}
