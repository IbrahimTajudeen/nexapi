/**
 * The site's HTTP API as a plain function: request in, response out. The Vercel route handler
 * (src/app/api/[...path]/route.ts) and the in-browser demo transport both call it, so the
 * authorization rules below are the same in both and are covered by unit tests.
 *
 * Authorization is checked here for clear 401/403 answers, and again by the database (row level
 * security) because every query runs with the caller's own token.
 */
import {
  BackendError,
  type Backend,
  type ListOptions,
  type MediaRow,
  type StaffRole,
} from "../lib/backend/types";
import { buildOpenApi } from "./openapi";
import { bySegment, type TableSpec } from "./spec";
import { checkBody } from "./validate";

export interface Principal {
  userId: string;
  email: string;
  /** Null when signed in but not invited. */
  role: StaffRole | null;
}

export interface SignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  /** Comma separated formats that were signed; the browser must send exactly this. */
  allowedFormats: string;
  /** Where the browser posts the file. */
  uploadUrl: string;
}

export interface ApiDeps {
  mode: "supabase" | "demo";
  /** Data access that runs as the caller (their token, so row level security applies). */
  store(token: string | null): Backend;
  /** Who is calling. Null for no or an invalid token. */
  authenticate(token: string | null): Promise<Principal | null>;
  /** Cloudinary signing and deleting; absent when it is not configured. */
  media?: {
    sign(folder: string): SignedUpload;
    destroy(publicId: string): Promise<boolean>;
  };
  /** Email a sign-in link to an invited person; absent when not available. */
  sendSignInLink?(email: string, origin: string): Promise<void>;
}

export interface ApiRequest {
  method: string;
  /** Path segments after /api, already decoded. */
  path: string[];
  query: URLSearchParams;
  body: unknown;
  token: string | null;
  /** The site's origin, used for the redirect in invite emails. */
  origin: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const RANK: Record<StaffRole, number> = { contributor: 1, editor: 2, admin: 3 };
const atLeast = (p: Principal | null, role: StaffRole): boolean =>
  !!p?.role && RANK[p.role] >= RANK[role];

const fail = (
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): ApiResponse => ({
  status,
  body: { error: { code, message, ...(fields ? { fields } : {}) } },
});
const ok = (body: unknown, status = 200, headers?: Record<string, string>): ApiResponse => ({
  status,
  body,
  ...(headers ? { headers } : {}),
});

const STATUS_FOR_CODE: Record<string, number> = {
  "42501": 403,
  "23505": 409,
  "23514": 422,
  "23502": 422,
  "23503": 422,
  PGRST116: 404,
};

function fromError(e: unknown): ApiResponse {
  if (e instanceof BackendError) {
    const status = e.code ? (STATUS_FOR_CODE[e.code] ?? 400) : 400;
    return fail(
      status,
      status === 409
        ? "conflict"
        : status === 404
          ? "not_found"
          : status === 403
            ? "forbidden"
            : "rejected",
      e.message,
    );
  }
  return fail(500, "server_error", "Something went wrong on the server.");
}

const PUBLIC_CACHE = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
const PRIVATE_CACHE = { "Cache-Control": "private, no-store" };

function parseOrder(spec: TableSpec, raw: string | null): ListOptions["orderBy"] | string {
  if (!raw) return undefined;
  const out: { column: string; ascending: boolean }[] = [];
  for (const part of raw.split(",")) {
    const desc = part.startsWith("-");
    const column = desc ? part.slice(1) : part;
    if (!spec.columns.some((c) => c.name === column)) return `Cannot order by "${column}".`;
    out.push({ column, ascending: !desc });
  }
  return out;
}

async function list(
  spec: TableSpec,
  req: ApiRequest,
  deps: ApiDeps,
  who: Principal | null,
): Promise<ApiResponse> {
  if (spec.read !== "public") {
    if (!who) return fail(401, "unauthorized", "Sign in first.");
    if (!atLeast(who, spec.read === "admin" ? "admin" : "editor"))
      return fail(403, "forbidden", "Your role cannot read this.");
  }
  const order = parseOrder(spec, req.query.get("order"));
  if (typeof order === "string") return fail(400, "bad_request", order);
  const limitRaw = req.query.get("limit");
  const limit = limitRaw === null ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 1000))
    return fail(400, "bad_request", "limit must be 1 to 1000.");
  // Visitors only ever get published rows. Staff get published rows when they ask for them.
  const onlyPublished = !who?.role || req.query.get("published") === "true";
  const options: ListOptions = {
    publishedOnly: !!spec.publicFlag && onlyPublished,
    ...(order ? { orderBy: order } : {}),
    ...(limit ? { limit } : spec.table === "audit_log" ? { limit: 200 } : {}),
  };
  const rows = await deps.store(req.token).list(spec.table, options);
  const anonymous = !who?.role;
  return ok(rows, 200, anonymous ? PUBLIC_CACHE : PRIVATE_CACHE);
}

