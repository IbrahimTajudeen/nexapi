import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "@/components/Code";
import { REPO_URL } from "@/site";
import { EPISODES } from "@/tutorials";

export const metadata: Metadata = {
  title: "Make a tutorial video",
  description:
    "How to pick a NyxAPI episode, record it to a consistent standard and get it listed.",
};

export default function Page() {
  const open = EPISODES.filter((e) => e.status === "open").length;
  return (
    <article className="wrap doc" style={{ padding: "36px 0 80px", maxWidth: 820 }}>
      <h1>Make a tutorial video</h1>
      <p className="lede">
        Anyone can help NyxAPI grow by recording one episode. {open} of {EPISODES.length} episodes
        currently need a tutor. Every episode page already contains the outline, code sample and
        talking points, so you can start from there.
      </p>

      <h2>The process</h2>
      <ol>
        <li>
          Browse the <Link href="/tutorials/">playlist</Link> and choose one episode.
        </li>
        <li>
          Open an issue titled <code>Tutorial: episode N</code> in the{" "}
          <a href={`${REPO_URL}/issues`} rel="noopener noreferrer">
            repository
          </a>{" "}
          so nobody else records the same one. A maintainer marks the episode as claimed.
        </li>
        <li>Read the episode notes and the linked docs pages. Run every code sample yourself.</li>
        <li>Record, edit and publish the video on a platform you control.</li>
        <li>
          Comment the link on your issue. A maintainer reviews it and lists it on the episode page.
        </li>
      </ol>

      <h2>Recording standards</h2>
      <ul>
        <li>
          <strong>Accuracy first.</strong> Run what you show. Do not claim speed, features or
          version support you have not verified, and say clearly when something is on the roadmap
          rather than shipped.
        </li>
        <li>
          <strong>Pin the version.</strong> State the NyxAPI version in the first minute. Releases
          are listed on the <Link href="/releases/">releases page</Link>.
        </li>
        <li>
          <strong>Readable screen.</strong> 1080p, a font size of at least 18 pt, a dark or light
          theme with strong contrast.
        </li>
        <li>
          <strong>Clear audio.</strong> A quiet room beats an expensive microphone.
        </li>
        <li>
          <strong>Captions.</strong> Add accurate captions or a transcript.
        </li>
        <li>
          <strong>Pace.</strong> Follow the episode&apos;s timed outline within a few minutes either
          way.
        </li>
        <li>
          <strong>No secrets on screen.</strong> Hide tokens, keys and personal data.
        </li>
        <li>
          <strong>Be kind and inclusive.</strong> Follow the project&apos;s code of conduct.
        </li>
      </ul>

      <h2>Description template</h2>
      <Code lang="bash" title="video description">{`NyxAPI tutorial, episode N: <title>
NyxAPI version: <x.y.z>
Docs: <link to the docs pages for this episode>
Code: <link to your sample repository or gist>
Chapters: 0:00 ... (copy the outline)`}</Code>

      <h2>Checklist before you submit</h2>
      <ul className="checklist">
        <li>Every sample ran on the version named in the video.</li>
        <li>Captions or a transcript are attached.</li>
        <li>The video has chapters that match the outline.</li>
        <li>No secrets or personal data appear on screen.</li>
        <li>The description includes version, docs and code links.</li>
      </ul>

      <h2>Ownership and licensing</h2>
      <p>
        You keep ownership of your video. By listing it here you allow the project to link to and
        embed it. Code samples taken from this site are MIT licensed like the rest of NyxAPI. The
        maintainers may change this wording, so check the repository&apos;s{" "}
        <code>docs/TUTORIALS.md</code> before you start.
      </p>

      <h2>Maintainers: updating an episode</h2>
      <p>
        Edit the episode in <code>website/src/tutorials.ts</code>:
      </p>
      <Code lang="ts" title="website/src/tutorials.ts">{`status: "published",
tutorName: "Your Name",
videoUrl: "https://..."`}</Code>
    </article>
  );
}
