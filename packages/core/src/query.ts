import { CancelledError } from "./errors.js";
import { hashKey, type QueryKey } from "./key.js";
import type { QueryOptions, QueryState } from "./types.js";
import {
  defaultQueryRetry,
  defaultRetryDelay,
  raceAbort,
  replaceEqualDeep,
  setUnrefTimeout,
  sleep,
} from "./util.js";

/** What a Query needs from its owner. Implemented by `QueryClient`. */
export interface QueryHost {
  /** Monotonic logical clock used to order fetch starts against optimistic commits. */
  tick(): number;
  isOnline(): boolean;
  subscribeOnline(listener: () => void): () => void;
  readonly defaultGcTime: number;
  removeQuery(query: { readonly hash: string; destroy(): void }): void;
  reportUpdaterError(error: unknown): void;
}

/** The slice of an observer that the cache and client talk to (keeps generics out of registries). */
export interface ObserverHandle {
  onQueryUpdate(): void;
  onFocus(): void;
  onReconnect(): void;
  isEnabled(): boolean;
}

type AnyOptions = QueryOptions<unknown, unknown, unknown>;

interface FetchRun {
  readonly controller: AbortController;
  readonly startTick: number;
  readonly writeStamp: number;
  /** Non-observer callers (fetchQuery/prefetch/refetch) awaiting this run. */
  imperative: number;
  promise: Promise<unknown>;
  supersededBy: FetchRun | undefined;
}

interface Patch {
  readonly id: number;
  readonly updater: (old: unknown) => unknown;
  committedTick: number | undefined;
}

export interface FetchMode {
  /** Called by an observer on its own behalf (does not count as an imperative consumer). */
  observer?: boolean;
  /** Abort a fetch already in flight and start over; its awaiting callers follow the new run. */
  cancelRefetch?: boolean;
  /**
   * Run this function for this one fetch instead of `options.queryFn`, without replacing the
   * query's stored options (used by `fetchNextPage`, so later refetches keep using the real fn).
   */
  queryFn?: AnyOptions["queryFn"];
}

let patchSeq = 0;

/**
 * One cache entry. Lifecycle (all transitions go through `#set`):
 *
 *   pending/idle ──fetch──▶ pending/fetching ──ok──▶ success/idle
 *                                  │                     │ ▲
 *                                  └────error───▶ error/idle (data kept if any)
 *   success|error/idle ──fetch──▶ same status/fetching (background refetch)
 *   fetching ──cancel──▶ previous status/idle (no state loss)
 *   any ──setData──▶ success/idle-or-fetching, invalidated=false
 *
 * Data model: `#base` is the last confirmed value (server response or manual write).
 * Optimistic patches are pure functions layered over it, so removing one (rollback)
 * never disturbs another, and a server response never erases a still-pending patch.
 */
export class Query<TData = unknown, TError = unknown> {
  readonly key: QueryKey;
  readonly hash: string;
  state: QueryState<TData, TError>;
  readonly observers = new Set<ObserverHandle>();
  options: AnyOptions | undefined;

  readonly #host: QueryHost;
  #base: TData | undefined;
  #patches: Patch[] = [];
  #run: FetchRun | undefined;
  #writeStamp = 0;
  #gcTime: number;
  #gcTimeExplicit = false;
  #gcTimer: ReturnType<typeof setTimeout> | undefined;
  #destroyed = false;

  constructor(host: QueryHost, key: QueryKey, hash?: string) {
    this.#host = host;
    this.key = key;
    this.hash = hash ?? hashKey(key);
    this.#gcTime = host.defaultGcTime;
    this.state = {
      data: undefined,
      error: null,
      status: "pending",
      fetchStatus: "idle",
      dataUpdatedAt: 0,
      errorUpdatedAt: 0,
      failureCount: 0,
      isInvalidated: false,
    };
    this.#scheduleGc();
  }

  get isFetching(): boolean {
    return this.#run !== undefined;
  }
  get observerCount(): number {
    return this.observers.size;
  }
  /** Confirmed data without optimistic patches (what dehydration must serialize). */
  get confirmedData(): TData | undefined {
    return this.#base;
  }
  get hasPatches(): boolean {
    return this.#patches.length > 0;
  }

