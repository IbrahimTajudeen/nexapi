import { describe, expect, it } from "vitest";
import {
  HttpClient,
  OperationError,
  ResponseTooLargeError,
  createMutationOperation,
  createQueryOperation,
} from "../src/index.js";
import { makeClient } from "./helpers.js";

describe("query operations", () => {
  const setup = () => {
    const { client } = makeClient();
    let calls = 0;
    const op = createQueryOperation<{ id: string }, string, unknown>(
      { queryClient: client },
      {
        prefix: ["TEST", "user"],
        run: (input) => {
          calls++;
          return Promise.resolve(`user-${input.id}`);
        },
      },
    );
    return { client, op, calls: () => calls };
  };

  it("calls directly without touching the cache", async () => {
    const { op, client, calls } = setup();
    await expect(op({ id: "1" })).resolves.toBe("user-1");
    expect(calls()).toBe(1);
    expect(client.getData(op.key({ id: "1" }))).toBeUndefined();
  });

  it("prefetch fills the cache and shares single-flight with options()", async () => {
    const { op, client, calls } = setup();
    await op.prefetch({ id: "1" });
    expect(client.getData(op.key({ id: "1" }))).toBe("user-1");
    await client.fetchQuery(op.options({ id: "1" }, { staleTime: 60_000 }));
    expect(calls()).toBe(1);
  });

  it("keys: input is part of the key; the bare prefix matches all variants", () => {
    const { op } = setup();
    expect(op.key({ id: "1" })).toEqual(["TEST", "user", { id: "1" }]);
  });

  it("invalidate with input is exact; without input hits every variant", async () => {
    const { op, client } = setup();
    await op.prefetch({ id: "1" });
    await op.prefetch({ id: "2" });
    await op.invalidate({ id: "1" });
    expect(client.getQuery(op.key({ id: "1" }))?.state.isInvalidated).toBe(true);
    expect(client.getQuery(op.key({ id: "2" }))?.state.isInvalidated).toBe(false);
    await op.invalidate();
    expect(client.getQuery(op.key({ id: "2" }))?.state.isInvalidated).toBe(true);
  });

  it("no-input operations: undefined, null and {} share one entry", async () => {
    const { client } = makeClient();
    const op = createQueryOperation<void, number, unknown>(
      { queryClient: client },
      { prefix: ["T", "n"], run: () => Promise.resolve(1) },
      { hasInput: false },
    );
    await op.prefetch();
    expect(client.getData(op.key())).toBe(1);
  });
});

describe("mutation operations", () => {
  it("runs through the engine with the input as variables", async () => {
    const { client } = makeClient();
    const op = createMutationOperation<{ n: number }, number, unknown>(
      { queryClient: client },
      { prefix: ["T", "inc"], run: (i) => Promise.resolve(i.n + 1) },
    );
    expect(op.key()).toEqual(["T", "inc"]);
    await expect(op({ n: 1 })).resolves.toBe(2);
    const opts = op.options();
    await expect(opts.mutationFn({ n: 4 })).resolves.toBe(5);
  });
});

describe("retryable errors", () => {
  it("OperationError carries protocol, code, details and retryable", () => {
    const e = new OperationError({ protocol: "graphql", message: "boom", code: "X", details: 1 });
    expect(e.protocol).toBe("graphql");
    expect(e.retryable).toBe(false);
  });
});

describe("maxResponseBytes", () => {
  const big = "x".repeat(5000);
  const http = (headers: Record<string, string> = {}) =>
    new HttpClient({
      baseUrl: "https://api.test",
      maxResponseBytes: 1000,
      transport: () =>
        Promise.resolve(
          new Response(big, { headers: { "content-type": "text/plain", ...headers } }),
        ),
    });
  it("rejects oversized streamed bodies", async () => {
    await expect(
      http().request({ method: "get", path: "/x", response: "text" }),
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
  it("rejects early on content-length", async () => {
    await expect(
      http({ "content-length": "5000" }).request({ method: "get", path: "/x", response: "text" }),
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
});
