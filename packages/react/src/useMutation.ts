import {
  MutationObserver,
  type MutationOptions,
  type MutationResult,
  type QueryClient,
} from "@syncapi/core";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "./context.js";

/** Run mutations from a component. `mutate` is stable; the latest options are always used. */
export function useMutation<TData, TError = Error, TVariables = void, TContext = unknown>(
  options: MutationOptions<TData, TError, TVariables, TContext>,
): MutationResult<TData, TError, TVariables> {
  const client = useQueryClient(options.queryClient);
  const holder = useRef<
    | { client: QueryClient; observer: MutationObserver<TData, TError, TVariables, TContext> }
    | undefined
  >(undefined);
  if (holder.current?.client !== client)
    holder.current = { client, observer: new MutationObserver(client, options) };
  const observer = holder.current.observer;

  const subscribe = useCallback((onChange: () => void) => observer.subscribe(onChange), [observer]);
  const getSnapshot = useCallback(() => observer.getResult(), [observer]);
  const result = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    observer.setOptions(options);
  });
  return result;
}
