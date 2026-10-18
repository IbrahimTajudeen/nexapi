import { describe, expect, it, vi } from "vitest";
import {
  HttpClient,
  HttpError,
  NetworkError,
  ParseError,
  RequestError,
  TimeoutError,
  buildUrl,
  expandPath,
  serializeQuery,
  type Transport,
} from "../src/index.js";
import { json } from "./helpers.js";

const BASE = "https://api.test/v1";
const client = (
  transport: Transport,
  extra: Partial<ConstructorParameters<typeof HttpClient>[0]> = {},
) => new HttpClient({ baseUrl: BASE, transport, ...extra });

describe("expandPath", () => {
  it("encodes path parameters strictly", () => {
    expect(expandPath("/users/{id}", { id: "a b/c?d#e" })).toBe("/users/a%20b%2Fc%3Fd%23e");
    expect(expandPath("/n/{a}/{b}", { a: 1, b: true })).toBe("/n/1/true");
  });
  it("rejects missing, empty and dot-segment parameters (path traversal)", () => {
    expect(() => expandPath("/users/{id}", {})).toThrow(RequestError);
    expect(() => expandPath("/users/{id}", { id: "" })).toThrow(RequestError);
    expect(() => expandPath("/users/{id}", { id: ".." })).toThrow(RequestError);
    expect(() => expandPath("/users/{id}", { id: "." })).toThrow(RequestError);
  });
});

describe("serializeQuery", () => {
  it("serializes primitives, dates and exploded arrays; skips null/undefined", () => {
    expect(
      serializeQuery({
        page: 1,
        q: "a b&c",
        on: true,
        off: false,
        none: undefined,
        nil: null,
        tags: ["x", "y"],
        d: new Date(0),
      }),
    ).toBe("page=1&q=a+b%26c&on=true&off=false&tags=x&tags=y&d=1970-01-01T00%3A00%3A00.000Z");
  });
  it("rejects nested objects and non-finite numbers", () => {
    expect(() => serializeQuery({ a: { b: 1 } })).toThrow(RequestError);
    expect(() => serializeQuery({ a: Number.POSITIVE_INFINITY })).toThrow(RequestError);
  });
});

describe("buildUrl (origin safety)", () => {
  const base = new URL(BASE);
  it("keeps the base path prefix and query string", () => {
    expect(
      buildUrl(base, { path: "/users/{id}", params: { id: "7" }, query: { a: 1 } }, false).href,
    ).toBe("https://api.test/v1/users/7?a=1");
  });
  it("applies per-parameter query styles", () => {
    const url = buildUrl(
      base,
      {
        path: "/items",
        query: { ids: [1, 2], filter: { a: "x" }, tag: ["p", "q"] },
        queryStyles: { ids: "csv", filter: "deepObject" },
      },
      false,
    );
    expect(url.searchParams.get("ids")).toBe("1,2");
    expect(url.searchParams.get("filter[a]")).toBe("x");
    expect(url.searchParams.getAll("tag")).toEqual(["p", "q"]);
  });
  it("cannot be redirected to another origin via protocol-relative or absolute paths", () => {
    expect(() => buildUrl(base, { path: "//evil.test/x" }, false)).toThrow(RequestError);
    expect(() => buildUrl(base, { path: "https://evil.test/x" }, false)).toThrow(RequestError);
    expect(() => buildUrl(base, { path: "users" }, false)).toThrow(RequestError);
    expect(() => buildUrl(base, { path: "javascript:alert(1)" }, true)).toThrow(RequestError);
  });
  it("cannot be redirected through an encoded path parameter", () => {
    const url = buildUrl(base, { path: "/u/{id}", params: { id: "//evil.test" } }, false);
    expect(url.origin).toBe("https://api.test");
    expect(url.pathname).toBe("/v1/u/%2F%2Fevil.test");
  });
  it("allows absolute URLs only with the explicit option", () => {
    expect(buildUrl(base, { path: "https://other.test/x" }, true).origin).toBe(
      "https://other.test",
    );
  });
});