type Row = Record<string, unknown>;

async function findRow(store: Backend, spec: TableSpec, id: string): Promise<Row | undefined> {
  const rows = (await store.list(spec.table)) as unknown as Row[];
  return rows.find((r) => String(r[spec.pk]) === id);
}

function canWrite(spec: TableSpec, who: Principal | null): boolean {
  if (spec.write === "admin") return atLeast(who, "admin");
  return atLeast(who, "editor");
}

async function create(
  spec: TableSpec,
  req: ApiRequest,
  deps: ApiDeps,
  who: Principal | null,
): Promise<ApiResponse> {
  if (!spec.create)
    return fail(405, "method_not_allowed", "This resource cannot be created this way.");
  if (!who) return fail(401, "unauthorized", "Sign in first.");
  if (!canWrite(spec, who)) return fail(403, "forbidden", "Your role cannot do that.");
  const checked = checkBody(spec, req.body, "create", undefined, {
    dataImages: deps.mode === "demo",
  });
  if (!checked.ok) return fail(422, "invalid", "Some fields are not valid.", checked.errors);
  const row: Row = { ...checked.value };
  if (spec.table === "media") row["created_by"] = who.userId;
  if (spec.table === "staff_invites") {
    row["email"] = String(row["email"]).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row["email"])))
      return fail(422, "invalid", "Some fields are not valid.", {
        email: "email must be an email address.",
      });
    row["invited_by"] = who.userId;
  }
  const made = await deps.store(req.token).insert(spec.table, row);
  if (spec.table === "staff_invites") {
    let emailSent = false;
    let emailError: string | undefined;
    if (deps.sendSignInLink) {
      try {
        await deps.sendSignInLink(String(row["email"]), req.origin);
        emailSent = true;
      } catch (e) {
        emailError = e instanceof Error ? e.message : "The email could not be sent.";
      }
    } else emailError = "Email sending is not available here.";
    return ok(
      { invite: made, emailSent, ...(emailError ? { emailError } : {}) },
      201,
      PRIVATE_CACHE,
    );
  }
  return ok(made, 201, PRIVATE_CACHE);
}

async function update(
  spec: TableSpec,
  id: string,
  req: ApiRequest,
  deps: ApiDeps,
  who: Principal | null,
): Promise<ApiResponse> {
  if (!who) return fail(401, "unauthorized", "Sign in first.");
  const store = deps.store(req.token);
  const own = spec.write === "contributor-own" && who.role === "contributor";
  if (!canWrite(spec, who) && !own) return fail(403, "forbidden", "Your role cannot do that.");
  if (own) {
    const row = await findRow(store, spec, id);
    if (!row || row["user_id"] !== who.userId)
      return fail(403, "forbidden", "You can only edit your own profile.");
  }
  const checked = checkBody(spec, req.body, "update", own ? (c) => !c.staffOnly : undefined, {
    dataImages: deps.mode === "demo",
  });
  if (!checked.ok) {
    const forbidden =
      own && Object.values(checked.errors).includes("You may not change this field.");
    return forbidden
      ? fail(403, "forbidden", "You may not change some of those fields.", checked.errors)
      : fail(422, "invalid", "Some fields are not valid.", checked.errors);
  }
  const updated = await store.update(spec.table, id, checked.value);
  return ok(updated, 200, PRIVATE_CACHE);
}

