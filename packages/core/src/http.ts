import {
  HttpError,
  NetworkError,
  NexError,
  ParseError,
  RequestError,
  TimeoutError,
} from "./errors.js";
import { raceAbort } from "./util.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";

/** A transport turns a standard `Request` into a standard `Response`. Default: global `fetch`. */
export type Transport = (request: Request) => Promise<Response>;

/** Onion-style middleware over standard Fetch objects. Call `next` exactly once to continue. */
export type Middleware = (
  request: Request,
  next: (request: Request) => Promise<Response>,
) => Promise<Response>;

export type PathParamValue = string | number | boolean;
export type HeaderValue = string | number | boolean | undefined;

export interface HttpClientOptions {
  /** Absolute base URL (`https://api.example.com/v1`). Its origin is pinned for every request. */
  baseUrl: string | URL;
  /** Custom transport. Defaults to the global `fetch`. */
  transport?: Transport;
  /** Headers sent with every request (lowest precedence). */
  headers?: Record<string, string>;
  /** Called per request; a returned token is sent as `Authorization: Bearer <token>`. */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Request/response middleware, outermost first. */
  middleware?: readonly Middleware[];
  /** Default timeout in ms (none by default). */
  timeoutMs?: number;
  /**
   * DANGEROUS: when true an endpoint path that is an absolute `http(s)://` URL is used verbatim,
   * so the request may leave the configured origin (and carry the auth token with it).
   * Default false; generated clients never need this.
   */
  allowAbsoluteUrls?: boolean;
}

export interface RequestSpec {
  method: HttpMethod;
  /** Path template such as `/users/{id}`. */
  path: string;
  params?: Readonly<Record<string, PathParamValue>>;
  query?: Readonly<Record<string, unknown>> | undefined;
  headers?: Readonly<Record<string, HeaderValue>> | undefined;
  body?: unknown;
  /** `json` (default) requires a JSON body; `none` ignores any body (e.g. 204 endpoints). */
  response?: "json" | "none";
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

/** Expand `{name}` placeholders with strictly encoded values. */
export function expandPath(
  template: string,
  params: Readonly<Record<string, PathParamValue>> = {},
): string {
  return template.replace(/\{([^{}]+)\}/g, (_m, name: string) => {
    const raw = params[name];
    if (raw === undefined)
      throw new RequestError(`Missing path parameter "${name}" for ${template}`);
    const value = String(raw);
    if (value === "" || value === "." || value === "..")
      throw new RequestError(`Invalid value for path parameter "${name}"`);
    return encodeURIComponent(value);
  });
}

function appendQuery(search: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) appendQuery(search, name, item);
    return;
  }
  if (value instanceof Date) return void search.append(name, value.toISOString());
  switch (typeof value) {
    case "string":
      return void search.append(name, value);
    case "number":
      if (!Number.isFinite(value))
        throw new RequestError(`Query parameter "${name}" is not finite`);
      return void search.append(name, String(value));
    case "boolean":
      return void search.append(name, value ? "true" : "false");
    default:
      throw new RequestError(
        `Query parameter "${name}" must be a primitive, Date or array of primitives`,
      );
  }
}

/** `a=1&a=2` style (exploded arrays); `undefined`/`null` are skipped; nested objects are rejected. */
export function serializeQuery(query: Readonly<Record<string, unknown>> | undefined): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const name of Object.keys(query)) appendQuery(search, name, query[name]);
  return search.toString();
}

