import type { QueryClient } from "./client.js";
import { keyMatchesPrefix, type QueryKey, type TypedKey } from "./key.js";
import { ResponseValidationError, type EndpointError } from "./errors.js";
import { checkShape, type Shape, type Shapes } from "./shape.js";
import type {
  BodyKind,
  HeaderValue,
  HttpClient,
  HttpMethod,
  PathParamValue,
  QueryStyle,
  ResponseKind,
} from "./http.js";
import type { MutationConfig, MutationOptions } from "./mutation.js";
import type { QueryConfig, QueryOptions } from "./types.js";

/* ------------------------------------------------------------------------------------------
 * Public endpoint types. See docs/API-DESIGN.md for the rationale.
 *
 *   TReq   request shape: { query?: ..., headers?: ... } — path params are bound while
 *          navigating (`api.users.byId("42")`), never passed here.
 *   TBody  JSON body type, or `void` when the operation has none.
 *   TData  success payload (`void` for no-content responses).
 *   TErr   union of the documented error-response bodies (wrapped in HttpError at runtime).
 * ---------------------------------------------------------------------------------------- */

/** Request shape of an operation without query or header parameters. */
export type NoRequest = Record<never, never>;

export interface RequestShape {
  query?: Readonly<Record<string, unknown>>;
  headers?: Readonly<Record<string, HeaderValue>>;
}

/** Extra per-call options for direct invocation only (never part of cache keys). */
export interface CallExtras {
  signal?: AbortSignal;
}

/** `[request?]` when every request part is optional, `[request]` otherwise. */
export type RequestArgs<TReq extends RequestShape> = NoRequest extends TReq
  ? [request?: TReq & CallExtras]
  : [request: TReq & CallExtras];

/** Same, for `options`/`prefetch`/`key`, where the engine owns the abort signal. */
export type OptionsArgs<TReq extends RequestShape> = NoRequest extends TReq
  ? [request?: TReq]
  : [request: TReq];

export interface QueryEndpoint<TReq extends RequestShape, TData, TErrBody> {
  /** Execute the request directly (no cache). */
  (...args: RequestArgs<TReq>): Promise<TData>;
  /** Query options for `useQuery` / `queryClient.fetchQuery`. `config` is never confused with `request`. */
  options<TSelected = TData>(
    ...args: [...OptionsArgs<TReq>, config?: QueryConfig<TData, EndpointError<TErrBody>, TSelected>]
  ): QueryOptions<TData, EndpointError<TErrBody>, TSelected>;
  /**
   * Canonical cache key. Without `request` it is the *prefix* shared by every variant of this
   * route (+ bound path params), which is what you want for filtering.
   */
  key(request?: TReq): TypedKey<TData>;
  /** Fetch into the cache if not fresh. Never rejects. */
  prefetch(
    ...args: [...OptionsArgs<TReq>, config?: QueryConfig<TData, EndpointError<TErrBody>, TData>]
  ): Promise<void>;
  /** Invalidate (and refetch if observed). With `request`: that variant; without: all variants. */
  invalidate(request?: TReq): Promise<void>;
}

type MutationArgs<TReq extends RequestShape, TBody> = [TBody] extends [void]
  ? RequestArgs<TReq>
  : [body: TBody, ...request: RequestArgs<TReq>];

export interface MutationEndpoint<TReq extends RequestShape, TBody, TData, TErrBody> {
  /** Execute the request directly. Body first (when the operation has one), then request options. */
  (...args: MutationArgs<TReq, TBody>): Promise<TData>;
  /**
   * Mutation options for `useMutation` / `queryClient.mutate`. Request options (query,
   * headers) are bound here; the *body* is supplied later as the mutation variables.
   */
  options<TContext = unknown>(
    ...args: [
      ...OptionsArgs<TReq>,
      config?: MutationConfig<TData, EndpointError<TErrBody>, TBody, TContext>,
    ]
  ): MutationOptions<TData, EndpointError<TErrBody>, TBody, TContext>;
  /** `[METHOD, path, params]`; usable as a mutation key and as a cache-filter prefix. */
  key(): QueryKey;
}

/* ------------------------------------------------------------------------------------------
 * Runtime
 * ---------------------------------------------------------------------------------------- */

export interface EndpointDef {
  operationId?: string;
  method: HttpMethod;
  /** Path template, e.g. `/users/{id}` */
  path: string;
  /** Path parameters bound while navigating the resource tree. */
  params?: Readonly<Record<string, PathParamValue>>;
  /** Whether the operation takes a JSON body as first argument. */
  hasBody?: boolean;
  /**
   * Response shape emitted when the generator runs with `"validation": true`. Checked on every
   * successful response unless the client was created with `validateResponses: false`.
   */
  validate?: { readonly shape: Shape; readonly shapes: Shapes };
  /** How the request body is encoded (default `json`). */
  bodyKind?: BodyKind;
  /** `none` for operations that return no content; `text`/`blob` for non-JSON payloads. */
  response?: ResponseKind;
  /** Query parameters that are not sent as plain exploded `a=1&a=2`. */
  queryStyles?: Readonly<Record<string, QueryStyle>>;
}

export interface EndpointRuntime {
  /** `false` skips shape checks even for endpoints that carry a shape. Default `true`. */
  readonly validateResponses?: boolean;
  readonly http: HttpClient;
  readonly queryClient: QueryClient;
}

