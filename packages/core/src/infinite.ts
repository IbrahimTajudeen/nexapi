import type { QueryClient } from "./client.js";
import type { QueryKey } from "./key.js";
import { QueryObserver } from "./observer.js";
import type { QueryConfig, QueryOptions, QueryResult } from "./types.js";
import { noop } from "./util.js";

export interface InfiniteData<TPage, TParam> {
  readonly pages: readonly TPage[];
  readonly pageParams: readonly TParam[];
}

export interface InfiniteQueryOptions<
  TPage,
  TError = Error,
  TParam = unknown,
  TSelected = InfiniteData<TPage, TParam>,
> extends Omit<QueryConfig<InfiniteData<TPage, TParam>, TError, TSelected>, "structuralSharing"> {
  queryKey: QueryKey;
  queryFn: (context: {
    queryKey: QueryKey;
    signal: AbortSignal;
    pageParam: TParam;
  }) => Promise<TPage>;
  /** Parameter of the first page. */
  initialPageParam: TParam;
  /** Return the next page's parameter, or `undefined`/`null` when there is none. */
  getNextPageParam: (
    lastPage: TPage,
    allPages: readonly TPage[],
    lastPageParam: TParam,
    allPageParams: readonly TParam[],
  ) => TParam | undefined | null;
  /**
   * Parameter of the page *before* the first loaded one, or `undefined`/`null` when there is none.
   * Enables `fetchPreviousPage` / `hasPreviousPage`.
   */
  getPreviousPageParam?: (
    firstPage: TPage,
    allPages: readonly TPage[],
    firstPageParam: TParam,
    allPageParams: readonly TParam[],
  ) => TParam | undefined | null;
  /**
   * Keep at most this many pages (integer ≥ 1). Loading a page at one end drops the page at the
   * other end; a refetch re-requests only the pages still held, starting from the first one held.
   */
  maxPages?: number;
  queryClient?: QueryClient;
}

export interface InfiniteQueryResult<TData, TError> extends QueryResult<TData, TError> {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** Always `false` unless `getPreviousPageParam` is given. */
  readonly hasPreviousPage: boolean;
  readonly isFetchingPreviousPage: boolean;
  /** Loads the next page and appends it. No-op when there is none. Joins a fetch already in flight. */
  fetchNextPage: () => Promise<void>;
  /** Loads the page before the first one and prepends it. No-op when there is none. */
  fetchPreviousPage: () => Promise<void>;
}

/**
 * Infinite pagination on top of an ordinary query entry whose data is `{ pages, pageParams }`.
 * Refetching (focus, invalidation, polling) re-requests every loaded page in order, so the list
 * never mixes pages from different moments; `fetchNextPage` appends exactly one page.
 */
export class InfiniteQueryObserver<
  TPage,
  TError = Error,
  TParam = unknown,
  TSelected = InfiniteData<TPage, TParam>,
