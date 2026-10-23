import type { Col, TableSpec } from "./spec";

export type FieldErrors = Record<string, string>;
export type Checked =
  { ok: true; value: Record<string, unknown> } | { ok: false; errors: FieldErrors };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
/** Small inline images, accepted only by the demo store. */
const DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/;
const HTTPS = /^https:\/\/\S+$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkValue(col: Col, v: unknown, dataImages: boolean): string | null {
  if (v === null) return col.nullable ? null : `${col.name} cannot be null.`;
  switch (col.type) {
    case "text": {
      if (typeof v !== "string") return `${col.name} must be a string.`;
      if (col.maxLength !== undefined && v.length > col.maxLength)
        return `${col.name} must be at most ${String(col.maxLength)} characters.`;
      if (col.enum && !col.enum.includes(v))
        return `${col.name} must be one of: ${col.enum.join(", ")}.`;
      if (
        col.https &&
        v !== "" &&
        !HTTPS.test(v) &&
        !(col.path && /^\/[^/\\\s][^\\\s]*$/.test(v)) &&
        !(dataImages && DATA_IMAGE.test(v))
      )
        return `${col.name} must be a link starting with https://${col.path ? " or a path starting with /" : ""}.`;
      return null;
    }
    case "int":
      if (typeof v !== "number" || !Number.isInteger(v))
        return `${col.name} must be a whole number.`;
      if (col.min !== undefined && v < col.min)
        return `${col.name} must be at least ${String(col.min)}.`;
      if (col.max !== undefined && v > col.max)
        return `${col.name} must be at most ${String(col.max)}.`;
      return null;
    case "bool":
      return typeof v === "boolean" ? null : `${col.name} must be true or false.`;
    case "uuid":
      return typeof v === "string" && UUID.test(v) ? null : `${col.name} must be an id.`;
    case "date":
      return typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v))
        ? null
        : `${col.name} must be a date like 2026-01-31.`;
    case "timestamp":
      return typeof v === "string" && !Number.isNaN(Date.parse(v))
        ? null
        : `${col.name} must be a date and time.`;
    case "textarray":
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string"))
        return `${col.name} must be a list of strings.`;
      if (col.enum) {
        const bad = v.find((x) => !col.enum?.includes(x));
        if (bad !== undefined) return `${col.name} may only contain: ${col.enum.join(", ")}.`;
      }
      return null;
    case "jsonobject":
      if (!isObject(v)) return `${col.name} must be an object.`;
      if (col.name === "socials") {
        for (const [k, link] of Object.entries(v))
          if (typeof link !== "string" || !HTTPS.test(link))
            return `socials.${k} must be a link starting with https://`;
      }
      return null;
    case "jsonarray":
      return Array.isArray(v) ? null : `${col.name} must be a list.`;
    case "json":
      return v === undefined ? `${col.name} is required.` : null;
  }
}

/**
 * Check a request body against a table. Unknown and read-only fields are rejected rather than
 * dropped, so a typo is an error the caller sees instead of a silent no-op.
 */
export function checkBody(
  spec: TableSpec,
  body: unknown,
  mode: "create" | "update",
  allow?: (c: Col) => boolean,
  options: { dataImages?: boolean } = {},
): Checked {
  if (!isObject(body)) return { ok: false, errors: { body: "Send a JSON object." } };
  const errors: FieldErrors = {};
  const known = new Map(spec.columns.map((c) => [c.name, c]));
  for (const key of Object.keys(body)) {
    const col = known.get(key);
    if (!col) errors[key] = "Unknown field.";
    else if (col.readOnly) errors[key] = "This field is set by the server.";
    else if (allow && !allow(col)) errors[key] = "You may not change this field.";
    else if (mode === "update" && key === spec.pk && spec.table !== "site_settings")
      errors[key] = "The id cannot be changed.";
    else {
      const problem = checkValue(col, body[key], options.dataImages === true);
      if (problem) errors[key] = problem;
    }
  }
  if (mode === "create")
    for (const c of spec.columns)
      if (c.required && !(c.name in body)) errors[c.name] = `${c.name} is required.`;
  if (mode === "update" && Object.keys(body).length === 0) errors["body"] = "Nothing to change.";
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: body };
}
