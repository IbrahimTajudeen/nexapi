import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TABLES } from "../src/server/spec";

const sql = readFileSync(
  new URL("../../supabase/migrations/0001_init.sql", import.meta.url),
  "utf8",
);

/** Column name -> whether NULL is allowed, read from `create table public.<name> ( ... );`. */
function columnsOf(table: string): Map<string, boolean> {
  const m = new RegExp(`create table public\\.${table} \\(\\n([\\s\\S]*?)\\n\\);`).exec(sql);
  if (!m?.[1]) throw new Error(`table ${table} not found in the migration`);
  const out = new Map<string, boolean>();
  // A column definition starts at two-space indent; continuation lines are indented further.
  for (const block of m[1].split(/\n(?= {2}\S)/)) {
    const first = /^\s{2}([a-z_]+)\s/.exec(block);
    if (!first?.[1] || ["primary", "unique", "check", "constraint", "foreign"].includes(first[1]))
      continue;
    const nullable = !/\bnot null\b/i.test(block) && !/\bprimary key\b/i.test(block);
    out.set(first[1], nullable);
  }
  return out;
}

describe("API spec vs the SQL migration", () => {
  for (const spec of TABLES) {
    it(`${spec.table}: same columns and nullability`, () => {
      const db = columnsOf(spec.table);
      expect([...db.keys()].sort()).toEqual(spec.columns.map((c) => c.name).sort());
      for (const c of spec.columns)
        expect(c.nullable === true, `${spec.table}.${c.name} nullable`).toBe(db.get(c.name));
    });
  }
});
