import { describe, expect, it } from "vitest";
import {
  SLUG_RE,
  atLeast,
  getPath,
  isHttps,
  setPath,
  slugify,
  toLocalInput,
  toPayload,
  validate,
  type Field,
} from "../src/admin/form";
import { RESOURCES, ADMIN_SLUGS, resourceById } from "../src/admin/resources";
import { demoSeed } from "../src/lib/backend/seed-data";

describe("form paths", () => {
  it("reads and writes dotted paths without losing siblings", () => {
    const v = { content: { goals: ["a"], tutor: { hook: "x" } }, title: "t" };
    expect(getPath(v, "content.tutor.hook")).toBe("x");
    expect(getPath(v, "content.nope.deeper")).toBeUndefined();
    const next = setPath(v, "content.tutor.outro", "bye");
    expect(next).toEqual({
      content: { goals: ["a"], tutor: { hook: "x", outro: "bye" } },
      title: "t",
    });
    expect(v.content.tutor).toEqual({ hook: "x" }); // original untouched
  });
  it("makes slugs", () => {
    expect(slugify("  Héllo, Wörld! 2 ")).toBe("hello-world-2");
    expect(SLUG_RE.test(slugify("Amara Okafor"))).toBe(true);
    expect(slugify("***")).toBe("");
  });
  it("accepts only https links", () => {
    expect(isHttps("https://example.com/a")).toBe(true);
    for (const bad of ["http://example.com", "javascript:alert(1)", "https://a b", "//x.com", ""])
      expect(isHttps(bad), bad).toBe(false);
  });
  it("converts ISO time to a local input value", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("nope")).toBe("");
    expect(toLocalInput("2026-01-02T03:04:00.000Z")).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  });
});

describe("validate", () => {
  const fields: Field[] = [
    { name: "name", label: "Name", type: "text", required: true, maxLength: 5 },
    { name: "slug", label: "Slug", type: "text", slugFrom: "name", required: true },
    { name: "site", label: "Site", type: "url" },
    { name: "path", label: "Path", type: "url", allowPath: true },
    { name: "n", label: "N", type: "number", min: 1, max: 10 },
    { name: "socials", label: "Socials", type: "socials" },
    { name: "j", label: "J", type: "json" },
    {
      name: "rows",
      label: "Rows",
      type: "repeater",
      fields: [{ name: "x", label: "X", type: "text", required: true }],
    },
  ];
  it("passes good values", () => {
    expect(
      validate(fields, {
        name: "Ada",
        site: "https://a.dev",
        path: "/docs/",
        n: "3",
        socials: { github: "https://github.com/a" },
        j: "{}",
        rows: [{ x: "1" }],
      }),
    ).toEqual({});
  });
  it("derives a missing slug from its source instead of failing", () => {
    expect(validate(fields, { name: "Ada" })["slug"]).toBeUndefined();
  });
  it("reports each problem on its field", () => {
    const e = validate(fields, {
      name: "",
      slug: "Bad Slug",
      site: "http://a.dev",
      path: "docs",
      n: 11,
      socials: { x: "http://x.com/a" },
      j: "{nope",
      rows: [{ x: "" }],
    });
    expect(Object.keys(e).sort()).toEqual([
      "j",
      "n",
      "name",
      "path",
      "rows.0.x",
      "site",
      "slug",
      "socials.x",
    ]);
  });
  it("enforces length limits", () => {
    expect(validate(fields, { name: "toolong" })["name"]).toMatch(/at most 5/);
  });
});

