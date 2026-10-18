import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryObserver, dehydrate, hydrate } from "../src/index.js";
import { flush, makeClient } from "./helpers.js";

const fetcher = <T>(value: T) => vi.fn(() => Promise.resolve(value));

describe("dehydrate", () => {
  it("includes confirmed successful data only (no errors, pending, optimistic patches)", async () => {
    const { client } = makeClient();
    await client.fetchQuery({
      queryKey: ["ok"],
      queryFn: () => Promise.resolve({ v: 1 }),
      retry: false,
    });
    await client
      .fetchQuery({
        queryKey: ["bad"],
        queryFn: () => Promise.reject(new Error("secret internals")),
        retry: false,
      })
      .catch(() => undefined);
    client.buildQuery({ queryKey: ["never-fetched"] });
    await client.fetchQuery({
      queryKey: ["list"],
      queryFn: () => Promise.resolve([1]),
      retry: false,
    });
    client.optimistic<number[]>(["list"], (old) => [...(old ?? []), 2]);
    const state = dehydrate(client);
    expect(state.queries.map((q) => q.queryKey)).toEqual([["ok"], ["list"]]);
    expect(state.queries[1]?.data).toEqual([1]); // not [1, 2]
    expect(JSON.stringify(state)).not.toContain("secret internals");
    expect(JSON.parse(JSON.stringify(state))).toEqual(state); // JSON round trip
    expect(dehydrate(client, { shouldDehydrate: (q) => q.key[0] === "ok" }).queries).toHaveLength(
      1,
    );
  });
});

describe("hydrate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("restores data and timestamps, so staleness stays honest and no request is made while fresh", async () => {
    const server = makeClient().client;
    await server.fetchQuery({
      queryKey: ["u", 1],
      queryFn: () => Promise.resolve({ name: "Ada" }),
      retry: false,
    });
    const state = JSON.parse(JSON.stringify(dehydrate(server))) as unknown;

    const browser = makeClient().client;
    hydrate(browser, state);
    const fn = fetcher({ name: "Fresh" });
    const options = { queryKey: ["u", 1], queryFn: fn, staleTime: 60_000, retry: false };
    const o = new QueryObserver<{ name: string }, Error, { name: string }>(browser, options);
    expect(o.getResult().data).toEqual({ name: "Ada" }); // present before any effect/subscription
    const stop = o.subscribe(() => undefined);
    await flush();
    expect(fn).not.toHaveBeenCalled();
    stop();

    vi.advanceTimersByTime(61_000); // server data is older than staleTime now
    const o2 = new QueryObserver<{ name: string }, Error, { name: string }>(browser, options);
    const stop2 = o2.subscribe(() => undefined);
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(o2.getResult().data).toEqual({ name: "Fresh" });
    stop2();
  });

  it("never replaces newer data with older dehydrated data", async () => {
    const a = makeClient().client;
    await a.fetchQuery({ queryKey: ["k"], queryFn: () => Promise.resolve("old"), retry: false });
    const old = dehydrate(a);
    vi.advanceTimersByTime(5000);
    const b = makeClient().client;
    await b.fetchQuery({ queryKey: ["k"], queryFn: () => Promise.resolve("new"), retry: false });
    hydrate(b, old);
    expect(b.getData(["k"])).toBe("new");
    hydrate(a, dehydrate(b));
    expect(a.getData(["k"])).toBe("new");
  });

  it("validates untrusted input before writing anything", () => {
    const { client } = makeClient();
    const bad: unknown[] = [
      null,
      "string",
      {},
      { version: 2, queries: [] },
      { version: 1, queries: "x" },
      { version: 1, queries: [null] },
      { version: 1, queries: [{ queryKey: "k", data: 1, dataUpdatedAt: 1 }] },
      { version: 1, queries: [{ queryKey: ["k"], data: 1, dataUpdatedAt: "1" }] },
      { version: 1, queries: [{ queryKey: ["k"], data: 1, dataUpdatedAt: -5 }] },
      { version: 1, queries: [{ queryKey: ["k"], dataUpdatedAt: 5 }] },
      { version: 1, queries: [{ queryKey: [() => 1], data: 1, dataUpdatedAt: 5 }] },
      // a valid entry followed by an invalid one must not be half-applied
      {
        version: 1,
        queries: [
          { queryKey: ["good"], data: 1, dataUpdatedAt: 5 },
          { queryKey: 7, data: 1, dataUpdatedAt: 5 },
        ],
      },
    ];
    for (const state of bad) expect(() => hydrate(client, state)).toThrow(TypeError);
    expect(client.size).toBe(0);
  });

  it("does not let hydrated keys such as __proto__ pollute anything", () => {
    const { client } = makeClient();
    hydrate(
      client,
      JSON.parse(
        '{"version":1,"queries":[{"queryKey":["x",{"__proto__":{"polluted":true}}],"data":{"__proto__":{"polluted":true}},"dataUpdatedAt":5}]}',
      ),
    );
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("initialData", () => {
  it("seeds a new entry (value or factory), honours initialDataUpdatedAt, and never overrides existing data", async () => {
    vi.useFakeTimers();
    const { client } = makeClient();
    const fn = fetcher("server");
    const base = { queryKey: ["k"], queryFn: fn, retry: false, staleTime: 1000 };
    const o = new QueryObserver<string, Error, string>(client, {
      ...base,
      initialData: () => "seed",
      initialDataUpdatedAt: Date.now(),
    });
    expect(o.getResult()).toMatchObject({ data: "seed", status: "success", isStale: false });
    const stop = o.subscribe(() => undefined);
    await flush();
    expect(fn).not.toHaveBeenCalled(); // seeded as fresh
    stop();
    const second = new QueryObserver<string, Error, string>(client, {
      ...base,
      initialData: "ignored",
    });
    expect(second.getResult().data).toBe("seed");

    const stale = new QueryObserver<string, Error, string>(client, {
      ...base,
      queryKey: ["old"],
      initialData: "x",
      initialDataUpdatedAt: Date.now() - 5000,
    });
    expect(stale.getResult()).toMatchObject({ data: "x", isStale: true });
    const stop2 = stale.subscribe(() => undefined);
    await flush();
    expect(fn).toHaveBeenCalledTimes(1); // stale seed refetches on mount
    expect(stale.getResult().data).toBe("server");
    stop2();
    vi.useRealTimers();
  });
});