> {
  readonly #client: QueryClient;
  #options: InfiniteQueryOptions<TPage, TError, TParam, TSelected>;
  #inner: QueryObserver<InfiniteData<TPage, TParam>, TError, TSelected>;
  #fetchingNext = false;
  #fetchingPrevious = false;
  #inFlightPage: Promise<void> | undefined;
  readonly #listeners = new Set<() => void>();
  #unsubscribeInner: (() => void) | undefined;
  #result: InfiniteQueryResult<TSelected, TError>;
  #lastInner: QueryResult<TSelected, TError> | undefined;
  readonly #fetchNextPage = (): Promise<void> => this.fetchNextPage();
  readonly #fetchPreviousPage = (): Promise<void> => this.fetchPreviousPage();

  constructor(
    client: QueryClient,
    options: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
  ) {
    validateMaxPages(options.maxPages);
    this.#client = client;
    this.#options = options;
    this.#inner = new QueryObserver(client, toQueryOptions(this.#client, options));
    this.#result = this.#extend(this.#inner.getResult());
  }

  getResult(): InfiniteQueryResult<TSelected, TError> {
    return this.#result;
  }

  getOptimisticResult(
    options: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
  ): InfiniteQueryResult<TSelected, TError> {
    return this.#extend(
      this.#inner.getOptimisticResult(toQueryOptions(this.#client, options)),
      options,
    );
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1)
      this.#unsubscribeInner = this.#inner.subscribe(() => this.#refresh());
    return () => {
      if (this.#listeners.delete(listener) && this.#listeners.size === 0) {
        this.#unsubscribeInner?.();
        this.#unsubscribeInner = undefined;
      }
    };
  }

  setOptions(options: InfiniteQueryOptions<TPage, TError, TParam, TSelected>): void {
    validateMaxPages(options.maxPages);
    this.#options = options;
    this.#inner.setOptions(toQueryOptions(this.#client, options));
    this.#refresh();
  }

  fetchNextPage(): Promise<void> {
    return this.#fetchPage("next");
  }

  fetchPreviousPage(): Promise<void> {
    return this.#fetchPage("previous");
  }

  /**
   * One directional page load. While one is in flight, a second call (either direction) joins it
   * instead of racing it: both would write the same entry from the same snapshot.
   */
  #fetchPage(direction: "next" | "previous"): Promise<void> {
    if (this.#inFlightPage) return this.#inFlightPage;
    const run = this.#loadPage(direction).finally(() => {
      this.#inFlightPage = undefined;
    });
    this.#inFlightPage = run;
    return run;
  }

  async #loadPage(direction: "next" | "previous"): Promise<void> {
    const o = this.#options;
    const query = this.#inner.query;
    const data = query.state.data;
    if (!data) return void (await this.#inner.refetch()); // nothing loaded yet: load the first page
    const target = direction === "next" ? this.#nextParam(data, o) : this.#previousParam(data, o);
    if (target === undefined) return;
    const param = target.param;
    if (direction === "next") this.#fetchingNext = true;
    else this.#fetchingPrevious = true;
    this.#refresh();
    try {
      await query
        .fetch(toQueryOptions(this.#client, o) as never, {
          observer: true,
          queryFn: async (ctx) => {
            const page = await o.queryFn({
              queryKey: ctx.queryKey,
              signal: ctx.signal,
              pageParam: param,
            });
            return direction === "next"
              ? trim(
                  { pages: [...data.pages, page], pageParams: [...data.pageParams, param] },
                  o.maxPages,
                  "start",
                )
              : trim(
                  { pages: [page, ...data.pages], pageParams: [param, ...data.pageParams] },
                  o.maxPages,
                  "end",
                );
          },
        })
        .catch(noop);
    } finally {
      this.#fetchingNext = false;
      this.#fetchingPrevious = false;
      this.#refresh();
    }
  }

  #previousParam(
    data: InfiniteData<TPage, TParam>,
    o: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
  ): { param: TParam } | undefined {
    if (!o.getPreviousPageParam) return undefined;
    const firstPage = data.pages[0];
    const firstParam = data.pageParams[0];
    if (data.pages.length === 0 || firstPage === undefined || firstParam === undefined)
      return undefined;
    const previous = o.getPreviousPageParam(firstPage, data.pages, firstParam, data.pageParams);
    return previous === undefined || previous === null ? undefined : { param: previous };
  }

  #nextParam(
    data: InfiniteData<TPage, TParam>,
    o: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
  ): { param: TParam } | undefined {
    const lastPage = data.pages.at(-1);
    const lastParam = data.pageParams.at(-1);
    if (data.pages.length === 0 || lastPage === undefined || lastParam === undefined)
      return undefined;
    const next = o.getNextPageParam(lastPage, data.pages, lastParam, data.pageParams);
    return next === undefined || next === null ? undefined : { param: next };
  }

  #refresh(): void {
    const next = this.#extend(this.#inner.getResult());
    if (next === this.#result) return;
    this.#result = next;
    for (const l of [...this.#listeners]) l();
  }

  #extend(
    inner: QueryResult<TSelected, TError>,
    options: InfiniteQueryOptions<TPage, TError, TParam, TSelected> = this.#options,
  ): InfiniteQueryResult<TSelected, TError> {
    const data = this.#inner.query.state.data;
    const hasNextPage = data !== undefined && this.#nextParam(data, options) !== undefined;
    const hasPreviousPage = data !== undefined && this.#previousParam(data, options) !== undefined;
    const prev = this.#result as InfiniteQueryResult<TSelected, TError> | undefined;
    if (
      prev &&
      this.#lastInner === inner &&
      prev.hasNextPage === hasNextPage &&
      prev.hasPreviousPage === hasPreviousPage &&
      prev.isFetchingNextPage === this.#fetchingNext &&
      prev.isFetchingPreviousPage === this.#fetchingPrevious
    )
      return prev;
    this.#lastInner = inner;
    return {
      ...inner,
      hasNextPage,
      hasPreviousPage,
      isFetchingNextPage: this.#fetchingNext,
      isFetchingPreviousPage: this.#fetchingPrevious,
      fetchNextPage: this.#fetchNextPage,
      fetchPreviousPage: this.#fetchPreviousPage,
    };
  }
}