describe("toPayload", () => {
  const fields: Field[] = [
    { name: "title", label: "Title", type: "text" },
    { name: "slug", label: "Slug", type: "text", slugFrom: "title", lockOnEdit: true },
    { name: "minutes", label: "Minutes", type: "number" },
    {
      name: "tutor_id",
      label: "Tutor",
      type: "relation",
      nullable: true,
      relation: { table: "people", label: "name" },
    },
    { name: "bio", label: "Bio", type: "textarea", nullable: true },
    { name: "socials", label: "Socials", type: "socials" },
    { name: "tags", label: "Tags", type: "lines" },
    { name: "extra", label: "Extra", type: "json" },
    { name: "content.goals", label: "Goals", type: "lines" },
    { name: "content.tutor.hook", label: "Hook", type: "text" },
  ];
  const values = {
    title: "My Page",
    slug: "",
    minutes: "12",
    tutor_id: "",
    bio: "  ",
    socials: { github: " https://github.com/a ", x: "" },
    tags: [" a ", "", "b"],
    extra: '{"k":1}',
    content: { goals: ["g", ""], tutor: { hook: "h" }, keepMe: true },
  };
  it("shapes a create payload", () => {
    const p = toPayload(fields, values, "create");
    expect(p).toMatchObject({
      title: "My Page",
      slug: "my-page",
      minutes: 12,
      tutor_id: null,
      bio: null,
      tags: ["a", "b"],
      extra: { k: 1 },
    });
    expect(p["socials"]).toEqual({ github: "https://github.com/a" });
  });
  it("keeps JSON keys the form does not know about", () => {
    const p = toPayload(fields, values, "create");
    expect(p["content"]).toEqual({ goals: ["g"], tutor: { hook: "h" }, keepMe: true });
  });
  it("never sends locked fields when editing", () => {
    expect("slug" in toPayload(fields, values, "edit")).toBe(false);
  });
});

describe("roles", () => {
  it("ranks admin over editor over contributor", () => {
    expect(atLeast("admin", "editor")).toBe(true);
    expect(atLeast("editor", "admin")).toBe(false);
    expect(atLeast("contributor", "editor")).toBe(false);
    expect(atLeast(null, "contributor")).toBe(false);
  });
});

describe("resource definitions", () => {
  const seed = demoSeed();
  it("has unique ids that all become routes", () => {
    const ids = RESOURCES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(ADMIN_SLUGS).toContain(id);
    expect(resourceById("people")?.table).toBe("people");
  });
  for (const r of RESOURCES) {
    describe(r.id, () => {
      const sample = (seed[r.table] as unknown as Record<string, unknown>[])[0];
      it("only edits columns that exist", () => {
        expect(sample, "demo seed has a row").toBeDefined();
        for (const f of r.fields) {
          const root = f.name.split(".")[0] ?? f.name;
          expect(Object.keys(sample ?? {}), `${r.id}.${f.name}`).toContain(root);
        }
        for (const c of r.columns) expect(Object.keys(sample ?? {})).toContain(c.key.split(".")[0]);
        for (const k of [r.titleKey, ...r.search, ...r.orderBy.map((o) => o.column)])
          expect(Object.keys(sample ?? {})).toContain(k);
      });
      it("has unique field names and complete selects", () => {
        const names = r.fields.map((f) => f.name);
        expect(new Set(names).size).toBe(names.length);
        for (const f of r.fields) {
          if (f.type === "select" || f.type === "multiselect")
            expect(f.options?.length, f.name).toBeGreaterThan(0);
          if (f.type === "repeater") expect(f.fields?.length, f.name).toBeGreaterThan(0);
          if (f.type === "relation") expect(f.relation, f.name).toBeDefined();
        }
      });
      it("has defaults that pass validation once the required text is filled", () => {
        const filled: Record<string, unknown> = { ...r.defaults };
        for (const f of r.fields)
          if (f.required && getPath(filled, f.name) === undefined)
            filled[f.name] =
              f.type === "number"
                ? 1
                : f.type === "select"
                  ? f.options?.[0]?.value
                  : f.type === "relation"
                    ? "x"
                    : "Example";
        const errors = validate(r.fields, filled, "create");
        // slugs and versions have their own formats, so only check the generic ones
        for (const key of Object.keys(errors)) expect(["version", "id"]).toContain(key);
      });
    });
  }
  it("lets editors, not contributors, reach everything except people", () => {
    for (const r of RESOURCES) expect(r.minRole === "contributor", r.id).toBe(r.id === "people");
  });
});
