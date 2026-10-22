/**
 * Connects the API to Supabase and Cloudinary on the server. Every data request runs with the
 * caller's own access token, so row level security stays the last line of defence. No service
 * role key is used or needed: signing and deleting Cloudinary files uses the Cloudinary API
 * secret, and invite emails are sent by asking Supabase Auth for a sign-in link.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBackend } from "../lib/backend/supabase";
import type { StaffRole } from "../lib/backend/types";
import type { ApiDeps, Principal, SignedUpload } from "./api";

export interface ServerEnv {
  SUPABASE_URL?: string | undefined;
  SUPABASE_ANON_KEY?: string | undefined;
  CLOUDINARY_CLOUD_NAME?: string | undefined;
  CLOUDINARY_API_KEY?: string | undefined;
  CLOUDINARY_API_SECRET?: string | undefined;
}

export const ALLOWED_FORMATS = "png,jpg,jpeg,webp,gif,avif";

const isRole = (v: unknown): v is StaffRole =>
  v === "admin" || v === "editor" || v === "contributor";
const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex");

/** Cloudinary signs the sorted `key=value` pairs joined by & with the API secret appended. */
export function cloudinarySignature(
  params: Record<string, string | number>,
  secret: string,
): string {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
  return sha1(payload + secret);
}

function clientFor(url: string, anon: string, token: string | null): SupabaseClient {
  // supabase-js types an untyped client with `any` schema generics; the Backend layer types rows.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const client: SupabaseClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
  return client;
}

/** Reads the environment; null when Supabase is not configured. */
export function createSupabaseDeps(env: ServerEnv, fetcher: typeof fetch = fetch): ApiDeps | null {
  const url = env.SUPABASE_URL ?? "";
  const anon = env.SUPABASE_ANON_KEY ?? "";
  if (url === "" || anon === "") return null;

  const cache = new Map<string, { until: number; who: Principal | null }>();

  const deps: ApiDeps = {
    mode: "supabase",
    store: (token) => createSupabaseBackend(url, anon, clientFor(url, anon, token)),
    async authenticate(token) {
      if (!token) return null;
      const hit = cache.get(token);
      if (hit && hit.until > Date.now()) return hit.who;
      const sb = clientFor(url, anon, token);
      const { data, error } = await sb.auth.getUser(token);
      let who: Principal | null = null;
      if (!error && data.user) {
        // Accept a pending invite (a no-op when there is none), then read the role.
        const claimed = await sb.rpc("claim_invite");
        let role: StaffRole | null = !claimed.error && isRole(claimed.data) ? claimed.data : null;
        if (!role) {
          const own = await sb
            .from("staff")
            .select("role")
            .eq("user_id", data.user.id)
            .maybeSingle<{ role: unknown }>();
          role = own.data && isRole(own.data.role) ? own.data.role : null;
        }
        who = { userId: data.user.id, email: data.user.email ?? "", role };
      }
      if (cache.size > 200) cache.clear();
      cache.set(token, { until: Date.now() + 10_000, who });
      return who;
    },
  };

  const cloud = env.CLOUDINARY_CLOUD_NAME ?? "";
  const key = env.CLOUDINARY_API_KEY ?? "";
  const secret = env.CLOUDINARY_API_SECRET ?? "";
  if (cloud && key && secret) {
    deps.media = {
      sign(folder): SignedUpload {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = cloudinarySignature(
          { allowed_formats: ALLOWED_FORMATS, folder, timestamp },
          secret,
        );
        return {
          cloudName: cloud,
          apiKey: key,
          timestamp,
          signature,
          folder,
          allowedFormats: ALLOWED_FORMATS,
          uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
        };
      },
      async destroy(publicId) {
        const timestamp = Math.floor(Date.now() / 1000);
        const body = new URLSearchParams({
          public_id: publicId,
          timestamp: String(timestamp),
          api_key: key,
          signature: cloudinarySignature({ public_id: publicId, timestamp }, secret),
        });
        const res = await fetcher(`https://api.cloudinary.com/v1_1/${cloud}/image/destroy`, {
          method: "POST",
          body,
        });
        const json = (await res.json().catch(() => ({}))) as { result?: unknown };
        return res.ok && (json.result === "ok" || json.result === "not found");
      },
    };
  }

  deps.sendSignInLink = async (email, origin) => {
    const sb = clientFor(url, anon, null);
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/admin/`, shouldCreateUser: true },
    });
    if (error) throw new Error(error.message);
  };

  return deps;
}