function validateMaxPages(maxPages: number | undefined): void {
  if (maxPages !== undefined && (!Number.isInteger(maxPages) || maxPages < 1))
    throw new RangeError("maxPages must be an integer >= 1");
}

/** Drop pages from the `start` (after appending) or the `end` (after prepending) beyond `max`. */
function trim<TPage, TParam>(
  data: InfiniteData<TPage, TParam>,
  max: number | undefined,
  from: "start" | "end",
): InfiniteData<TPage, TParam> {
  if (max === undefined || data.pages.length <= max) return data;
  return from === "start"
    ? { pages: data.pages.slice(-max), pageParams: data.pageParams.slice(-max) }
    : { pages: data.pages.slice(0, max), pageParams: data.pageParams.slice(0, max) };
}

/** Plain query options for an infinite query: first load and refetch re-request every page held. */
function toQueryOptions<TPage, TError, TParam, TSelected>(
  client: QueryClient,
  o: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
): QueryOptions<InfiniteData<TPage, TParam>, TError, TSelected> {
  const {
    queryFn: _q,
    getNextPageParam: _g,
    getPreviousPageParam: _p,
    initialPageParam: _i,
    maxPages: _m,
    ...config
  } = o;
  return {
    ...config,
    queryKey: o.queryKey,
    queryClient: o.queryClient ?? client,
    // Used for the first load and every refetch: re-request all loaded pages, in order.
    queryFn: async (ctx) => {
      // Re-request exactly the pages held, from the first one held (which is not the initial
      // page after `fetchPreviousPage` or `maxPages` trimming). Confirmed data, not the optimistic view.
      const held = client.getQuery<InfiniteData<TPage, TParam>>(o.queryKey)?.confirmedData;
      const loaded = Math.max(held?.pages.length ?? 1, 1);
      const pages: TPage[] = [];
      const pageParams: TParam[] = [];
      let param: TParam = held?.pageParams[0] ?? o.initialPageParam;
      for (let i = 0; i < loaded; i++) {
        const page = await o.queryFn({
          queryKey: ctx.queryKey,
          signal: ctx.signal,
          pageParam: param,
        });
        pages.push(page);
        pageParams.push(param);
        if (i === loaded - 1) break;
        const next = o.getNextPageParam(page, pages, param, pageParams);
        if (next === undefined || next === null) break;
        param = next;
      }
      return { pages, pageParams };
    },
  };
}

/**
 * Load an infinite query's first page (or reuse data already cached) without an observer. One
 * shared request however many callers; used by suspense, prefetching and SSR.
 */
export function fetchInfiniteQuery<TPage, TError, TParam, TSelected>(
  client: QueryClient,
  options: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
): Promise<InfiniteData<TPage, TParam>> {
  const resolved = client.resolveOptions(toQueryOptions(client, options));
  return client.fetchQuery<InfiniteData<TPage, TParam>, TError>(resolved);
}
