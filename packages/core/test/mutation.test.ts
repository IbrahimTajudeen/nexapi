import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HttpError,
  MutationObserver,
  NetworkError,
  QueryObserver,
  type MutationOptions,
  type QueryClient,
  type QueryOptions,
} from "../src/index.js";
import { deferred, flush, makeClient } from "./helpers.js";

type List = number[];
const LIST = ["list"] as const;
const append =
  (n: number) =>
  (old: List | undefined): List | undefined =>
    old ? [...old, n] : undefined;

async function seed(client: QueryClient, data: List = [1]): Promise<void> {
  await client.fetchQuery({
    queryKey: LIST,
    queryFn: () => Promise.resolve(data),
    gcTime: Infinity,
    retry: false,
  });
}
const visible = (client: QueryClient): List | undefined => client.getData<List>(LIST);

/** A mutation that optimistically appends `n` and then waits for the test to settle it. */
function appendMutation(client: QueryClient, n: number) {
  const gate = deferred<number>();
  const options: MutationOptions<number, Error, void, void> = {
    mutationFn: () => gate.promise,
    onMutate: (_v, { optimistic }) => {
      optimistic<List>(LIST, append(n));
    },
  };
  const promise = client.mutate(options, undefined);
  promise.catch(() => undefined);
  return { gate, promise };
}

describe("optimistic updates", () => {
  it("applies instantly and rolls back only its own effect on failure", async () => {
    const { client } = makeClient();
    await seed(client);
    const m = appendMutation(client, 2);
    await flush();
    expect(visible(client)).toEqual([1, 2]);
    m.gate.reject(new Error("server said no"));
    await expect(m.promise).rejects.toThrow("server said no");
    expect(visible(client)).toEqual([1]);
  });

  it("a failing older mutation never erases a newer, successful one", async () => {
    const { client } = makeClient();
    await seed(client);
    const m1 = appendMutation(client, 2); // older
    const m2 = appendMutation(client, 3); // newer
    await flush();
    expect(visible(client)).toEqual([1, 2, 3]);
    m2.gate.resolve(3); // newer succeeds first (its patch is committed but m1 is still pending)
    await m2.promise;
    expect(visible(client)).toEqual([1, 2, 3]);
    m1.gate.reject(new Error("older failed"));
    await expect(m1.promise).rejects.toThrow();
    expect(visible(client)).toEqual([1, 3]); // a whole-cache snapshot rollback would give [1]
    expect(client.getQuery(LIST)?.hasPatches).toBe(false); // everything folded into confirmed data
  });

  it("a failing newer mutation leaves the older pending one intact", async () => {
    const { client } = makeClient();
    await seed(client);
    const m1 = appendMutation(client, 2);
    const m2 = appendMutation(client, 3);
    await flush();
    m2.gate.reject(new Error("newer failed"));
    await expect(m2.promise).rejects.toThrow();
    expect(visible(client)).toEqual([1, 2]);
    m1.gate.resolve(2);
    await m1.promise;
    expect(visible(client)).toEqual([1, 2]);
  });

  it("keeps pending patches on top of a server response that has not seen them yet", async () => {
    const { client } = makeClient();
    await seed(client);
    const m = appendMutation(client, 2);
    await flush();
    await client.fetchQuery({ queryKey: LIST, queryFn: () => Promise.resolve([1]), retry: false }); // stale server snapshot
    expect(visible(client)).toEqual([1, 2]);
    m.gate.reject(new Error("x"));
    await m.promise.catch(() => undefined);
    expect(visible(client)).toEqual([1]);
  });

  it("does not double-apply a committed update that the server already includes", async () => {
    const { client } = makeClient();
    await seed(client);
    const older = appendMutation(client, 9); // stays pending, so the newer commit cannot fold yet
    const newer = appendMutation(client, 2);
    await flush();
    newer.gate.resolve(2);
    await newer.promise;
    expect(visible(client)).toEqual([1, 9, 2]);
    // A request that starts after `newer` committed returns server state containing it.
    await client.fetchQuery({
      queryKey: LIST,
      queryFn: () => Promise.resolve([1, 2]),
      retry: false,
    });
    expect(visible(client)).toEqual([1, 2, 9]); // not [1, 2, 9, 2]
    older.gate.resolve(9);
    await older.promise;
    expect(visible(client)).toEqual([1, 2, 9]);
  });

  it("manual transactions: independent rollback, idempotent commit/rollback", async () => {
    const { client } = makeClient();
    await seed(client);
    const a = client.optimistic<List>(LIST, append(2));
    const b = client.optimistic<List>(LIST, append(3));
    expect(a.size).toBe(1);
    expect(visible(client)).toEqual([1, 2, 3]);
    a.rollback();
    a.rollback();
    expect(visible(client)).toEqual([1, 3]);
    b.commit();
    b.rollback(); // already committed: no-op
    expect(visible(client)).toEqual([1, 3]);
    expect(b.status).toBe("committed");
  });

  it("skips queries without data and survives throwing updaters", async () => {
    const reported: unknown[] = [];
    const { client } = makeClient({ onUpdaterError: (e) => reported.push(e) });
    expect(client.optimistic<List>(["missing"], append(1)).size).toBe(0);
    await seed(client);
    client.optimistic<List>(LIST, () => {
      throw new Error("bad updater");
    });
    client.optimistic<List>(LIST, append(5));
    expect(visible(client)).toEqual([1, 5]);
    expect(reported).toHaveLength(2); // reported on each recompute, never thrown into the cache
  });

  it("setData during pending patches updates confirmed data and keeps patches on top", async () => {
    const { client } = makeClient();
    await seed(client);
    client.optimistic<List>(LIST, append(2));
    client.setData<List>(LIST, [10]);
    expect(visible(client)).toEqual([10, 2]);
    client.setData<List>(LIST, (old) => [...(old ?? []), 11]); // updater sees confirmed data
    expect(visible(client)).toEqual([10, 11, 2]);
  });

  it("notifies observers on apply and rollback", async () => {
    const { client } = makeClient();
    await seed(client);
    const o = new QueryObserver<List, Error, List>(client, {
      queryKey: LIST,
      queryFn: () => Promise.resolve([1]),
      staleTime: Infinity,
    });
    const seen: (List | undefined)[] = [];
    const stop = o.subscribe(() => seen.push(o.getResult().data));
    await flush();
    seen.length = 0;
    const tx = client.optimistic<List>(LIST, append(2));
    tx.rollback();
    expect(seen).toEqual([[1, 2], [1]]);
    stop();
  });
});