  setOptions(options: AnyOptions): void {
    this.options = options;
    const gcTime = options.gcTime;
    if (gcTime !== undefined) {
      const next = this.#gcTimeExplicit ? Math.max(this.#gcTime, gcTime) : gcTime;
      this.#gcTimeExplicit = true;
      if (next !== this.#gcTime) {
        this.#gcTime = next;
        if (this.#gcTimer !== undefined) this.#scheduleGc(); // re-arm with the new duration
      }
    }
  }

  // ---- observers & garbage collection -------------------------------------------------

  addObserver(observer: ObserverHandle): void {
    this.observers.add(observer);
    this.#clearGc();
  }

  removeObserver(observer: ObserverHandle): void {
    if (!this.observers.delete(observer)) return;
    if (this.observers.size === 0) {
      // Deferred a microtask so React Strict Mode's unmount→remount (same tick) doesn't abort.
      queueMicrotask(() => this.#abortIfUnwanted());
      this.#scheduleGc();
    }
  }

  #abortIfUnwanted(): void {
    const run = this.#run;
    if (!run || this.observers.size > 0 || run.imperative > 0) return;
    this.cancel();
  }

  #clearGc(): void {
    if (this.#gcTimer !== undefined) clearTimeout(this.#gcTimer);
    this.#gcTimer = undefined;
  }

  #scheduleGc(): void {
    this.#clearGc();
    if (this.#destroyed || this.observers.size > 0 || !Number.isFinite(this.#gcTime)) return;
    this.#gcTimer = setUnrefTimeout(() => {
      this.#gcTimer = undefined;
      // Never collect observed or in-flight queries; re-armed when the fetch settles.
      if (this.observers.size === 0 && this.#run === undefined) this.#host.removeQuery(this);
    }, this.#gcTime);
  }

  /** Called by the owner when removing the entry. Stops timers and aborts work. */
  destroy(): void {
    this.#destroyed = true;
    this.#clearGc();
    this.cancel();
  }

  // ---- state --------------------------------------------------------------------------

  #set(patch: Partial<QueryState<TData, TError>>): void {
    this.state = { ...this.state, ...patch };
    for (const observer of [...this.observers]) observer.onQueryUpdate();
  }

