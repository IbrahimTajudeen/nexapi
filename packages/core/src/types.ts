import type { QueryClient } from "./client.js";
import type { QueryKey, TypedKey } from "./key.js";
import type { Query } from "./query.js";

export type QueryStatus = "pending" | "success" | "error";
/** `paused`: a fetch is pending but waiting for the network (see `networkMode`). */
export type FetchStatus = "idle" | "fetching" | "paused";

export type RetryFn<TError> = (failureCount: number, error: TError) => boolean;

export interface QueryFnContext {
  readonly queryKey: QueryKey;
  /** Aborted when the fetch is cancelled. Pass it to the transport. */
  readonly signal: AbortSignal;
  readonly meta: Readonly<Record<string, unknown>> | undefined;
}

/** Everything about a query except what it fetches. This is what `endpoint.options(req, config)` accepts. */
export interface QueryConfig<TData, TError = Error, TSelected = TData> {
  /** ms during which fetched data counts as fresh. Default 0. `Infinity` = never stale. */
  staleTime?: number;
  /** ms an unobserved entry survives before garbage collection. Default 5 min. `Infinity` = keep. */
  gcTime?: number;
  /** `false`/number/predicate. Default: 3 retries for transient failures only. */
  retry?: boolean | number | RetryFn<TError>;
  retryDelay?: number | ((failureCount: number, error: TError) => number);
  /** When false the observer never fetches by itself. Default true. */
  enabled?: boolean;
  /** Derive the observed value. Memoized on (data identity, select identity). */
  select?: (data: TData) => TSelected;
  refetchOnMount?: boolean;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  /** Seed the cache entry when it is first created. Ignored if the entry already exists. */
  initialData?: TData | (() => TData);
  /** When `initialData` was produced (ms epoch). Default: now. Older ⇒ becomes stale sooner. */
  initialDataUpdatedAt?: number;
  /**
   * Shown as `data` while the entry has no data yet (`status: "pending"`). Never written to the
   * cache; the result reports `isPlaceholder: true` and `status: "success"`. A function receives
   * the data of the previously observed query (raw, before `select`), so `keepPreviousData` keeps
   * the old page visible across key changes. Return a stable value: a new object per call
   * produces a new result on every notification.
   */
  placeholderData?: TData | ((previousData: TData | undefined) => TData | undefined);
  /**
   * `"online"` (default): while the environment reports offline, a fetch (and each retry) waits
   * with `fetchStatus: "paused"` and resumes on reconnect instead of failing. `"always"` never waits.
   */
  networkMode?: "online" | "always";
  /** Poll while observed and enabled, every N ms. `false`/undefined disables. */
  refetchInterval?: number | false;
  /** Reuse unchanged subtrees of fetched data (deep compare; off by default). */
  structuralSharing?: boolean;
  /** Only notify listeners when one of these result fields changes. Default: all fields. */
  notifyOn?: readonly (keyof QueryResult<unknown, unknown>)[];
  meta?: Readonly<Record<string, unknown>>;
}

export interface QueryOptions<TData, TError = Error, TSelected = TData> extends QueryConfig<
  TData,
  TError,
  TSelected
> {
  queryKey: TypedKey<TData>;
  queryFn: (context: QueryFnContext) => Promise<TData>;
  /** Bind to a specific client (endpoint options do this). Otherwise a provider supplies one. */
  queryClient?: QueryClient;
}

export interface QueryState<TData = unknown, TError = unknown> {
  /** Confirmed data with unsettled optimistic patches applied on top. */
  readonly data: TData | undefined;
  readonly error: TError | null;
  readonly status: QueryStatus;
  readonly fetchStatus: FetchStatus;
  /** 0 until data has been written. */
  readonly dataUpdatedAt: number;
  readonly errorUpdatedAt: number;
  /** Failed attempts in the current (or last) fetch. */
  readonly failureCount: number;
  readonly isInvalidated: boolean;
}

export interface QueryResult<TData, TError> {
  readonly data: TData | undefined;
  readonly error: TError | null;
  readonly status: QueryStatus;
  readonly fetchStatus: FetchStatus;
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly isFetching: boolean;
  /** A fetch is waiting for the network to come back. */
  readonly isPaused: boolean;
  /** First load: pending *and* fetching. */
  readonly isLoading: boolean;
  readonly isStale: boolean;
  /** `data` comes from `placeholderData`, not from the cache. */
  readonly isPlaceholder: boolean;
  readonly isInvalidated: boolean;
  readonly dataUpdatedAt: number;
  readonly errorUpdatedAt: number;
  readonly failureCount: number;
  refetch: () => Promise<void>;
}

export interface QueryFilter {
  /** Prefix match by default; see `exact`. */
  queryKey?: QueryKey;
  exact?: boolean;
  /** true: only observed queries; false: only unobserved. */
  active?: boolean;
  predicate?: (query: Query) => boolean;
}

export type Updater<T> = T | ((old: T | undefined) => T | undefined);

/** `placeholderData` helper: keep showing the previous query's data while a new key loads. */
export const keepPreviousData = <T>(previousData: T | undefined): T | undefined => previousData;
