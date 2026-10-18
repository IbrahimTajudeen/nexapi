import {
  HttpError,
  NyxError,
  ParseError,
  RequestError,
  ResponseValidationError,
} from "./errors.js";

export function noop(): void {
  /* intentionally empty */
}

/** Errors worth retrying: network trouble, timeouts and a few retryable HTTP statuses. */
export function isTransientError(error: unknown): boolean {
  if (error instanceof NyxError && error.retryable !== undefined) return error.retryable;
  if (error instanceof HttpError)
    return error.status >= 500 || error.status === 408 || error.status === 429;
  if (
    error instanceof ParseError ||
    error instanceof ResponseValidationError ||
    error instanceof RequestError
  )
    return false;
  return error instanceof NyxError; // NetworkError, TimeoutError
}

/** Default query retry: up to 3 retries, never for deterministic failures (4xx, parse, bad input). */
export function defaultQueryRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  if (error instanceof NyxError && error.retryable !== undefined) return error.retryable;
  if (error instanceof HttpError) return isTransientError(error);
  if (
    error instanceof ParseError ||
    error instanceof ResponseValidationError ||
    error instanceof RequestError
  )
    return false;
  return true;
}

export function defaultRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 30_000);
}

/** Sleep that wakes early (without rejecting) when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Settle with `promise`, or reject as soon as `signal` aborts, even if `promise` ignores the
 * signal. Cancellation therefore always releases waiting callers; a late result from the
 * abandoned promise is swallowed (and can never reach the cache: the run has been replaced).
 */
function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException("Aborted", "AbortError");
}

export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  promise.catch(noop); // avoid an unhandled rejection if it fails after we stopped listening
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(abortReason(signal));
    const onAbort = (): void => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        // Forward the caller's rejection untouched: user-supplied functions may reject with any value.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject(error);
      },
    );
  });
}

/** Timers must never keep a Node process (e.g. an SSR server or test runner) alive. */
export function setUnrefTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
  const timer = setTimeout(fn, ms);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  return timer;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Structural sharing for JSON-like data: returns `a` (previous) wherever `b` (next) is deeply
 * equal, so unchanged subtrees keep their identity. O(size of the smaller tree); opt-in.
 */
export function replaceEqualDeep<T>(a: unknown, b: T): T {
  if (Object.is(a, b)) return a as T;
  const bothArrays = Array.isArray(a) && Array.isArray(b);
  if (!bothArrays && !(isPlainObject(a) && isPlainObject(b))) return b;
  const aItems = (bothArrays ? a : Object.keys(a as object)) as unknown[];
  const bItems = (bothArrays ? b : Object.keys(b as object)) as unknown[];
  const copy: Record<string, unknown> | unknown[] = bothArrays ? [] : {};
  let equalItems = 0;
  for (let i = 0; i < bItems.length; i++) {
    const key = (bothArrays ? i : bItems[i]) as string | number;
    const prev = (a as Record<string | number, unknown>)[key];
    const next = (b as Record<string | number, unknown>)[key];
    if (!bothArrays && !(key in (a as object))) {
      (copy as Record<string, unknown>)[key as string] = next;
      continue;
    }
    const merged = replaceEqualDeep(prev, next);
    (copy as Record<string | number, unknown>)[key] = merged;
    if (merged === prev && (bothArrays ? i < aItems.length : true)) equalItems++;
  }
  return (aItems.length === bItems.length && equalItems === aItems.length ? a : copy) as T;
}
