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
      if (server.failing)
        return respond(500, { code: "server_error", message: "Simulated outage" });

      const path = url.pathname.replace(/^\/v1/, "");
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
