/**
 * GraphQL → TypeScript. A schema (SDL or introspection JSON) plus, optionally, your own
 * operation documents become a typed client built on `@nyxapi/graphql`.
 *
 * Every operation's result type is derived from the exact selection set that is sent, so the
 * type and the query can never drift apart. The `graphql` package is imported lazily: OpenAPI
 * users never load it.
 */
import type {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  GraphQLArgument,
  GraphQLField,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLInputType,
  GraphQLSchema,
  OperationDefinitionNode,
  SelectionSetNode,
  TypeNode as GqlTypeNode,
} from "graphql";
import type { NyxApiConfig } from "./config.js";
import type { GeneratedFile } from "./emit.js";
import { GenerationError, type ApiModel, type Diagnostic } from "./ir.js";
import { isIdentifier, propertyKey, toCamel, toPascal } from "./naming.js";

import type * as GraphQLModule from "graphql";

type G = typeof GraphQLModule;

export interface GraphQLDocumentInput {
  /** Used in diagnostics only. */
  name: string;
  text: string;
}

export interface GraphQLGenerateResult {
  files: GeneratedFile[];
  model: ApiModel;
  diagnostics: Diagnostic[];
}

const DEFAULT_DEPTH = 2;
const BUILTIN_SCALARS: Record<string, string> = {
  String: "string",
  ID: "string",
  Int: "number",
  Float: "number",
  Boolean: "boolean",
};
/** A TS type expression from the config, restricted so it cannot break out of the generated file. */
const SAFE_TS_TYPE = /^[\w.<>,[\]|&"' {}:;?()-]+$/;

const pad = (n: number): string => "  ".repeat(n);
const safeComment = (text: string): string => text.replace(/\*\//g, "*\\/");

function docBlock(lines: (string | null | undefined)[], level: number): string {
  const body = lines
    .filter((l): l is string => !!l)
    .flatMap((l) => safeComment(l).split(/\r?\n/))
    .map((l) => l.trimEnd());
  if (body.length === 0) return "";
  if (body.length === 1) return `${pad(level)}/** ${body[0] as string} */\n`;
  return `${pad(level)}/**\n${body.map((l) => `${pad(level)} * ${l}`.trimEnd()).join("\n")}\n${pad(level)} */\n`;
}

/** Does the text look like GraphQL SDL (as opposed to YAML/JSON)? */
export function looksLikeGraphQL(text: string, sourceName = ""): boolean {
  if (/\.(graphql|graphqls|gql)$/i.test(sourceName)) return true;
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return /"__schema"\s*:/.test(text);
  }
  if (/^\s*["']?(?:openapi|swagger)["']?\s*:/m.test(text)) return false;
  return (
    /^(?:extend[ \t]+)?(?:type|input|enum|interface|union|scalar)[ \t]+[A-Za-z_]\w*/m.test(text) ||
    /^schema[ \t]*(?:@\w+[^{\n]*)?\{/m.test(text) ||
    /^directive[ \t]+@\w+/m.test(text)
  );
}

function diag(list: Diagnostic[], level: "error" | "warning", code: string, message: string): void {
  list.push({ level, code, message });
}

export async function generateGraphQL(
  schemaText: string,
  config: NyxApiConfig,
  documents: readonly GraphQLDocumentInput[] = [],
  sourceName = "schema",
): Promise<GraphQLGenerateResult> {
  const gql: G = await import("graphql");
  const diagnostics: Diagnostic[] = [];
  const error = (code: string, message: string): void => diag(diagnostics, "error", code, message);
  const warn = (code: string, message: string): void => diag(diagnostics, "warning", code, message);

  // ---- schema ---------------------------------------------------------------------------
  let schema: GraphQLSchema;
  try {
    const trimmed = schemaText.trimStart();
    if (trimmed.startsWith("{")) {
      const json = JSON.parse(schemaText) as { data?: unknown; __schema?: unknown };
      const introspection = (json.__schema ? json : json.data) as Parameters<
        G["buildClientSchema"]
      >[0];
      schema = gql.buildClientSchema(introspection);
    } else {
      schema = gql.buildSchema(schemaText, { assumeValidSDL: false });
    }
  } catch (cause) {
    throw new GenerationError([
      {
        level: "error",
        code: "GRAPHQL_SCHEMA",
        message: `${sourceName}: ${cause instanceof Error ? cause.message : String(cause)}`,
      },
    ]);
  }
  const schemaErrors = gql.validateSchema(schema);
  for (const e of schemaErrors) error("GRAPHQL_SCHEMA", `${sourceName}: ${e.message}`);
  if (schemaErrors.length > 0) throw new GenerationError(diagnostics);

  // ---- config ---------------------------------------------------------------------------
  const scalarMap = new Map<string, string>(Object.entries(config.scalars ?? {}));
  for (const [name, ts] of scalarMap)
    if (!SAFE_TS_TYPE.test(ts))
      error("INVALID_CONFIG", `scalars.${name} is not a plain TypeScript type`);
  const depth = config.selectionDepth ?? DEFAULT_DEPTH;

  const namedTypes = Object.values(schema.getTypeMap())
    .filter((t) => !t.name.startsWith("__"))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exportedNames = new Map<string, string>();
  const claim = (name: string, what: string): void => {
    const other = exportedNames.get(name);
    if (other !== undefined)
      error("NAME_COLLISION", `${what} and ${other} would both be generated as "${name}"`);
    else exportedNames.set(name, what);
  };

  // ---- type mapping ---------------------------------------------------------------------
  const unmappedScalars = new Set<string>();
  const leafType = (type: GraphQLNamedType): string => {
    if (gql.isEnumType(type)) return type.name;
    if (gql.isScalarType(type)) {
      const builtin = BUILTIN_SCALARS[type.name];
      if (builtin !== undefined) return builtin;
      if (scalarMap.has(type.name)) return type.name;
      unmappedScalars.add(type.name);
      return "unknown";
    }
    return type.name;
  };
  /** TS for a (possibly wrapped) type, where `inner` renders the named type. */
  const wrapTs = (
    type: GraphQLOutputType | GraphQLInputType,
    inner: (named: GraphQLNamedType) => string,
  ): string => {
    if (gql.isNonNullType(type)) return wrapTsNonNull(type.ofType, inner);
    return `${wrapTsNonNull(type, inner)} | null`;
  };
  const wrapTsNonNull = (
    type: GraphQLOutputType | GraphQLInputType,
    inner: (named: GraphQLNamedType) => string,
  ): string => {
    if (gql.isListType(type)) {
      const item = wrapTs(type.ofType as GraphQLOutputType, inner);
      return item.includes(" | ") ? `(${item})[]` : `${item}[]`;
    }
    return inner(type as GraphQLNamedType);
  };

  // ---- types.ts -------------------------------------------------------------------------
  let types = "";
  for (const t of namedTypes) {
    if (gql.isScalarType(t)) {
      if (t.name in BUILTIN_SCALARS) continue;
      claim(t.name, `scalar "${t.name}"`);
      const mapped = scalarMap.get(t.name);
      types += `${docBlock([t.description], 0)}export type ${t.name} = ${mapped ?? "unknown"};\n\n`;
    } else if (gql.isEnumType(t)) {
      claim(t.name, `enum "${t.name}"`);
      const values = t.getValues().map((v) => JSON.stringify(v.name));
      types += `${docBlock([t.description], 0)}export type ${t.name} = ${values.length > 0 ? values.join(" | ") : "never"};\n\n`;
    } else if (gql.isInputObjectType(t)) {
      claim(t.name, `input "${t.name}"`);
      const fields = Object.values(t.getFields());
      types += `${docBlock([t.description], 0)}export interface ${t.name} {\n`;
      for (const f of fields) {
        const optional = !gql.isNonNullType(f.type) || f.defaultValue !== undefined;
        types += `${docBlock([f.description, f.deprecationReason ? `@deprecated ${f.deprecationReason}` : undefined], 1)}${pad(1)}${propertyKey(f.name)}${optional ? "?" : ""}: ${wrapTs(f.type, leafType)};\n`;
      }
      types += "}\n\n";
    } else if (gql.isObjectType(t) || gql.isInterfaceType(t)) {
      if (
        t.name === schema.getQueryType()?.name ||
        t.name === schema.getMutationType()?.name ||
        t.name === schema.getSubscriptionType()?.name
      )
        continue;
      claim(t.name, `type "${t.name}"`);
      const typename = gql.isObjectType(t)
        ? `${pad(1)}__typename?: ${JSON.stringify(t.name)};\n`
        : "";
      types += `${docBlock([t.description], 0)}export interface ${t.name} {\n${typename}`;
      for (const f of Object.values(t.getFields())) {
        const composite = gql.isCompositeType(gql.getNamedType(f.type));
        types += `${docBlock([f.description, f.deprecationReason ? `@deprecated ${f.deprecationReason}` : undefined], 1)}${pad(1)}${propertyKey(f.name)}${composite ? "?" : ""}: ${wrapTs(f.type, leafType)};\n`;
      }
      types += "}\n\n";
    } else if (gql.isUnionType(t)) {
      claim(t.name, `union "${t.name}"`);
      const members = t.getTypes().map((m) => m.name);
      types += `${docBlock([t.description], 0)}export type ${t.name} = ${members.length > 0 ? members.join(" | ") : "never"};\n\n`;
    }
  }

  // ---- selection-derived result types --------------------------------------------------
  const fragments = new Map<string, FragmentDefinitionNode>();
  const addDocument = (doc: DocumentNode): void => {
    for (const def of doc.definitions)
      if (def.kind === gql.Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
  };

  const hasConditionalDirective = (node: {
    directives?: readonly { name: { value: string } }[] | undefined;
  }): boolean =>
    (node.directives ?? []).some((d) => d.name.value === "skip" || d.name.value === "include");

  /** All fields that can appear on `concrete`, merged by response key, in first-seen order. */
  const collect = (
    concrete: GraphQLObjectType,
    sets: readonly SelectionSetNode[],
    into: Map<string, { nodes: FieldNode[]; conditional: boolean }>,
    seen: Set<string>,
    conditional: boolean,
  ): void => {
    for (const set of sets) {
      for (const sel of set.selections) {
        const cond = conditional || hasConditionalDirective(sel);
        if (sel.kind === gql.Kind.FIELD) {
          const key = sel.alias?.value ?? sel.name.value;
          const entry = into.get(key);
          if (entry) {
            entry.nodes.push(sel);
            entry.conditional = entry.conditional && cond;
          } else into.set(key, { nodes: [sel], conditional: cond });
        } else if (sel.kind === gql.Kind.INLINE_FRAGMENT) {
          const on = sel.typeCondition ? schema.getType(sel.typeCondition.name.value) : concrete;
          if (on && appliesTo(on, concrete))
            collect(concrete, [sel.selectionSet], into, seen, cond);
        } else {
          const frag = fragments.get(sel.name.value);
          if (!frag) continue;
          const on = schema.getType(frag.typeCondition.name.value);
          if (on && appliesTo(on, concrete)) {
            const mark = `${concrete.name}:${frag.name.value}:${cond}`;
            if (seen.has(mark)) continue;
            seen.add(mark);
            collect(concrete, [frag.selectionSet], into, seen, cond);
          }
        }
      }
    }
  };
  const appliesTo = (on: GraphQLNamedType, concrete: GraphQLObjectType): boolean =>
    on === concrete ||
    ((gql.isInterfaceType(on) || gql.isUnionType(on)) && schema.isSubType(on, concrete));

  const fieldOf = (
    parent: GraphQLObjectType,
    name: string,
  ): GraphQLField<unknown, unknown> | undefined => parent.getFields()[name];

  const objectBody = (
    concrete: GraphQLObjectType,
    sets: readonly SelectionSetNode[],
    level: number,
  ): string => {
    const fields = new Map<string, { nodes: FieldNode[]; conditional: boolean }>();
    collect(concrete, sets, fields, new Set(), false);
    if (fields.size === 0) return "{}";
    let out = "{\n";
    for (const [key, { nodes, conditional }] of fields) {
      const first = nodes[0] as FieldNode;
      let ts: string;
      if (first.name.value === "__typename") ts = JSON.stringify(concrete.name);
      else {
        const def = fieldOf(concrete, first.name.value);
        if (!def) continue;
        const named = gql.getNamedType(def.type);
        if (gql.isLeafType(named)) ts = wrapTs(def.type, leafType);
        else {
          const subs = nodes.flatMap((n) => (n.selectionSet ? [n.selectionSet] : []));
          ts = wrapTs(def.type, (n) => compositeType(n, subs, level + 1));
        }
      }
      out += `${pad(level + 1)}${propertyKey(key)}${conditional ? "?" : ""}: ${ts};\n`;
    }
    return `${out}${pad(level)}}`;
  };

  const compositeType = (
    type: GraphQLNamedType,
    sets: readonly SelectionSetNode[],
    level: number,
  ): string => {
    if (gql.isObjectType(type)) return objectBody(type, sets, level);
    if (gql.isAbstractType(type)) {
      const bodies = schema
        .getPossibleTypes(type)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((member) => objectBody(member, sets, level));
      const unique = [...new Set(bodies)];
      return unique.length === 1 ? (unique[0] as string) : unique.join(" | ");
    }
    return "unknown";
  };

  const rootTypeOf = (kind: "query" | "mutation"): GraphQLObjectType | null | undefined =>
    kind === "query" ? schema.getQueryType() : schema.getMutationType();

  // ---- operations -----------------------------------------------------------------------
  interface Op {
    kind: "query" | "mutation";
    key: string; // property name under api.query / api.mutation
    operationName: string;
    document: string;
    field: string | null;
    variablesName: string;
    variablesType: string; // declaration body, or "" when there are none
    allOptional: boolean;
    dataName: string;
    dataType: string;
    description?: string | null;
    deprecated?: string | null;
  }
  const ops: Op[] = [];

  const variableTs = (type: GraphQLInputType): string => wrapTs(type, leafType);
  const astTypeToInput = (node: GqlTypeNode): GraphQLInputType | undefined =>
    gql.typeFromAST(schema, node as never) as GraphQLInputType | undefined;

  const variablesDecl = (
    name: string,
    vars: { name: string; type: GraphQLInputType; optional: boolean }[],
  ): { body: string; allOptional: boolean } => {
    if (vars.length === 0) return { body: "", allOptional: false };
    let body = `export interface ${name} {\n`;
    for (const v of vars)
      body += `${pad(1)}${propertyKey(v.name)}${v.optional ? "?" : ""}: ${variableTs(v.type)};\n`;
    return { body: `${body}}\n\n`, allOptional: vars.every((v) => v.optional) };
  };

  if (documents.length > 0) {
    // explicit documents: generate exactly what the user wrote
    const parsed: { name: string; doc: DocumentNode }[] = [];
    for (const d of documents) {
      try {
        const doc = gql.parse(d.text);
        parsed.push({ name: d.name, doc });
        addDocument(doc);
      } catch (cause) {
        error(
          "GRAPHQL_DOCUMENT",
          `${d.name}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }
    for (const { name, doc } of parsed) {
      for (const e of gql.validate(schema, doc)) {
        // validate() on a single file reports fragments defined in sibling files as unknown
        if (
          /^Unknown fragment/.test(e.message) &&
          [...fragments.keys()].some((f) => e.message.includes(`"${f}"`))
        )
          continue;
        if (/^Fragment ".*" is never used/.test(e.message)) continue;
        error("GRAPHQL_DOCUMENT", `${name}: ${e.message}`);
      }
      for (const def of doc.definitions) {
        if (def.kind !== gql.Kind.OPERATION_DEFINITION) continue;
        if (def.operation === gql.OperationTypeNode.SUBSCRIPTION) {
          warn("GRAPHQL_SUBSCRIPTION", `${name}: subscriptions are not supported and were skipped`);
          continue;
        }
        if (!def.name) {
          error(
            "GRAPHQL_DOCUMENT",
            `${name}: every operation needs a name (anonymous ${def.operation} found)`,
          );
          continue;
        }
        ops.push(fromDocument(def, name));
      }
    }
  } else {
    for (const kind of ["query", "mutation"] as const) {
      const root = rootTypeOf(kind);
      if (!root) continue;
      for (const field of Object.values(root.getFields())) ops.push(fromField(kind, field));
    }
    const sub = schema.getSubscriptionType();
    if (sub)
      warn(
        "GRAPHQL_SUBSCRIPTION",
        `subscriptions are not supported: ${Object.keys(sub.getFields()).length} subscription field(s) were skipped`,
      );
  }

  /** Default selection set for a field's type, bounded by `selectionDepth`. */
  function defaultSelection(type: GraphQLNamedType, level: number, budget: number): string {
    if (gql.isLeafType(type)) return "";
    const lines: string[] = [];
    const selectFields = (fields: readonly GraphQLField<unknown, unknown>[], lvl: number): void => {
      for (const f of fields) {
        if (
          f.args.some(
            (a: GraphQLArgument) => gql.isNonNullType(a.type) && a.defaultValue === undefined,
          )
        )
          continue;
        const named = gql.getNamedType(f.type);
        if (gql.isLeafType(named)) lines.push(`${pad(lvl)}${f.name}`);
        else if (budget - 1 > 0) {
          const sub = defaultSelection(named, lvl + 1, budget - 1);
          if (sub) lines.push(`${pad(lvl)}${f.name} ${sub}`);
        }
      }
    };
    if (gql.isObjectType(type)) {
      selectFields(Object.values(type.getFields()), level);
      if (lines.length === 0) lines.push(`${pad(level)}__typename`);
    } else if (gql.isAbstractType(type)) {
      lines.push(`${pad(level)}__typename`);
      for (const member of schema
        .getPossibleTypes(type)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const before = lines.length;
        const inner: string[] = [];
        const saved = lines.splice(0, lines.length);
        selectFields(Object.values(member.getFields()), level + 1);
        inner.push(...lines.splice(0, lines.length));
        lines.push(...saved);
        if (inner.length > 0)
          lines.push(`${pad(level)}... on ${member.name} {\n${inner.join("\n")}\n${pad(level)}}`);
        void before;
      }
    }
    return `{\n${lines.join("\n")}\n${pad(level - 1)}}`;
  }

  function fromField(kind: "query" | "mutation", field: GraphQLField<unknown, unknown>): Op {
    const pascal = toPascal(field.name);
    const label = kind === "query" ? "Query" : "Mutation";
    const vars = field.args.map((a) => ({
      name: a.name,
      type: a.type,
      optional: !gql.isNonNullType(a.type) || a.defaultValue !== undefined,
      def: `$${a.name}: ${String(a.type)}${a.defaultValue !== undefined ? ` = ${gql.print(gql.astFromValue(a.defaultValue, a.type) ?? ({ kind: "NullValue" } as never))}` : ""}`,
    }));
    const named = gql.getNamedType(field.type);
    const selection = defaultSelection(named, 2, depth);
    const head = vars.length > 0 ? `(${vars.map((v) => v.def).join(", ")})` : "";
    const argUse =
      field.args.length > 0 ? `(${field.args.map((a) => `${a.name}: $${a.name}`).join(", ")})` : "";
    const text = `${kind} ${pascal}${label}${head} {\n  ${field.name}${argUse}${selection ? ` ${selection}` : ""}\n}`;
    const doc = gql.parse(text);
    const printed = gql.print(doc);
    const operation = doc.definitions[0] as OperationDefinitionNode;
    const fieldNode = operation.selectionSet.selections[0] as FieldNode;
    const variablesName = `${pascal}${label}Variables`;
    const dataName = `${pascal}${label}Data`;
    const { body, allOptional } = variablesDecl(variablesName, vars);
    const dataType = wrapTs(field.type, (n) =>
      gql.isLeafType(n)
        ? leafType(n)
        : compositeType(n, fieldNode.selectionSet ? [fieldNode.selectionSet] : [], 0),
    );
    return {
      kind,
      key: toCamel(field.name),
      operationName: `${pascal}${label}`,
      document: printed,
      field: field.name,
      variablesName,
      variablesType: body,
      allOptional,
      dataName,
      dataType,
      description: field.description,
      deprecated: field.deprecationReason ?? null,
    };
  }

  function fromDocument(def: OperationDefinitionNode, source: string): Op {
    const kind = def.operation === gql.OperationTypeNode.MUTATION ? "mutation" : "query";
    const opName = (def.name as { value: string }).value;
    const pascal = toPascal(opName);
    const root = rootTypeOf(kind);
    if (!root) {
      error("GRAPHQL_DOCUMENT", `${source}: schema has no ${kind} root type for "${opName}"`);
      return emptyOp(kind, opName);
    }
    const vars = (def.variableDefinitions ?? []).map((v) => {
      const type = astTypeToInput(v.type);
      return {
        name: v.variable.name.value,
        type: type as GraphQLInputType,
        optional: v.type.kind !== gql.Kind.NON_NULL_TYPE || v.defaultValue !== undefined,
      };
    });
    const variablesName = `${pascal}Variables`;
    const dataName = `${pascal}Data`;
    const { body, allOptional } = variablesDecl(
      variablesName,
      vars.filter((v) => v.type !== undefined),
    );
    // attach the fragments the operation (transitively) uses
    const used = new Set<string>();
    const visit = (set: SelectionSetNode): void => {
      for (const s of set.selections) {
        if (s.kind === gql.Kind.FRAGMENT_SPREAD) {
          if (used.has(s.name.value)) continue;
          used.add(s.name.value);
          const frag = fragments.get(s.name.value);
          if (frag) visit(frag.selectionSet);
        } else if (s.selectionSet) visit(s.selectionSet);
      }
    };
    visit(def.selectionSet);
    const printed = [
      gql.print(def),
      ...[...used].sort().flatMap((n) => {
        const f = fragments.get(n);
        return f ? [gql.print(f)] : [];
      }),
    ].join("\n\n");
    return {
      kind,
      key: toCamel(opName),
      operationName: opName,
      document: printed,
      field: null,
      variablesName,
      variablesType: body,
      allOptional,
      dataName,
      dataType: objectBody(root, [def.selectionSet], 0),
    };
  }
  function emptyOp(kind: "query" | "mutation", name: string): Op {
    return {
      kind,
      key: toCamel(name),
      operationName: name,
      document: "",
      field: null,
      variablesName: "",
      variablesType: "",
      allOptional: false,
      dataName: "",
      dataType: "unknown",
    };
  }

  if (diagnostics.some((d) => d.level === "error")) throw new GenerationError(diagnostics);

  // names + collisions
  const keys = new Set<string>();
  for (const op of ops) {
    const k = `${op.kind}.${op.key}`;
    if (keys.has(k)) error("NAME_COLLISION", `two ${op.kind} operations would both be api.${k}`);
    keys.add(k);
    if (!isIdentifier(op.key)) error("NAME_COLLISION", `"${op.key}" is not a valid property name`);
    claim(op.dataName, `result of ${op.kind} "${op.operationName}"`);
    if (op.variablesType) claim(op.variablesName, `variables of ${op.kind} "${op.operationName}"`);
  }
  if (diagnostics.some((d) => d.level === "error")) throw new GenerationError(diagnostics);

  for (const name of [...unmappedScalars].sort())
    warn(
      "UNMAPPED_SCALAR",
      `custom scalar "${name}" is typed as unknown; map it with "scalars": { "${name}": "string" }`,
    );

  // ---- assemble -------------------------------------------------------------------------
  const title = schema.description?.split("\n")[0] ?? "GraphQL API";
  const model: ApiModel = { title, version: "", schemas: [], operations: [] };
  const header = `// <auto-generated by @nyxapi/codegen. Do not edit: changes are overwritten.>\n// Source: ${safeComment(title)}\n/* eslint-disable */\n\n`;

  for (const op of ops) {
    if (op.variablesType) types += op.variablesType;
    types += `${docBlock([op.description, op.deprecated ? `@deprecated ${op.deprecated}` : undefined], 0)}export type ${op.dataName} = ${op.dataType};\n\n`;
  }

  const group = (kind: "query" | "mutation"): string => {
    const list = ops.filter((o) => o.kind === kind).sort((a, b) => a.key.localeCompare(b.key));
    if (list.length === 0) return "";
    return list
      .map((op) => {
        const vars = op.variablesType
          ? op.allOptional
            ? `${op.variablesName} | undefined`
            : op.variablesName
          : "void";
        const flags = `name: ${JSON.stringify(op.operationName)}, document: ${JSON.stringify(op.document)}${op.field ? `, field: ${JSON.stringify(op.field)}` : ""}${op.variablesType ? "" : ", hasVariables: false"}`;
        return `${docBlock([op.description, op.deprecated ? `@deprecated ${op.deprecated}` : undefined], 3)}${pad(3)}${propertyKey(op.key)}: client.${kind}<${vars}, ${op.dataName}>({ ${flags} }),\n`;
      })
      .join("");
  };

  const usedTypeNames = ops
    .flatMap((o) => [o.dataName, ...(o.variablesType ? [o.variablesName] : [])])
    .sort();
  let client = header;
  client += `import type { GraphQLClient } from "@nyxapi/graphql";\n`;
  if (usedTypeNames.length > 0)
    client += `import type {\n${usedTypeNames.map((n) => `${pad(1)}${n},\n`).join("")}} from "./types.js";\n`;
  client += `\n/**\n * Create the typed client. Create one \`GraphQLClient\` per user/request on the server.\n */\nexport function createApi(client: GraphQLClient) {\n  return {\n    query: {\n${group("query")}    },\n    mutation: {\n${group("mutation")}    },\n  };\n}\n\nexport type Api = ReturnType<typeof createApi>;\n`;
  const index = `${header}export * from "./types.js";\nexport { createApi, type Api } from "./client.js";\n`;

  return {
    files: [
      { path: "types.ts", content: `${header}${types.trimEnd()}\n` },
      { path: "client.ts", content: client },
      { path: "index.ts", content: index },
    ],
    model,
    diagnostics,
  };
}

/** The standard introspection query, for tools that fetch a schema from a running server. */
export async function introspectionQuery(): Promise<string> {
  const gql: G = await import("graphql");
  return gql.getIntrospectionQuery({ descriptions: true });
}