interface RuntimeRequest {
  query?: Readonly<Record<string, unknown>> | undefined;
  headers?: Readonly<Record<string, HeaderValue>> | undefined;
  signal?: AbortSignal | undefined;
}

function prune<T>(
  record: Readonly<Record<string, T | undefined>> | undefined,
  lower: boolean,
): Record<string, T> | undefined {
  if (!record) return undefined;
  let out: Record<string, T> | undefined;
  for (const name of Object.keys(record)) {
    const value = record[name];
    if (value === undefined || value === null) continue;
    (out ??= {})[lower ? name.toLowerCase() : name] = value;
  }
  return out;
}

function routePrefix(def: EndpointDef): QueryKey {
  return [def.method.toUpperCase(), def.path, def.params ?? {}];
}

function requestKeyPart(request: RuntimeRequest | undefined): QueryKey {
  const query = prune(request?.query, false);
  const headers = prune(request?.headers, true);
  return query || headers ? [{ query, headers }] : [];
}

function execute<TData>(
  rt: EndpointRuntime,
  def: EndpointDef,
  request: RuntimeRequest | undefined,
  body: unknown,
  signal?: AbortSignal,
): Promise<TData> {
  const validate = def.validate && rt.validateResponses !== false ? def.validate : undefined;
  const pending = rt.http.request<TData>({
    method: def.method,
    path: def.path,
    ...(def.params ? { params: def.params } : {}),
    query: request?.query,
    ...(def.queryStyles ? { queryStyles: def.queryStyles } : {}),
    headers: request?.headers,
    body,
    ...(def.bodyKind ? { bodyKind: def.bodyKind } : {}),
    response: def.response ?? "json",
    signal: signal ?? request?.signal,
  });
  if (!validate) return pending;
  return pending.then((data) => {
    const issues = checkShape(data, validate.shape, validate.shapes);
    if (issues.length > 0)
      throw new ResponseValidationError(`${def.method.toUpperCase()} ${def.path}`, issues);
    return data;
  });
}

/**
 * Build a callable query endpoint. The returned value is a real function with `options`,
 * `key`, `prefetch` and `invalidate` attached. All three casts below are the single point
 * where the untyped runtime meets the public generic contract; generated code supplies the
 * type arguments.
 */
export function createQueryEndpoint<TReq extends RequestShape, TData, TErrBody>(
  rt: EndpointRuntime,
  def: EndpointDef,
): QueryEndpoint<TReq, TData, TErrBody> {
  const prefix = routePrefix(def);
  const keyOf = (request: RuntimeRequest | undefined): QueryKey =>
    request === undefined ? prefix : [...prefix, ...requestKeyPart(request)];
  // A request-less call has no request part, so its concrete key equals the route prefix.
  const concreteKey = (request: RuntimeRequest | undefined): QueryKey => [
    ...prefix,
    ...requestKeyPart(request),
  ];

  const buildOptions = (
    request: RuntimeRequest | undefined,
    config: QueryConfig<unknown, never, unknown> | undefined,
  ): QueryOptions<unknown, never, unknown> => ({
    ...config,
    queryKey: concreteKey(request),
    queryFn: ({ signal }) => execute(rt, def, request, undefined, signal),
    queryClient: rt.queryClient,
  });

  const call = (request?: RuntimeRequest): Promise<unknown> => execute(rt, def, request, undefined);
  const methods = {
    options: (request?: RuntimeRequest, config?: QueryConfig<unknown, never, unknown>) =>
      buildOptions(request, config),
    key: (request?: RuntimeRequest) => keyOf(request),
    prefetch: (request?: RuntimeRequest, config?: QueryConfig<unknown, never, unknown>) =>
      rt.queryClient.prefetchQuery(buildOptions(request, config)),
    invalidate: (request?: RuntimeRequest) =>
      request === undefined
        ? rt.queryClient.invalidateQueries({ queryKey: prefix })
        : rt.queryClient.invalidateQueries({ queryKey: concreteKey(request), exact: true }),
  };
  return Object.assign(call, methods) as unknown as QueryEndpoint<TReq, TData, TErrBody>;
}

export function createMutationEndpoint<TReq extends RequestShape, TBody, TData, TErrBody>(
  rt: EndpointRuntime,
  def: EndpointDef,
): MutationEndpoint<TReq, TBody, TData, TErrBody> {
  const hasBody = def.hasBody === true;
  const prefix = routePrefix(def);
  const call = (...args: unknown[]): Promise<unknown> =>
    hasBody
      ? execute(rt, def, args[1] as RuntimeRequest | undefined, args[0])
      : execute(rt, def, args[0] as RuntimeRequest | undefined, undefined);
  const methods = {
    options: (
      request?: RuntimeRequest,
      config?: MutationConfig<unknown, never, unknown, unknown>,
    ): MutationOptions<unknown, never, unknown, unknown> => ({
      ...config,
      mutationKey: config?.mutationKey ?? [...prefix, ...requestKeyPart(request)],
      mutationFn: (variables) => execute(rt, def, request, hasBody ? variables : undefined),
      queryClient: rt.queryClient,
    }),
    key: () => prefix,
  };
  return Object.assign(call, methods) as unknown as MutationEndpoint<TReq, TBody, TData, TErrBody>;
}

/** Re-export for tests/devtools: does `key` belong to this endpoint's route (any variant)? */
export function isEndpointKey(key: QueryKey, endpointPrefix: QueryKey): boolean {
  return keyMatchesPrefix(key, endpointPrefix);
}
