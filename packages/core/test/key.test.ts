import { describe, expect, it } from "vitest";
import { hashKey, keyMatchesPrefix, replaceEqualDeep } from "../src/index.js";

describe("hashKey", () => {
  it("ignores object key order and undefined properties", () => {
    expect(hashKey(["a", { x: 1, y: [1, { b: 2, a: 1 }] }])).toBe(
      hashKey(["a", { y: [1, { a: 1, b: 2 }], x: 1 }]),
    );
    expect(hashKey(["a", { x: 1, y: undefined }])).toBe(hashKey(["a", { x: 1 }]));
  });

  it("distinguishes values that would collide under naive joining", () => {
    expect(hashKey(["a,b"])).not.toBe(hashKey(["a", "b"]));
    expect(hashKey([1])).not.toBe(hashKey(["1"]));
    expect(hashKey([null])).not.toBe(hashKey(["null"]));
    expect(hashKey([[1, 2], 3])).not.toBe(hashKey([[1], [2, 3]]));
    expect(hashKey([{ a: 1 }])).not.toBe(hashKey([{ a: "1" }]));
  });

  it("hashes dates by instant and rejects non-JSON-like values", () => {
    expect(hashKey([new Date(0)])).toBe(hashKey([new Date(0)]));
    expect(hashKey([new Date(0)])).not.toBe(hashKey([new Date(1)]));
    expect(() => hashKey([() => 1])).toThrow(TypeError);
    expect(() => hashKey([new Map()])).toThrow(TypeError);
    expect(() => hashKey([Number.NaN])).toThrow(TypeError);
    expect(() => hashKey([10n])).toThrow(TypeError);
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(() => hashKey([cyclic])).toThrow(TypeError);
  });
});

describe("keyMatchesPrefix", () => {
  it("matches array prefixes with deep partial objects", () => {
    const key = ["GET", "/users/{id}", { id: "1" }, { query: { page: 1, limit: 5 } }];
    expect(keyMatchesPrefix(key, [])).toBe(true);
    expect(keyMatchesPrefix(key, ["GET"])).toBe(true);
    expect(keyMatchesPrefix(key, ["GET", "/users/{id}", { id: "1" }])).toBe(true);
    expect(keyMatchesPrefix(key, ["GET", "/users/{id}", { id: "2" }])).toBe(false);
    expect(keyMatchesPrefix(key, ["GET", "/users/{id}", {}, { query: { page: 1 } }])).toBe(true);
    expect(keyMatchesPrefix(key, ["POST"])).toBe(false);
    expect(keyMatchesPrefix(["a"], ["a", "b"])).toBe(false);
  });
});

describe("replaceEqualDeep", () => {
  it("keeps identity of unchanged subtrees", () => {
    const prev = { a: { x: 1 }, b: [1, 2, 3], c: "s" };
    const next = replaceEqualDeep(prev, { a: { x: 1 }, b: [1, 2, 3], c: "t" });
    expect(next).not.toBe(prev);
    expect(next.a).toBe(prev.a);
    expect(next.b).toBe(prev.b);
    expect(next.c).toBe("t");
  });
  it("returns the previous reference when deeply equal", () => {
    const prev = { a: [{ id: 1 }] };
    expect(replaceEqualDeep(prev, { a: [{ id: 1 }] })).toBe(prev);
  });
  it("handles added/removed keys and array length changes", () => {
    const prev = { a: 1, b: 2 };
    expect(replaceEqualDeep(prev, { a: 1 })).toEqual({ a: 1 });
    expect(replaceEqualDeep(prev, { a: 1 })).not.toBe(prev);
    expect(replaceEqualDeep([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(replaceEqualDeep([1, 2, 3], [1, 2])).toEqual([1, 2]);
  });
});
