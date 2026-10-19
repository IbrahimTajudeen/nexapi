import type { Transport } from "@nyxapi/core";

interface LogEntry {
  id: number;
  at: number;
  method: string;
  path: string;
  status: number;
  ms: number;
}

interface User {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "member";
}

export interface MockServer {
  transport: Transport;
  /** Artificial latency in ms. */
  latency: number;
  /** When true, every request fails with a 500 (to try retries and error handling). */
  failing: boolean;
  log(): readonly LogEntry[];
  subscribe(listener: () => void): () => void;
  reset(): void;
  requestCount(): number;
}

const seed = (): User[] => [
  { id: "1", name: "Ada Lovelace", email: "ada@example.test", role: "admin" },
  { id: "2", name: "Linus Torvalds", email: null, role: "member" },
  { id: "3", name: "Grace Hopper", email: "grace@example.test", role: "admin" },
  { id: "4", name: "Margaret Hamilton", email: "margaret@example.test", role: "member" },
];

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * An in-memory implementation of `fixtures/openapi/basic.yaml`, so the docs can run the real
 * NyxAPI engine in the browser without any network. No data leaves the page.
 */
export function createMockServer(): MockServer {
  let users = seed();
  let nextId = 1;
  let flakyCalls = 0;
  let createdIds = 100;
  const entries: LogEntry[] = [];
  const listeners = new Set<() => void>();
  const emit = (): void => listeners.forEach((l) => l());

  const server: MockServer = {
    latency: 300,
    failing: false,
    log: () => entries,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    reset() {
      users = seed();
      flakyCalls = 0;
      createdIds = 100;
      entries.length = 0;
      emit();
    },
    requestCount: () => entries.length,
    transport: async (request) => {
      const started = Date.now();
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, server.latency);
        request.signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
      const respond = (status: number, body?: unknown): Response => {
        entries.push({
          id: nextId++,
          at: started,
          method,
          path: url.pathname.replace(/^\/v1/, "") + url.search,
          status,
          ms: Date.now() - started,
        });
        emit();
        return body === undefined ? new Response(null, { status }) : json(status, body);
      };
      const textResponse = (status: number, text: string): Response => {
        entries.push({
          id: nextId++,
          at: started,
          method,
          path: url.pathname.replace(/^\/v1/, ""),
          status,
          ms: Date.now() - started,
        });
        emit();
        return new Response(text, { status, headers: { "content-type": "text/plain" } });
      };
      if (server.failing)
        return respond(500, { code: "server_error", message: "Simulated outage" });

      const path = url.pathname.replace(/^\/v1/, "");
      if (path === "/echo") {
        // Echoes what the server received, for any method: lets the docs show exactly what NyxAPI sent.
        const type = request.headers.get("content-type") ?? "";
        let body: unknown = null;
        if (method !== "GET" && method !== "HEAD") {
          const text = await request.text();
          if (type.startsWith("application/json")) body = text === "" ? null : JSON.parse(text);
          else if (type.startsWith("multipart/form-data")) body = "(multipart body)";
          else body = text === "" ? null : text;
        }
        const query: Record<string, string[]> = {};
        url.searchParams.forEach((v, k) => (query[k] ??= []).push(v));
        const headers: Record<string, string> = {};
        request.headers.forEach((v, k) => {
          if (k === "accept" || k === "authorization" || k === "content-type" || k.startsWith("x-"))
            headers[k] =
              type.startsWith("multipart/") && k === "content-type" ? "multipart/form-data" : v;
        });
        if (method === "HEAD") return respond(200);
        return respond(200, {
          method,
          path: url.pathname.replace(/^\/v1/, ""),
          query,
          headers,
          body,
        });
      }
      if (method === "OPTIONS" && path === "/users") return respond(204);
      if (method === "POST" && path === "/users") {
        const body = (await request.json()) as Partial<User>;
        if (!body.name) return respond(422, { code: "invalid", message: "Name is required" });
        const created: User = {
          id: String(++createdIds),
          name: body.name,
          email: body.email ?? null,
          role: body.role ?? "member",
        };
        users = [...users, created];
        return respond(201, created);
      }
      if (method === "GET" && path === "/health") return textResponse(200, "ok");
      if (method === "GET" && path === "/files/notes.txt")
        return textResponse(200, "NyxAPI notes\nline two\n");
      if (method === "GET" && path === "/files/logo.bin") {
        entries.push({
          id: nextId++,
          at: started,
          method,
          path,
          status: 200,
          ms: Date.now() - started,
        });
        emit();
        return new Response(new Uint8Array([78, 121, 120, 65, 80, 73]), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        });
      }
      if (method === "GET" && path === "/flaky") {
        // Fails twice with 503, then succeeds, so retries can be shown.
        flakyCalls += 1;
        if (flakyCalls <= 2)
          return respond(503, { code: "unavailable", message: `Try again (${flakyCalls})` });
        return respond(200, { ok: true, attempts: flakyCalls });
      }
      if (method === "GET" && path === "/me") {
        const auth = request.headers.get("authorization");
        if (auth === "Bearer demo-token") return respond(200, users[0]);
        return respond(401, {
          code: "unauthorized",
          message: auth ? "Token expired" : "Sign in first",
        });
      }
      if (method === "POST" && path === "/auth/refresh")
        return respond(200, { token: "demo-token" });
      if (method === "POST" && path === "/auth/login") {
        const body = (await request.json()) as { email?: string; password?: string };
        if (body.password !== "secret")
          return respond(401, { code: "bad_credentials", message: "Wrong email or password" });
        return respond(200, { token: "demo-token", user: users[0] });
      }
      if (method === "GET" && path === "/users") {
        const roles = url.searchParams.getAll("role");
        const items = users.filter((u) => roles.length === 0 || roles.includes(u.role));
        const page = Number(url.searchParams.get("page") ?? 1);
        const limit = Number(url.searchParams.get("limit") ?? 20);
        return respond(200, {
          items: items.slice((page - 1) * limit, page * limit),
          total: items.length,
        });
      }
      const one = /^\/users\/([^/]+)$/.exec(path);
      if (one) {
        const user = users.find((u) => u.id === one[1]);
        if (!user) return respond(404, { code: "not_found", message: `No user ${one[1]}` });
        if (method === "GET") return respond(200, user);
        if (method === "HEAD") return respond(200);
        if (method === "PUT") {
          const next = (await request.json()) as Partial<User>;
          if (!next.name) return respond(422, { code: "invalid", message: "Name is required" });
          Object.assign(user, { email: null, role: "member" }, next);
          return respond(200, user);
        }
        if (method === "PATCH") {
          const patch = (await request.json()) as Partial<User>;
          if (patch.name === "")
            return respond(422, { code: "invalid", message: "Name cannot be empty" });
          Object.assign(user, patch);
          return respond(200, user);
        }
        if (method === "DELETE") {
          users = users.filter((u) => u.id !== user.id);
          return respond(204);
        }
      }
      return respond(404, {
        code: "not_found",
        message: `${method} ${path} is not part of the demo API`,
      });
    },
  };
  return server;
}