describe("mutation lifecycle", () => {
  it("runs onMutate → mutationFn → onSuccess → invalidation → onSettled in order", async () => {
    const { client } = makeClient();
    const log: string[] = [];
    let fetches = 0;
    const w = new QueryObserver<number, Error, number>(client, {
      queryKey: ["data"],
      queryFn: () => {
        log.push("refetch");
        return Promise.resolve(++fetches);
      },
      staleTime: Infinity,
    });
    const stop = w.subscribe(() => undefined);
    await flush();
    log.length = 0;
    const result = await client.mutate<string, Error, string, { ctx: number }>(
      {
        mutationFn: (v) => {
          log.push(`fn:${v}`);
          return Promise.resolve("result");
        },
        onMutate: (v) => {
          log.push(`mutate:${v}`);
          return { ctx: 7 };
        },
        onSuccess: (data, v, ctx) => void log.push(`success:${data}:${v}:${String(ctx?.ctx)}`),
        onError: () => void log.push("error"),
        onSettled: (data, err, _v, ctx) =>
          void log.push(`settled:${String(data)}:${String(err)}:${String(ctx?.ctx)}`),
        invalidates: [["data"]],
      },
      "vars",
    );
    expect(result).toBe("result");
    expect(log).toEqual([
      "mutate:vars",
      "fn:vars",
      "success:result:vars:7",
      "refetch",
      "settled:result:null:7",
    ]);
    expect(w.getResult().data).toBe(2);
    stop();
  });

  it("failure: onError then onSettled, rejects, and rolls back optimistic work", async () => {
    const { client } = makeClient();
    await seed(client);
    const log: string[] = [];
    const err = new Error("nope");
    await expect(
      client.mutate<void, Error, void, string>(
        {
          mutationFn: () => Promise.reject(err),
          onMutate: (_v, { optimistic }) => {
            optimistic<List>(LIST, append(2));
            return "ctx";
          },
          onSuccess: () => void log.push("success"),
          onError: (e, _v, ctx) => void log.push(`error:${e.message}:${String(ctx)}`),
          onSettled: (_d, e) => void log.push(`settled:${String(e?.message)}`),
          invalidates: [LIST],
        },
        undefined,
      ),
    ).rejects.toBe(err);
    expect(log).toEqual(["error:nope:ctx", "settled:nope"]);
    expect(visible(client)).toEqual([1]);
    expect(client.getQuery(LIST)?.state.isInvalidated).toBe(false); // no invalidation after failure
  });

  it("an onMutate failure skips the network call and rolls back what it already applied", async () => {
    const { client } = makeClient();
    await seed(client);
    const fn = vi.fn(() => Promise.resolve(1));
    await expect(
      client.mutate(
        {
          mutationFn: fn,
          onMutate: (_v, { optimistic }) => {
            optimistic<List>(LIST, append(2));
            throw new Error("onMutate failed");
          },
        },
        undefined,
      ),
    ).rejects.toThrow("onMutate failed");
    expect(fn).not.toHaveBeenCalled();
    expect(visible(client)).toEqual([1]);
  });

  it("tracks in-flight mutations", async () => {
    const { client } = makeClient();
    const d = deferred<void>();
    const p = client.mutate({ mutationFn: () => d.promise }, undefined);
    expect(client.isMutating()).toBe(1);
    d.resolve();
    await p;
    expect(client.isMutating()).toBe(0);
  });
});