async function remove(
  spec: TableSpec,
  id: string,
  req: ApiRequest,
  deps: ApiDeps,
  who: Principal | null,
): Promise<ApiResponse> {
  if (spec.table === "audit_log")
    return fail(405, "method_not_allowed", "The activity log cannot be changed.");
  if (!who) return fail(401, "unauthorized", "Sign in first.");
  if (!canWrite(spec, who)) return fail(403, "forbidden", "Your role cannot do that.");
  const store = deps.store(req.token);
  if (spec.table === "media") {
    const row = (await findRow(store, spec, id)) as MediaRow | undefined;
    if (!row) return fail(404, "not_found", "That image was not found.");
    await store.remove("media", id);
    let assetDeleted = false;
    if (deps.media) {
      try {
        assetDeleted = await deps.media.destroy(row.public_id);
      } catch {
        assetDeleted = false;
      }
    }
    return ok({ deleted: true, assetDeleted }, 200, PRIVATE_CACHE);
  }
  if (spec.table === "staff" && id === who.userId)
    return fail(409, "conflict", "You cannot remove yourself.");
  await store.remove(spec.table, id);
  return ok({ deleted: true }, 200, PRIVATE_CACHE);
}

export async function handleApi(req: ApiRequest, deps: ApiDeps): Promise<ApiResponse> {
  try {
    const [head, second, third] = req.path;
    const method = req.method.toUpperCase();

    if (head === "status" && method === "GET")
      return ok({ configured: true, mode: deps.mode }, 200, {
        "Cache-Control": "public, max-age=30",
      });
    if (head === "openapi.json" && method === "GET")
      return ok(buildOpenApi(req.origin), 200, { "Cache-Control": "public, max-age=300" });

    const who = await deps.authenticate(req.token);
    if (req.token && !who)
      return fail(401, "unauthorized", "Your session has expired. Sign in again.");

    if (head === "me" && method === "GET") {
      if (!who) return fail(401, "unauthorized", "Sign in first.");
      return ok(who, 200, PRIVATE_CACHE);
    }

    if (head === "media" && second === "sign" && method === "POST") {
      if (!who) return fail(401, "unauthorized", "Sign in first.");
      if (!who.role) return fail(403, "forbidden", "Your role cannot do that.");
      if (!deps.media)
        return fail(503, "not_configured", "Image uploads are not configured on the server.");
      const body = req.body as { folder?: unknown } | null;
      const folder =
        typeof body?.folder === "string" && /^[a-z0-9/_-]{1,80}$/i.test(body.folder)
          ? body.folder
          : "nyxapi";
      return ok(deps.media.sign(folder), 200, PRIVATE_CACHE);
    }

    const spec = head ? bySegment(head) : undefined;
    if (!spec) return fail(404, "not_found", "No such endpoint.");

    if (!second) {
      if (method === "GET") return await list(spec, req, deps, who);
      if (method === "POST") return await create(spec, req, deps, who);
      return fail(405, "method_not_allowed", "Method not allowed.");
    }
    if (third) return fail(404, "not_found", "No such endpoint.");

    if (spec.table === "site_settings") {
      if (method !== "PUT") return fail(405, "method_not_allowed", "Use PUT to change a setting.");
      if (!who) return fail(401, "unauthorized", "Sign in first.");
      if (!canWrite(spec, who)) return fail(403, "forbidden", "Your role cannot do that.");
      const checked = checkBody(
        spec,
        { ...(typeof req.body === "object" && req.body ? req.body : {}), key: second },
        "create",
        (c) => c.name !== "updated_at",
      );
      if (!checked.ok) return fail(422, "invalid", "Some fields are not valid.", checked.errors);
      return ok(
        await deps.store(req.token).upsert("site_settings", checked.value),
        200,
        PRIVATE_CACHE,
      );
    }
    if (method === "PATCH") return await update(spec, second, req, deps, who);
    if (method === "DELETE") return await remove(spec, second, req, deps, who);
    return fail(405, "method_not_allowed", "Method not allowed.");
  } catch (e) {
    return fromError(e);
  }
}
