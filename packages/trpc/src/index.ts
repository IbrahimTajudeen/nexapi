import {
  OperationError,
  QueryClient,
  createMutationOperation,
  createQueryOperation,
  type MutationOperation,
  type QueryClientOptions,
  type QueryOperation,
} from "@nyxapi/core";

/** Details of a failed tRPC call. Never contains the request input. */
export interface TrpcErrorDetails {
  /** tRPC error code such as `NOT_FOUND`, when the server sent one. */
  code: string | undefined;
  httpStatus: number | undefined;
  /** The procedure, e.g. `users.byId`. */
  path: string;
  /** The server's error `data` (stack traces are only present if the server sends them). */
  data: unknown;
}

/**
 * A tRPC procedure failed. Retried only when it looks transient: no response at all (network),
 * 408, 429 or any 5xx. Client errors (bad input, not found, unauthorized) are never retried.
 */
export class TrpcError extends OperationError<TrpcErrorDetails> {
  readonly httpStatus: number | undefined;
  constructor(path: string, cause: unknown) {
    const rec = isRecord(cause) ? cause : {};
    const data = isRecord(rec["data"]) ? rec["data"] : undefined;
    const httpStatus = typeof data?.["httpStatus"] === "number" ? data["httpStatus"] : undefined;
    const code = typeof data?.["code"] === "string" ? data["code"] : undefined;
    const message =
      typeof rec["message"] === "string" ? rec["message"] : `tRPC call ${path} failed`;
    super({
      protocol: "trpc",
      message,
      code,
      details: { code, httpStatus, path, data },
      retryable:
        httpStatus === undefined || httpStatus === 408 || httpStatus === 429 || httpStatus >= 500,
      cause,
    });
    this.name = "TrpcError";
    this.httpStatus = httpStatus;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/* ------------------------------------------------------------------------------------------
 * Types are read structurally from the tRPC client you pass in, so this package needs no
 * tRPC import and works with any v11 client (`createTRPCClient`, `createTRPCProxyClient`).
 * ---------------------------------------------------------------------------------------- */

/** No-input procedures are typed with an optional `null | undefined` input so `query()` works. */
type InputOf<I> = [I] extends [void | undefined] ? undefined | null : I;

type Procedures<T> = {
  [K in keyof T]: T[K] extends {
    query: (input: infer I, opts?: never) => Promise<infer O>;
  }
    ? { query: QueryOperation<InputOf<I>, O, TrpcError> }
    : T[K] extends { mutate: (input: infer I, opts?: never) => Promise<infer O> }
      ? { mutate: MutationOperation<InputOf<I>, O, TrpcError> }
      : T[K] extends object
        ? Procedures<T[K]>
        : never;
};

/** `Procedures<T>` minus the client-level helpers some tRPC clients carry. */
export type NyxTrpc<T> = Procedures<Omit<T, "$types" | "runtime">>;

export interface NyxTrpcOptions {
  /** Reuse an existing cache, or configure a fresh one. */
  queryClient?: QueryClient | QueryClientOptions;
}

export interface NyxTrpcResult<T> {
  /** The same tree as your tRPC client, with `.query` / `.mutate` replaced by cache-aware operations. */
  api: NyxTrpc<T>;
  queryClient: QueryClient;
}

type Call = (input: unknown, opts?: { signal?: AbortSignal }) => Promise<unknown>;

/**
 * Wrap a tRPC client so every procedure gets `options`, `key`, `prefetch` and `invalidate`
 * (queries) or `options` and `key` (mutations), on one shared cache.
 *
 * @example
 * const { api, queryClient } = createNyxTrpc(trpc);
 * await api.users.byId.query({ id: "1" });
 * await api.users.byId.query.prefetch({ id: "1" });
 * await queryClient.mutate(api.users.rename.mutate.options(), { id: "1", name: "Ada" });
 */
export function createNyxTrpc<T extends object>(
  client: T,
  options: NyxTrpcOptions = {},
): NyxTrpcResult<T> {
  const queryClient =
    options.queryClient instanceof QueryClient
      ? options.queryClient
      : new QueryClient(options.queryClient);
  const runtime = { queryClient };
  const cache = new Map<string, unknown>();

  const callAt = (path: readonly string[], verb: "query" | "mutate"): Call => {
    let node: unknown = client;
    for (const part of path) node = (node as Record<string, unknown>)[part];
    const fn = (node as Record<string, unknown> | undefined)?.[verb];
    if (typeof fn !== "function")
      throw new TypeError(`"${path.join(".")}" is not a tRPC ${verb} procedure`);
    return (input, opts) => (fn as Call).call(node, input, opts);
  };

  const run =
    (path: readonly string[], verb: "query" | "mutate") =>
    async (input: unknown, signal: AbortSignal | undefined): Promise<unknown> => {
      try {
        return await callAt(path, verb)(input, signal ? { signal } : undefined);
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new TrpcError(path.join("."), error);
      }
    };

  const proxy = (path: readonly string[]): unknown =>
    new Proxy(() => undefined, {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        if (prop === "query" || prop === "mutate") {
          const id = `${prop}:${path.join(".")}`;
          let op = cache.get(id);
          if (!op) {
            const def = { prefix: ["TRPC", ...path], run: run(path, prop) };
            op =
              prop === "query"
                ? createQueryOperation(runtime, def)
                : createMutationOperation(runtime, def);
            cache.set(id, op);
          }
          return op;
        }
        if (prop === "then") return undefined; // never look like a thenable
        return proxy([...path, prop]);
      },
    });

  return { api: proxy([]) as NyxTrpc<T>, queryClient };
}
