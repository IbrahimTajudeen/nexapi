"use client";
import { useEffect, useState } from "react";

type Times = Record<string, string>;
type State =
  | { kind: "loading" }
  | { kind: "ok"; times: Times; latest: string | undefined }
  | { kind: "error" };

let cached: Promise<State> | undefined;

/** One registry request shared by every card on the page. */
function load(): Promise<State> {
  cached ??= fetch("https://registry.npmjs.org/@nyxapi%2fcore", {
    headers: { accept: "application/json" },
  })
    .then(async (response): Promise<State> => {
      if (!response.ok) return { kind: "error" };
      const doc = (await response.json()) as {
        time?: Times;
        "dist-tags"?: Record<string, string>;
      };
      return { kind: "ok", times: doc.time ?? {}, latest: doc["dist-tags"]?.["latest"] };
    })
    .catch((): State => ({ kind: "error" }));
  return cached;
}

const fmt = (iso: string): string =>
  new Date(iso).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });

/** Whether `version` is on npm, according to the registry itself. */
export function NpmStatus({ version }: { version: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void load().then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, []);
  if (state.kind === "loading") return <span className="chip">checking npm…</span>;
  if (state.kind === "error") return <span className="chip">npm status unavailable</span>;
  const when = state.times[version];
  if (when) {
    const latest = state.latest === version;
    return (
      <span className="chip ok">
        {latest ? "latest on npm" : "on npm"} · {fmt(when)}
      </span>
    );
  }
  return <span className="chip warn">not published to npm yet</span>;
}
