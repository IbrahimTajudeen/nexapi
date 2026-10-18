import {
  fetchInfiniteQuery,
  type InfiniteData,
  type InfiniteQueryOptions,
  type InfiniteQueryResult,
} from "@nexapi/core";
import { useQueryClient } from "./context.js";
import { useInfiniteQuery } from "./useInfiniteQuery.js";

export type UseSuspenseInfiniteQueryOptions<TPage, TError, TParam, TSelected> = Omit<
  InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
  "enabled"
>;

export type SuspenseInfiniteQueryResult<TSelected, TError> = Omit<
  InfiniteQueryResult<TSelected, TError>,
  "data"
> & {
  /** Always defined: the component only renders once the first page exists. */
  readonly data: TSelected;
};

const MIN_STALE_TIME = 1000;
const noop = (): void => undefined;

/**
 * `useInfiniteQuery` that suspends until the first page arrives and throws a failed first load to
 * the nearest error boundary. Same rules as `useSuspenseQuery` (suspends on the cache entry, so
 * siblings share one request; retry after a boundary reset by invalidating the query; staleTime is
 * at least 1000 ms). Later pages load with `fetchNextPage` / `fetchPreviousPage` and do not
 * suspend: watch `isFetchingNextPage` for their progress.
 */
export function useSuspenseInfiniteQuery<
  TPage,
  TError = Error,
  TParam = unknown,
  TSelected = InfiniteData<TPage, TParam>,
>(
  options: UseSuspenseInfiniteQueryOptions<TPage, TError, TParam, TSelected>,
): SuspenseInfiniteQueryResult<TSelected, TError> {
  const client = useQueryClient(options.queryClient);
  const state = client.buildQuery<InfiniteData<TPage, TParam>, TError>({
    queryKey: options.queryKey,
  }).state;
  if (state.data === undefined) {
    const error: unknown = state.error;
    if (state.status === "error" && !state.isInvalidated && error !== null) {
      const query = client.getQuery(options.queryKey);
      if (!query?.isFetching)
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- the query's own error, for the boundary
        throw error;
    }
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- throwing a promise is React's Suspense protocol
    throw fetchInfiniteQuery(client, options).then(noop, noop);
  }
  const result = useInfiniteQuery<TPage, TError, TParam, TSelected>({
    ...options,
    staleTime: Math.max(
      client.resolveOptions({ ...options } as never).staleTime ?? 0,
      MIN_STALE_TIME,
    ),
  });
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- the query's own error
  if (result.data === undefined && result.error !== null) throw result.error;
  return result as SuspenseInfiniteQueryResult<TSelected, TError>;
}
