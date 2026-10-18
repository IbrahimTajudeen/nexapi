import {
  InfiniteQueryObserver,
  type InfiniteData,
  type InfiniteQueryOptions,
  type InfiniteQueryResult,
  type QueryClient,
} from "@nexapi/core";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "./context.js";

/** Paginated query: `data.pages` plus `fetchNextPage`/`hasNextPage`. Same lifecycle rules as `useQuery`. */
export function useInfiniteQuery<
  TPage,
  TError = Error,
  TParam = unknown,
  TSelected = InfiniteData<TPage, TParam>,
>(
  options: InfiniteQueryOptions<TPage, TError, TParam, TSelected>,
): InfiniteQueryResult<TSelected, TError> {
  const client = useQueryClient(options.queryClient);
  const holder = useRef<
    | { client: QueryClient; observer: InfiniteQueryObserver<TPage, TError, TParam, TSelected> }
    | undefined
  >(undefined);
  if (holder.current?.client !== client)
    holder.current = { client, observer: new InfiniteQueryObserver(client, options) };
  const observer = holder.current.observer;
  const subscribe = useCallback((onChange: () => void) => observer.subscribe(onChange), [observer]);
  const getSnapshot = useCallback(() => observer.getResult(), [observer]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    observer.setOptions(options);
  });
  return observer.getOptimisticResult(options);
}
