import type { QueryClient } from "./client.js";
import { hashKey, type QueryKey } from "./key.js";
import type { Query } from "./query.js";

export interface DehydratedQuery {
  queryKey: QueryKey;
  /** Confirmed data. Must be JSON-serializable. */
  data: unknown;
  /** ms epoch when the data was fetched; keeps staleness honest after hydration. */
  dataUpdatedAt: number;
}

export interface DehydratedState {
  version: 1;
  queries: DehydratedQuery[];
}

export interface DehydrateOptions {
  /** Default: every query that has successful data. */
  shouldDehydrate?: (query: Query) => boolean;
}

/**
 * Serialize the successful entries of one client (typically at the end of a server request).
 * Only confirmed data is included: never errors, never optimistic patches, never in-flight work.
 * The result must go through a JSON-safe channel; when embedding in HTML, escape `<` (e.g.
 * `JSON.stringify(state).replace(/</g, "\\u003c")`).
 */
export function dehydrate(client: QueryClient, options: DehydrateOptions = {}): DehydratedState {
  const queries: DehydratedQuery[] = [];
  for (const q of client.findAll()) {
    if (q.state.status !== "success" || q.state.dataUpdatedAt === 0) continue;
    const data = q.confirmedData;
    if (data === undefined) continue;
    if (options.shouldDehydrate && !options.shouldDehydrate(q)) continue;
    queries.push({ queryKey: q.key, data, dataUpdatedAt: q.state.dataUpdatedAt });
  }
  return { version: 1, queries };
}

function invalid(reason: string): never {
  throw new TypeError(`Invalid dehydrated state: ${reason}`);
}

/**
 * Load dehydrated entries into `client`. The input is treated as untrusted (it usually arrives
 * through HTML): its shape is validated before anything is written, and an entry never replaces
 * newer data already in the cache.
 */
export function hydrate(client: QueryClient, state: unknown): void {
  if (typeof state !== "object" || state === null) invalid("expected an object");
  const s = state as { version?: unknown; queries?: unknown };
  if (s.version !== 1) invalid(`unsupported version ${String(s.version)}`);
  if (!Array.isArray(s.queries)) invalid('"queries" must be an array');
  const entries: DehydratedQuery[] = [];
  for (const raw of s.queries as unknown[]) {
    if (typeof raw !== "object" || raw === null) invalid("query entry must be an object");
    const e = raw as { queryKey?: unknown; data?: unknown; dataUpdatedAt?: unknown };
    if (!Array.isArray(e.queryKey)) invalid("queryKey must be an array");
    if (
      typeof e.dataUpdatedAt !== "number" ||
      !Number.isFinite(e.dataUpdatedAt) ||
      e.dataUpdatedAt <= 0
    )
      invalid("dataUpdatedAt must be a positive finite number");
    if (e.data === undefined) invalid("data is missing");
    hashKey(e.queryKey as QueryKey); // throws TypeError for keys that cannot be hashed
    entries.push({
      queryKey: e.queryKey as QueryKey,
      data: e.data,
      dataUpdatedAt: e.dataUpdatedAt,
    });
  }
  for (const e of entries) {
    const existing = client.getQuery(e.queryKey);
    if (existing && existing.state.dataUpdatedAt >= e.dataUpdatedAt) continue;
    client.buildQuery({ queryKey: e.queryKey }).setData(e.data, { updatedAt: e.dataUpdatedAt });
  }
}
