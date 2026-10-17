import { describe, expect, it } from "vitest";
import { QueryClient } from "../src/index.js";

const make = (): QueryClient => new QueryClient({ defaultOptions: { gcTime: Infinity } } as never);
const keys = (client: QueryClient, target?: Parameters<QueryClient["findAll"]>[0]): string[] =>
  client.findAll(target).map((q) => JSON.stringify(q.key));

describe("prefix lookup index", () => {
  const build = (): QueryClient => {
    const c = make();
    for (const k of [
      ["users"],
      ["users", 1],
      ["posts", 1],
      ["users", { role: "admin", page: 2 }],
      [{ scope: "x" }, "users"],
      [7, "n"],
      [true],
      [null, "z"],
    ] as const)
      c.buildQuery({ queryKey: k });
    return c;
  };

  it("returns exactly what a full scan would, in insertion order", () => {
    const c = build();
    const all = c.findAll().map((q) => q.key);
    const scan = (prefix: readonly unknown[]): string[] =>
      c
        .findAll({ predicate: () => true })
        .filter((q) => c.findAll({ queryKey: prefix, predicate: (x) => x === q }).length === 1)
        .map((q) => JSON.stringify(q.key));
    for (const prefix of [["users"], ["posts"], [7], [true], [null], ["nope"], [{ scope: "x" }]])
      expect(keys(c, prefix)).toEqual(scan(prefix));
    expect(all).toHaveLength(8);
    expect(keys(c, ["users"])).toEqual([
      '["users"]',
      '["users",1]',
      '["users",{"role":"admin","page":2}]',
    ]);
    expect(keys(c, [])).toHaveLength(8); // empty prefix matches everything
  });

  it("keeps partial object matching after the root element, and for object roots", () => {
    const c = build();
    expect(keys(c, ["users", { role: "admin" }])).toEqual(['["users",{"role":"admin","page":2}]']);
    expect(keys(c, [{ scope: "x" }])).toEqual(['[{"scope":"x"},"users"]']);
  });

  it("forgets removed entries (removal, clear, and re-creation)", () => {
    const c = build();
    const target = c.getQuery(["users", 1]);
    expect(target).toBeDefined();
    if (target) c.removeQuery(target);
    expect(keys(c, ["users"])).toEqual(['["users"]', '["users",{"role":"admin","page":2}]']);
    c.clear();
    expect(keys(c, ["users"])).toEqual([]);
    c.buildQuery({ queryKey: ["users", 9] });
    expect(keys(c, ["users"])).toEqual(['["users",9]']);
  });

  it("garbage collection removes entries from the index", async () => {
    const c = new QueryClient();
    await c.fetchQuery({ queryKey: ["gc", 1], queryFn: () => Promise.resolve(1), gcTime: 1 });
    await new Promise((r) => setTimeout(r, 20));
    expect(keys(c, ["gc"])).toEqual([]);
    expect(c.size).toBe(0);
  });
});
