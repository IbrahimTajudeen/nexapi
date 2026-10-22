import { NextResponse, type NextRequest } from "next/server";
import { handleApi } from "@/server/api";
import { createSupabaseDeps } from "@/server/supabase-deps";
import { buildOpenApi } from "@/server/openapi";

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

const error = (status: number, code: string, message: string): NextResponse =>
  NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const origin = request.nextUrl.origin;

  if (!deps) {
    // Not configured: say so plainly instead of failing in a confusing way.
    if (path[0] === "status") return NextResponse.json({ configured: false, mode: "supabase" });
    if (path[0] === "openapi.json") return NextResponse.json(buildOpenApi(origin));
    return error(
      503,
      "not_configured",
      "The backend is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
  }

  let body: unknown;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) return error(413, "too_large", "That request is too large.");
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return error(413, "too_large", "That request is too large.");
    if (text !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        return error(400, "bad_request", "The request body is not valid JSON.");
      }
    }
  }

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() || null : null;
  const res = await handleApi(
    { method: request.method, path, query: request.nextUrl.searchParams, body, token, origin },
    deps,
  );
  return NextResponse.json(res.body, { status: res.status, headers: res.headers ?? {} });
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
