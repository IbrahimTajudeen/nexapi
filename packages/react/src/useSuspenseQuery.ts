import type { QueryOptions, QueryResult } from "@syncapi/core";
import { useQuery } from "./useQuery.js";
import { useQueryClient } from "./context.js";

/** `enabled` and `placeholderData` make no sense when the component waits for real data. */
export type UseSuspenseQueryOptions<TData, TError, TSelected> = Omit<
  QueryOptions<TData, TError, TSelected>,
  "enabled" | "placeholderData"
>;

export type SuspenseQueryResult<TData, TError> = Omit<QueryResult<TData, TError>, "data"> & {
  /** Always defined: the component only renders once data exists. */
  readonly data: TData;
};

const MIN_STALE_TIME = 1000;
const noop = (): void => undefined;

/**
 * Like `useQuery`, but the component suspends until the first data arrives and throws to the
 * nearest error boundary when the first load fails, so `data` is never `undefined`.
 *
 * - Suspends only while the entry has no data. Stale data renders immediately and refetches in
 *   the background; a failed background refetch keeps the data and does not throw.
 * - Suspending uses the cache entry itself (never component state, which React discards when a
 *   component suspends on mount), so concurrent components share one request.
 * - A failed first load keeps throwing the same error on every render (React retries a render
 *   once before showing the boundary). To retry after the boundary resets, invalidate the query
 *   (`api.users.byId(id).get.invalidate()`): the next render fetches it again.
 * - `staleTime` is at least 1000 ms so data that just resolved is not refetched the moment the
 *   component mounts.
 * - Server rendering needs a streaming renderer (`renderToPipeableStream`); `renderToString`
 *   cannot wait and emits the fallback.
 */
export function useSuspenseQuery<TData, TError = Error, TSelected = TData>(
  options: UseSuspenseQueryOptions<TData, TError, TSelected>,
): SuspenseQueryResult<TSelected, TError> {
  const client = useQueryClient(options.queryClient);
  const resolved = client.resolveOptions(options);
  const query = client.buildQuery<TData, TError>(resolved);
  const state = query.state;
  if (state.data === undefined) {
    const error: unknown = state.error;
    // first load failed and nobody asked for a retry (invalidate) since: surface the failure
    if (state.status === "error" && !query.isFetching && !state.isInvalidated && error !== null)
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the query's own error, for the boundary
      throw error;
    // pending, in flight, or invalidated after a failure (joins a run already in flight)
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- throwing a promise is React's Suspense protocol
    throw query.fetch(resolved as never).then(noop, noop);
  }
  const result = useQuery<TData, TError, TSelected>({
    ...options,
    staleTime: Math.max(resolved.staleTime ?? 0, MIN_STALE_TIME),
  });
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- the query's own error
  if (result.data === undefined && result.error !== null) throw result.error; // `select` threw
  return result as SuspenseQueryResult<TSelected, TError>;
}
