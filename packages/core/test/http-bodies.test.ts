import { describe, expect, it } from "vitest";
import { HttpClient, ParseError, RequestError, type Transport } from "../src/index.js";

const BASE = "https://api.test/v1";

/** A transport that records the request it received and answers with `reply`. */
function rig(reply: () => Response = () => new Response("ok")): {
  http: HttpClient;
  seen: () => Request;
} {
  let last: Request | undefined;
  const transport: Transport = (req) => {
    last = req;
    return Promise.resolve(reply());
  };
  return {
    http: new HttpClient({ baseUrl: BASE, transport }),
    seen: () => {
      if (!last) throw new Error("no request");
      return last;
    },
  };
}

describe("request body kinds", () => {
  it("multipart: builds FormData from a plain object (files, scalars, arrays), no manual content-type", async () => {
    const { http, seen } = rig();
    await http.request({
      method: "post",
      path: "/up",
      bodyKind: "form-data",
      response: "text",
      headers: { "content-type": "application/json" }, // must not leak: the boundary is required
      body: {
        file: new Blob(["hello"], { type: "text/plain" }),
        title: "t",
        n: 2,
        ok: true,
        tags: ["a", "b"],
        skip: undefined,
        nil: null,
      },
    });
    const req = seen();
    expect(req.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    const form = await req.formData();
    expect(await (form.get("file") as File).text()).toBe("hello");
    expect([form.get("title"), form.get("n"), form.get("ok")]).toEqual(["t", "2", "true"]);
    expect(form.getAll("tags")).toEqual(["a", "b"]);
    expect(form.has("skip")).toBe(false);
    expect(form.has("nil")).toBe(false);
  });

  it("multipart: passes a FormData through and rejects nested objects", async () => {
    const { http, seen } = rig();
    const form = new FormData();
    form.append("x", "1");
    await http.request({
      method: "post",
      path: "/up",
      bodyKind: "form-data",
      body: form,
      response: "text",
    });
    expect((await seen().formData()).get("x")).toBe("1");
    await expect(
      http.request({ method: "post", path: "/up", bodyKind: "form-data", body: { a: { b: 1 } } }),
    ).rejects.toThrow(RequestError);
    await expect(
      http.request({ method: "post", path: "/up", bodyKind: "form-data", body: "nope" }),
    ).rejects.toThrow(/plain object/);
  });

  it("urlencoded: encodes scalars and repeats arrays", async () => {
    const { http, seen } = rig();
    await http.request({
      method: "post",
      path: "/f",
      bodyKind: "urlencoded",
      response: "text",
      body: { a: "x y", b: [1, 2], skip: null },
    });
    expect(seen().headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await seen().text()).toBe("a=x+y&b=1&b=2");
    await expect(
      http.request({ method: "post", path: "/f", bodyKind: "urlencoded", body: { a: { b: 1 } } }),
    ).rejects.toThrow(/Form field "a"/);
  });

  it("binary: sends Blob/ArrayBuffer/typed arrays with their type, defaulting to octet-stream", async () => {
    const { http, seen } = rig();
    await http.request({
      method: "put",
      path: "/b",
      bodyKind: "binary",
      response: "text",
      body: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    });
    expect(seen().headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await seen().arrayBuffer())]).toEqual([1, 2, 3]);
    await http.request({
      method: "put",
      path: "/b",
      bodyKind: "binary",
      response: "text",
      body: new Uint8Array([9]),
    });
    expect(seen().headers.get("content-type")).toBe("application/octet-stream");
    await expect(
      http.request({ method: "put", path: "/b", bodyKind: "binary", body: "str" }),
    ).rejects.toThrow(/binary body/);
  });

  it("text: sends a string as text/plain and rejects other types", async () => {
    const { http, seen } = rig();
    await http.request({
      method: "post",
      path: "/t",
      bodyKind: "text",
      response: "text",
      body: "hi",
    });
    expect(seen().headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await seen().text()).toBe("hi");
    await expect(
      http.request({ method: "post", path: "/t", bodyKind: "text", body: { a: 1 } }),
    ).rejects.toThrow(/string/);
  });

  it("json stays the default and still rejects unserializable bodies", async () => {
    const { http, seen } = rig(
      () => new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    await http.request({ method: "post", path: "/j", body: { a: 1 } });
    expect(seen().headers.get("content-type")).toBe("application/json");
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    await expect(http.request({ method: "post", path: "/j", body: cyclic })).rejects.toThrow(
      RequestError,
    );
  });
});

describe("response kinds", () => {
  it("text returns the body as a string (even when empty) and asks for text", async () => {
    const { http, seen } = rig(
      () => new Response("hello", { headers: { "content-type": "text/plain" } }),
    );
    expect(await http.request<string>({ method: "get", path: "/t", response: "text" })).toBe(
      "hello",
    );
    expect(seen().headers.get("accept")).toBe("text/*");
    const empty = rig(() => new Response(""));
    expect(await empty.http.request<string>({ method: "get", path: "/t", response: "text" })).toBe(
      "",
    );
  });

  it("blob returns a Blob with the response's content type", async () => {
    const { http, seen } = rig(
      () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
    );
    const blob = await http.request<Blob>({ method: "get", path: "/img", response: "blob" });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(3);
    expect(seen().headers.get("accept")).toBe("*/*");
  });

  it("json still fails loudly on non-JSON bodies", async () => {
    const { http } = rig(() => new Response("<html>"));
    await expect(http.request({ method: "get", path: "/j" })).rejects.toThrow(ParseError);
  });

  it("an explicit accept header wins over the default", async () => {
    const { http, seen } = rig();
    await http.request({
      method: "get",
      path: "/t",
      response: "text",
      headers: { accept: "text/csv" },
    });
    expect(seen().headers.get("accept")).toBe("text/csv");
  });
});
