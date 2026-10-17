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
  /** Per-parameter query serialization; parameters not listed use the exploded default. */
  queryStyles?: Readonly<Record<string, QueryStyle>> | undefined;
  headers?: Readonly<Record<string, HeaderValue>> | undefined;
  body?: unknown;
  /** Encoding of `body`. Default `json`. */
  bodyKind?: BodyKind;
  /** `json` (default) requires a JSON body; `none` ignores any body (e.g. 204 endpoints). */
  response?: ResponseKind;
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

/** Serialization of one query parameter, beyond the default exploded form (`a=1&a=2`). */
export type QueryStyle = "csv" | "space" | "pipe" | "deepObject";

const DELIMITERS = { csv: ",", space: " ", pipe: "|" } as const;

/** A primitive's string form, or `undefined` when there is none to send (`undefined`/`null`). */
function scalar(name: string, value: unknown, what = "Query parameter"): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  switch (typeof value) {
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new RequestError(`${what} "${name}" is not finite`);
      return String(value);
    case "boolean":
      return value ? "true" : "false";
    default:
      throw new RequestError(`${what} "${name}" must be a primitive, Date or array of primitives`);
  }
}

function appendQuery(
  search: URLSearchParams,
  name: string,
  value: unknown,
  what = "Query parameter",
): void {
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) appendQuery(search, name, item, what);
    return;
  }
  const text = scalar(name, value, what);
  if (text !== undefined) search.append(name, text);
}

/** How a request body is encoded. `json` is the default. */
export type BodyKind = "json" | "form-data" | "urlencoded" | "binary" | "text";
/** How a successful response body is decoded. `none` ignores it. */
export type ResponseKind = "json" | "none" | "text" | "blob";

function plainRecord(body: unknown, what: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body) || body instanceof Blob)
    throw new RequestError(`${what} body must be a plain object`);
  return body as Record<string, unknown>;
}

function toFormData(body: unknown): FormData {
  if (body instanceof FormData) return body;
  const record = plainRecord(body, "multipart/form-data");
  const form = new FormData();
  const add = (name: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    if (value instanceof Blob) return void form.append(name, value);
    if (Array.isArray(value)) {
      for (const item of value as unknown[]) add(name, item);
      return;
    }
    const text = scalar(name, value, "Form field");
    if (text !== undefined) form.append(name, text);
  };
  for (const name of Object.keys(record)) add(name, record[name]);
  return form;
}

function toUrlEncoded(body: unknown): string {
  const record = plainRecord(body, "application/x-www-form-urlencoded");
  const search = new URLSearchParams();
  for (const name of Object.keys(record)) appendQuery(search, name, record[name], "Form field");
  return search.toString();
}

function encodeBody(kind: BodyKind, body: unknown, headers: Headers): BodyInit {
  switch (kind) {
    case "json": {
      let text: string;
      try {
        text = JSON.stringify(body);
      } catch (cause) {
        throw new RequestError(`Request body is not JSON-serializable: ${String(cause)}`);
      }
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      return text;
    }
    case "text":
      if (typeof body !== "string") throw new RequestError("A text body must be a string");
      if (!headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8");
      return body;
    case "binary":
      if (!(body instanceof Blob) && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body))
        throw new RequestError("A binary body must be a Blob, ArrayBuffer or typed array");
      if (!headers.has("content-type"))
        headers.set(
          "content-type",
          body instanceof Blob && body.type !== "" ? body.type : "application/octet-stream",
        );
      return body as BodyInit;
    case "urlencoded":
      if (!headers.has("content-type"))
        headers.set("content-type", "application/x-www-form-urlencoded");
      return toUrlEncoded(body);
    case "form-data":
      // no content-type: `fetch` adds `multipart/form-data; boundary=...` itself
      headers.delete("content-type");
      return toFormData(body);
  }
}

function appendStyled(
  search: URLSearchParams,
  name: string,
  value: unknown,
  style: QueryStyle,
): void {
  if (value === undefined || value === null) return;
  if (style === "deepObject") {
    if (typeof value !== "object" || Array.isArray(value) || value instanceof Date)
      throw new RequestError(`Query parameter "${name}" must be an object of primitives`);
    for (const key of Object.keys(value)) {
      if (/[[\]]/.test(key))
        throw new RequestError(`Query parameter "${name}" has a key containing "[" or "]"`);
      const text = scalar(`${name}[${key}]`, (value as Record<string, unknown>)[key]);
      if (text !== undefined) search.append(`${name}[${key}]`, text);
    }
    return;
  }
  if (!Array.isArray(value))
    throw new RequestError(`Query parameter "${name}" must be an array (${style}-delimited)`);
  const delimiter = DELIMITERS[style];
  const parts: string[] = [];
  for (const item of value as unknown[]) {
    const text = scalar(name, item);
    if (text === undefined) continue;
    if (text.includes(delimiter))
      throw new RequestError(
        `Query parameter "${name}" has a value containing its "${delimiter}" delimiter, which would be ambiguous`,
      );
    parts.push(text);
  }
  if (parts.length > 0) search.append(name, parts.join(delimiter));
}

/**
 * Default is `a=1&a=2` (exploded arrays). `styles` selects another form per parameter:
 * comma/space/pipe-delimited arrays and `deepObject` (`filter[a]=1`). `undefined`/`null` are
 * skipped; nested structures and values containing their own delimiter are rejected.
 */
export function serializeQuery(
  query: Readonly<Record<string, unknown>> | undefined,
  styles?: Readonly<Record<string, QueryStyle>>,
): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const name of Object.keys(query)) {
    const style = styles?.[name];
    if (style) appendStyled(search, name, query[name], style);
    else appendQuery(search, name, query[name]);
  }
  return search.toString();
}

/** Resolve a request URL, guaranteeing it stays on the configured origin. */
export function buildUrl(
  base: URL,
  spec: Pick<RequestSpec, "path" | "params" | "query" | "queryStyles">,
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
  const qs = serializeQuery(spec.query, spec.queryStyles);
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
    if (!headers.has("accept"))
      headers.set(
        "accept",
        spec.response === "text" ? "text/*" : spec.response === "blob" ? "*/*" : "application/json",
      );

    let body: BodyInit | undefined;
    if (spec.body !== undefined) body = encodeBody(spec.bodyKind ?? "json", spec.body, headers);

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
        if (spec.response === "text")
          return (await raceAbort(response.text(), controller.signal)) as TData;
        if (spec.response === "blob")
          return (await raceAbort(response.blob(), controller.signal)) as TData;
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
