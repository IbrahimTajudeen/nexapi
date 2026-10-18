const WORD = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g;

export function words(input: string): string[] {
  return input.match(WORD) ?? [];
}

const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** `get-user_ByID` → `GetUserById`. Never returns an empty string or a leading digit. */
export function toPascal(input: string): string {
  const out = words(input).map(cap).join("");
  return /^\d/.test(out) ? `_${out}` : out;
}

/** `user-profiles` → `userProfiles`. */
export function toCamel(input: string): string {
  const ws = words(input);
  const out = ws.map((w, i) => (i === 0 ? w.toLowerCase() : cap(w))).join("");
  return /^\d/.test(out) ? `_${out}` : out;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
export const isIdentifier = (s: string): boolean => IDENTIFIER.test(s);

/** Property key as it must appear in source. */
export const propertyKey = (name: string): string =>
  isIdentifier(name) ? name : JSON.stringify(name);

const RESERVED_VARIABLES = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "static",
  "await",
  "async",
  "client",
]);

/** A safe local variable name for a path parameter. */
export function variableName(paramName: string): string {
  const base = toCamel(paramName) || "param";
  return RESERVED_VARIABLES.has(base) ? `${base}Param` : base;
}

/** Global type names the generated code relies on, or that would shadow lib types. */
export const RESERVED_TYPE_NAMES = new Set([
  "Record",
  "Blob",
  "Array",
  "Promise",
  "Partial",
  "Date",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "Map",
  "Set",
  "Error",
  "Function",
  "Readonly",
  "Omit",
  "Pick",
  "NexClient",
  "NoRequest",
]);

/** Type identifier for a schema/operation name; reserved names get a `Model` suffix. */
export function typeName(source: string): string {
  const name = toPascal(source);
  return RESERVED_TYPE_NAMES.has(name) ? `${name}Model` : name;
}

/** Deterministic id for operations without `operationId`: `GET /users/{id}/posts` → `getUsersByIdPosts`. */
export function synthesizeOperationId(method: string, path: string): string {
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((seg) => (seg.startsWith("{") && seg.endsWith("}") ? `by-${seg.slice(1, -1)}` : seg));
  return toCamel([method, ...parts].join("-"));
}
