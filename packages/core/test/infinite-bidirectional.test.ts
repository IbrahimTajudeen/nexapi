import { describe, expect, it } from "vitest";
import { InfiniteQueryObserver, type InfiniteQueryOptions } from "../src/index.js";
import { deferred, flush, makeClient } from "./helpers.js";

type Page = { id: number };

/** Pages are numbered 0..9 (a chat-like history); loading starts in the middle, at 5. */
function setup(extra: Partial<InfiniteQueryOptions<Page, Error, number>> = {}) {
  const { client } = makeClient();
  const calls: number[] = [];
  const options: InfiniteQueryOptions<Page, Error, number> = {
    queryKey: ["chat"],
    retry: false,
    queryFn: ({ pageParam }) => {
      calls.push(pageParam);
      return Promise.resolve({ id: pageParam });
    },
    initialPageParam: 5,
    getNextPageParam: (last) => (last.id < 9 ? last.id + 1 : null),
    getPreviousPageParam: (first) => (first.id > 0 ? first.id - 1 : null),
    ...extra,
  };
  const observer = new InfiniteQueryObserver(client, options);
  const stop = observer.subscribe(() => undefined);
  return { client, observer, stop, calls, options };
}
const ids = (o: InfiniteQueryObserver<Page, Error, number>): number[] =>
  o.getResult().data?.pages.map((p) => p.id) ?? [];

describe("bidirectional paging", () => {
  it("prepends previous pages and reports hasPreviousPage until the start", async () => {
    const { observer, stop } = setup({ initialPageParam: 2 });
    await flush();
    expect(observer.getResult()).toMatchObject({ hasPreviousPage: true, hasNextPage: true });
    await observer.fetchPreviousPage();
    await observer.fetchPreviousPage();
    expect(ids(observer)).toEqual([0, 1, 2]);
    expect(observer.getResult().data?.pageParams).toEqual([0, 1, 2]);
    expect(observer.getResult().hasPreviousPage).toBe(false);
    await observer.fetchPreviousPage(); // no-op
    expect(ids(observer)).toEqual([0, 1, 2]);
    stop();
  });

  it("reports isFetchingPreviousPage while loading, and not isFetchingNextPage", async () => {
    const gate = deferred<Page>();
    let first = true;
    const { observer, stop } = setup({
      queryFn: ({ pageParam }) => {
        if (first) {
          first = false;
          return Promise.resolve({ id: pageParam });
        }
        return gate.promise;
      },
    });
    await flush();
    const loading = observer.fetchPreviousPage();
    expect(observer.getResult()).toMatchObject({
      isFetchingPreviousPage: true,
      isFetchingNextPage: false,
    });
    gate.resolve({ id: 4 });
    await loading;
    expect(observer.getResult().isFetchingPreviousPage).toBe(false);
    expect(ids(observer)).toEqual([4, 5]);
    stop();
  });

  it("hasPreviousPage is false and fetchPreviousPage a no-op without getPreviousPageParam", async () => {
    const { observer, calls, stop } = setup({ getPreviousPageParam: undefined });
    await flush();
    await observer.fetchPreviousPage();
    expect(observer.getResult().hasPreviousPage).toBe(false);
    expect(calls).toEqual([5]);
    stop();
  });

  it("a second directional call joins the one in flight instead of racing it", async () => {
    const gate = deferred<Page>();
    const calls2: number[] = [];
    let n = 0;
    const { observer, stop } = setup({
      queryFn: ({ pageParam }) => {
        calls2.push(pageParam);
        return n++ === 0 ? Promise.resolve({ id: pageParam }) : gate.promise;
      },
    });
    await flush();
    const a = observer.fetchPreviousPage();
    const b = observer.fetchNextPage();
    gate.resolve({ id: 4 });
    await Promise.all([a, b]);
    expect(calls2).toEqual([5, 4]); // exactly one extra request
    expect(ids(observer)).toEqual([4, 5]);
    stop();
  });
});

describe("maxPages", () => {
  it("drops from the opposite end in each direction", async () => {
    const { observer, stop } = setup({ maxPages: 3 });
    await flush();
    await observer.fetchNextPage();
    await observer.fetchNextPage();
    expect(ids(observer)).toEqual([5, 6, 7]);
    await observer.fetchNextPage();
    expect(ids(observer)).toEqual([6, 7, 8]);
    expect(observer.getResult().data?.pageParams).toEqual([6, 7, 8]);
    await observer.fetchPreviousPage();
    expect(ids(observer)).toEqual([5, 6, 7]);
    // the dropped page is loadable again
    expect(observer.getResult()).toMatchObject({ hasPreviousPage: true, hasNextPage: true });
    stop();
  });

  it("refetch re-requests only the pages held, starting from the first one held", async () => {
    const { observer, calls, stop } = setup({ maxPages: 2 });
    await flush();
    await observer.fetchNextPage();
    await observer.fetchNextPage(); // holds [6, 7]
    calls.length = 0;
    await observer.getResult().refetch();
    expect(calls).toEqual([6, 7]);
    expect(ids(observer)).toEqual([6, 7]);
    stop();
  });

  it("refetch after fetchPreviousPage starts at the first loaded page, not initialPageParam", async () => {
    const { observer, calls, stop } = setup();
    await flush();
    await observer.fetchPreviousPage(); // [4, 5]
    calls.length = 0;
    await observer.getResult().refetch();
    expect(calls).toEqual([4, 5]);
    expect(ids(observer)).toEqual([4, 5]);
    stop();
  });

  it("rejects invalid values", () => {
    const { client } = makeClient();
    const base: InfiniteQueryOptions<Page, Error, number> = {
      queryKey: ["bad"],
      queryFn: ({ pageParam }) => Promise.resolve({ id: pageParam }),
      initialPageParam: 0,
      getNextPageParam: () => null,
    };
    for (const maxPages of [0, -1, 1.5, Number.NaN])
      expect(() => new InfiniteQueryObserver(client, { ...base, maxPages })).toThrow(RangeError);
  });
});
