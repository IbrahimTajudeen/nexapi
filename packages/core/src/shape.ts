/**
 * Runtime description of a response type, emitted by `@nexapi/codegen` (`"validation": true`)
 * and checked by `checkShape`. Plain JSON-compatible data so it can be generated, serialized and
 * tested; it carries no code.
 */
export type Shape =
  | { readonly k: "string" | "number" | "boolean" | "null" | "any" | "blob" }
  | { readonly k: "lit"; readonly v: string | number | boolean }
  | { readonly k: "arr"; readonly of: Shape }
  | {
      readonly k: "obj";
      readonly props: Readonly<
        Record<string, { readonly shape: Shape; readonly required: boolean }>
      >;
      /** Type of properties that are not declared; `null` lets them through unchecked. */
      readonly extra: Shape | null;
    }
  | { readonly k: "or" | "and"; readonly of: readonly Shape[] }
  | { readonly k: "ref"; readonly name: string };

export type Shapes = Readonly<Record<string, Shape>>;

/** Where and what, never the offending value (responses may carry personal data). */
export interface ShapeIssue {
  /** `$` is the root; `$.items[2].role` is a nested position. */
  readonly path: string;
  readonly expected: string;
  readonly received: string;
}

const MAX_ISSUES = 10;

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Blob) return "blob";
  return typeof value;
}

function key(path: string, name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? `${path}.${name}` : `${path}[${JSON.stringify(name)}]`;
}

/** Unions can match several ways; a failed member must not leak issues, so it is probed silently. */
function matches(value: unknown, shape: Shape, shapes: Shapes, depth: number): boolean {
  const probe: ShapeIssue[] = [];
  walk(value, shape, shapes, "$", probe, depth);
  return probe.length === 0;
}

function walk(
  value: unknown,
  shape: Shape,
  shapes: Shapes,
  path: string,
  issues: ShapeIssue[],
  depth: number,
): void {
  if (issues.length >= MAX_ISSUES) return;
  const fail = (expected: string): void => {
    issues.push({ path, expected, received: describe(value) });
  };
  if (depth > 64) return fail("a value nested no deeper than 64 levels");
  switch (shape.k) {
    case "any":
      return;
    case "string":
    case "boolean":
      if (typeof value !== shape.k) fail(shape.k);
      return;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) fail("number");
      return;
    case "null":
      if (value !== null) fail("null");
      return;
    case "blob":
      if (!(value instanceof Blob)) fail("blob");
      return;
    case "lit":
      if (value !== shape.v) fail(`the literal ${JSON.stringify(shape.v)}`);
      return;
    case "arr":
      if (!Array.isArray(value)) return fail("array");
      for (let i = 0; i < value.length; i++)
        walk(value[i], shape.of, shapes, `${path}[${String(i)}]`, issues, depth + 1);
      return;
    case "obj": {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return fail("object");
      const record = value as Record<string, unknown>;
      for (const name of Object.keys(shape.props)) {
        const prop = shape.props[name];
        if (!prop) continue;
        const present = Object.hasOwn(record, name) && record[name] !== undefined;
        if (!present) {
          if (prop.required)
            issues.push({
              path: key(path, name),
              expected: "a value (required)",
              received: "missing",
            });
          continue;
        }
        walk(record[name], prop.shape, shapes, key(path, name), issues, depth + 1);
      }
      if (shape.extra)
        for (const name of Object.keys(record))
          if (!Object.hasOwn(shape.props, name))
            walk(record[name], shape.extra, shapes, key(path, name), issues, depth + 1);
      return;
    }
    case "or":
      if (!shape.of.some((member) => matches(value, member, shapes, depth + 1)))
        fail(`one of ${String(shape.of.length)} alternatives`);
      return;
    case "and":
      for (const member of shape.of) walk(value, member, shapes, path, issues, depth + 1);
      return;
    case "ref": {
      const target = Object.hasOwn(shapes, shape.name) ? shapes[shape.name] : undefined;
      if (!target) return fail(`a known type "${shape.name}"`);
      return walk(value, target, shapes, path, issues, depth + 1);
    }
  }
}

/**
 * Check `value` against `shape`. Undeclared properties are accepted (servers add fields
 * without breaking clients) unless the schema gave them a type. `integer`/`format`/length
 * constraints are not represented, so they are not checked.
 */
export function checkShape(value: unknown, shape: Shape, shapes: Shapes = {}): ShapeIssue[] {
  const issues: ShapeIssue[] = [];
  walk(value, shape, shapes, "$", issues, 0);
  return issues;
}
