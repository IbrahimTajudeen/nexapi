import type { QueryClient } from "./client.js";
import type { QueryKey, TypedKey } from "./key.js";
import type { MutationConfig, MutationOptions } from "./mutation.js";
import type { QueryConfig, QueryOptions } from "./types.js";

/* ------------------------------------------------------------------------------------------
 * Protocol-neutral operations.
 *
 * REST endpoints (see endpoint.ts) are built on HTTP. An *operation* is the same idea for any
 * other protocol: a function from one typed input to one typed result, plus the cache key that
 * identifies it. GraphQL and tRPC adapters build their clients out of these, so every protocol
 * gets the same `options`, `key`, `prefetch` and `invalidate`, the same single-flight cache and
 * the same optimistic mutations.
 * ---------------------------------------------------------------------------------------- */

/** Extra per-call options for direct invocation (never part of cache keys). */
export interface OperationCallExtras {
  signal?: AbortSignal;
}

/** No argument when the input is `void`, an optional one when it may be `undefined`, else required. */
export type OperationArgs<TInput> = [TInput] extends [void]
  ? []
  : undefined extends TInput
    ? [input?: TInput]
    : [input: TInput];

export interface QueryOperation<TInput, TData, TError> {
  /** Run the operation directly (no cache). */
  (...args: [...OperationArgs<TInput>, extras?: OperationCallExtras]): Promise<TData>;
  /** Query options for `useQuery` / `queryClient.fetchQuery`. */
  options<TSelected = TData>(
    ...args: [...OperationArgs<TInput>, config?: QueryConfig<TData, TError, TSelected>]
  ): QueryOptions<TData, TError, TSelected>;
  /** Cache key. Without input it is the prefix shared by every variant of this operation. */
  key(...input: OperationArgs<TInput> | []): TypedKey<TData>;
  /** Fetch into the cache if not fresh. Never rejects. */
  prefetch(
    ...args: [...OperationArgs<TInput>, config?: QueryConfig<TData, TError, TData>]
  ): Promise<void>;
  /** Invalidate (and refetch if observed). With input: that variant; without: all variants. */
  invalidate(...input: OperationArgs<TInput> | []): Promise<void>;
}

export interface MutationOperation<TInput, TData, TError> {
  /** Run the mutation directly. */
  (...args: [...OperationArgs<TInput>, extras?: OperationCallExtras]): Promise<TData>;
  /** Mutation options for `useMutation` / `queryClient.mutate`. The input becomes the variables. */
  options<TContext = unknown>(
    config?: MutationConfig<TData, TError, TInput, TContext>,
  ): MutationOptions<TData, TError, TInput, TContext>;
  /** Mutation key; also usable as a cache-filter prefix. */
  key(): QueryKey;
}

export interface OperationRuntime {
  readonly queryClient: QueryClient;
}

export interface OperationDef<TInput, TData> {
  /** Identifies the operation, e.g. `["GRAPHQL", "query", "user"]`. Must be JSON-like. */
  readonly prefix: QueryKey;
  /** Performs the operation. Honour `signal`; the engine aborts it when the fetch is cancelled. */
  readonly run: (input: TInput, signal: AbortSignal | undefined) => Promise<TData>;
}

/** `undefined`, `null` and `{}` all mean "no input" so they share one cache entry. */
function inputPart(input: unknown): QueryKey {
  if (input === undefined || input === null) return [];
  if (typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0)
    return [];
  return [input];
}

/** Split `[...input, config?]` / `[...input, extras?]` the same way the type does. */
function split(args: readonly unknown[], hasInput: boolean): [unknown, unknown] {
  return hasInput ? [args[0], args[1]] : [undefined, args[0]];
}

export function createQueryOperation<TInput, TData, TError>(
  rt: OperationRuntime,
  def: OperationDef<TInput, TData>,
  options: { readonly hasInput?: boolean } = {},
): QueryOperation<TInput, TData, TError> {
  const hasInput = options.hasInput !== false;
  const keyOf = (input: unknown): QueryKey => [...def.prefix, ...inputPart(input)];
  const build = (input: unknown, config: unknown): QueryOptions<TData, TError, TData> => ({
    ...(config as QueryConfig<TData, TError, TData> | undefined),
    queryKey: keyOf(input),
    queryFn: ({ signal }) => def.run(input as TInput, signal),
    queryClient: rt.queryClient,
  });
  const call = (...args: unknown[]): Promise<TData> => {
    const [input, extras] = split(args, hasInput);
    return def.run(input as TInput, (extras as OperationCallExtras | undefined)?.signal);
  };
  const methods = {
    options: (...args: unknown[]) => build(...split(args, hasInput)),
    key: (...args: unknown[]) => (args[0] === undefined ? def.prefix : keyOf(args[0])),
    prefetch: (...args: unknown[]) => rt.queryClient.prefetchQuery(build(...split(args, hasInput))),
    invalidate: (...args: unknown[]) =>
      args[0] === undefined
        ? rt.queryClient.invalidateQueries({ queryKey: def.prefix })
        : rt.queryClient.invalidateQueries({ queryKey: keyOf(args[0]), exact: true }),
  };
  return Object.assign(call, methods) as unknown as QueryOperation<TInput, TData, TError>;
}

export function createMutationOperation<TInput, TData, TError>(
  rt: OperationRuntime,
  def: OperationDef<TInput, TData>,
  options: { readonly hasInput?: boolean } = {},
): MutationOperation<TInput, TData, TError> {
  const hasInput = options.hasInput !== false;
  const call = (...args: unknown[]): Promise<TData> => {
    const [input, extras] = split(args, hasInput);
    return def.run(input as TInput, (extras as OperationCallExtras | undefined)?.signal);
  };
  const methods = {
    options: (config?: MutationConfig<TData, TError, TInput, unknown>) => ({
      ...config,
      mutationKey: config?.mutationKey ?? def.prefix,
      mutationFn: (variables: TInput) => def.run(variables, undefined),
      queryClient: rt.queryClient,
    }),
    key: () => def.prefix,
  };
  return Object.assign(call, methods) as unknown as MutationOperation<TInput, TData, TError>;
}
