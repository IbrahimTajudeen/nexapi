import { describe, expect, it, vi } from "vitest";
import { QueryObserver, createBrowserOnlineManager } from "../src/index.js";
import { deferred, flush, makeClient } from "./helpers.js";

describe("networkMode: paused while offline", () => {
  it("does not call queryFn offline, reports paused, and resumes once on reconnect", async () => {
    const { client, env } = makeClient();
    env.setOnline(false);
    const queryFn = vi.fn(() => Promise.resolve("data"));
    const observer = new QueryObserver(client, { queryKey: ["a"], queryFn, retry: false });
    // render-phase view already says paused, not fetching
    expect(observer.getResult()).toMatchObject({ fetchStatus: "paused", isPaused: true });
    const unsubscribe = observer.subscribe(() => undefined);
    await flush();
    expect(queryFn).not.toHaveBeenCalled();
    expect(observer.getResult()).toMatchObject({
      status: "pending",
      fetchStatus: "paused",
      isPaused: true,
      isFetching: false,
      isLoading: false,
    });

    env.setOnline(true);
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(observer.getResult()).toMatchObject({
      data: "data",
      fetchStatus: "idle",
      isPaused: false,
    });
    unsubscribe();
  });

  it("deduplicates: callers during the pause share one run", async () => {
    const { client, env } = makeClient();
    env.setOnline(false);
    const queryFn = vi.fn(() => Promise.resolve(1));
    const options = { queryKey: ["b"], queryFn, retry: false };
    const a = client.fetchQuery(options);
    const b = client.fetchQuery(options);
    await flush();
    expect(queryFn).not.toHaveBeenCalled();
    env.setOnline(true);
    expect(await Promise.all([a, b])).toEqual([1, 1]);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("pauses retries too: a failure that happens offline waits for reconnect before retrying", async () => {
    const { client, env } = makeClient();
    let calls = 0;
    const first = deferred<string>();
    const queryFn = vi.fn(() => (++calls === 1 ? first.promise : Promise.resolve("second")));
    const result = client.fetchQuery({
      queryKey: ["c"],
      queryFn,
      retry: 1,
      retryDelay: 0,
    });
    await flush();
    env.setOnline(false);
    first.reject(new Error("network down"));
    await flush();
    await new Promise((r) => setTimeout(r, 5));
    expect(queryFn).toHaveBeenCalledTimes(1); // retry is held back
    expect(client.getQuery(["c"])?.state.fetchStatus).toBe("paused");
    env.setOnline(true);
    expect(await result).toBe("second");
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("cancel while paused settles callers with CancelledError and returns to idle", async () => {
    const { client, env } = makeClient();
    env.setOnline(false);
    const queryFn = vi.fn(() => Promise.resolve(1));
    const pending = client.fetchQuery({ queryKey: ["d"], queryFn, retry: false });
    const outcome = pending.then(
      () => "ok",
      (e: unknown) => (e as Error).name,
    );
    await flush();
    client.getQuery(["d"])?.cancel();
    expect(await outcome).toBe("CancelledError");
    expect(client.getQuery(["d"])?.state.fetchStatus).toBe("idle");
    env.setOnline(true);
    await flush();
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('networkMode "always" ignores the online state', async () => {
    const { client, env } = makeClient();
    env.setOnline(false);
    const queryFn = vi.fn(() => Promise.resolve("local"));
    expect(
      await client.fetchQuery({ queryKey: ["e"], queryFn, retry: false, networkMode: "always" }),
    ).toBe("local");
  });

  it("an already-online fetch is unaffected (no paused flash)", async () => {
    const { client } = makeClient();
    const observer = new QueryObserver(client, {
      queryKey: ["f"],
      queryFn: () => Promise.resolve(1),
    });
    expect(observer.getResult().isPaused).toBe(false);
    expect(
      observer.getOptimisticResult({ queryKey: ["f"], queryFn: () => Promise.resolve(1) }),
    ).toMatchObject({
      fetchStatus: "fetching",
    });
  });
});

describe("createBrowserOnlineManager", () => {
  it("reports online outside a browser (a runtime without online events must never pause)", () => {
    expect(createBrowserOnlineManager().isOnline()).toBe(true);
  });
});
