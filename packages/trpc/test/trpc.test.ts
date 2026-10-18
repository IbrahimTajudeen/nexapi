import type { AddressInfo } from "node:net";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { TRPCError, initTRPC } from "@trpc/server";
import { createTRPCClient, httpLink } from "@trpc/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QueryObserver } from "@nyxapi/core";
import { TrpcError, createNyxTrpc } from "../src/index.js";

interface User {
  id: string;
  name: string;
}
const db = new Map<string, User>();
let hits = 0;
let failNext = 0;

const t = initTRPC.create();
const appRouter = t.router({
  ping: t.procedure.query(() => "pong"),
  users: t.router({
    byId: t.procedure
      .input((v: unknown) => v as { id: string })
      .query(({ input }) => {
        hits++;
        if (failNext > 0) {
          failNext--;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "flaky" });
        }
        const user = db.get(input.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "no such user" });
        return user;
      }),
    rename: t.procedure
      .input((v: unknown) => v as { id: string; name: string })
      .mutation(({ input }) => {
        const user = db.get(input.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        user.name = input.name;
        return user;
      }),
  }),
});
type AppRouter = typeof appRouter;

let server: ReturnType<typeof createHTTPServer>;
let url: string;
beforeAll(async () => {
  server = createHTTPServer({ router: appRouter });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});
afterAll(() => void server.close());
beforeEach(() => {
  hits = 0;
  failNext = 0;
  db.clear();
  db.set("1", { id: "1", name: "Ada" });
});

/** `retry` omitted = the engine's default policy, which honours `error.retryable`. */
const make = (retry?: number | false) => {
  const trpc = createTRPCClient<AppRouter>({ links: [httpLink({ url })] });
  return createNyxTrpc(trpc, {
    queryClient: {
      defaultOptions: { queries: { ...(retry === undefined ? {} : { retry }), retryDelay: 1 } },
    },
  });
};

describe("createNyxTrpc against a real tRPC server", () => {
  it("calls procedures directly, fully typed", async () => {
    const { api } = make();
    const user = await api.users.byId.query({ id: "1" });
    expect(user.name).toBe("Ada");
    expect(await api.ping.query()).toBe("pong");
  });

  it("gives every procedure a stable typed key", () => {
    const { api } = make();
    expect(api.users.byId.query.key({ id: "1" })).toEqual(["TRPC", "users", "byId", { id: "1" }]);
    expect(api.users.byId.query.key()).toEqual(["TRPC", "users", "byId"]);
    expect(api.ping.query.key()).toEqual(["TRPC", "ping"]);
  });

  it("prefetch fills the cache once; observers share it (single-flight)", async () => {
    const { api, queryClient } = make();
    const options = api.users.byId.query.options({ id: "1" }, { staleTime: 60_000 });
    const a = new QueryObserver(queryClient, options);
    const b = new QueryObserver(queryClient, options);
    const ua = a.subscribe(() => undefined);
    const ub = b.subscribe(() => undefined);
    await queryClient.fetchQuery(options);
    expect(hits).toBe(1);
    expect(queryClient.getData(api.users.byId.query.key({ id: "1" }))).toMatchObject({
      name: "Ada",
    });
    ua();
    ub();
  });

  it("mutations run on the engine and invalidation marks the query stale", async () => {
    const { api, queryClient } = make();
    await api.users.byId.query.prefetch({ id: "1" });
    const renamed = await queryClient.mutate(api.users.rename.mutate.options(), {
      id: "1",
      name: "Grace",
    });
    expect(renamed.name).toBe("Grace");
    await api.users.byId.query.invalidate({ id: "1" });
    expect(queryClient.getQuery(api.users.byId.query.key({ id: "1" }))?.state.isInvalidated).toBe(
      true,
    );
  });

  it("client errors become TrpcError with code and are never retried", async () => {
    const { api, queryClient } = make();
    const error = await queryClient
      .fetchQuery(api.users.byId.query.options({ id: "404" }))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrpcError);
    expect((error as TrpcError).code).toBe("NOT_FOUND");
    expect((error as TrpcError).retryable).toBe(false);
    expect(hits).toBe(1);
  });

  it("transient server errors are retried by the engine", async () => {
    const { api, queryClient } = make();
    failNext = 1;
    const user = await queryClient.fetchQuery(api.users.byId.query.options({ id: "1" }));
    expect(user.name).toBe("Ada");
    expect(hits).toBe(2);
  });

  it("an unreachable server is a retryable network failure", async () => {
    const trpc = createTRPCClient<AppRouter>({ links: [httpLink({ url: "http://127.0.0.1:1" })] });
    const { api } = createNyxTrpc(trpc);
    const error = await api.ping.query().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrpcError);
    expect((error as TrpcError).retryable).toBe(true);
  });
});
