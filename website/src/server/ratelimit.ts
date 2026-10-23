/**
 * A small fixed-window rate limiter. It lives in the memory of one server instance, so on a host
 * that runs several instances (Vercel) each keeps its own count: it slows down abuse and
 * accidental loops, it is not a hard global limit. Use the host's firewall for that.
 */
export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

export interface Verdict {
  allowed: boolean;
  /** Seconds until the caller may try again (0 when allowed). */
  retryAfter: number;
}

export class RateLimiter {
  private hits = new Map<string, { start: number; count: number }>();
  constructor(
    private readonly limit: Limit,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 5000,
  ) {}

  /** Count one request for `key` and say whether it is allowed. */
  take(key: string): Verdict {
    const t = this.now();
    let e = this.hits.get(key);
    if (!e || t - e.start >= this.limit.windowMs) {
      if (this.hits.size >= this.maxKeys) this.sweep(t);
      // Still full after sweeping: drop everything rather than grow without bound.
      if (this.hits.size >= this.maxKeys) this.hits.clear();
      e = { start: t, count: 0 };
      this.hits.set(key, e);
    }
    e.count += 1;
    if (e.count <= this.limit.max) return { allowed: true, retryAfter: 0 };
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((e.start + this.limit.windowMs - t) / 1000)),
    };
  }

  /** Whether `key` is already over the limit, without counting a request. */
  blocked(key: string): Verdict {
    const t = this.now();
    const e = this.hits.get(key);
    if (!e || t - e.start >= this.limit.windowMs || e.count < this.limit.max)
      return { allowed: true, retryAfter: 0 };
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((e.start + this.limit.windowMs - t) / 1000)),
    };
  }

  private sweep(t: number): void {
    for (const [k, e] of this.hits) if (t - e.start >= this.limit.windowMs) this.hits.delete(k);
  }
}

/** The caller's address as the host reports it (Vercel sets x-forwarded-for itself). */
export function clientKey(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}

export type Bucket = "read" | "write" | "sensitive" | "badauth";

const LIMITS: Record<Bucket, Limit> = {
  read: { max: 240, windowMs: 60_000 },
  write: { max: 60, windowMs: 60_000 },
  // Sending email and signing uploads cost real money or abuse potential.
  sensitive: { max: 12, windowMs: 60_000 },
  // Requests carrying a token that turned out to be invalid.
  badauth: { max: 20, windowMs: 60_000 },
};

export function createLimiters(now?: () => number): Record<Bucket, RateLimiter> {
  return {
    read: new RateLimiter(LIMITS.read, now),
    write: new RateLimiter(LIMITS.write, now),
    sensitive: new RateLimiter(LIMITS.sensitive, now),
    badauth: new RateLimiter(LIMITS.badauth, now),
  };
}

/** Which bucket a request counts against. */
export function bucketFor(method: string, path: readonly string[]): Bucket {
  const m = method.toUpperCase();
  const [head, second] = path;
  if ((head === "media" && second === "sign") || (head === "invites" && m === "POST"))
    return "sensitive";
  return m === "GET" || m === "HEAD" ? "read" : "write";
}
