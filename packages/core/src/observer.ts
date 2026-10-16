import type { QueryClient } from "./client.js";
import type { Query } from "./query.js";
import type { QueryOptions, QueryResult, QueryState } from "./types.js";
import { noop, setUnrefTimeout } from "./util.js";

type Listener = () => void;

const RESULT_FIELDS = [
  "data",
  "error",
  "status",
  "fetchStatus",
  "isStale",
  "isPlaceholder",
  "isInvalidated",
  "dataUpdatedAt",
  "errorUpdatedAt",
  "failureCount",
] as const;

/**
 * Binds one consumer (a React hook, a vanilla subscriber) to one query. Observers hold no
 * data of their own: they derive a memoized `QueryResult` from the cache entry, so there is a
 * single source of truth and results keep a stable identity until something observable changes.
 */
export class QueryObserver<TData = unknown, TError = Error, TSelected = TData> {
  readonly #client: QueryClient;
  #options: QueryOptions<TData, TError, TSelected>;
  #query: Query<TData, TError>;
  #result: QueryResult<TSelected, TError>;
  readonly #listeners = new Set<Listener>();
  #staleTimer: ReturnType<typeof setTimeout> | undefined;
  #intervalTimer: ReturnType<typeof setInterval> | undefined;
  #previousData: TData | undefined;
  #selected: { data: TData; fn: (d: TData) => TSelected; value: TSelected } | undefined;
  readonly #refetch = (): Promise<void> => this.refetch();

  constructor(client: QueryClient, options: QueryOptions<TData, TError, TSelected>) {
    this.#client = client;
    this.#options = client.resolveOptions(options);
    this.#query = client.buildQuery<TData, TError>(this.#options);
    this.#result = this.#build(this.#query, this.#options, undefined, true);
  }

  get query(): Query<TData, TError> {
    return this.#query;
  }

  isEnabled(): boolean {
    return this.#options.enabled !== false;
  }

  /** The last notified result. Referentially stable between changes (safe for useSyncExternalStore). */
  getResult(): QueryResult<TSelected, TError> {
    return this.#result;
  }

  /**
   * Result for `options` *right now*, before the observer has switched to them (render phase).
   * Reports `fetching` for a query that is about to fetch on mount, avoiding an idle flash.
   */
  getOptimisticResult(
    options: QueryOptions<TData, TError, TSelected>,
  ): QueryResult<TSelected, TError> {
    const resolved = this.#client.resolveOptions(options);
    const query = this.#client.buildQuery<TData, TError>(resolved);
    const same = query === this.#query;
    // Only a query that is about to be mounted (first render, or a key switch) is *about to* fetch.
    // An already-subscribed observer on the same query reports the cache's real fetch status.
    const aboutToMount = !same || this.#listeners.size === 0;
    return this.#build(query, resolved, same ? this.#result : undefined, aboutToMount);
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) this.#attach();
    return () => {
      if (this.#listeners.delete(listener) && this.#listeners.size === 0) this.#detach();
    };
  }

  setOptions(options: QueryOptions<TData, TError, TSelected>): void {
    const resolved = this.#client.resolveOptions(options);
    const previous = this.#options;
    const next = this.#client.buildQuery<TData, TError>(resolved);
    const switched = next !== this.#query;
    const listening = this.#listeners.size > 0;
    this.#options = resolved;
    if (switched) {
      if (listening) {
        this.#query.removeObserver(this);
        next.addObserver(this);
      }
      this.#query = next;
    }
    next.setOptions(resolved as never);
    this.#update(listening);
    if (listening) this.#scheduleInterval();
    if (!listening) return;
    const enabledNow = resolved.enabled !== false;
    if (enabledNow && (switched || previous.enabled === false) && this.#wantsFetch())
      this.#fetch(false);
  }

  /** Force a refetch of this observer's query (cancels a request already in flight). */
  async refetch(): Promise<void> {
    await this.#query
      .fetch(this.#options as never, { observer: true, cancelRefetch: true })
      .catch(noop);
  }

  // ---- called by Query / QueryClient --------------------------------------------------

  onQueryUpdate(): void {
    this.#update(true);
  }

  onFocus(): void {
    if (
      this.#options.refetchOnWindowFocus !== false &&
      this.#options.enabled !== false &&
      this.#wantsFetch()
    )
      this.#fetch(false);
  }

  onReconnect(): void {
    if (
      this.#options.refetchOnReconnect !== false &&
      this.#options.enabled !== false &&
      this.#wantsFetch()
    )
      this.#fetch(false);
  }

  // ---- internals ----------------------------------------------------------------------

  #attach(): void {
    this.#query.addObserver(this);
    this.#query.setOptions(this.#options as never);
    this.#client.registerObserver(this);
    this.#update(false); // the cache may have moved on since render; useSyncExternalStore re-checks
    this.#scheduleInterval();
    if (
      this.#options.enabled !== false &&
      this.#options.refetchOnMount !== false &&
      this.#wantsFetch()
    )
      this.#fetch(false);
  }

  #detach(): void {
    if (this.#staleTimer !== undefined) clearTimeout(this.#staleTimer);
    this.#staleTimer = undefined;
    this.#clearInterval();
    this.#query.removeObserver(this);
    this.#client.unregisterObserver(this);
  }

  #isStale(
    state: QueryState<TData, TError>,
    options: QueryOptions<TData, TError, TSelected>,
  ): boolean {
    if (state.dataUpdatedAt === 0 || state.isInvalidated) return true;
    return Date.now() - state.dataUpdatedAt >= (options.staleTime ?? 0);
  }

