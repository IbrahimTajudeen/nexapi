import { NextResponse, type NextRequest } from "next/server";
import { handleApi } from "@/server/api";
import { createSupabaseDeps } from "@/server/supabase-deps";
import { buildOpenApi } from "@/server/openapi";
import { bucketFor, clientKey, createLimiters } from "@/server/ratelimit";

// Always run on the server: this reads the caller's token and talks to Supabase.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;

const deps = createSupabaseDeps({
  SUPABASE_URL: process.env["SUPABASE_URL"] ?? process.env["NEXT_PUBLIC_SUPABASE_URL"],
  SUPABASE_ANON_KEY:
    process.env["SUPABASE_ANON_KEY"] ?? process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  CLOUDINARY_CLOUD_NAME:
    process.env["CLOUDINARY_CLOUD_NAME"] ?? process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"],
  CLOUDINARY_API_KEY: process.env["CLOUDINARY_API_KEY"],
  CLOUDINARY_API_SECRET: process.env["CLOUDINARY_API_SECRET"],
});

const limiters = createLimiters();

/** Headers on every answer from the API. */
const BASE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  // The API is for this site only. Without CORS headers browsers already refuse cross-origin
  // reads; this also stops other sites embedding the responses.
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};

const reply = (body: unknown, status: number, headers: Record<string, string> = {}): NextResponse =>
  NextResponse.json(body, { status, headers: { ...BASE_HEADERS, ...headers } });

const error = (
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): NextResponse =>
  reply({ error: { code, message } }, status, { "Cache-Control": "no-store", ...headers });

/** Reads at most `limit` bytes of the body, or returns null when it is larger. */
async function readLimited(request: NextRequest, limit: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const origin = request.nextUrl.origin;

  if (!deps) {
    // Not configured: say so plainly instead of failing in a confusing way.
    if (path[0] === "status") return reply({ configured: false, mode: "supabase" }, 200);
    if (path[0] === "openapi.json") return reply(buildOpenApi(origin), 200);
    return error(
      503,
      "not_configured",
      "The backend is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
  }

  const key = clientKey(request.headers);
  const mutating = request.method !== "GET" && request.method !== "HEAD";

  // Browsers always send Origin on cross-site writes. Our own pages send our own origin; scripts
  // such as curl send none (they still need a valid token). Anything else is refused.
  if (mutating) {
    const from = request.headers.get("origin");
    if (from !== null && from !== origin)
      return error(403, "forbidden", "Requests from other sites are not allowed.");
  }

  const bucket = bucketFor(request.method, path);
  const slow = limiters.badauth.blocked(key);
  const verdict = slow.allowed ? limiters[bucket].take(`${bucket}:${key}`) : slow;
  if (!verdict.allowed)
    return error(429, "rate_limited", "Too many requests. Wait a moment and try again.", {
      "Retry-After": String(verdict.retryAfter),
    });

  let body: unknown;
  if (mutating) {
    const type = request.headers.get("content-type") ?? "";
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 0 && !/^application\/json\b/i.test(type))
      return error(415, "unsupported_media_type", "Send the body as application/json.");
    if (length > MAX_BODY_BYTES) return error(413, "too_large", "That request is too large.");
    const text = await readLimited(request, MAX_BODY_BYTES);
    if (text === null) return error(413, "too_large", "That request is too large.");
    if (text !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        return error(400, "bad_request", "The request body is not valid JSON.");
      }
    }
  }

  const auth = request.headers.get("authorization");
  const rawToken = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  // A real access token is a short JWT; refuse absurd values before they reach any lookup.
  const token = rawToken !== "" && rawToken.length <= 4096 ? rawToken : null;
  const res = await handleApi(
    { method: request.method, path, query: request.nextUrl.searchParams, body, token, origin },
    deps,
  );
  // Count tokens that did not check out, so guessing at tokens is throttled harder than normal use.
  if (token && res.status === 401) limiters.badauth.take(key);
  return reply(res.body, res.status, res.headers ?? {});
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