/** Resolve a request URL, guaranteeing it stays on the configured origin. */
export function buildUrl(
  base: URL,
  spec: Pick<RequestSpec, "path" | "params" | "query">,
  allowAbsoluteUrls: boolean,
): URL {
  const expanded = expandPath(spec.path, spec.params);
  let url: URL;
  if (ABSOLUTE_URL.test(expanded) || expanded.startsWith("//")) {
    if (!allowAbsoluteUrls || !/^https?:\/\//i.test(expanded))
      throw new RequestError(
        "Endpoint path must be relative to the configured baseUrl (set allowAbsoluteUrls to override)",
      );
    url = new URL(expanded);
  } else {
    if (!expanded.startsWith("/")) throw new RequestError("Endpoint path must start with '/'");
    url = new URL(base.href);
    url.search = "";
    url.hash = "";
    // Assigning `pathname` can never change the origin, unlike `new URL(path, base)` with "//host".
    url.pathname = base.pathname.replace(/\/+$/, "") + expanded;
    if (url.origin !== base.origin) throw new RequestError("Request URL escaped the base origin");
  }
  const qs = serializeQuery(spec.query);
  if (qs) url.search = qs;
  return url;
}

function isJsonContentType(value: string | null): boolean {
  return value !== null && /(^|[/+])json(\s*;|$)/i.test(value.trim());
}

async function readErrorBody(response: Response, signal: AbortSignal): Promise<unknown> {
  let text: string;
  try {
    text = await raceAbort(response.text(), signal);
  } catch {
    return undefined;
  }
  if (text === "") return undefined;
  if (isJsonContentType(response.headers.get("content-type"))) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

export class HttpClient {
  readonly #base: URL;
  readonly #options: HttpClientOptions;
  readonly #transport: Transport;

  constructor(options: HttpClientOptions) {
    let base: URL;
    try {
      base = new URL(options.baseUrl);
    } catch (cause) {
      throw new RequestError(`baseUrl must be an absolute URL: ${String(cause)}`);
    }
    if (base.protocol !== "http:" && base.protocol !== "https:")
      throw new RequestError("baseUrl must use http or https");
    this.#base = base;
    this.#options = options;
    this.#transport = options.transport ?? ((request) => globalThis.fetch(request));
  }

  async request<TData>(spec: RequestSpec): Promise<TData> {
    const url = buildUrl(this.#base, spec, this.#options.allowAbsoluteUrls === true);
    const safeUrl = url.origin + url.pathname;
    const method = spec.method.toUpperCase();

    const headers = new Headers(this.#options.headers);
    if (this.#options.getToken) {
      const token = await this.#options.getToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
    }
    if (spec.headers)
      for (const [name, value] of Object.entries(spec.headers))
        if (value !== undefined) headers.set(name, String(value));
    if (!headers.has("accept")) headers.set("accept", "application/json");

    let body: string | undefined;
    if (spec.body !== undefined) {
      try {
        body = JSON.stringify(spec.body);
      } catch (cause) {
        throw new RequestError(`Request body is not JSON-serializable: ${String(cause)}`);
      }
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }

    // Link caller abort + timeout into one controller so we can tell them apart.
    const controller = new AbortController();
    const userSignal = spec.signal;
    userSignal?.throwIfAborted();
    const onUserAbort = (): void => controller.abort(userSignal?.reason);
    userSignal?.addEventListener("abort", onUserAbort, { once: true });
    const timeoutMs = spec.timeoutMs ?? this.#options.timeoutMs;
    let timedOut = false;
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs);

    try {
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined) init.body = body;
      const request = new Request(url, init);

      let response: Response;
      try {
        // raced against the signal so a transport that ignores it can never hang the call
        response = await raceAbort(this.#run(request), controller.signal);
      } catch (error) {
        if (timedOut && timeoutMs !== undefined) throw new TimeoutError(timeoutMs);
        if (userSignal?.aborted)
          throw userSignal.reason ?? new DOMException("Aborted", "AbortError");
        if (error instanceof NexError) throw error;
        throw new NetworkError(`Network request failed: ${method} ${safeUrl}`, { cause: error });
      }

      try {
        if (!response.ok) {
          const errorBody = await readErrorBody(response, controller.signal);
          throw new HttpError({
            status: response.status,
            statusText: response.statusText,
            body: errorBody,
            method,
            url: safeUrl,
          });
        }
        if (spec.response === "none" || response.status === 204 || response.status === 205) {
          await response.body?.cancel().catch(() => undefined);
          return undefined as TData;
        }
        const text = await raceAbort(response.text(), controller.signal);
        if (text === "")
          throw new ParseError(
            `Expected a JSON body from ${method} ${safeUrl} but it was empty`,
            response.status,
          );
        try {
          return JSON.parse(text) as TData;
        } catch (cause) {
          throw new ParseError(
            `Malformed JSON in response from ${method} ${safeUrl}`,
            response.status,
            { cause },
          );
        }
      } catch (error) {
        if (timedOut && timeoutMs !== undefined && !(error instanceof HttpError))
          throw new TimeoutError(timeoutMs);
        if (userSignal?.aborted && !(error instanceof HttpError))
          throw userSignal.reason ?? new DOMException("Aborted", "AbortError");
        throw error;
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      userSignal?.removeEventListener("abort", onUserAbort);
    }
  }

  #run(request: Request): Promise<Response> {
    const stack = this.#options.middleware ?? [];
    const dispatch = (index: number, req: Request): Promise<Response> => {
      const mw = stack[index];
      if (mw === undefined) return this.#transport(req);
      return mw(req, (next) => dispatch(index + 1, next));
    };
    return dispatch(0, request);
  }
}