  #wantsFetch(): boolean {
    return this.#isStale(this.#query.state, this.#options) && !this.#query.isFetching;
  }

  #fetch(cancelRefetch: boolean): void {
    this.#query.fetch(this.#options as never, { observer: true, cancelRefetch }).catch(noop);
  }

  #update(notify: boolean): void {
    const next = this.#build(this.#query, this.#options, this.#result, false);
    if (next !== this.#result) {
      this.#result = next;
      if (notify) for (const l of [...this.#listeners]) l();
    }
    this.#scheduleStale();
  }

  #clearInterval(): void {
    if (this.#intervalTimer !== undefined) clearInterval(this.#intervalTimer);
    this.#intervalTimer = undefined;
  }

  #scheduleInterval(): void {
    this.#clearInterval();
    const ms = this.#options.refetchInterval;
    if (!ms || ms <= 0 || !Number.isFinite(ms) || this.#options.enabled === false) return;
    this.#intervalTimer = setInterval(() => {
      if (!this.#query.isFetching) this.#fetch(false);
    }, ms);
    if (typeof this.#intervalTimer === "object" && "unref" in this.#intervalTimer)
      this.#intervalTimer.unref();
  }

  #scheduleStale(): void {
    if (this.#staleTimer !== undefined) clearTimeout(this.#staleTimer);
    this.#staleTimer = undefined;
    if (this.#listeners.size === 0) return;
    const state = this.#query.state;
    const staleTime = this.#options.staleTime ?? 0;
    if (
      state.dataUpdatedAt === 0 ||
      state.isInvalidated ||
      !Number.isFinite(staleTime) ||
      staleTime <= 0
    )
      return;
    const remaining = state.dataUpdatedAt + staleTime - Date.now();
    if (remaining <= 0) return;
    this.#staleTimer = setUnrefTimeout(() => this.#update(true), remaining + 1);
  }

  #build(
    query: Query<TData, TError>,
    options: QueryOptions<TData, TError, TSelected>,
    previous: QueryResult<TSelected, TError> | undefined,
    optimistic: boolean,
  ): QueryResult<TSelected, TError> {
    const s = query.state;
    if (query === this.#query && s.data !== undefined) this.#previousData = s.data;
    let raw = s.data;
    let isPlaceholder = false;
    let error = s.error;
    let status = s.status;
    if (raw === undefined && status === "pending" && options.placeholderData !== undefined) {
      const given = options.placeholderData;
      const value =
        typeof given === "function"
          ? (given as (previous: TData | undefined) => TData | undefined)(this.#previousData)
          : given;
      if (value !== undefined) {
        raw = value;
        isPlaceholder = true;
        status = "success";
      }
    }
    let data = raw as unknown as TSelected | undefined;
    const select = options.select;
    if (select && raw !== undefined) {
      const cached = this.#selected;
      if (cached && cached.data === raw && cached.fn === select) data = cached.value;
      else {
        try {
          const value = select(raw);
          this.#selected = { data: raw, fn: select, value };
          data = value;
        } catch (e) {
          data = undefined;
          error = e as TError;
          status = "error";
        }
      }
    }
    let fetchStatus = s.fetchStatus;
    const isStale = this.#isStale(s, options);
    if (
      optimistic &&
      fetchStatus === "idle" &&
      options.enabled !== false &&
      options.refetchOnMount !== false &&
      isStale
    )
      fetchStatus =
        options.networkMode !== "always" && !this.#client.isOnline() ? "paused" : "fetching";

    const next: QueryResult<TSelected, TError> = {
      data,
      error,
      status,
      fetchStatus,
      isPending: status === "pending",
      isSuccess: status === "success",
      isError: status === "error",
      isFetching: fetchStatus === "fetching",
      isPaused: fetchStatus === "paused",
      isLoading: status === "pending" && fetchStatus === "fetching",
      isStale,
      isPlaceholder,
      isInvalidated: s.isInvalidated,
      dataUpdatedAt: s.dataUpdatedAt,
      errorUpdatedAt: s.errorUpdatedAt,
      failureCount: s.failureCount,
      refetch: this.#refetch,
    };
    if (!previous) return next;
    const fields = options.notifyOn ?? RESULT_FIELDS;
    for (const field of fields) {
      if (field === "refetch") continue;
      if (!Object.is(previous[field], next[field])) return next;
    }
    return previous;
  }
}
