import type { Query, QueryClient } from "@nexapi/core";

export interface QueryInfo {
  readonly hash: string;
  readonly key: readonly unknown[];
  readonly status: "pending" | "success" | "error";
  readonly fetchStatus: "idle" | "fetching" | "paused";
  readonly observers: number;
  readonly isInvalidated: boolean;
  readonly hasData: boolean;
  /** 0 until data has been written. */
  readonly dataUpdatedAt: number;
  readonly errorUpdatedAt: number;
  readonly failureCount: number;
  /** `name` and `message` of the last error. Messages from the HTTP runtime never contain credentials. */
  readonly error: { readonly name: string; readonly message: string } | null;
}

export interface MutationInfo {
  readonly status: "idle" | "pending" | "success" | "error";
  readonly failureCount: number;
  readonly submittedAt: number;
}

export interface InspectorEvent {
  readonly id: number;
  readonly at: number;
  readonly type:
    | "added"
    | "removed"
    | "fetch-start"
    | "fetch-paused"
    | "success"
    | "error"
    | "invalidated"
    | "observers";
  readonly hash: string;
  readonly key: readonly unknown[];
}

export interface InspectorSnapshot {
  /** Sorted by key hash, so the order is stable between snapshots. */
  readonly queries: readonly QueryInfo[];
  readonly mutations: readonly MutationInfo[];
  /** Oldest first, at most `maxEvents`. */
  readonly events: readonly InspectorEvent[];
}

export interface InspectorOptions {
  /** Events kept for the log. Default 200. */
  maxEvents?: number;
  /**
   * Decide what `inspectData` may reveal. Receives the entry's key and data and returns what to
   * show; the default returns everything. Use it to hide fields (tokens, personal data).
   */
  redact?: (key: readonly unknown[], data: unknown) => unknown;
}

export interface Inspector {
  /** Referentially stable until something observable changes (safe for `useSyncExternalStore`). */
  readonly snapshot: () => InspectorSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * The cached data of one entry, passed through `redact`. Never part of `snapshot()`: data can
   * be large and sensitive, so it is only read when you ask for it.
   */
  inspectData(hash: string): unknown;
  refetch(hash: string): Promise<void>;
  invalidate(hash: string): Promise<void>;
  remove(hash: string): void;
  /** Stop listening to the client. */
  dispose(): void;
}

interface Seen {
  fetchStatus: QueryInfo["fetchStatus"];
  dataUpdatedAt: number;
  errorUpdatedAt: number;
  isInvalidated: boolean;
  observers: number;
}

function describeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: typeof error === "string" ? error : "non-Error value" };
}

function infoOf(query: Query): QueryInfo {
  const s = query.state;
  return {
    hash: query.hash,
    key: query.key,
    status: s.status,
    fetchStatus: s.fetchStatus,
    observers: query.observerCount,
    isInvalidated: s.isInvalidated,
    hasData: s.data !== undefined,
    dataUpdatedAt: s.dataUpdatedAt,
    errorUpdatedAt: s.errorUpdatedAt,
    failureCount: s.failureCount,
    error: s.error === null ? null : describeError(s.error),
  };
}

/**
 * Read-only view of a `QueryClient`'s cache for diagnostics. It watches `subscribeCache`, keeps a
 * bounded event log, and offers refetch/invalidate/remove. It holds no data of its own and adds
 * no cost to the cache unless created.
 */
export function createInspector(client: QueryClient, options: InspectorOptions = {}): Inspector {
  const maxEvents = Math.max(1, options.maxEvents ?? 200);
  const listeners = new Set<() => void>();
  const seen = new Map<string, Seen>();
  const events: InspectorEvent[] = [];
  let nextId = 1;
  let cached: InspectorSnapshot | undefined;
  let scheduled = false;

  const push = (type: InspectorEvent["type"], query: Query): void => {
    events.push({ id: nextId++, at: Date.now(), type, hash: query.hash, key: query.key });
    if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
  };

  const notify = (): void => {
    cached = undefined;
    if (scheduled || listeners.size === 0) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      for (const l of [...listeners]) l();
    });
  };

  const record = (query: Query): void => {
    const s = query.state;
    const prev = seen.get(query.hash);
    const next: Seen = {
      fetchStatus: s.fetchStatus,
      dataUpdatedAt: s.dataUpdatedAt,
      errorUpdatedAt: s.errorUpdatedAt,
      isInvalidated: s.isInvalidated,
      observers: query.observerCount,
    };
    seen.set(query.hash, next);
    if (!prev) return;
    if (prev.fetchStatus !== next.fetchStatus) {
      if (next.fetchStatus === "fetching") push("fetch-start", query);
      else if (next.fetchStatus === "paused") push("fetch-paused", query);
    }
    if (next.dataUpdatedAt !== prev.dataUpdatedAt) push("success", query);
    if (next.errorUpdatedAt !== prev.errorUpdatedAt) push("error", query);
    if (next.isInvalidated && !prev.isInvalidated) push("invalidated", query);
    if (next.observers !== prev.observers) push("observers", query);
  };

  for (const query of client.findAll()) record(query);
  const off = client.subscribeCache(({ type, query }) => {
    if (type === "removed") {
      seen.delete(query.hash);
      push("removed", query);
    } else if (type === "added") {
      record(query);
      push("added", query);
    } else record(query);
    notify();
  });

  const find = (hash: string): Query | undefined =>
    client.findAll().find((query) => query.hash === hash);

  return {
    snapshot() {
      cached ??= {
        queries: client
          .findAll()
          .map(infoOf)
          .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0)),
        mutations: client.mutationCache.getAll().map((m) => ({
          status: m.state.status,
          failureCount: m.state.failureCount,
          submittedAt: m.state.submittedAt,
        })),
        events: [...events],
      };
      return cached;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    inspectData(hash) {
      const query = find(hash);
      if (!query || query.state.data === undefined) return undefined;
      return options.redact ? options.redact(query.key, query.state.data) : query.state.data;
    },
    async refetch(hash) {
      const query = find(hash);
      if (query) await client.refetchQueries({ queryKey: query.key, exact: true });
    },
    async invalidate(hash) {
      const query = find(hash);
      if (query) await client.invalidateQueries({ queryKey: query.key, exact: true });
    },
    remove(hash) {
      const query = find(hash);
      if (query) client.removeQuery(query);
    },
    dispose() {
      off();
      listeners.clear();
    },
  };
}