describe("mutation scopes", () => {
  it("serializes network calls within a scope but applies optimistic updates immediately", async () => {
    const { client } = makeClient();
    await seed(client);
    const g1 = deferred<void>();
    const g2 = deferred<void>();
    const started: number[] = [];
    const make = (n: number, gate: ReturnType<typeof deferred<void>>) =>
      client.mutate(
        {
          scope: { id: "list" },
          mutationFn: () => (started.push(n), gate.promise),
          onMutate: (_v, { optimistic }) => void optimistic<List>(LIST, append(n)),
        },
        undefined,
      );
    const p1 = make(2, g1);
    const p2 = make(3, g2);
    await flush();
    expect(started).toEqual([2]); // #2 is queued…
    expect(visible(client)).toEqual([1, 2, 3]); // …but its optimistic effect is already visible
    g1.resolve();
    await p1;
    await flush();
    expect(started).toEqual([2, 3]);
    g2.resolve();
    await p2;
  });

  it("a failed mutation still releases the scope", async () => {
    const { client } = makeClient();
    const started: number[] = [];
    const p1 = client.mutate(
      { scope: { id: "s" }, mutationFn: () => (started.push(1), Promise.reject(new Error("x"))) },
      undefined,
    );
    const p2 = client.mutate(
      { scope: { id: "s" }, mutationFn: () => (started.push(2), Promise.resolve(2)) },
      undefined,
    );
    await expect(p1).rejects.toThrow();
    await expect(p2).resolves.toBe(2);
    expect(started).toEqual([1, 2]);
  });

  it("different scopes (and unscoped mutations) run concurrently", async () => {
    const { client } = makeClient();
    const started: string[] = [];
    const never = () => new Promise<void>(() => undefined);
    void client.mutate(
      { scope: { id: "a" }, mutationFn: () => (started.push("a"), never()) },
      undefined,
    );
    void client.mutate(
      { scope: { id: "b" }, mutationFn: () => (started.push("b"), never()) },
      undefined,
    );
    void client.mutate({ mutationFn: () => (started.push("c"), never()) }, undefined);
    await flush();
    expect(started).toEqual(["a", "b", "c"]);
  });
});

