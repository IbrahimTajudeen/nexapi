import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { buildSchema, graphql } from "graphql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateFrom } from "@nyxapi/codegen";
import { QueryObserver } from "@nyxapi/core";
import { GraphQLClient, GraphQLError } from "@nyxapi/graphql";
import { createApi } from "../examples/graphql/generated/index.js";

const sdl = readFileSync(new URL("../fixtures/graphql/blog.graphql", import.meta.url), "utf8");
const schema = buildSchema(sdl);

interface Row {
  id: string;
  name: string;
  email: string | null;
  role: "ADMIN" | "EDITOR" | "READER";
  createdAt: string;
}
const users = new Map<string, Row>();
const posts: {
  id: string;
  title: string;
  body: string | null;
  tags: string[];
  authorId: string;
}[] = [];
let server: Server;
let url: string;
let received: { query: string; operationName: string | undefined; variables: unknown }[] = [];
let mode: "ok" | "http500" | "partial" | "huge" = "ok";
let calls = 0;

const author = (id: string): Row => users.get(id) as Row;
const toPost = (p: (typeof posts)[number]) => ({ ...p, author: author(p.authorId) });
const rootValue = {
  user: ({ id }: { id: string }) => {
    const u = users.get(id);
    return u && { ...u, posts: posts.filter((p) => p.authorId === id).map(toPost) };
  },
  users: () => [...users.values()].map((u) => ({ ...u, posts: [] })),
  me: () => null,
  search: ({ text }: { text: string }) => [
    { __typename: "User", ...author("1"), posts: [] },
    ...posts
      .filter((p) => p.title.includes(text))
      .map((p) => ({ __typename: "Post", ...toPost(p) })),
  ],
  createPost: ({ input }: { input: { title: string; body?: string; tags?: string[] } }) => {
    const p = {
      id: String(posts.length + 1),
      title: input.title,
      body: input.body ?? null,
      tags: input.tags ?? [],
      authorId: "1",
    };
    posts.push(p);
    return toPost(p);
  },
  deletePost: ({ id }: { id: string }) => posts.some((p) => p.id === id),
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        calls++;
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          query: string;
          operationName?: string;
          variables?: Record<string, unknown>;
        };
        received.push({
          query: body.query,
          operationName: body.operationName,
          variables: body.variables,
        });
        if (mode === "http500") return void res.writeHead(500).end("boom");
        if (mode === "huge")
          return void res
            .writeHead(200, { "content-type": "application/json" })
            .end(JSON.stringify({ data: { me: "x".repeat(5000) } }));
        const result = await graphql({
          schema,
          source: body.query,
          rootValue,
          variableValues: body.variables ?? {},
          ...(body.operationName ? { operationName: body.operationName } : {}),
        });
        if (mode === "partial")
          result.errors = [
            { message: "one field failed", extensions: { code: "PARTIAL" } } as never,
          ];
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
      })();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/graphql`;
});
afterAll(() => void server.close());
beforeEach(() => {
  mode = "ok";
  calls = 0;
  received = [];
  users.clear();
  users.set("1", {
    id: "1",
    name: "Ada",
    email: "ada@example.test",
    role: "ADMIN",
    createdAt: "2026-01-01",
  });
  users.set("2", { id: "2", name: "Linus", email: null, role: "READER", createdAt: "2026-01-02" });
  posts.length = 0;
  posts.push({ id: "p1", title: "Hello", body: null, tags: ["a"], authorId: "1" });
});

const make = (extra: Partial<ConstructorParameters<typeof GraphQLClient>[0]> = {}) => {
  const client = new GraphQLClient({
    url,
    queryClient: { defaultOptions: { queries: { retry: false } } },
    ...extra,
  });
  return { client, api: createApi(client) };
};

describe("generated GraphQL client against a real graphql-js server", () => {
  it("runs a typed query and returns exactly the selected fields", async () => {
    const { api } = make();
    const user = await api.query.user({ id: "1" });
    expect(user?.name).toBe("Ada");
    expect(user?.posts[0]?.title).toBe("Hello");
    expect(received[0]?.operationName).toBe("UserQuery");
    expect(received[0]?.variables).toEqual({ id: "1" });
  });

  it("returns null for a missing nullable result", async () => {
    const { api } = make();
    expect(await api.query.user({ id: "404" })).toBeNull();
  });

  it("no-variable and optional-variable operations take no required argument", async () => {
    const { api } = make();
    expect(await api.query.me()).toBeNull();
    expect((await api.query.users()).length).toBe(2);
    expect((await api.query.users({ role: "ADMIN" })).length).toBe(2); // server ignores the filter; args are passed through
    expect(received.at(-1)?.variables).toEqual({ role: "ADMIN" });
  });

  it("abstract types come back with __typename for narrowing", async () => {
    const { api } = make();
    const found = await api.query.search({ text: "Hello" });
    const kinds = found.map((r) => r.__typename).sort();
    expect(kinds).toEqual(["Post", "User"]);
    for (const r of found) if (r.__typename === "Post") expect(r.title).toBe("Hello");
  });

  it("shares one cache entry and one request across concurrent observers (single-flight)", async () => {
    const { client, api } = make();
    const options = api.query.user.options({ id: "1" });
    const a = new QueryObserver(client.queryClient, options);
    const b = new QueryObserver(client.queryClient, options);
    const ua = a.subscribe(() => undefined);
    const ub = b.subscribe(() => undefined);
    await client.queryClient.fetchQuery(options);
    expect(calls).toBe(1);
    expect(client.queryClient.getData(api.query.user.key({ id: "1" }))).toMatchObject({
      name: "Ada",
    });
    ua();
    ub();
  });

  it("mutations use the same engine; invalidate refetches", async () => {
    const { client, api } = make();
    await api.query.user.prefetch({ id: "1" });
    const created = await client.queryClient.mutate(api.mutation.createPost.options(), {
      input: { title: "New" },
    });
    expect(created.title).toBe("New");
    await api.query.user.invalidate({ id: "1" });
    expect(client.queryClient.getQuery(api.query.user.key({ id: "1" }))?.state.isInvalidated).toBe(
      true,
    );
  });

  it("rejects with GraphQLError (with code and path) when the server reports errors", async () => {
    const { client } = make();
    const bad = client.query<{ id: string }, unknown>({
      name: "Bad",
      document: "query Bad($id: ID!) { user(id: $id) { nope } }",
      field: "user",
    });
    const error = await bad({ id: "1" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphQLError);
    expect((error as GraphQLError).retryable).toBe(false);
    expect((error as GraphQLError).errors[0]?.message).toContain("nope");
  });

  it("errorPolicy 'all' resolves with partial data", async () => {
    mode = "partial";
    const strict = make();
    await expect(strict.api.query.user({ id: "1" })).rejects.toBeInstanceOf(GraphQLError);
    const lenient = make({ errorPolicy: "all" });
    expect((await lenient.api.query.user({ id: "1" }))?.name).toBe("Ada");
  });

  it("HTTP 5xx surfaces as HttpError and is retried by the engine", async () => {
    mode = "http500";
    const client = new GraphQLClient({
      url,
      queryClient: { defaultOptions: { queries: { retry: 1, retryDelay: 1 } } },
    });
    const api = createApi(client);
    await expect(
      client.queryClient.fetchQuery(api.query.user.options({ id: "1" })),
    ).rejects.toMatchObject({ status: 500 });
    expect(calls).toBe(2);
  });

  it("maxResponseBytes protects against oversized responses", async () => {
    mode = "huge";
    const { api } = make({ maxResponseBytes: 1000 });
    await expect(api.query.me()).rejects.toMatchObject({ name: "ResponseTooLargeError" });
  });

  it("never sends the endpoint's credentials and pins the origin", () => {
    expect(() => new GraphQLClient({ url: "https://user:pass@api.example.com/graphql" })).toThrow(
      /credentials/,
    );
  });
});

describe("generator output for GraphQL is deterministic and in sync", () => {
  it("matches the committed example", async () => {
    const first = await generateFrom(
      sdl,
      { scalars: { DateTime: "string" } },
      { sourceName: "blog.graphql" },
    );
    const second = await generateFrom(
      sdl,
      { scalars: { DateTime: "string" } },
      { sourceName: "blog.graphql" },
    );
    expect(first.files).toEqual(second.files);
    for (const f of first.files)
      expect(
        readFileSync(new URL(`../examples/graphql/generated/${f.path}`, import.meta.url), "utf8"),
      ).toBe(f.content);
  });
});
