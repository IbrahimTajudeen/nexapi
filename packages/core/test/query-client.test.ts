import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "../src/index.js";
import { CancelledError, HttpError, QueryObserver, type QueryOptions } from "../src/index.js";
import { deferred, flush, makeClient } from "./helpers.js";

type Opts<T> = QueryOptions<T, Error, T>;
const opts = <T>(
  key: unknown[],
  queryFn: Opts<T>["queryFn"],
  extra: Partial<Opts<T>> = {},
): Opts<T> => ({
  queryKey: key,
  queryFn,
  retry: false,
  ...extra,
});
const watch = <T>(
  client: QueryClient,
  o: Opts<T>,
): { observer: QueryObserver<T, Error, T>; stop: () => void; renders: () => number } => {
  const observer = new QueryObserver<T, Error, T>(client, o);
  let n = 0;
  const stop = observer.subscribe(() => n++);
  return { observer, stop, renders: () => n };
};

describe("fetching, deduplication and keys", () => {
  it("runs one request for concurrent identical queries and shares the result", async () => {
    const { client } = makeClient();
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const a = watch(client, opts(["k", { b: 1, a: 2 }], fn));
    const b = watch(client, opts(["k", { a: 2, b: 1 }], fn)); // same canonical key
    const c = client.fetchQuery(opts(["k", { a: 2, b: 1 }], fn));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(a.observer.getResult().isLoading).toBe(true);
    d.resolve("data");
    await expect(c).resolves.toBe("data");
    expect(a.observer.getResult().data).toBe("data");
    expect(b.observer.getResult().data).toBe("data");
    expect(client.size).toBe(1);
  });

  it("keeps different inputs in different entries", async () => {
    const { client } = makeClient();
    const fn = vi.fn(({ queryKey }: { queryKey: readonly unknown[] }) =>
      Promise.resolve(String(queryKey[1])),
    );
    await client.fetchQuery(opts(["k", 1], fn));
    await client.fetchQuery(opts(["k", 2], fn));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(client.getData(["k", 1])).toBe("1");
    expect(client.getData(["k", 2])).toBe("2");
  });

  it("isolates caches between client instances", async () => {
    const a = makeClient().client;
    const b = makeClient().client;
    await a.fetchQuery(opts(["me"], () => Promise.resolve("alice")));
    await b.fetchQuery(opts(["me"], () => Promise.resolve("bob")));
    expect(a.getData(["me"])).toBe("alice");
    expect(b.getData(["me"])).toBe("bob");
    a.clear();
    expect(b.getData(["me"])).toBe("bob");
  });

  it("applies client defaults under per-query options", async () => {
    const { client } = makeClient({ defaultOptions: { queries: { staleTime: 10_000 } } });
    const fn = vi.fn(() => Promise.resolve(1));
    await client.fetchQuery(opts(["k"], fn));
    await client.fetchQuery(opts(["k"], fn)); // fresh by default staleTime
    expect(fn).toHaveBeenCalledTimes(1);
    await client.fetchQuery(opts(["k"], fn, { staleTime: 0 }));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("supports void (no-content) data without treating it as 'no data'", async () => {
    const { client } = makeClient();
    const fn = vi.fn(() => Promise.resolve(undefined));
    const w = watch(client, opts<undefined>(["void"], fn, { staleTime: Infinity }));
    await flush();
    expect(w.observer.getResult().status).toBe("success");
    w.stop();
    const w2 = watch(client, opts<undefined>(["void"], fn, { staleTime: Infinity }));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1); // fresh: not refetched on mount
    w2.stop();
  });
});

describe("freshness", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not refetch fresh data on mount but does once stale", async () => {
    const { client } = makeClient();
    const fn = vi.fn(() => Promise.resolve("v"));
    const o = opts(["k"], fn, { staleTime: 1000, gcTime: Infinity });
    const mountAndSettle = async (): Promise<void> => {
      const w = watch(client, o);
      await flush(); // let the request finish; unsubscribing earlier would (rightly) cancel it
      w.stop();
    };
    await mountAndSettle();
    expect(fn).toHaveBeenCalledTimes(1);
    await mountAndSettle();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    await mountAndSettle();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("flips isStale for subscribed observers when staleTime elapses", async () => {
    const { client } = makeClient();
    const w = watch(
      client,
      opts(["k"], () => Promise.resolve("v"), { staleTime: 1000 }),
    );
    await flush();
    expect(w.observer.getResult().isStale).toBe(false);
    const before = w.renders();
    vi.advanceTimersByTime(1100);
    expect(w.observer.getResult().isStale).toBe(true);
    expect(w.renders()).toBe(before + 1);
  });

  it("staleTime: Infinity never goes stale unless invalidated", async () => {
    const { client } = makeClient();
    const fn = vi.fn(() => Promise.resolve("v"));
    const o = opts(["k"], fn, { staleTime: Infinity, gcTime: Infinity });
    await client.fetchQuery(o);
    vi.advanceTimersByTime(10 ** 9);
    await client.fetchQuery(o);
    expect(fn).toHaveBeenCalledTimes(1);
    await client.invalidateQueries(["k"]);
    await client.fetchQuery(o);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("invalidation and refetch", () => {
  it("refetches observed queries immediately and only marks unobserved ones", async () => {
    const { client } = makeClient();
    let n = 0;
    const fn = vi.fn(() => Promise.resolve(++n));
    const observed = watch(client, opts(["list", 1], fn, { staleTime: Infinity }));
    await client.fetchQuery(opts(["list", 2], fn, { staleTime: Infinity }));
    await flush();
    const calls = fn.mock.calls.length;
    await client.invalidateQueries(["list"]);
    expect(fn.mock.calls.length).toBe(calls + 1); // only the observed one refetched
    expect(observed.observer.getResult().isInvalidated).toBe(false);
    expect(client.getQuery(["list", 2])?.state.isInvalidated).toBe(true);
    // the unobserved one refetches when someone mounts it
    watch(client, opts(["list", 2], fn, { staleTime: Infinity })).stop();
    await flush();
    expect(fn.mock.calls.length).toBe(calls + 2);
  });

  it("supports exact and predicate filters", async () => {
    const { client } = makeClient();
    await client.fetchQuery(opts(["a"], () => Promise.resolve(1)));
    await client.fetchQuery(opts(["a", "b"], () => Promise.resolve(2)));
    expect(client.findAll({ queryKey: ["a"], exact: true })).toHaveLength(1);
    expect(client.findAll(["a"])).toHaveLength(2);
    expect(client.findAll({ predicate: (q) => q.key.length === 2 })).toHaveLength(1);
    expect(client.findAll({ active: true })).toHaveLength(0);
  });
});

describe("background refetch failures", () => {
  it("keeps previously successful data and records the error", async () => {
    const { client } = makeClient();
    let fail = false;
    const fn = vi.fn(() => (fail ? Promise.reject(new Error("boom")) : Promise.resolve("good")));
    const w = watch(client, opts(["k"], fn));
    await flush();
    expect(w.observer.getResult().data).toBe("good");
    fail = true;
    await w.observer.refetch();
    const r = w.observer.getResult();
    expect(r.data).toBe("good");
    expect(r.status).toBe("error");
    expect(r.error?.message).toBe("boom");
    expect(r.fetchStatus).toBe("idle");
    fail = false;
    await w.observer.refetch();
    expect(w.observer.getResult()).toMatchObject({ status: "success", error: null, data: "good" });
  });

  it("separates initial loading from background fetching", async () => {
    const { client } = makeClient();
    const d1 = deferred<string>();
    let d = d1;
    const w = watch(
      client,
      opts(["k"], () => d.promise),
    );
    expect(w.observer.getResult()).toMatchObject({
      status: "pending",
      fetchStatus: "fetching",
      isLoading: true,
    });
    d1.resolve("a");
    await flush();
    d = deferred<string>();
    void w.observer.refetch();
    expect(w.observer.getResult()).toMatchObject({
      status: "success",
      fetchStatus: "fetching",
      isLoading: false,
      data: "a",
    });
  });
});

describe("retries", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("retries with the configured delay and then succeeds", async () => {
    const { client } = makeClient();
    let calls = 0;
    const fn = vi.fn(() =>
      ++calls < 3 ? Promise.reject(new Error("flaky")) : Promise.resolve("ok"),
    );
    const p = client.fetchQuery(opts(["k"], fn, { retry: 2, retryDelay: 100 }));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(client.getQuery(["k"])?.state.failureCount).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe("ok");
    expect(client.getQuery(["k"])?.state.failureCount).toBe(0);
  });

  it("stops after the retry budget and surfaces the last error", async () => {
    const { client } = makeClient();
    const fn = vi.fn(() => Promise.reject(new Error("nope")));
    const p = client.fetchQuery(opts(["k"], fn, { retry: 1, retryDelay: 10 }));
    const assertion = expect(p).rejects.toThrow("nope");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("never retries deterministic HTTP failures by default, but retries 503", async () => {
    const { client } = makeClient();
    const http = (status: number): HttpError =>
      new HttpError({ status, statusText: "", body: undefined, method: "GET", url: "x" });
    const f400 = vi.fn(() => Promise.reject(http(400)));
    await expect(client.fetchQuery({ queryKey: ["a"], queryFn: f400 })).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(f400).toHaveBeenCalledTimes(1);

    let n = 0;
    const f503 = vi.fn(() => (++n < 2 ? Promise.reject(http(503)) : Promise.resolve("up")));
    const p = client.fetchQuery({ queryKey: ["b"], queryFn: f503, retryDelay: 5 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(p).resolves.toBe("up");
  });

  it("cancels a retry sleep", async () => {
    const { client } = makeClient();
    const fn = vi.fn(() => Promise.reject(new Error("x")));
    const p = client.fetchQuery(opts(["k"], fn, { retry: 5, retryDelay: 10_000 }));
    const assertion = expect(p).rejects.toBeInstanceOf(CancelledError);
    await flush();
    client.cancelQueries(["k"]);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("cancellation with multiple observers", () => {
  it("does not abort while any observer still needs the request", async () => {
    const { client } = makeClient();
    let signal!: AbortSignal;
    const d = deferred<string>();
    const fn = vi.fn(({ signal: s }: { signal: AbortSignal }) => ((signal = s), d.promise));
    const a = watch(client, opts(["k"], fn));
    const b = watch(client, opts(["k"], fn));
    a.stop();
    await flush();
    expect(signal.aborted).toBe(false);
    d.resolve("done");
    await flush();
    expect(b.observer.getResult().data).toBe("done");
  });

  it("aborts once the last observer leaves, and restores idle without losing state", async () => {
    const { client } = makeClient();
    let signal!: AbortSignal;
    const fn = vi.fn(({ signal: s }: { signal: AbortSignal }) => {
      signal = s;
      return new Promise<string>(() => undefined);
    });
    const a = watch(client, opts(["k"], fn));
    const b = watch(client, opts(["k"], fn));
    a.stop();
    b.stop();
    await flush();
    expect(signal.aborted).toBe(true);
    expect(client.getQuery(["k"])?.state).toMatchObject({ fetchStatus: "idle", status: "pending" });
  });

  it("survives an unsubscribe→resubscribe in the same tick (React Strict Mode)", async () => {
    const { client } = makeClient();
    let signal!: AbortSignal;
    const d = deferred<string>();
    const fn = vi.fn(({ signal: s }: { signal: AbortSignal }) => ((signal = s), d.promise));
    const o = opts(["k"], fn);
    const observer = new QueryObserver(client, o);
    const stop = observer.subscribe(() => undefined);
    stop();
    const stop2 = observer.subscribe(() => undefined);
    await flush();
    expect(signal.aborted).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    d.resolve("ok");
    await flush();
    expect(observer.getResult().data).toBe("ok");
    stop2();
  });

  it("never aborts a request that an imperative caller (prefetch/fetchQuery) is awaiting", async () => {
    const { client } = makeClient();
    let signal!: AbortSignal;
    const d = deferred<string>();
    const fn = vi.fn(({ signal: s }: { signal: AbortSignal }) => ((signal = s), d.promise));
    const o = opts(["k"], fn);
    const pending = client.fetchQuery(o);
    watch(client, o).stop(); // observer joins then leaves
    await flush();
    expect(signal.aborted).toBe(false);
    d.resolve("x");
    await expect(pending).resolves.toBe("x");
  });

  it("explicit cancelQueries rejects awaiting callers with CancelledError", async () => {
    const { client } = makeClient();
    const p = client.fetchQuery(opts(["k"], () => new Promise<string>(() => undefined)));
    client.cancelQueries(["k"]);
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(client.getQuery(["k"])?.state.fetchStatus).toBe("idle");
  });
});

describe("request races", () => {
  it("an obsolete response can never overwrite a newer one (either arrival order)", async () => {
    for (const oldFirst of [true, false]) {
      const { client } = makeClient();
      const slow = deferred<string>();
      const fast = deferred<string>();
      let call = 0;
      const fn = vi.fn(() => (++call === 1 ? slow.promise : fast.promise)); // ignores the abort signal on purpose
      const w = watch(client, opts(["k"], fn));
      await flush();
      void client.invalidateQueries(["k"]); // supersedes the in-flight request
      await flush();
      expect(fn).toHaveBeenCalledTimes(2);
      if (oldFirst) {
        slow.resolve("OLD");
        await flush();
        fast.resolve("NEW");
      } else {
        fast.resolve("NEW");
        await flush();
        slow.resolve("OLD");
      }
      await flush();
      expect(w.observer.getResult().data).toBe("NEW");
      expect(client.getQuery(["k"])?.state.fetchStatus).toBe("idle");
    }
  });

  it("callers awaiting a superseded request receive the newer result", async () => {
    const { client } = makeClient();
    const first = deferred<string>();
    const second = deferred<string>();
    let call = 0;
    const o = opts(["k"], () => (++call === 1 ? first.promise : second.promise));
    const awaiting = client.fetchQuery(o);
    await flush();
    void client.refetchQueries(["k"]);
    second.resolve("fresh");
    await expect(awaiting).resolves.toBe("fresh");
  });

  it("a manual write made while a request is in flight wins over that request's response", async () => {
    const { client } = makeClient();
    const d = deferred<string>();
    const w = watch(
      client,
      opts(["k"], () => d.promise),
    );
    await flush();
    client.setData(["k"], "manual");
    d.resolve("from-server-started-before-the-write");
    await flush();
    expect(w.observer.getResult()).toMatchObject({
      data: "manual",
      fetchStatus: "idle",
      status: "success",
    });
  });
});

describe("garbage collection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("removes unobserved entries after gcTime", async () => {
    const { client } = makeClient();
    await client.fetchQuery(opts(["k"], () => Promise.resolve(1), { gcTime: 1000 }));
    expect(client.size).toBe(1);
    vi.advanceTimersByTime(999);
    expect(client.size).toBe(1);
    vi.advanceTimersByTime(2);
    expect(client.size).toBe(0);
  });

  it("never removes an observed query, and restarts the clock when it is released", async () => {
    const { client } = makeClient();
    const w = watch(
      client,
      opts(["k"], () => Promise.resolve(1), { gcTime: 1000 }),
    );
    await flush();
    vi.advanceTimersByTime(60_000);
    expect(client.size).toBe(1);
    w.stop();
    vi.advanceTimersByTime(500);
    expect(client.size).toBe(1);
    vi.advanceTimersByTime(600);
    expect(client.size).toBe(0);
  });

  it("never removes a query with a request in flight", async () => {
    const { client } = makeClient();
    const d = deferred<number>();
    const p = client.fetchQuery(opts(["k"], () => d.promise, { gcTime: 100 }));
    vi.advanceTimersByTime(10_000);
    expect(client.size).toBe(1);
    d.resolve(1);
    await p;
    vi.advanceTimersByTime(101);
    expect(client.size).toBe(0);
  });

  it("gcTime: Infinity keeps entries until cleared; dispose() releases everything", async () => {
    const { client } = makeClient();
    await client.fetchQuery(opts(["k"], () => Promise.resolve(1), { gcTime: Infinity }));
    vi.advanceTimersByTime(10 ** 9);
    expect(client.size).toBe(1);
    client.dispose();
    expect(client.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("environment: focus and reconnect", () => {
  it("refetches stale observed queries on focus/reconnect and respects opt-outs", async () => {
    const { client, env } = makeClient();
    const fn = vi.fn(() => Promise.resolve("v"));
    const w = watch(client, opts(["k"], fn));
    const off = watch(
      client,
      opts(["off"], fn, { refetchOnWindowFocus: false, refetchOnReconnect: false }),
    );
    await flush();
    expect(fn).toHaveBeenCalledTimes(2);
    env.setFocused(false);
    env.setFocused(true);
    await flush();
    expect(fn).toHaveBeenCalledTimes(3); // only ["k"]
    env.setOnline(false);
    env.setOnline(true);
    await flush();
    expect(fn).toHaveBeenCalledTimes(4);
    w.stop();
    off.stop();
    env.setFocused(false);
    env.setFocused(true);
    await flush();
    expect(fn).toHaveBeenCalledTimes(4); // no observers: nothing to do, and listeners were detached
  });

  it("does not refetch fresh data on focus", async () => {
    const { client, env } = makeClient();
    const fn = vi.fn(() => Promise.resolve("v"));
    const w = watch(client, opts(["k"], fn, { staleTime: Infinity }));
    await flush();
    env.setFocused(false);
    env.setFocused(true);
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    w.stop();
  });
});

describe("observers: switching keys, enabled, select and notifications", () => {
  it("switches queries when options change and fetches the new one", async () => {
    const { client } = makeClient();
    const fn = vi.fn(({ queryKey }: { queryKey: readonly unknown[] }) =>
      Promise.resolve(`data-${String(queryKey[1])}`),
    );
    const w = watch(client, opts(["u", 1], fn));
    await flush();
    expect(w.observer.getResult().data).toBe("data-1");
    w.observer.setOptions(opts(["u", 2], fn));
    expect(w.observer.getResult().data).toBeUndefined();
    await flush();
    expect(w.observer.getResult().data).toBe("data-2");
    expect(client.getQuery(["u", 1])?.observerCount).toBe(0);
    expect(client.getQuery(["u", 2])?.observerCount).toBe(1);
  });

  it("enabled:false does not fetch until enabled", async () => {
    const { client } = makeClient();
    const fn = vi.fn(() => Promise.resolve("v"));
    const w = watch(client, opts(["k"], fn, { enabled: false }));
    await flush();
    expect(fn).not.toHaveBeenCalled();
    expect(w.observer.getResult()).toMatchObject({ status: "pending", fetchStatus: "idle" });
    w.observer.setOptions(opts(["k"], fn, { enabled: true }));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("memoizes select, keeps result identity stable, and can narrow notifications", async () => {
    const { client } = makeClient();
    const select = vi.fn((d: { n: number; other: number }) => d.n);
    let value = { n: 1, other: 1 };
    const w = watch(client, {
      ...opts(["k"], () => Promise.resolve(value)),
      select,
    } as unknown as Opts<{ n: number; other: number }>);
    await flush();
    const r1 = w.observer.getResult();
    expect(r1.data).toEqual(1 as unknown as { n: number; other: number });
    const calls = select.mock.calls.length;
    expect(w.observer.getResult()).toBe(r1);
    expect(select.mock.calls.length).toBe(calls);
    value = { n: 1, other: 2 };
    await w.observer.refetch();
    expect(select.mock.calls.length).toBe(calls + 1);

    // notifyOn: only status changes wake the listener
    const n = watch(
      client,
      opts(["n"], () => Promise.resolve(Math.random()), { notifyOn: ["status"] }),
    );
    await flush();
    const rendersAfterLoad = n.renders();
    await n.observer.refetch();
    await n.observer.refetch();
    expect(n.renders()).toBe(rendersAfterLoad);
  });

  it("captures a throwing select as an error result instead of crashing the cache", async () => {
    const { client } = makeClient();
    const w = watch(client, {
      ...opts(["k"], () => Promise.resolve(1)),
      select: () => {
        throw new Error("bad select");
      },
    });
    await flush();
    expect(w.observer.getResult()).toMatchObject({ status: "error", data: undefined });
    expect(w.observer.getResult().error?.message).toBe("bad select");
  });
});

describe("invalidation of failed entries", () => {
  it("a failed first load clears isInvalidated, but an entry that has data stays invalidated", async () => {
    const { client } = makeClient();
    const failing = client.buildQuery({ queryKey: ["first"] });
    await client
      .fetchQuery({
        queryKey: ["first"],
        queryFn: () => Promise.reject(new Error("x")),
        retry: false,
      })
      .catch(() => undefined);
    failing.invalidate();
    expect(failing.state.isInvalidated).toBe(true);
    await client
      .fetchQuery({
        queryKey: ["first"],
        queryFn: () => Promise.reject(new Error("x")),
        retry: false,
      })
      .catch(() => undefined);
    expect(failing.state.isInvalidated).toBe(false);

    client.setData(["has"], 1);
    const withData = client.buildQuery({ queryKey: ["has"] });
    withData.invalidate();
    await client
      .fetchQuery({
        queryKey: ["has"],
        queryFn: () => Promise.reject(new Error("x")),
        retry: false,
        staleTime: 0,
      })
      .catch(() => undefined);
    expect(withData.state).toMatchObject({ isInvalidated: true, data: 1, status: "error" });
  });
});
