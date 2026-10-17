import {
  createBrowserFocusManager,
  createBrowserOnlineManager,
  type FocusManager,
  type OnlineManager,
} from "./env.js";
import { hashKey, keyMatchesPrefix, type QueryKey, type TypedKey } from "./key.js";
import { Mutation, MutationCache, type MutationOptions } from "./mutation.js";
import { Query, type ObserverHandle, type QueryHost } from "./query.js";
import type { QueryConfig, QueryFilter, QueryOptions, Updater } from "./types.js";
import { noop } from "./util.js";

/** Defaults applied under every query's own options. */
export type QueryDefaults = Pick<
  QueryConfig<unknown, unknown, unknown>,
  | "staleTime"
  | "gcTime"
  | "enabled"
  | "retry"
  | "retryDelay"
  | "refetchOnMount"
  | "refetchOnWindowFocus"
  | "refetchOnReconnect"
  | "structuralSharing"
>;

export interface QueryClientOptions {
  defaultOptions?: { queries?: QueryDefaults };
  focusManager?: FocusManager;
  onlineManager?: OnlineManager;
  /** Called when an optimistic updater or cache updater throws; the broken patch is skipped. */
  onUpdaterError?: (error: unknown) => void;
}

export interface OptimisticTransaction {
  readonly status: "pending" | "committed" | "rolledBack";
  /** Number of cached queries this transaction patched. */
  readonly size: number;
  /** Undo only this transaction. Other transactions and server data are untouched. */
  readonly rollback: () => void;
  /** Keep this transaction's effect permanently. */
  readonly commit: () => void;
}

const DEFAULT_GC_TIME = 5 * 60 * 1000;

function toFilter(target: QueryKey | QueryFilter | undefined): QueryFilter {
  if (target === undefined) return {};
  return Array.isArray(target) ? { queryKey: target as QueryKey } : (target as QueryFilter);
}

/**
 * Owns one isolated cache. Create one per user/request on the server; never share a client
 * between users. Nothing here is global.
 */
export class QueryClient implements QueryHost {
  readonly mutationCache = new MutationCache();
  readonly defaultGcTime: number;

  readonly #queries = new Map<string, Query>();
  /**
   * Entries bucketed by the primitive first element of their key (`["users", ...]` → `"users"`).
   * A prefix filter that starts with a primitive only has to look at its own bucket, so
   * `invalidate(["users"])` no longer scans every entry. Buckets are a superset filter: every
   * candidate is still checked with the real prefix match, and everything else falls back to a scan.
   */
  readonly #byRoot = new Map<string, Set<Query>>();
  readonly #observers = new Set<ObserverHandle>();
  readonly #defaults: QueryDefaults | undefined;
  readonly #focus: FocusManager;
  readonly #online: OnlineManager;
  readonly #onUpdaterError: ((error: unknown) => void) | undefined;
  #unsubscribeEnv: (() => void)[] = [];
  #clock = 0;
  #txSeq = 0;

  constructor(options: QueryClientOptions = {}) {
    this.#defaults = options.defaultOptions?.queries;
    this.defaultGcTime = this.#defaults?.gcTime ?? DEFAULT_GC_TIME;
    this.#focus = options.focusManager ?? createBrowserFocusManager();
    this.#online = options.onlineManager ?? createBrowserOnlineManager();
    this.#onUpdaterError = options.onUpdaterError;
  }

  // ---- QueryHost ------------------------------------------------------------------------
  isOnline(): boolean {
    return this.#online.isOnline();
  }

  /** @internal */
  subscribeOnline(listener: () => void): () => void {
    return this.#online.subscribe(listener);
  }

  /** @internal */
  tick(): number {
    return ++this.#clock;
  }
  removeQuery(query: { readonly hash: string; destroy(): void }): void {
    const stored = this.#queries.get(query.hash);
    if ((stored as unknown) === query) {
      this.#queries.delete(query.hash);
      if (stored) this.#unindex(stored);
    }
    query.destroy();
  }
  reportUpdaterError(error: unknown): void {
    this.#onUpdaterError?.(error);
  }

  // ---- lookup ---------------------------------------------------------------------------

  /** Merge client defaults under `options`. Returns `options` itself when there are none. */
  resolveOptions<TData, TError, TSelected>(
    options: QueryOptions<TData, TError, TSelected>,
  ): QueryOptions<TData, TError, TSelected> {
    return this.#defaults ? { ...this.#defaults, ...options } : options;
  }

