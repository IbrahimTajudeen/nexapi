/**
 * Error taxonomy. Every error syncapi raises itself extends `NexError`.
 *
 * Security note: errors intentionally carry the request *method* and a sanitized URL
 * (origin + path, no query string) but never request headers or bodies, so that logging an
 * error cannot leak credentials.
 */
export class NexError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NexError";
  }
}

/** The server answered with a non-2xx status. `body` is the parsed error payload (JSON) or text. */
export class HttpError<TBody = unknown, TStatus extends number = number> extends NexError {
  readonly status: TStatus;
  readonly statusText: string;
  readonly body: TBody;
  readonly method: string;
  /** Origin + path only. The query string is stripped because it may contain secrets. */
  readonly url: string;

  constructor(init: {
    status: TStatus;
    statusText: string;
    body: TBody;
    method: string;
    url: string;
  }) {
    super(`${init.method} ${init.url} failed with status ${String(init.status)}`);
    this.name = "HttpError";
    this.status = init.status;
    this.statusText = init.statusText;
    this.body = init.body;
    this.method = init.method;
    this.url = init.url;
  }
}

/** The request never produced a response (DNS, connection reset, CORS, ...). */
export class NetworkError extends NexError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
  }
}

/** The request exceeded the configured timeout. */
export class TimeoutError extends NexError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Request timed out after ${String(timeoutMs)}ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** A 2xx response body could not be parsed as the expected format. */
export class ParseError extends NexError {
  readonly status: number;
  constructor(message: string, status: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ParseError";
    this.status = status;
  }
}

/** A 2xx response parsed fine but does not have the documented shape (opt-in validation). */
export class ResponseValidationError extends NexError {
  /** Positions and expectations only; the response data itself is never included. */
  readonly issues: readonly { path: string; expected: string; received: string }[];
  constructor(
    operation: string,
    issues: readonly { path: string; expected: string; received: string }[],
  ) {
    const first = issues[0];
    super(
      `Response of ${operation} does not match its schema: ${String(issues.length)} issue(s)` +
        (first
          ? `, first at ${first.path} (expected ${first.expected}, got ${first.received})`
          : ""),
    );
    this.name = "ResponseValidationError";
    this.issues = issues;
  }
}

/** The request could not be built from the supplied input (bad path param, bad query value...). */
export class RequestError extends NexError {
  constructor(message: string) {
    super(message);
    this.name = "RequestError";
  }
}

/** A query fetch was cancelled (explicitly, or because every observer went away). */
export class CancelledError extends NexError {
  constructor() {
    super("Query was cancelled");
    this.name = "CancelledError";
  }
}

/**
 * Type-level description of one documented error response (never constructed at runtime).
 * Generated clients describe errors as a union of these so `error.status` narrows `error.body`.
 */
export interface ErrorCase<TStatus extends number, TBody> {
  readonly status: TStatus;
  readonly body: TBody;
}

/** `ErrorCase<404, X>` → `HttpError<X, 404>`; any other type `T` → `HttpError<T>`. Distributes over unions. */
export type HttpErrorOf<T> = T extends ErrorCase<infer S, infer B> ? HttpError<B, S> : HttpError<T>;

/** Everything an endpoint call can reject with. `TBody` is a body type or a union of `ErrorCase`s. */
export type EndpointError<TBody = unknown> =
  | HttpErrorOf<TBody>
  | NetworkError
  | TimeoutError
  | ParseError
  | ResponseValidationError
  | RequestError;
