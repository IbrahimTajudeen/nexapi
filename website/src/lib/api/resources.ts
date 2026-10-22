/**
 * Typed access to the site's tables through the generated client, in one place.
 *
 * The generated client has one endpoint tree per table. Pages that work across tables (the admin
 * manager, the public content hooks) go through `tree(table)`, which views a tree through one
 * small structural type. Rows are validated against the generated shapes on every response, so
 * the casts below only choose a view of data that has already been checked.
 */
import { HttpError, type QueryConfig, type QueryKey, type QueryOptions } from "@nyxapi/core";
import { useMutation } from "@nyxapi/react";
import type { ListOptions, TableName, Tables } from "../backend/types";
import { PRIMARY_KEY } from "../backend/types";
import { api } from "./client";

export type Row = Record<string, unknown>;
export interface ListQuery {
  published?: boolean;
  order?: string;
  limit?: number;
}

interface Tree {
  get: {
    options(request?: { query?: ListQuery }, config?: QueryConfig<Row[]>): QueryOptions<Row[]>;
    key(request?: { query?: ListQuery }): QueryKey;
  };
  post?: (body: Row) => Promise<unknown>;
  byId?: (id: string) => {
    patch?: (body: Row) => Promise<unknown>;
    delete?: () => Promise<unknown>;
  };
  byKey?: (key: string) => { put: (body: { value: unknown }) => Promise<unknown> };
}

const TREES: Record<TableName, Tree> = {
  people: api.people as unknown as Tree,
  tutorial_modules: api.tutorialModules as unknown as Tree,
  tutorials: api.tutorials as unknown as Tree,
  releases: api.releases as unknown as Tree,
  roadmap_milestones: api.roadmapMilestones as unknown as Tree,
  planned_releases: api.plannedReleases as unknown as Tree,
  limitations: api.limitations as unknown as Tree,
  issues: api.issues as unknown as Tree,
  pages: api.pages as unknown as Tree,
  announcements: api.announcements as unknown as Tree,
  site_settings: api.settings as unknown as Tree,
  media: api.media as unknown as Tree,
  staff: api.staff as unknown as Tree,
  staff_invites: api.invites as unknown as Tree,
  audit_log: api.audit as unknown as Tree,
};
export const tree = (table: TableName): Tree => TREES[table];

/** The cache key shared by every list query of a table, whatever its filters. */
export const listKey = (table: TableName): QueryKey => tree(table).get.key();

export function toQuery(options: ListOptions & { admin?: boolean } = {}): ListQuery {
  const query: ListQuery = {};
  if (options.publishedOnly) query.published = true;
  if (options.orderBy?.length)
    query.order = options.orderBy
      .map((o) => `${o.ascending === false ? "-" : ""}${o.column}`)
      .join(",");
  if (options.limit) query.limit = options.limit;
  return query;
}

/** A message a person can act on, from whatever the client threw. */
export function errorMessage(e: unknown): string {
  if (e instanceof HttpError) {
    const body = e.body as { error?: { message?: unknown; fields?: unknown } } | null;
    const message = typeof body?.error?.message === "string" ? body.error.message : e.message;
    const fields = body?.error?.fields;
    if (fields && typeof fields === "object") {
      const detail = Object.values(fields as Record<string, unknown>).filter(
        (v): v is string => typeof v === "string",
      );
      if (detail.length) return `${message} ${detail.join(" ")}`;
    }
    return message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

/** Field-by-field problems from a 422 answer, or null. */
export function fieldErrors(e: unknown): Record<string, string> | null {
  if (!(e instanceof HttpError)) return null;
  const fields = (e.body as { error?: { fields?: unknown } } | null)?.error?.fields;
  if (!fields || typeof fields !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields as Record<string, unknown>))
    if (typeof v === "string") out[k] = v;
  return Object.keys(out).length ? out : null;
}

export function isUnauthorized(e: unknown): boolean {
  return e instanceof HttpError && e.status === 401;
}

type Patch = Row;
interface UpdateVars {
  id: string;
  patch: Patch;
}

/**
 * Create, change and delete rows of one table.
 *
 * - Every successful write invalidates the table's list queries, so every screen that shows the
 *   table (admin lists, dropdowns, the public pages in the same tab) refetches.
 * - Updates are optimistic: the cached rows change at once and are rolled back, and only that
 *   change, if the request fails.
 */
export function useResourceMutations(table: TableName) {
  const t = tree(table);
  const pk = PRIMARY_KEY[table];
  const invalidates = [listKey(table)] as const;

  const create = useMutation<Row, Error, Row>({
    mutationFn: async (body) => {
      if (!t.post) throw new Error("This table cannot be created from here.");
      return (await t.post(body)) as Row;
    },
    invalidates,
  });

  const update = useMutation<Row, Error, UpdateVars>({
    mutationFn: async ({ id, patch }) => {
      const endpoint = t.byId?.(id).patch;
      if (!endpoint) throw new Error("This table cannot be changed from here.");
      return (await endpoint(patch)) as Row;
    },
    onMutate: ({ id, patch }, { optimistic }) => {
      optimistic(listKey(table), (rows: Row[] | undefined) =>
        rows?.map((r) => (String(r[pk]) === id ? { ...r, ...patch } : r)),
      );
    },
    invalidates,
  });

  const remove = useMutation<unknown, Error, string>({
    mutationFn: async (id) => {
      const endpoint = t.byId?.(id).delete;
      if (!endpoint) throw new Error("This table cannot be deleted from here.");
      return endpoint();
    },
    onMutate: (id, { optimistic }) => {
      optimistic(listKey(table), (rows: Row[] | undefined) =>
        rows?.filter((r) => String(r[pk]) !== id),
      );
    },
    invalidates,
  });

  return { create, update, remove };
}

/** Settings are keyed by name, not id. */
export function useSettingMutation() {
  return useMutation<unknown, Error, { key: string; value: unknown }>({
    mutationFn: ({ key, value }) => {
      const put = TREES.site_settings.byKey?.(key).put;
      if (!put) throw new Error("Settings cannot be changed from here.");
      return put({ value });
    },
    onMutate: ({ key, value }, { optimistic }) => {
      optimistic(listKey("site_settings"), (rows: Row[] | undefined) => {
        if (!rows) return rows;
        return rows.some((r) => r["key"] === key)
          ? rows.map((r) => (r["key"] === key ? { ...r, value } : r))
          : [...rows, { key, value, updated_at: new Date().toISOString() }];
      });
    },
    invalidates: [listKey("site_settings")],
  });
}

export type RowsOf<T extends TableName> = Tables[T][];