  /** Get or create the entry for `options.queryKey`. */
  buildQuery<TData, TError>(options: {
    queryKey: QueryKey;
    initialData?: unknown;
    initialDataUpdatedAt?: number;
  }): Query<TData, TError> {
    const hash = hashKey(options.queryKey);
    let query = this.#queries.get(hash);
    if (!query) {
      query = new Query(this, options.queryKey, hash);
      this.#queries.set(hash, query);
      this.#index(query);
      const seed = options.initialData;
      if (seed !== undefined) {
        const value = typeof seed === "function" ? (seed as () => unknown)() : seed;
        query.setData(value, { updatedAt: options.initialDataUpdatedAt ?? Date.now() });
      }
    }
    return query as unknown as Query<TData, TError>;
  }

  getQuery<TData = unknown, TError = unknown>(key: QueryKey): Query<TData, TError> | undefined {
    return this.#queries.get(hashKey(key)) as Query<TData, TError> | undefined;
  }

  get size(): number {
    return this.#queries.size;
  }

  findAll(target?: QueryKey | QueryFilter): Query[] {
    const filter = toFilter(target);
    const { queryKey, exact, active, predicate } = filter;
    const out: Query[] = [];
    if (queryKey && exact) {
      const q = this.#queries.get(hashKey(queryKey));
      if (q && this.#matches(q, filter)) out.push(q);
      return out;
    }
    const root = queryKey ? rootOf(queryKey) : undefined;
    const candidates: Iterable<Query> =
      root === undefined ? this.#queries.values() : (this.#byRoot.get(root) ?? []);
    for (const q of candidates) {
      if (queryKey && !keyMatchesPrefix(q.key, queryKey)) continue;
      if (active !== undefined && active !== q.observerCount > 0) continue;
      if (predicate && !predicate(q)) continue;
      out.push(q);
    }
    return out;
  }

  #index(query: Query): void {
    const root = rootOf(query.key);
    if (root === undefined) return;
    let bucket = this.#byRoot.get(root);
    if (!bucket) this.#byRoot.set(root, (bucket = new Set()));
    bucket.add(query);
  }

