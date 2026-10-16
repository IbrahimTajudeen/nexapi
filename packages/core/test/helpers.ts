import { ManualEnvironment, QueryClient, type QueryClientOptions } from "../src/index.js";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drain the microtask queue (works under fake timers). */
export async function flush(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

export function makeClient(options: QueryClientOptions = {}): {
  client: QueryClient;
  env: ManualEnvironment;
} {
  const env = new ManualEnvironment();
  const client = new QueryClient({
    focusManager: env.focus,
    onlineManager: env.online,
    ...options,
  });
  return { client, env };
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
