import { QueryObserver, type QueryClient, type QueryOptions, type QueryResult } from "@nexapi/core";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "./context.js";

/**
 * Subscribe a component to a query.
 *
 * - One `QueryObserver` per component instance; the data lives only in the core cache.
 * - The returned object keeps its identity until an observable field changes, and
 *   `notifyOn` can narrow which fields wake the component.
 * - Changing the key re-targets the observer and reports `isFetching` immediately (no idle flash).
 * - Server rendering: nothing is fetched (effects do not run) and the snapshot reflects only
 *   what is already in this request's own `QueryClient`.
 */
export function useQuery<TData, TError = Error, TSelected = TData>(
  options: QueryOptions<TData, TError, TSelected>,
): QueryResult<TSelected, TError> {
  const client = useQueryClient(options.queryClient);
  const holder = useRef<
    { client: QueryClient; observer: QueryObserver<TData, TError, TSelected> } | undefined
  >(undefined);
  if (holder.current?.client !== client)
    holder.current = { client, observer: new QueryObserver(client, options) };
  const observer = holder.current.observer;

  const subscribe = useCallback((onChange: () => void) => observer.subscribe(onChange), [observer]);
  const getSnapshot = useCallback(() => observer.getResult(), [observer]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Always hand the observer the latest options so queryFn closures are never stale.
  useEffect(() => {
    observer.setOptions(options);
  });

  return observer.getOptimisticResult(options);
}