  #unindex(query: Query): void {
    const root = rootOf(query.key);
    if (root === undefined) return;
    const bucket = this.#byRoot.get(root);
    if (!bucket) return;
    bucket.delete(query);
    if (bucket.size === 0) this.#byRoot.delete(root);
  }

  #matches(q: Query, f: QueryFilter): boolean {
    if (f.active !== undefined && f.active !== q.observerCount > 0) return false;
    return !f.predicate || f.predicate(q);
  }

  // ---- reads & writes -------------------------------------------------------------------

  /** Visible data: confirmed value plus unsettled optimistic patches. */
  getData<TData = unknown>(key: TypedKey<TData> | QueryKey): TData | undefined {
    return this.getQuery<TData>(key)?.state.data;
  }

  /**
   * Write confirmed data (creating the entry if needed). Updater functions receive the
   * confirmed value, not optimistic patches; patches stay layered on top. A fetch that
   * started before this write cannot overwrite it.
   */
  setData<TData>(key: TypedKey<TData> | QueryKey, updater: Updater<TData>): TData | undefined {
    return this.buildQuery<TData, unknown>({ queryKey: key }).setData(updater);
  }

  // ---- fetching -------------------------------------------------------------------------

  /** Resolve with fresh cached data or fetch (deduplicated with any in-flight request). */
  fetchQuery<TData, TError = Error>(options: QueryOptions<TData, TError, unknown>): Promise<TData> {
    const resolved = this.resolveOptions(options);
    const query = this.buildQuery<TData, TError>(resolved);
    const s = query.state;
    const staleTime = resolved.staleTime ?? 0;
    const fresh =
      s.dataUpdatedAt !== 0 && !s.isInvalidated && Date.now() - s.dataUpdatedAt < staleTime;
    if (fresh) return Promise.resolve(s.data as TData);
    return query.fetch(resolved as never);
  }

  /** Like `fetchQuery` but never rejects and returns nothing. */
  async prefetchQuery<TData, TError = Error>(
    options: QueryOptions<TData, TError, unknown>,
  ): Promise<void> {
    await this.fetchQuery(options).then(noop, noop);
  }

  /** Mark matching queries stale; refetch (and await) those that are currently observed. */
  async invalidateQueries(target?: QueryKey | QueryFilter): Promise<void> {
    const matches = this.findAll(target);
    for (const q of matches) q.invalidate();
    await this.#refetch(matches.filter((q) => [...q.observers].some((o) => o.isEnabled())));
  }

  /** Refetch matching queries that have been observed or fetched before (they know their `queryFn`). */
  async refetchQueries(target?: QueryKey | QueryFilter): Promise<void> {
    await this.#refetch(this.findAll(target));
  }

  async #refetch(queries: Query[]): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const q of queries)
      if (q.options)
        pending.push(q.fetch(q.options as never, { cancelRefetch: true }).then(noop, noop));
    await Promise.all(pending);
  }

  cancelQueries(target?: QueryKey | QueryFilter): void {
    for (const q of this.findAll(target)) q.cancel();
  }

  removeQueries(target?: QueryKey | QueryFilter): void {
    for (const q of this.findAll(target)) this.removeQuery(q);
  }

  isFetching(target?: QueryKey | QueryFilter): number {
    return this.findAll(target).filter((q) => q.isFetching).length;
  }

  isMutating(): number {
    return this.mutationCache.size;
  }

  /** Remove every entry. Observers keep working and will re-create entries on next use. */
  clear(): void {
    for (const q of [...this.#queries.values()]) this.removeQuery(q);
  }

  // ---- optimistic updates ---------------------------------------------------------------

  /**
   * Layer `updater` over every matching query that already holds data. Each call is an
   * independent transaction: rolling it back removes exactly its own effect, however many
   * other transactions started or finished in between.
   */
  optimistic<TData>(
    target: QueryKey | QueryFilter,
    updater: (old: TData | undefined) => TData | undefined,
  ): OptimisticTransaction {
    const patched: { query: Query; id: number }[] = [];
    for (const query of this.findAll(target)) {
      if (query.state.dataUpdatedAt === 0) continue;
      patched.push({ query, id: query.addPatch(updater as (old: unknown) => unknown) });
    }
    let status: OptimisticTransaction["status"] = "pending";
    void this.#txSeq++;
    return {
      get status() {
        return status;
      },
      size: patched.length,
      rollback() {
        if (status !== "pending") return;
        status = "rolledBack";
        for (const p of patched) p.query.dropPatch(p.id);
      },
      commit() {
        if (status !== "pending") return;
        status = "committed";
        for (const p of patched) p.query.commitPatch(p.id);
      },
    };
  }

  // ---- mutations ------------------------------------------------------------------------

  mutate<TData, TError = Error, TVariables = void, TContext = unknown>(
    options: MutationOptions<TData, TError, TVariables, TContext>,
    variables: TVariables,
  ): Promise<TData> {
    return new Mutation(this, options).execute(variables);
  }

  // ---- environment ----------------------------------------------------------------------

  /** @internal */
  registerObserver(observer: ObserverHandle): void {
    this.#observers.add(observer);
    if (this.#observers.size === 1 && this.#unsubscribeEnv.length === 0) {
      this.#unsubscribeEnv = [
        this.#focus.subscribe(() => {
          for (const o of [...this.#observers]) o.onFocus();
        }),
        this.#online.subscribe(() => {
          for (const o of [...this.#observers]) o.onReconnect();
        }),
      ];
    }
  }

  /** @internal */
  unregisterObserver(observer: ObserverHandle): void {
    this.#observers.delete(observer);
    if (this.#observers.size === 0) {
      for (const off of this.#unsubscribeEnv) off();
      this.#unsubscribeEnv = [];
    }
  }

  /** Release timers and environment subscriptions and drop all entries. */
  dispose(): void {
    this.clear();
    for (const off of this.#unsubscribeEnv) off();
    this.#unsubscribeEnv = [];
  }
}

/** Bucket token for a key whose first element is a primitive; `undefined` ⇒ not indexable. */
function rootOf(key: QueryKey): string | undefined {
  const first = key[0];
  if (key.length === 0) return undefined;
  if (first === null || ["string", "number", "boolean"].includes(typeof first))
    return hashKey([first]);
  return undefined;
}