describe("HttpClient.request", () => {
  it("sends method, JSON body, headers and returns parsed JSON", async () => {
    const transport = vi.fn<Transport>(async () => json({ ok: true }, { status: 201 }));
    const http = client(transport, { headers: { "x-app": "t" } });
    const out = await http.request<{ ok: boolean }>({
      method: "post",
      path: "/things/{id}",
      params: { id: "a/b" },
      query: { dry: true },
      headers: { "x-trace": "1", skip: undefined },
      body: { n: 1 },
    });
    expect(out).toEqual({ ok: true });
    const req = transport.mock.calls[0]![0];
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://api.test/v1/things/a%2Fb?dry=true");
    expect(req.headers.get("content-type")).toBe("application/json");
    expect(req.headers.get("x-app")).toBe("t");
    expect(req.headers.get("x-trace")).toBe("1");
    expect(req.headers.has("skip")).toBe(false);
    expect(await req.text()).toBe('{"n":1}');
  });

  it("returns undefined for 204 and for response:'none'", async () => {
    const http = client(async () => new Response(null, { status: 204 }));
    expect(await http.request({ method: "delete", path: "/x" })).toBeUndefined();
    const http2 = client(async () => json({ ignored: 1 }));
    expect(await http2.request({ method: "delete", path: "/x", response: "none" })).toBeUndefined();
  });

  it("throws typed HttpError with parsed JSON body, sanitized url and no credentials", async () => {
    const http = client(
      async () => json({ code: "bad" }, { status: 422, statusText: "Unprocessable" }),
      {
        getToken: () => "super-secret-token",
      },
    );
    const error = await http
      .request({
        method: "post",
        path: "/x",
        query: { apikey: "qs-secret" },
        body: { password: "pw" },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    const e = error as HttpError<{ code: string }>;
    expect(e.status).toBe(422);
    expect(e.body).toEqual({ code: "bad" });
    expect(e.url).toBe("https://api.test/v1/x");
    const dump = JSON.stringify(e, Object.getOwnPropertyNames(e)) + String(e.stack);
    for (const secret of ["super-secret-token", "qs-secret", "pw"])
      expect(dump).not.toContain(secret);
  });

  it("keeps text/empty error bodies usable", async () => {
    const http = client(
      async () => new Response("boom", { status: 500, headers: { "content-type": "text/plain" } }),
    );
    const e = (await http
      .request({ method: "get", path: "/x" })
      .catch((x: unknown) => x)) as HttpError;
    expect(e.body).toBe("boom");
    const http2 = client(async () => new Response(null, { status: 404 }));
    const e2 = (await http2
      .request({ method: "get", path: "/x" })
      .catch((x: unknown) => x)) as HttpError;
    expect(e2.body).toBeUndefined();
  });

  it("rejects empty and malformed 2xx JSON bodies with ParseError", async () => {
    const empty = client(async () => new Response("", { status: 200 }));
    await expect(empty.request({ method: "get", path: "/x" })).rejects.toBeInstanceOf(ParseError);
    const bad = client(async () => new Response("<html>captive portal</html>", { status: 200 }));
    await expect(bad.request({ method: "get", path: "/x" })).rejects.toBeInstanceOf(ParseError);
    const truncated = client(async () => new Response('{"a":', { status: 200 }));
    await expect(truncated.request({ method: "get", path: "/x" })).rejects.toBeInstanceOf(
      ParseError,
    );
  });

  it("wraps transport failures in NetworkError", async () => {
    const http = client(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(http.request({ method: "get", path: "/x" })).rejects.toBeInstanceOf(NetworkError);
  });

  it("adds a bearer token from an async provider and lets explicit headers win", async () => {
    const transport = vi.fn<Transport>(async () => json({}));
    const http = client(transport, { getToken: async () => "tok" });
    await http.request({ method: "get", path: "/x" });
    expect(transport.mock.calls[0]![0].headers.get("authorization")).toBe("Bearer tok");
    await http.request({ method: "get", path: "/x", headers: { authorization: "Basic abc" } });
    expect(transport.mock.calls[1]![0].headers.get("authorization")).toBe("Basic abc");
  });

  it("runs middleware onion-style with the ability to transform request and response", async () => {
    const order: string[] = [];
    const transport = vi.fn<Transport>(async (req) => {
      order.push("transport");
      return json({ seen: req.headers.get("x-mw") });
    });
    const http = client(transport, {
      middleware: [
        async (req, next) => {
          order.push("a:in");
          const res = await next(
            new Request(req, { headers: { ...Object.fromEntries(req.headers), "x-mw": "1" } }),
          );
          order.push("a:out");
          return res;
        },
        async (req, next) => {
          order.push("b:in");
          const res = await next(req);
          order.push("b:out");
          return res;
        },
      ],
    });
    expect(await http.request({ method: "get", path: "/x" })).toEqual({ seen: "1" });
    expect(order).toEqual(["a:in", "b:in", "transport", "b:out", "a:out"]);
  });

  it("times out with TimeoutError and aborts the transport", async () => {
    let aborted = false;
    const http = client(
      (req) =>
        new Promise<Response>((_, reject) =>
          req.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          }),
        ),
      { timeoutMs: 20 },
    );
    await expect(http.request({ method: "get", path: "/x" })).rejects.toBeInstanceOf(TimeoutError);
    expect(aborted).toBe(true);
  });

  it("propagates caller aborts as AbortError (not a timeout or network error)", async () => {
    const ctl = new AbortController();
    const http = client(
      (req) =>
        new Promise<Response>((_, reject) =>
          req.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const pending = http.request({ method: "get", path: "/x", signal: ctl.signal });
    ctl.abort();
    const e = (await pending.catch((x: unknown) => x)) as Error;
    expect(e.name).toBe("AbortError");
    await expect(
      http.request({ method: "get", path: "/x", signal: ctl.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("validates baseUrl", () => {
    expect(() => new HttpClient({ baseUrl: "/relative" })).toThrow(RequestError);
    expect(() => new HttpClient({ baseUrl: "ftp://x.test" })).toThrow(RequestError);
  });
});

describe("serializeQuery styles", () => {
  const decoded = (q: string): string => decodeURIComponent(q.replace(/\+/g, " "));

  it("joins arrays as csv / space / pipe into one parameter", () => {
    expect(decoded(serializeQuery({ ids: [1, 2, 3] }, { ids: "csv" }))).toBe("ids=1,2,3");
    expect(decoded(serializeQuery({ t: ["a", "b"] }, { t: "space" }))).toBe("t=a b");
    expect(decoded(serializeQuery({ t: ["a", "b"] }, { t: "pipe" }))).toBe("t=a|b");
    expect(serializeQuery({ ids: [] }, { ids: "csv" })).toBe(""); // empty arrays are omitted
    expect(decoded(serializeQuery({ ids: [1, null, undefined, 2] }, { ids: "csv" }))).toBe(
      "ids=1,2",
    );
  });

  it("refuses values that would be ambiguous or malformed for their style", () => {
    expect(() => serializeQuery({ ids: ["a,b"] }, { ids: "csv" })).toThrow(/delimiter/);
    expect(() => serializeQuery({ t: ["a|b"] }, { t: "pipe" })).toThrow(/delimiter/);
    expect(() => serializeQuery({ ids: "x" }, { ids: "csv" })).toThrow(/array/);
    expect(() => serializeQuery({ ids: [{ a: 1 }] }, { ids: "csv" })).toThrow(/primitive/);
  });

  it("serializes deepObject as name[key]=value and rejects anything nested", () => {
    expect(
      decoded(
        serializeQuery(
          { filter: { a: "x", n: 2, skip: undefined, nil: null } },
          { filter: "deepObject" },
        ),
      ),
    ).toBe("filter[a]=x&filter[n]=2");
    expect(() => serializeQuery({ f: { a: { b: 1 } } }, { f: "deepObject" })).toThrow(/primitive/);
    expect(() => serializeQuery({ f: { a: [1] } }, { f: "deepObject" })).toThrow(/primitive/);
    expect(() => serializeQuery({ f: { "a]b": 1 } }, { f: "deepObject" })).toThrow(/"\["/);
    expect(() => serializeQuery({ f: [1] }, { f: "deepObject" })).toThrow(/object/);
  });

  it("leaves parameters without a style on the exploded default", () => {
    expect(serializeQuery({ a: [1, 2], b: "x" }, { other: "csv" })).toBe("a=1&a=2&b=x");
  });
});
