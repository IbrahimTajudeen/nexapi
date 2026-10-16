import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfiniteQueryObserver, QueryObserver, type InfiniteQueryOptions } from "../src/index.js";
import { deferred, flush, makeClient } from "./helpers.js";

type Page = { items: number[]; next: number | null };
const TOTAL = 3;

function setup(extra: Partial<InfiniteQueryOptions<Page, Error, number>> = {}) {
  const { client } = makeClient();
  const calls: number[] = [];
  let version = 0;
  const options: InfiniteQueryOptions<Page, Error, number> = {
    queryKey: ["feed"],
    retry: false,
    queryFn: ({ pageParam }) => {
      calls.push(pageParam);
      return Promise.resolve({
        items: [pageParam * 10 + version],
        next: pageParam + 1 < TOTAL ? pageParam + 1 : null,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.next,
    ...extra,
  };
  const observer = new InfiniteQueryObserver(client, options);
  const stop = observer.subscribe(() => undefined);
  return { client, observer, stop, calls, bump: () => void version++, options };
}

describe("InfiniteQueryObserver", () => {
  it("loads the first page, then appends pages until there are no more", async () => {
    const { observer, calls, stop } = setup();
    await flush();
    expect(observer.getResult().data?.pages).toEqual([{ items: [0], next: 1 }]);
    expect(observer.getResult().hasNextPage).toBe(true);
    await observer.fetchNextPage();
    await observer.fetchNextPage();
    expect(observer.getResult().data?.pages.map((p) => p.items[0])).toEqual([0, 10, 20]);
    expect(observer.getResult().data?.pageParams).toEqual([0, 1, 2]);
    expect(observer.getResult().hasNextPage).toBe(false);
    await observer.fetchNextPage(); // no-op
    expect(calls).toEqual([0, 1, 2]);
    stop();
  });

  it("reports isFetchingNextPage only for next-page loads, not for refetches", async () => {
    const gate = deferred<Page>();
    let n = 0;
    const { observer, stop } = setup({
      queryFn: ({ pageParam }) =>
        ++n === 2 ? gate.promise : Promise.resolve({ items: [pageParam], next: pageParam + 1 }),
    });
    await flush();
    const pending = observer.fetchNextPage();
    expect(observer.getResult()).toMatchObject({ isFetchingNextPage: true, isFetching: true });
    gate.resolve({ items: [1], next: 2 });
    await pending;
    expect(observer.getResult().isFetchingNextPage).toBe(false);
    void observer.getResult().data;
    stop();
  });

  it("refetch re-requests every loaded page in order (no mixing of moments)", async () => {
    const { observer, client, calls, bump, stop } = setup();
    await flush();
    await observer.fetchNextPage();
    await observer.fetchNextPage();
    calls.length = 0;
    bump();
    await client.invalidateQueries(["feed"]);
    expect(calls).toEqual([0, 1, 2]);
    expect(observer.getResult().data?.pages.map((p) => p.items[0])).toEqual([1, 11, 21]);
    stop();
  });

  it("a failed next-page fetch keeps the pages already loaded and a later refetch still works", async () => {
    let fail = false;
    const { observer, stop } = setup({
      queryFn: ({ pageParam }) =>
        fail && pageParam === 1
          ? Promise.reject(new Error("page 2 down"))
          : Promise.resolve({
              items: [pageParam],
              next: pageParam + 1 < TOTAL ? pageParam + 1 : null,
            }),
    });
    await flush();
    fail = true;
    await observer.fetchNextPage();
    expect(observer.getResult()).toMatchObject({ status: "error", isFetchingNextPage: false });
    expect(observer.getResult().data?.pages).toHaveLength(1);
    expect(observer.getResult().error?.message).toBe("page 2 down");
    fail = false;
    await observer.fetchNextPage();
    expect(observer.getResult()).toMatchObject({ status: "success", error: null });
    expect(observer.getResult().data?.pages).toHaveLength(2);
    stop();
  });

  it("fetchNextPage does not replace the query's stored queryFn", async () => {
    const { observer, client, calls, stop } = setup();
    await flush();
    await observer.fetchNextPage();
    calls.length = 0;
    await client.refetchQueries(["feed"]);
    expect(calls).toEqual([0, 1]); // full refetch, not a "next page" fetch
    stop();
  });

  it("starts from nothing when fetchNextPage is called before data exists, and supports select", async () => {
    const { client } = makeClient();
    const observer = new InfiniteQueryObserver<Page, Error, number, number[]>(client, {
      queryKey: ["sel"],
      retry: false,
      queryFn: ({ pageParam }) => Promise.resolve({ items: [pageParam], next: pageParam + 1 }),
      initialPageParam: 0,
      getNextPageParam: (last) => last.next,
      select: (d) => d.pages.flatMap((p) => p.items),
      enabled: false,
    });
    const stop = observer.subscribe(() => undefined);
    await observer.fetchNextPage();
    expect(observer.getResult().data).toEqual([0]);
    await observer.fetchNextPage();
    expect(observer.getResult().data).toEqual([0, 1]);
    stop();
  });

  it("keeps result identity stable between unrelated reads", async () => {
    const { observer, stop } = setup();
    await flush();
    expect(observer.getResult()).toBe(observer.getResult());
    stop();
  });
});

describe("refetchInterval", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls while observed and stops when unobserved, disabled or switched off", async () => {
    const { client } = makeClient();
    const fn = vi.fn(() => Promise.resolve(1));
    const options = { queryKey: ["poll"], queryFn: fn, retry: false, refetchInterval: 1000 };
    const observer = new QueryObserver<number, Error, number>(client, options);
    const stop = observer.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fn).toHaveBeenCalledTimes(4);
    observer.setOptions({ ...options, enabled: false });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(4);
    observer.setOptions({ ...options, refetchInterval: 500 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(7); // re-enabling a stale query fetches at once (+1), then two 500ms ticks (+2)
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(7);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1); // only the (unref'd) gc timer may remain
  });

  it("never stacks requests: a tick during an in-flight fetch is skipped", async () => {
    const { client } = makeClient();
    const gate = deferred<number>();
    const fn = vi.fn(() => gate.promise);
    const observer = new QueryObserver<number, Error, number>(client, {
      queryKey: ["slow"],
      queryFn: fn,
      retry: false,
      refetchInterval: 100,
    });
    const stop = observer.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    gate.resolve(1);
    stop();
  });
});
