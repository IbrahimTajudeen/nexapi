/**
 * Pure helpers behind the admin forms: dotted paths into JSON columns, validation, and turning
 * form values into a database payload. Kept free of React so they can be tested.
 */
import type { StaffRole, TableName } from "../lib/backend/types";

export type FieldType =
  | "text"
  | "textarea"
  | "markdown"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "date"
  | "datetime"
  | "url"
  | "image"
  | "lines" // string[], one per line
  | "tags" // string[], comma separated
  | "repeater" // array of small objects
  | "socials"
  | "relation"
  | "json";

export interface Option {
  value: string;
  label: string;
}

export interface Field {
  /** Column name, or a dotted path into a JSON column such as "content.goals". */
  name: string;
  label: string;
  type: FieldType;
  group?: string;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: Option[];
  /** Sub-fields of a repeater. */
  fields?: Field[];
  /** For relation fields: where the choices come from. */
  relation?: { table: TableName; label: string; none?: string };
  /** An empty value is stored as null. */
  nullable?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  /** Make a URL from the value of another field when this one is left empty (slugs). */
  slugFrom?: string;
  /** Read-only after creation (slugs, keys). */
  lockOnEdit?: boolean;
  /** Where uploaded images go in Cloudinary (image fields). */
  folder?: string;
  /** Also store the Cloudinary public id in this column (image fields). */
  publicIdField?: string;
  /** Show in a wider column. */
  wide?: boolean;
  /** A URL may also be a site path such as /docs/. */
  allowPath?: boolean;
}

export type Values = Record<string, unknown>;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function getPath(values: Values, path: string): unknown {
  let cur: unknown = values;
  for (const part of path.split(".")) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** A copy of `values` with `path` set. Other keys, including unknown ones in JSON columns, are kept. */
export function setPath(values: Values, path: string, value: unknown): Values {
  const [head, ...rest] = path.split(".");
  if (head === undefined) return values;
  if (rest.length === 0) return { ...values, [head]: value };
  const child = isObj(values[head]) ? (values[head] as Values) : {};
  return { ...values, [head]: setPath(child, rest.join("."), value) };
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HTTPS_RE = /^https:\/\/\S+$/i;
export const isHttps = (v: string): boolean => HTTPS_RE.test(v);

export const SOCIAL_NETWORKS: { key: string; label: string; placeholder: string }[] = [
  { key: "github", label: "GitHub", placeholder: "https://github.com/username" },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/username" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/username" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@channel" },
  { key: "twitch", label: "Twitch", placeholder: "https://twitch.tv/username" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/username" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@username" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/username" },
  { key: "mastodon", label: "Mastodon", placeholder: "https://mastodon.social/@username" },
  { key: "bluesky", label: "Bluesky", placeholder: "https://bsky.app/profile/username" },
  { key: "discord", label: "Discord", placeholder: "https://discord.gg/invite" },
  { key: "website", label: "Website", placeholder: "https://example.com" },
];

/** A display string for a scalar value; objects and arrays give an empty string. */
export const text = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";

const isEmpty = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

/** Field-level problems keyed by field name (repeater rows use "name.0.sub"). Empty means valid. */
export function validate(
  fields: Field[],
  values: Values,
  mode: "create" | "edit" = "create",
  prefix = "",
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const key = prefix + f.name;
    const v = getPath(values, f.name);
    if (f.type === "boolean") continue;
    if (f.required && isEmpty(v) && !(f.slugFrom && !isEmpty(getPath(values, f.slugFrom)))) {
      errors[key] = `${f.label} is required.`;
      continue;
    }
    if (isEmpty(v)) continue;
    if (f.type === "number" || (f.type === "select" && typeof v === "number")) {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) errors[key] = `${f.label} must be a number.`;
      else if (f.min !== undefined && n < f.min)
        errors[key] = `${f.label} must be at least ${String(f.min)}.`;
      else if (f.max !== undefined && n > f.max)
        errors[key] = `${f.label} must be at most ${String(f.max)}.`;
    }
    if (typeof v === "string") {
      if (f.maxLength !== undefined && v.length > f.maxLength)
        errors[key] = `${f.label} must be at most ${String(f.maxLength)} characters.`;
      if (f.name === "slug" && !SLUG_RE.test(v))
        errors[key] = "Use lowercase letters, numbers and single dashes, for example my-page.";
      if (f.type === "url" && !isHttps(v) && !(f.allowPath && /^\/[^/\s]\S*$/.test(v)))
        errors[key] = f.allowPath
          ? "Use a link starting with https:// or a path starting with /."
          : "Use a link that starts with https://";
    }
    if (f.type === "socials" && isObj(v)) {
      for (const [net, url] of Object.entries(v))
        if (typeof url === "string" && url.trim() !== "" && !isHttps(url.trim()))
          errors[`${key}.${net}`] = `${net}: use a link that starts with https://`;
    }
    if (f.type === "json" && typeof v === "string") {
      try {
        JSON.parse(v);
      } catch {
        errors[key] = "This is not valid JSON.";
      }
    }
    if (f.type === "repeater" && Array.isArray(v) && f.fields) {
      v.forEach((row, i) => {
        if (isObj(row))
          Object.assign(errors, validate(f.fields ?? [], row, mode, `${key}.${String(i)}.`));
      });
    }
  }
  return errors;
}

/** Form values to a database payload: only editable columns, blanks to null, JSON text parsed. */
export function toPayload(fields: Field[], values: Values, mode: "create" | "edit"): Values {
  let out: Values = {};
  // JSON columns edited through dotted paths ("content.goals") keep keys the form does not know about
  const roots = new Set<string>();
  for (const f of fields) {
    if (mode === "edit" && f.lockOnEdit) continue;
    const root = f.name.split(".")[0] ?? f.name;
    if (f.name.includes(".")) roots.add(root);
    let v = getPath(values, f.name);
    if (f.slugFrom && isEmpty(v)) v = slugify(text(getPath(values, f.slugFrom)));
    if (f.type === "number" && v !== null && v !== undefined && v !== "") v = Number(v);
    if (f.type === "number" && v === "") v = null;
    if (f.type === "json" && typeof v === "string")
      v = v.trim() === "" ? null : (JSON.parse(v) as unknown);
    if (f.type === "socials" && isObj(v)) {
      v = Object.fromEntries(
        Object.entries(v)
          .map(([k, u]) => [k, typeof u === "string" ? u.trim() : ""] as const)
          .filter(([, u]) => u !== ""),
      );
    }
    if (f.type === "lines" || f.type === "tags")
      v = Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [];
    if (f.type === "datetime" && typeof v === "string" && v !== "") v = new Date(v).toISOString();
    if (typeof v === "string" && f.nullable && v.trim() === "") v = null;
    if (v === undefined) continue;
    out = f.name.includes(".") ? setPath(out, f.name, v) : { ...out, [f.name]: v };
  }
  for (const root of roots) {
    const original = values[root];
    const edited = out[root];
    if (isObj(original) && isObj(edited)) out[root] = { ...original, ...edited };
  }
  return out;
}

/** Which roles may open a section. */
export const ROLE_RANK: Record<StaffRole, number> = { contributor: 1, editor: 2, admin: 3 };
export const atLeast = (role: StaffRole | null, min: StaffRole): boolean =>
  role !== null && ROLE_RANK[role] >= ROLE_RANK[min];

export function toLocalInput(iso: unknown): string {
  if (typeof iso !== "string" || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
