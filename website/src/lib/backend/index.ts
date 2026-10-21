import type { Backend } from "./types";

/**
 * Which backend this build talks to. Values are inlined at build time:
 *   NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY  -> "supabase"
 *   NEXT_PUBLIC_BACKEND=demo                                  -> "demo" (data stays in this browser)
 *   neither                                                   -> "none": the site shows its built-in content
 */
const url = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
const anon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "";
const flag = process.env["NEXT_PUBLIC_BACKEND"] ?? "";

export const backendMode: "supabase" | "demo" | "none" =
  flag === "demo" ? "demo" : url !== "" && anon !== "" ? "supabase" : "none";

let cached: Promise<Backend | null> | undefined;

/** The backend for this build, or null when none is configured. Loaded on first use. */
export function loadBackend(): Promise<Backend | null> {
  cached ??=
    backendMode === "demo"
      ? import("./demo").then((m) => m.createDemoBackend())
      : backendMode === "supabase"
        ? import("./supabase").then((m) => m.createSupabaseBackend(url, anon))
        : Promise.resolve(null);
  return cached;
}