describe("mutation retry safety", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const http = (status: number): HttpError =>
    new HttpError({ status, statusText: "", body: undefined, method: "POST", url: "x" });

  it("never retries by default, even for transient failures", async () => {
    const { client } = makeClient();
    const fn = vi.fn(() => Promise.reject(new NetworkError("down")));
    await expect(client.mutate({ mutationFn: fn }, undefined)).rejects.toBeInstanceOf(NetworkError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries only after an explicit idempotency declaration, and only transient errors", async () => {
    const { client } = makeClient();
    let n = 0;
    const flaky = vi.fn(() =>
      ++n < 3 ? Promise.reject(new NetworkError("down")) : Promise.resolve("ok"),
    );
    const p = client.mutate(
      { mutationFn: flaky, retry: { idempotent: true, attempts: 3, delay: 10 } },
      undefined,
    );
    await vi.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toBe("ok");
    expect(flaky).toHaveBeenCalledTimes(3);

    const bad = vi.fn(() => Promise.reject(http(400)));
    await expect(
      client.mutate(
        { mutationFn: bad, retry: { idempotent: true, attempts: 3, delay: 10 } },
        undefined,
      ),
    ).rejects.toBeInstanceOf(HttpError);
    expect(bad).toHaveBeenCalledTimes(1); // 400 is deterministic: retrying cannot help
  });

  it("honours the attempts cap and a custom `when`", async () => {
    const { client } = makeClient();
    const fn = vi.fn(() => Promise.reject(http(409)));
    const p = client.mutate(
      {
        mutationFn: fn,
        retry: {
          idempotent: true,
          attempts: 2,
          delay: 1,
          when: (e) => e instanceof HttpError && e.status === 409,
        },
      },
      undefined,
    );
    const assertion = expect(p).rejects.toBeInstanceOf(HttpError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rejects an unsafe retry configuration at runtime (JS callers, casts)", () => {
    const { client } = makeClient();
    expect(() =>
      client.mutate(
        { mutationFn: () => Promise.resolve(1), retry: { attempts: 2 } as never },
        undefined,
      ),
    ).toThrow(TypeError);
    expect(() =>
      client.mutate({ mutationFn: () => Promise.resolve(1), retry: 3 as never }, undefined),
    ).toThrow(TypeError);
  });
});

describe("MutationObserver", () => {
  it("exposes status transitions to subscribers and swallows errors in mutate()", async () => {
    const { client } = makeClient();
    const d = deferred<string>();
    const observer = new MutationObserver<string, Error, number>(client, {
      mutationFn: () => d.promise,
    });
    const statuses: string[] = [];
    const stop = observer.subscribe(() => statuses.push(observer.getResult().status));
    expect(observer.getResult().isIdle).toBe(true);
    const onError = vi.fn();
    observer.getResult().mutate(1, { onError });
    expect(observer.getResult()).toMatchObject({ status: "pending", variables: 1 });
    d.reject(new Error("fail"));
    await flush();
    expect(observer.getResult().status).toBe("error");
    expect(onError).toHaveBeenCalledOnce();
    expect(statuses).toEqual(["pending", "error"]);
    observer.getResult().reset();
    expect(observer.getResult().status).toBe("idle");
    stop();
  });

  it("mutateAsync rejects, results keep stable identity, and only the latest mutation is reflected", async () => {
    const { client } = makeClient();
    const gates = [deferred<string>(), deferred<string>()];
    let i = 0;
    const observer = new MutationObserver<string, Error, void>(client, {
      mutationFn: () => gates[i++]!.promise,
    });
    const first = observer.getResult().mutateAsync();
    const second = observer.getResult().mutateAsync();
    gates[0]!.resolve("first");
    await first;
    expect(observer.getResult().status).toBe("pending"); // still tracking the second
    const stable = observer.getResult();
    expect(observer.getResult()).toBe(stable);
    gates[1]!.reject(new Error("second failed"));
    await expect(second).rejects.toThrow("second failed");
    expect(observer.getResult().status).toBe("error");
  });
});

describe("types of queries used by mutations", () => {
  it("fetchQuery accepts the QueryOptions shape produced by endpoints", async () => {
    const { client } = makeClient();
    const o: QueryOptions<number, Error, number> = {
      queryKey: ["x"],
      queryFn: () => Promise.resolve(1),
    };
    await expect(client.fetchQuery(o)).resolves.toBe(1);
  });
});
