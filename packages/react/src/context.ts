import type { QueryClient } from "@nexapi/core";
import { createContext, createElement, useContext, type ReactElement, type ReactNode } from "react";

const QueryClientContext = createContext<QueryClient | undefined>(undefined);

export interface NexProviderProps {
  client: QueryClient;
  children?: ReactNode;
}

/**
 * Optional: supplies a default `QueryClient` to hooks whose options are not already bound to
 * one. Options created by generated endpoints carry their own client, so they need no provider.
 */
export function NexProvider({ client, children }: NexProviderProps): ReactElement {
  return createElement(QueryClientContext.Provider, { value: client }, children);
}

/** The explicit override, else the provider's client. Throws if neither exists. */
export function useQueryClient(override?: QueryClient): QueryClient {
  const fromContext = useContext(QueryClientContext);
  const client = override ?? fromContext;
  if (!client)
    throw new Error(
      "No QueryClient found. Create options from a generated endpoint (they carry their client), pass `queryClient` in the options, or wrap the tree in <NexProvider client={...}>.",
    );
  return client;
}
