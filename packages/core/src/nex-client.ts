import { QueryClient, type QueryClientOptions } from "./client.js";
import {
  createMutationEndpoint,
  createQueryEndpoint,
  type EndpointDef,
  type MutationEndpoint,
  type QueryEndpoint,
  type RequestShape,
} from "./endpoint.js";
import { HttpClient, type HttpClientOptions } from "./http.js";

export interface NexClientOptions extends HttpClientOptions {
  /** Reuse an existing cache, or configure a fresh one. A new `QueryClient` is created by default. */
  queryClient?: QueryClient | QueryClientOptions;
  /**
   * Check responses against the shapes generated with `"validation": true`. Default `true`; it
   * only does anything for endpoints that carry a shape. A mismatch rejects with
   * `ResponseValidationError` (never retried).
   */
  validateResponses?: boolean;
}

/**
 * Glue between the HTTP runtime and the cache. Generated `createApi(client)` functions take
 * one of these. Create one **per user/request** on the server so caches and credentials never mix.
 */
export class NexClient {
  readonly http: HttpClient;
  readonly queryClient: QueryClient;
  readonly validateResponses: boolean;

  constructor(options: NexClientOptions) {
    const { queryClient, validateResponses, ...http } = options;
    this.validateResponses = validateResponses !== false;
    this.http = new HttpClient(http);
    this.queryClient =
      queryClient instanceof QueryClient ? queryClient : new QueryClient(queryClient);
  }

  /** Used by generated code. */
  query<TReq extends RequestShape, TData, TErrBody>(
    def: EndpointDef,
  ): QueryEndpoint<TReq, TData, TErrBody> {
    return createQueryEndpoint<TReq, TData, TErrBody>(this, def);
  }

  /** Used by generated code. */
  mutation<TReq extends RequestShape, TBody, TData, TErrBody>(
    def: EndpointDef,
  ): MutationEndpoint<TReq, TBody, TData, TErrBody> {
    return createMutationEndpoint<TReq, TBody, TData, TErrBody>(this, def);
  }
}

export function createNexClient(options: NexClientOptions): NexClient {
  return new NexClient(options);
}