  #visible(): TData | undefined {
    let value: unknown = this.#base;
    for (const patch of this.#patches) {
      try {
        const next = patch.updater(value);
        if (next !== undefined) value = next;
      } catch (error) {
        this.#host.reportUpdaterError(error); // skip the broken patch, keep the cache usable
      }
    }
    return value as TData | undefined;
  }

  #foldLeadingCommitted(): void {
    while (this.#patches[0]?.committedTick !== undefined) {
      const patch = this.#patches.shift();
      if (!patch) break;
      try {
        const next = patch.updater(this.#base);
        if (next !== undefined) this.#base = next as TData;
      } catch (error) {
        this.#host.reportUpdaterError(error);
      }
    }
  }

  // ---- fetching -----------------------------------------------------------------------

  fetch(options: AnyOptions, mode: FetchMode = {}): Promise<TData> {
    if (!mode.queryFn) this.setOptions(options);
    const existing = this.#run;
    if (existing && !mode.cancelRefetch) {
      if (!mode.observer) existing.imperative++;
      return existing.promise as Promise<TData>;
    }

    const run: FetchRun = {
      controller: new AbortController(),
      startTick: this.#host.tick(),
      writeStamp: this.#writeStamp,
      imperative: (existing?.imperative ?? 0) + (mode.observer ? 0 : 1),
      promise: Promise.resolve(),
      supersededBy: undefined,
    };
    if (existing) {
      existing.supersededBy = run;
      existing.controller.abort();
    }
    this.#run = run;
    this.#clearGc();

    const effective = mode.queryFn ? { ...options, queryFn: mode.queryFn } : options;
    this.#set({ fetchStatus: "fetching", failureCount: 0 });
    run.promise = this.#execute(run, effective).then(
      (data) => this.#onSuccess(run, options, data),
      (error: unknown) => this.#onError(run, error),
    );
    return run.promise as Promise<TData>;
  }

  async #execute(run: FetchRun, options: AnyOptions): Promise<unknown> {
    let failures = 0;
    for (;;) {
      // Only yield when actually offline: online fetches call `queryFn` synchronously.
      if (options.networkMode !== "always" && !this.#host.isOnline())
        await this.#waitForNetwork(run, options);
      if (run.controller.signal.aborted) {
        if (run.supersededBy) return run.supersededBy.promise;
        throw new CancelledError();
      }
      try {
        return await raceAbort(
          options.queryFn({
            queryKey: this.key,
            signal: run.controller.signal,
            meta: options.meta,
          }),
          run.controller.signal,
        );
      } catch (error) {
        if (run.controller.signal.aborted) {
          if (run.supersededBy) return run.supersededBy.promise; // follow the replacement
          throw new CancelledError();
        }
        const retry = options.retry;
        const again =
          retry === undefined
            ? defaultQueryRetry(failures, error)
            : typeof retry === "boolean"
              ? retry
              : typeof retry === "number"
                ? failures < retry
                : retry(failures, error);
        failures++;
        if (!again) throw error;
        if (this.#run === run) this.#set({ failureCount: failures });
        const delay =
          typeof options.retryDelay === "function"
            ? options.retryDelay(failures - 1, error)
            : (options.retryDelay ?? defaultRetryDelay(failures - 1));
        await sleep(delay, run.controller.signal);
        if (run.controller.signal.aborted) {
          if (run.supersededBy) return run.supersededBy.promise;
          throw new CancelledError();
        }
      }
    }
  }

  /** Hold the attempt while offline (`networkMode: "online"`). Returns on reconnect or abort. */
  async #waitForNetwork(run: FetchRun, options: AnyOptions): Promise<void> {
    if (options.networkMode === "always" || this.#host.isOnline()) return;
    const signal = run.controller.signal;
    if (this.#run === run) this.#set({ fetchStatus: "paused" });
    while (!this.#host.isOnline() && !signal.aborted) {
      await new Promise<void>((resolve) => {
        const done = (): void => {
          off();
          signal.removeEventListener("abort", done);
          resolve();
        };
        const off = this.#host.subscribeOnline(done);
        signal.addEventListener("abort", done, { once: true });
      });
    }
    if (!signal.aborted && this.#run === run) this.#set({ fetchStatus: "fetching" });
  }

  #onSuccess(run: FetchRun, options: AnyOptions, data: unknown): TData {
    if (this.#run !== run) return data as TData; // superseded: `data` already came from the newer run
    this.#run = undefined;
    if (run.writeStamp !== this.#writeStamp) {
      // A manual write landed while this request was in flight: the write is newer than the
      // request, so the response must not overwrite it.
      this.#set({ fetchStatus: "idle" });
      this.#scheduleGc();
      return this.state.data as TData;
    }
    const next = options.structuralSharing ? replaceEqualDeep(this.#base, data) : data;
    this.#base = next as TData;
    // The server saw every mutation committed before this request started.
    this.#patches = this.#patches.filter(
      (p) => p.committedTick === undefined || p.committedTick >= run.startTick,
    );
    this.#foldLeadingCommitted();
    this.#set({
      data: this.#visible(),
      error: null,
      status: "success",
      fetchStatus: "idle",
      dataUpdatedAt: Date.now(),
      failureCount: 0,
      isInvalidated: false,
    });
    this.#scheduleGc();
    return this.state.data as TData;
  }

  #onError(run: FetchRun, error: unknown): never {
    if (this.#run === run) {
      this.#run = undefined;
      this.#set({
        error: error as TError,
        status: "error", // previously successful data is deliberately kept
        fetchStatus: "idle",
        // "may be outdated" means nothing without data; a first load that failed is simply failed
        isInvalidated: this.state.data === undefined ? false : this.state.isInvalidated,
        errorUpdatedAt: Date.now(),
        failureCount: this.state.failureCount + 1,
      });
      this.#scheduleGc();
    }
    throw error;
  }

  /** Abort the in-flight fetch and restore `fetchStatus: idle`. Awaiting callers get `CancelledError`. */
  cancel(): void {
    const run = this.#run;
    if (!run) return;
    this.#run = undefined;
    run.controller.abort();
    this.#set({ fetchStatus: "idle" });
    this.#scheduleGc();
  }

  invalidate(): void {
    if (!this.state.isInvalidated) this.#set({ isInvalidated: true });
  }

  // ---- manual writes & optimistic patches -------------------------------------------------

  /**
   * Replace the confirmed value. The updater receives the confirmed (non-optimistic) value;
   * unsettled optimistic patches stay layered on top. Returning `undefined` is a no-op.
   */
  setData(
    updater: TData | ((old: TData | undefined) => TData | undefined),
    options: { updatedAt?: number } = {},
  ): TData | undefined {
    const next =
      typeof updater === "function"
        ? (updater as (old: TData | undefined) => TData | undefined)(this.#base)
        : updater;
    if (next === undefined) return this.state.data;
    this.#base = next;
    this.#writeStamp++;
    this.#set({
      data: this.#visible(),
      error: null,
      status: "success",
      dataUpdatedAt: options.updatedAt ?? Date.now(),
      isInvalidated: false,
    });
    this.#scheduleGc();
    return this.state.data;
  }

  /** Layer a pure updater over the confirmed data. Returns the patch id. */
  addPatch(updater: (old: unknown) => unknown): number {
    const patch: Patch = { id: ++patchSeq, updater, committedTick: undefined };
    this.#patches.push(patch);
    this.#set({ data: this.#visible() });
    return patch.id;
  }

  /** Remove one patch (rollback). Other patches and the confirmed data are untouched. */
  dropPatch(id: number): void {
    const before = this.#patches.length;
    this.#patches = this.#patches.filter((p) => p.id !== id);
    if (this.#patches.length === before) return;
    this.#foldLeadingCommitted(); // a committed patch may have been waiting on the one just removed
    this.#set({ data: this.#visible() });
  }

  /** Keep a patch's effect permanently. Folded into the confirmed data once it is the oldest. */
  commitPatch(id: number): void {
    const patch = this.#patches.find((p) => p.id === id);
    if (!patch) return;
    patch.committedTick = this.#host.tick();
    this.#foldLeadingCommitted();
    this.#set({ data: this.#visible() });
  }

  /** Drop everything and return to the initial state. */
  reset(): void {
    this.cancel();
    this.#base = undefined;
    this.#patches = [];
    this.#writeStamp++;
    this.#set({
      data: undefined,
      error: null,
      status: "pending",
      fetchStatus: "idle",
      dataUpdatedAt: 0,
      errorUpdatedAt: 0,
      failureCount: 0,
      isInvalidated: false,
    });
  }
}
