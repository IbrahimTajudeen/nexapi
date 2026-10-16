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
  queryClient?: QueryClient;
}

export interface InfiniteQueryResult<TData, TError> extends QueryResult<TData, TError> {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** Loads the next page and appends it. No-op when there is none. Joins a fetch already in flight. */
  fetchNextPage: () => Promise<void>;
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
  readonly #listeners = new Set<() => void>();
  #unsubscribeInner: (() => void) | undefined;
  #result: InfiniteQueryResult<TSelected, TError>;
  #lastInner: QueryResult<TSelected, TError> | undefined;
  readonly #fetchNextPage = (): Promise<void> => this.fetchNextPage();

  constructor(
    client: QueryClient,
    options: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
  ) {
    this.#client = client;
    this.#options = options;
    this.#inner = new QueryObserver(client, this.#toQueryOptions(options));
    this.#result = this.#extend(this.#inner.getResult());
  }

  getResult(): InfiniteQueryResult<TSelected, TError> {
    return this.#result;
  }

  getOptimisticResult(
    options: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
  ): InfiniteQueryResult<TSelected, TError> {
    return this.#extend(this.#inner.getOptimisticResult(this.#toQueryOptions(options)), options);
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
    this.#options = options;
    this.#inner.setOptions(this.#toQueryOptions(options));
    this.#refresh();
  }

  async fetchNextPage(): Promise<void> {
    const o = this.#options;
    const query = this.#inner.query;
    const data = query.state.data;
    if (!data) return void (await this.#inner.refetch()); // nothing loaded yet: load the first page
    const next = this.#nextParam(data, o);
    if (next === undefined) return;
    this.#fetchingNext = true;
    this.#refresh();
    try {
      await query
        .fetch(this.#toQueryOptions(o) as never, {
          observer: true,
          queryFn: async (ctx) => {
            const page = await o.queryFn({
              queryKey: ctx.queryKey,
              signal: ctx.signal,
              pageParam: next.param,
            });
            return { pages: [...data.pages, page], pageParams: [...data.pageParams, next.param] };
          },
        })
        .catch(noop);
    } finally {
      this.#fetchingNext = false;
      this.#refresh();
    }
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
    const prev = this.#result as InfiniteQueryResult<TSelected, TError> | undefined;
    if (
      prev &&
      this.#lastInner === inner &&
      prev.hasNextPage === hasNextPage &&
      prev.isFetchingNextPage === this.#fetchingNext
    )
      return prev;
    this.#lastInner = inner;
    return {
      ...inner,
      hasNextPage,
      isFetchingNextPage: this.#fetchingNext,
      fetchNextPage: this.#fetchNextPage,
    };
  }

  #toQueryOptions(
    o: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
  ): QueryOptions<InfiniteData<TPage, TParam>, TError, TSelected> {
    const { queryFn: _q, getNextPageParam: _g, initialPageParam: _i, ...config } = o;
    return {
      ...config,
      queryKey: o.queryKey,
      queryClient: o.queryClient ?? this.#client,
      // Used for the first load and every refetch: re-request all loaded pages, in order.
      queryFn: async (ctx) => {
        const loaded =
          this.#client.getData<InfiniteData<TPage, TParam>>(o.queryKey)?.pages.length ?? 1;
        const pages: TPage[] = [];
        const pageParams: TParam[] = [];
        let param: TParam = o.initialPageParam;
        for (let i = 0; i < Math.max(loaded, 1); i++) {
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
}
