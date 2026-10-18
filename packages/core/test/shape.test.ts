import { describe, expect, it } from "vitest";
import { checkShape, type Shape, type Shapes } from "../src/index.js";

const obj = (
  props: Record<string, { shape: Shape; required: boolean }>,
  extra: Shape | null = null,
): Shape => ({ k: "obj", props, extra });
const req = (shape: Shape): { shape: Shape; required: boolean } => ({ shape, required: true });
const opt = (shape: Shape): { shape: Shape; required: boolean } => ({ shape, required: false });

describe("checkShape", () => {
  const role: Shape = {
    k: "or",
    of: [
      { k: "lit", v: "admin" },
      { k: "lit", v: "member" },
    ],
  };
  const shapes: Shapes = {
    Role: role,
    User: obj({
      id: req({ k: "string" }),
      email: opt({ k: "or", of: [{ k: "string" }, { k: "null" }] }),
      role: req({ k: "ref", name: "Role" }),
    }),
  };
  const user: Shape = { k: "ref", name: "User" };

  it("accepts conforming values, extra properties and omitted optionals", () => {
    expect(checkShape({ id: "1", role: "admin" }, user, shapes)).toEqual([]);
    expect(
      checkShape({ id: "1", role: "member", email: null, newField: 42 }, user, shapes),
    ).toEqual([]);
  });

  it("reports the path, expectation and received type of each problem, never the value", () => {
    const issues = checkShape({ id: 7, role: "root", email: 5 }, user, shapes);
    expect(issues.map((i) => [i.path, i.received])).toEqual([
      ["$.id", "number"],
      ["$.email", "number"],
      ["$.role", "string"],
    ]);
    const text = JSON.stringify(issues);
    expect(text).not.toContain("root"); // the offending value stays out of the report
  });

  it("flags missing required properties but treats undefined/absent optionals alike", () => {
    expect(checkShape({}, user, shapes).map((i) => [i.path, i.received])).toEqual([
      ["$.id", "missing"],
      ["$.role", "missing"],
    ]);
    expect(checkShape({ id: "1", role: "admin", email: undefined }, user, shapes)).toEqual([]);
  });

  it("walks arrays with indexed paths and quotes unusual property names", () => {
    const list: Shape = { k: "arr", of: obj({ "odd-name": req({ k: "number" }) }) };
    const issues = checkShape([{ "odd-name": 1 }, { "odd-name": "x" }], list);
    expect(issues.map((i) => i.path)).toEqual(['$[1]["odd-name"]']);
  });

  it("validates declared additional properties and intersections", () => {
    const dict: Shape = obj({}, { k: "number" });
    expect(checkShape({ a: 1, b: 2 }, dict)).toEqual([]);
    expect(checkShape({ a: 1, b: "x" }, dict).map((i) => i.path)).toEqual(["$.b"]);
    const both: Shape = {
      k: "and",
      of: [obj({ a: req({ k: "string" }) }), obj({ b: req({ k: "number" }) })],
    };
    expect(checkShape({ a: "x", b: 1 }, both)).toEqual([]);
    expect(checkShape({ a: "x" }, both).map((i) => i.path)).toEqual(["$.b"]);
  });

  it("unions need one matching member and do not leak the failed members' issues", () => {
    const either: Shape = { k: "or", of: [{ k: "string" }, { k: "number" }] };
    expect(checkShape(3, either)).toEqual([]);
    const issues = checkShape(true, either);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.expected).toBe("one of 2 alternatives");
  });

  it("rejects non-objects, NaN/Infinity, wrong literals, and unknown refs; any accepts everything", () => {
    expect(checkShape([], obj({}))).toHaveLength(1);
    expect(checkShape(null, obj({}))).toHaveLength(1);
    expect(checkShape(Number.NaN, { k: "number" })).toHaveLength(1);
    expect(checkShape(Infinity, { k: "number" })).toHaveLength(1);
    expect(checkShape("x", { k: "lit", v: "y" })).toHaveLength(1);
    expect(checkShape(1, { k: "ref", name: "Nope" })[0]?.expected).toContain("Nope");
    for (const v of [undefined, null, 1, "s", {}, []])
      expect(checkShape(v, { k: "any" })).toEqual([]);
    expect(checkShape(new Blob(["x"]), { k: "blob" })).toEqual([]);
    expect(checkShape("x", { k: "blob" })).toHaveLength(1);
  });

  it("caps the number of issues and survives self-referential schemas on finite data", () => {
    const many = checkShape(
      Array.from({ length: 100 }, () => 1),
      { k: "arr", of: { k: "string" } },
    );
    expect(many).toHaveLength(10);
    const tree: Shapes = {
      Node: obj({ children: opt({ k: "arr", of: { k: "ref", name: "Node" } }) }),
    };
    expect(
      checkShape({ children: [{ children: [{}] }] }, { k: "ref", name: "Node" }, tree),
    ).toEqual([]);
    let deep: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) deep = { children: [deep] };
    expect(checkShape(deep, { k: "ref", name: "Node" }, tree).length).toBeGreaterThan(0); // depth cap, no crash
  });
});
