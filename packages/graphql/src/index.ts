import {
  HttpClient,
  OperationError,
  ParseError,
  QueryClient,
  RequestError,
  createMutationOperation,
  createQueryOperation,
  type CancelledError,
  type HttpClientOptions,
  type HttpError,
  type NetworkError,
  type ResponseTooLargeError,
  type TimeoutError,
  type MutationOperation,
  type QueryClientOptions,
  type QueryOperation,
} from "@nyxapi/core";

/** One entry of a GraphQL response's `errors` array (never contains request data). */
export interface GraphQLErrorItem {
  message: string;
  path?: readonly (string | number)[];
  locations?: readonly { line: number; column: number }[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLErrorDetails {
  errors: readonly GraphQLErrorItem[];
  /** Partial data that came with the errors (only present with `errorPolicy: "all"`-style responses). */
  data: unknown;
  operationName: string;
}

/**
 * The server answered with `errors`. Not retried by default: a GraphQL error is the server's
 * deliberate answer, not a transient fault. `code` is `extensions.code` of the first error.
 */
export class GraphQLError extends OperationError<GraphQLErrorDetails> {
  readonly errors: readonly GraphQLErrorItem[];
  constructor(operationName: string, errors: readonly GraphQLErrorItem[], data: unknown) {
    const first = errors[0];
    const code =
      typeof first?.extensions?.["code"] === "string" ? first.extensions["code"] : undefined;
    super({
      protocol: "graphql",
      message: first ? first.message : `GraphQL operation "${operationName}" failed`,
      code,
      details: { errors, data, operationName },
      retryable: false,
    });
    this.name = "GraphQLError";
    this.errors = errors;
  }
}

/** Everything a GraphQL operation can reject with. */
export type GraphQLRequestError =
  | GraphQLError
  | HttpError
  | NetworkError
  | TimeoutError
  | ParseError
  | RequestError
  | ResponseTooLargeError
  | CancelledError;

export interface GraphQLOperationDef {
  /** The operation name sent to the server and used in cache keys. */
  readonly name: string;
  /** The full document text (operation plus any fragments it uses). */
  readonly document: string;
  /** Return `data[field]` instead of the whole `data` object (default operations from the generator). */
  readonly field?: string;
  /** `false` for operations without variables, so they are called with no argument. */
  readonly hasVariables?: boolean;
}

export interface GraphQLClientOptions extends Omit<HttpClientOptions, "baseUrl"> {
  /** The GraphQL endpoint, e.g. `https://api.example.com/graphql`. Its origin is pinned. */
  url: string | URL;
  /** Reuse an existing cache, or configure a fresh one. */
  queryClient?: QueryClient | QueryClientOptions;
  /**
   * `"none"` (default): any `errors` entry rejects with `GraphQLError`.
   * `"all"`: if the response also has `data`, resolve with it and ignore the errors.
   */
  errorPolicy?: "none" | "all";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toErrorItems(value: unknown): GraphQLErrorItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((e) => {
    const rec = isRecord(e) ? e : {};
    const item: GraphQLErrorItem = {
      message: typeof rec["message"] === "string" ? rec["message"] : "Unknown GraphQL error",
    };
    if (Array.isArray(rec["path"])) item.path = rec["path"] as (string | number)[];
    if (Array.isArray(rec["locations"]))
      item.locations = rec["locations"] as { line: number; column: number }[];
    if (isRecord(rec["extensions"])) item.extensions = rec["extensions"];
    return item;
  });
}

/**
 * GraphQL over the same engine as REST: the cache, single-flight, retries (network/5xx only),
 * optimistic updates and origin-pinned HTTP client all apply. Generated `createApi(client)`
 * functions take one of these. Create one per user/request on the server.
 */
export class GraphQLClient {
  readonly http: HttpClient;
  readonly queryClient: QueryClient;
  readonly errorPolicy: "none" | "all";
  readonly #path: string;
  readonly #search: Record<string, string>;

  constructor(options: GraphQLClientOptions) {
    const { url, queryClient, errorPolicy, ...http } = options;
    const endpoint = new URL(url);
    if (endpoint.username !== "" || endpoint.password !== "")
      throw new RequestError("The GraphQL url must not contain credentials");
    this.#path = endpoint.pathname === "" ? "/" : endpoint.pathname;
    this.#search = Object.fromEntries(endpoint.searchParams);
    this.http = new HttpClient({ ...http, baseUrl: endpoint.origin });
    this.errorPolicy = errorPolicy ?? "none";
    this.queryClient =
      queryClient instanceof QueryClient ? queryClient : new QueryClient(queryClient);
  }

  /** Send one operation. Used by generated code; also handy for one-off calls. */
  async execute<TData>(
    def: GraphQLOperationDef,
    variables: unknown,
    signal?: AbortSignal,
  ): Promise<TData> {
    const response = await this.http.request<unknown>({
      method: "post",
      path: this.#path,
      ...(Object.keys(this.#search).length > 0 ? { query: this.#search } : {}),
      headers: { accept: "application/graphql-response+json, application/json" },
      body: {
        query: def.document,
        operationName: def.name,
        ...(variables === undefined ? {} : { variables }),
      },
      signal,
    });
    if (!isRecord(response)) throw new ParseError("GraphQL response was not a JSON object", 200);
    const errors = toErrorItems(response["errors"]);
    const data = response["data"];
    if (errors.length > 0 && !(this.errorPolicy === "all" && data !== null && data !== undefined))
      throw new GraphQLError(def.name, errors, data);
    if (data === null || data === undefined)
      throw new ParseError(`GraphQL response for "${def.name}" had neither data nor errors`, 200);
    if (def.field === undefined) return data as TData;
    if (!isRecord(data) || !(def.field in data))
      throw new ParseError(`GraphQL response for "${def.name}" is missing "${def.field}"`, 200);
    return data[def.field] as TData;
  }

  /** Used by generated code. */
  query<TVariables, TData>(
    def: GraphQLOperationDef,
  ): QueryOperation<TVariables, TData, GraphQLRequestError> {
    return createQueryOperation<TVariables, TData, GraphQLRequestError>(
      this,
      {
        prefix: ["GRAPHQL", "query", def.name],
        run: (variables, signal) => this.execute<TData>(def, variables, signal),
      },
      { hasInput: def.hasVariables !== false },
    );
  }

  /** Used by generated code. */
  mutation<TVariables, TData>(
    def: GraphQLOperationDef,
  ): MutationOperation<TVariables, TData, GraphQLRequestError> {
    return createMutationOperation<TVariables, TData, GraphQLRequestError>(
      this,
      {
        prefix: ["GRAPHQL", "mutation", def.name],
        run: (variables, signal) => this.execute<TData>(def, variables, signal),
      },
      { hasInput: def.hasVariables !== false },
    );
  }
}

export function createGraphQLClient(options: GraphQLClientOptions): GraphQLClient {
  return new GraphQLClient(options);
}
