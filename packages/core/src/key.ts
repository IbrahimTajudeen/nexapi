/** A query key: a JSON-like array. Object key order never matters. */
export type QueryKey = readonly unknown[];

/** A query key that remembers (at the type level only) what data it addresses. */
export type TypedKey<TData> = QueryKey & { readonly __nyxData?: TData };

const MAX_DEPTH = 32;

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function write(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) throw new TypeError("Query key is nested too deeply (or circular)");
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("Query keys cannot contain NaN or Infinity");
      return String(value);
    case "boolean":
      return value ? "true" : "false";
    case "undefined":
      return "null"; // array holes/undefined elements hash like null; object props are skipped below
    case "object": {
      if (value === null) return "null";
      if (Array.isArray(value)) {
        let out = "[";
        for (let i = 0; i < value.length; i++) {
          if (i > 0) out += ",";
          out += write(value[i], depth + 1);
        }
        return out + "]";
      }
      if (value instanceof Date) return `D(${JSON.stringify(value.toISOString())})`;
      if (!isPlainObject(value)) break;
      const keys = Object.keys(value).sort();
      let out = "{";
      let first = true;
      for (const k of keys) {
        const v = value[k];
        if (v === undefined) continue; // {a: undefined} hashes like {}
        if (!first) out += ",";
        first = false;
        out += JSON.stringify(k) + ":" + write(v, depth + 1);
      }
      return out + "}";
    }
    default:
      break;
  }
  throw new TypeError(
    `Query keys may only contain strings, finite numbers, booleans, null, Dates, arrays and plain objects (got ${typeof value})`,
  );
}

/**
 * Canonical string form of a key. Equal keys (modulo object key order and `undefined`
 * properties) always hash identically; unequal keys never collide because every token is
 * delimited and strings are JSON-quoted.
 */
export function hashKey(key: QueryKey): string {
  return write(key, 0);
}

function partialEqual(actual: unknown, filter: unknown, depth: number): boolean {
  if (Object.is(actual, filter)) return true;
  if (depth > MAX_DEPTH) return false;
  if (
    typeof actual !== "object" ||
    typeof filter !== "object" ||
    actual === null ||
    filter === null
  )
    return false;
  if (actual instanceof Date && filter instanceof Date)
    return actual.getTime() === filter.getTime();
  if (Array.isArray(filter)) {
    if (!Array.isArray(actual) || actual.length < filter.length) return false;
    return filter.every((f, i) => partialEqual(actual[i], f, depth + 1));
  }
  if (Array.isArray(actual)) return false;
  const a = actual as Record<string, unknown>;
  const f = filter as Record<string, unknown>;
  return Object.keys(f).every((k) => f[k] === undefined || partialEqual(a[k], f[k], depth + 1));
}

/** True when `filter` is a (deep, partial) prefix of `key`. */
export function keyMatchesPrefix(key: QueryKey, filter: QueryKey): boolean {
  if (filter.length > key.length) return false;
  for (let i = 0; i < filter.length; i++) if (!partialEqual(key[i], filter[i], 0)) return false;
  return true;
}
