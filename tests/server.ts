import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

interface User {
  id: string;
  name: string;
  email?: string | null;
  role: "admin" | "member";
}

export interface TestServer {
  url: string;
  /** Requests received, newest last. Authorization is recorded so tests can assert on it. */
  requests: { method: string; url: string; authorization: string | undefined; body: unknown }[];
  users: Map<string, User>;
  /** Artificial latency (ms) applied to every response. */
  latency: number;
  hits(method: string, path: string): number;
  close(): Promise<void>;
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readRaw(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

function parseJson(raw: Buffer): unknown {
  const text = raw.toString("utf8");
  return text ? (JSON.parse(text) as unknown) : undefined;
}

export async function startServer(): Promise<TestServer> {
  const state: TestServer = {
    url: "",
    requests: [],
    users: new Map<string, User>([
      ["1", { id: "1", name: "Ada", email: "ada@example.test", role: "admin" }],
      ["2", { id: "2", name: "Linus", email: null, role: "member" }],
    ]),
    latency: 0,
    hits: (method, path) =>
      state.requests.filter(
        (r) => r.method === method && new URL(r.url, "http://x").pathname === path,
      ).length,
    close: () =>
      new Promise((resolve) => (server.closeAllConnections(), server.close(() => resolve()))),
  };

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://x");
      const raw = await readRaw(req);
      const contentType = req.headers["content-type"] ?? "";
      const body = contentType.includes("json")
        ? (() => {
            try {
              return parseJson(raw);
            } catch {
              return undefined;
            }
          })()
        : undefined;
      state.requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        authorization: req.headers.authorization,
        body,
      });
      if (state.latency > 0) await new Promise((r) => setTimeout(r, state.latency));
      const path = url.pathname;
      const m = /^\/v1\/users\/(.+)$/.exec(path);

      const avatar = /^\/v1\/users\/([^/]+)\/avatar$/.exec(path);
      if (avatar && req.method === "POST") {
        const form = await new Response(new Uint8Array(raw), {
          headers: { "content-type": contentType },
        }).formData();
        const file = form.get("file");
        return send(res, 200, {
          bytes: file instanceof Blob ? file.size : 0,
          caption: form.get("caption") ?? undefined,
          tags: form.getAll("tags"),
        });
      }
      if (avatar && req.method === "GET") {
        res.writeHead(200, { "content-type": "image/png" }).end(Buffer.from([137, 80, 78, 71]));
        return;
      }
      if (req.method === "GET" && path === "/v1/exports/users") {
        res.writeHead(200, { "content-type": "text/csv" }).end("id,name\n1,Ada\n");
        return;
      }
      if (req.method === "POST" && path === "/v1/auth/login") {
        const b = body as { email?: string; password?: string } | undefined;
        if (b?.password !== "secret")
          return send(res, 401, { code: "bad_credentials", message: "Wrong email or password" });
        return send(res, 200, { token: "tok-1", user: state.users.get("1") });
      }
      if (req.method === "GET" && path === "/v1/users") {
        const roles = url.searchParams.getAll("role");
        const page = Number(url.searchParams.get("page") ?? "1");
        const limit = Number(url.searchParams.get("limit") ?? "10");
        const all = [...state.users.values()].filter(
          (u) => roles.length === 0 || roles.includes(u.role),
        );
        return send(res, 200, {
          items: all.slice((page - 1) * limit, page * limit),
          total: all.length,
        });
      }
      if (m) {
        const id = decodeURIComponent(m[1] as string);
        const user = state.users.get(id);
        if (req.method === "GET")
          return user
            ? send(res, 200, user)
            : send(res, 404, { code: "not_found", message: `No user ${id}` });
        if (req.method === "PATCH") {
          if (!user) return send(res, 404, { code: "not_found", message: `No user ${id}` });
          const patch = body as Partial<User>;
          if (patch.name === "")
            return send(res, 422, { code: "invalid", message: "name must not be empty" });
          const next = { ...user, ...patch };
          state.users.set(id, next);
          return send(res, 200, next);
        }
        if (req.method === "DELETE") {
          state.users.delete(id);
          return send(res, 204);
        }
      }
      if (path === "/v1/broken")
        return void res.writeHead(200, { "content-type": "application/json" }).end("{not json");
      send(res, 404, { code: "no_route", message: path });
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/v1`;
  return state;
}
