import { describe, expect, it } from "vitest";
import { QueryObserver, keepPreviousData } from "../src/index.js";
import { deferred, flush, makeClient } from "./helpers.js";

describe("placeholderData", () => {
  it("shows a constant placeholder as successful, flagged, and never writes it to the cache", async () => {
    const { client } = makeClient();
    const d = deferred<string>();
    const observer = new QueryObserver(client, {
      queryKey: ["a"],
      queryFn: () => d.promise,
      placeholderData: "loading…",
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    const first = observer.getResult();
    expect(first).toMatchObject({
      data: "loading…",
      status: "success",
      isPlaceholder: true,
      isPending: false,
      isFetching: true,
      dataUpdatedAt: 0,
      isStale: true,
    });
    expect(client.getData(["a"])).toBeUndefined();
    d.resolve("real");
    await flush();
    expect(observer.getResult()).toMatchObject({ data: "real", isPlaceholder: false });
    unsubscribe();
  });

  it("is not used once real data exists, and does not mask errors of a data-less query", async () => {
    const { client } = makeClient();
    client.setData(["b"], "cached");
    const withData = new QueryObserver(client, {
      queryKey: ["b"],
      queryFn: () => Promise.resolve("x"),
      placeholderData: "ph",
      staleTime: Infinity,
    });
    expect(withData.getResult()).toMatchObject({ data: "cached", isPlaceholder: false });

    const failing = new QueryObserver(client, {
      queryKey: ["c"],
      queryFn: () => Promise.reject(new Error("boom")),
      placeholderData: "ph",
      retry: false,
    });
    const unsubscribe = failing.subscribe(() => undefined);
    await flush();
    expect(failing.getResult()).toMatchObject({ status: "error", isPlaceholder: false });
    expect(failing.getResult().data).toBeUndefined();
    unsubscribe();
  });

  it("applies select to the placeholder", () => {
    const { client } = makeClient();
    const observer = new QueryObserver(client, {
      queryKey: ["s"],
      queryFn: () => Promise.resolve({ n: 2 }),
      placeholderData: { n: 1 },
      select: (v: { n: number }) => v.n * 10,
      enabled: false,
    });
    expect(observer.getResult()).toMatchObject({ data: 10, isPlaceholder: true });
  });

  it("keepPreviousData carries the previous key's data across a key switch", async () => {
    const { client } = makeClient();
    const page2 = deferred<string>();
    const make = (page: number) => ({
      queryKey: ["page", page],
      queryFn: () => (page === 1 ? Promise.resolve("one") : page2.promise),
      placeholderData: keepPreviousData,
      retry: false,
    });
    const observer = new QueryObserver(client, make(1));
    const unsubscribe = observer.subscribe(() => undefined);
    await flush();
    expect(observer.getResult().data).toBe("one");

    // render-phase view before the observer switches, and after
    expect(observer.getOptimisticResult(make(2))).toMatchObject({
      data: "one",
      isPlaceholder: true,
      isFetching: true,
    });
    observer.setOptions(make(2));
    expect(observer.getResult()).toMatchObject({ data: "one", isPlaceholder: true });
    page2.resolve("two");
    await flush();
    expect(observer.getResult()).toMatchObject({ data: "two", isPlaceholder: false });
    unsubscribe();
  });

  it("keepPreviousData yields nothing when there was no previous data", () => {
    const { client } = makeClient();
    const observer = new QueryObserver(client, {
      queryKey: ["fresh"],
      queryFn: () => Promise.resolve(1),
      placeholderData: keepPreviousData,
      enabled: false,
    });
    expect(observer.getResult()).toMatchObject({ status: "pending", isPlaceholder: false });
  });
});
