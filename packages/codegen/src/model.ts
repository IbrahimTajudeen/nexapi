import { resolveConfig, type NexApiConfig } from "./config.js";
import type {
  ApiModel,
  BodyKind,
  Diagnostic,
  HttpMethod,
  OperationModel,
  ParameterModel,
  PropertyNode,
  SchemaModel,
  TypeNode,
} from "./ir.js";
import { synthesizeOperationId, typeName } from "./naming.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o: Obj, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

const METHODS: readonly HttpMethod[] = ["get", "post", "put", "patch", "delete", "head"];
const UNSUPPORTED_METHODS = ["options", "trace"];
const SKIPPED_HEADERS = new Set(["authorization", "accept", "content-type"]);
const UNKNOWN: TypeNode = { kind: "primitive", type: "unknown" };
const VOID: TypeNode = { kind: "primitive", type: "void" };

/** Parse an OpenAPI 3.x document into the normalized model. Collects all problems. */
export function buildApiModel(
  document: unknown,
  config: NexApiConfig = {},
): { model: ApiModel; diagnostics: Diagnostic[] } {
  const cfg = resolveConfig(config);
  const diagnostics: Diagnostic[] = [];
  const error = (code: string, message: string): void =>
    void diagnostics.push({ level: "error", code, message });
  const warn = (code: string, message: string): void =>
    void diagnostics.push({ level: "warning", code, message });
  const empty: ApiModel = { title: "", version: "", schemas: [], operations: [] };

  if (!isObj(document)) {
    error("INVALID_DOCUMENT", "The schema is not an object");
    return { model: empty, diagnostics };
  }
  const version = str(document["openapi"]);
  if (!version || !/^3\.[01]\.\d+/.test(version)) {
    error(
      "UNSUPPORTED_VERSION",
      version
        ? `OpenAPI ${version} is not supported (3.0.x and 3.1.x are)`
        : 'Missing "openapi" field (Swagger 2.0 documents are not supported; convert to OpenAPI 3.x)',
    );
    return { model: empty, diagnostics };
  }
  const info = isObj(document["info"]) ? document["info"] : {};

  // ---- $ref resolution ------------------------------------------------------------------
  const resolvePointer = (ref: string, where: string): unknown => {
    if (!ref.startsWith("#/")) {
      error("EXTERNAL_REF", `${where}: only local "#/..." references are supported (got "${ref}")`);
      return undefined;
    }
    let cur: unknown = document;
    for (const raw of ref.slice(2).split("/")) {
      const key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
      if (!isObj(cur) && !Array.isArray(cur)) cur = undefined;
      else cur = (cur as Obj)[key];
      if (cur === undefined) break;
    }
    if (cur === undefined) error("UNRESOLVED_REF", `${where}: cannot resolve "${ref}"`);
    return cur;
  };
  const deref = (value: unknown, where: string): Obj | undefined => {
    let cur = value;
    for (let i = 0; i < 32; i++) {
      if (!isObj(cur)) return undefined;
      const ref = str(cur["$ref"]);
      if (ref === undefined) return cur;
      cur = resolvePointer(ref, where);
    }
    error("REF_CYCLE", `${where}: reference chain is too deep or circular`);
    return undefined;
  };

  // ---- schemas ----------------------------------------------------------------------------
  const components = isObj(document["components"]) ? document["components"] : {};
  const rawSchemas = isObj(components["schemas"]) ? components["schemas"] : {};
  const schemaNames = new Map<string, string>(); // source → TS name
  for (const source of Object.keys(rawSchemas)) schemaNames.set(source, typeName(source));

  const convert = (schema: unknown, where: string, inlining: readonly string[] = []): TypeNode => {
    if (schema === true || schema === undefined) return UNKNOWN;
    if (schema === false) return { kind: "primitive", type: "unknown" };
    if (!isObj(schema)) {
      error("INVALID_SCHEMA", `${where}: schema must be an object`);
      return UNKNOWN;
    }
    const ref = str(schema["$ref"]);
    if (ref !== undefined) {
      const m = /^#\/components\/schemas\/([^/]+)$/.exec(ref);
      if (m) {
        const source = decodeURIComponent(m[1] ?? "")
          .replace(/~1/g, "/")
          .replace(/~0/g, "~");
        const name = schemaNames.get(source);
        if (name === undefined) {
          error("UNRESOLVED_REF", `${where}: cannot resolve "${ref}"`);
          return UNKNOWN;
        }
        return { kind: "ref", name };
      }
      if (inlining.includes(ref)) {
        error(
          "REF_CYCLE",
          `${where}: circular reference through "${ref}" that is not a component schema`,
        );
        return UNKNOWN;
      }
      return convert(resolvePointer(ref, where), where, [...inlining, ref]);
    }

    let node = convertBody(schema, where, inlining);
    if (schema["nullable"] === true) node = union([node, { kind: "primitive", type: "null" }]);
    return node;
  };

  const union = (members: TypeNode[]): TypeNode => {
    const flat: TypeNode[] = [];
    for (const m of members) for (const x of m.kind === "union" ? m.members : [m]) flat.push(x);
    const seen = new Set<string>();
    const unique = flat.filter((m) => {
      const k = JSON.stringify(m);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return unique.length === 1 ? (unique[0] as TypeNode) : { kind: "union", members: unique };
  };

  const convertBody = (schema: Obj, where: string, inlining: readonly string[]): TypeNode => {
    if (has(schema, "const")) {
      const c = schema["const"];
      if (typeof c === "string" || typeof c === "number" || typeof c === "boolean")
        return { kind: "literal", value: c };
      if (c === null) return { kind: "primitive", type: "null" };
    }
    if (Array.isArray(schema["enum"])) {
      const members: TypeNode[] = [];
      for (const v of schema["enum"] as unknown[]) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
          members.push({ kind: "literal", value: v });
        else if (v === null) members.push({ kind: "primitive", type: "null" });
        else
          error(
            "INVALID_SCHEMA",
            `${where}: enum values must be strings, numbers, booleans or null`,
          );
      }
      if (members.length > 0) return union(members);
    }
    for (const key of ["oneOf", "anyOf"] as const) {
      const list = schema[key];
      if (Array.isArray(list) && list.length > 0)
        return union(list.map((s, i) => convert(s, `${where}.${key}[${String(i)}]`, inlining)));
    }
    if (Array.isArray(schema["allOf"]) && schema["allOf"].length > 0) {
      const members = schema["allOf"].map((s, i) =>
        convert(s, `${where}.allOf[${String(i)}]`, inlining),
      );
      const own = has(schema, "properties") ? [convertObject(schema, where, inlining)] : [];
      const all = [...members, ...own];
      return all.length === 1 ? (all[0] as TypeNode) : { kind: "intersection", members: all };
    }
    const type = schema["type"];
    if (Array.isArray(type)) {
      const nonNull = type.filter((t) => t !== "null");
      const members = nonNull.map((t) => convertBody({ ...schema, type: t }, where, inlining));
      if (type.includes("null")) members.push({ kind: "primitive", type: "null" });
      return members.length === 0 ? UNKNOWN : union(members);
    }
    switch (type) {
      case "string":
        return { kind: "primitive", type: schema["format"] === "binary" ? "Blob" : "string" };
      case "integer":
      case "number":
        return { kind: "primitive", type: "number" };
      case "boolean":
        return { kind: "primitive", type: "boolean" };
      case "null":
        return { kind: "primitive", type: "null" };
      case "array":
        return { kind: "array", item: convert(schema["items"], `${where}.items`, inlining) };
      case "object":
        return convertObject(schema, where, inlining);
      default:
        if (has(schema, "properties") || has(schema, "additionalProperties"))
          return convertObject(schema, where, inlining);
        return UNKNOWN;
    }
  };

  const convertObject = (schema: Obj, where: string, inlining: readonly string[]): TypeNode => {
    const props = isObj(schema["properties"]) ? schema["properties"] : {};
    const required = new Set(
      Array.isArray(schema["required"])
        ? (schema["required"] as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
    );
    const properties: PropertyNode[] = Object.keys(props).map((name) => {
      const raw = props[name];
      const resolved = isObj(raw) ? raw : {};
      const p: PropertyNode = {
        name,
        type: convert(raw, `${where}.properties.${name}`, inlining),
        required: required.has(name),
      };
      const description = str(resolved["description"]);
      if (description) p.description = description;
      if (resolved["deprecated"] === true) p.deprecated = true;
      return p;
    });
    const ap = schema["additionalProperties"];
    let additional: TypeNode | null = null;
    if (isObj(ap)) additional = convert(ap, `${where}.additionalProperties`, inlining);
    else if (properties.length === 0 && ap !== false) additional = UNKNOWN;
    return { kind: "object", properties, additional };
  };

  const schemas: SchemaModel[] = [];
  const seenNames = new Map<string, string>();
  for (const source of Object.keys(rawSchemas).sort()) {
    const name = schemaNames.get(source) as string;
    const other = seenNames.get(name);
    if (other !== undefined)
      error(
        "NAME_COLLISION",
        `Schemas "${other}" and "${source}" both map to the TypeScript name "${name}"`,
      );
    seenNames.set(name, source);
    const raw = rawSchemas[source];
    const model: SchemaModel = {
      sourceName: source,
      name,
      type: convert(raw, `#/components/schemas/${source}`),
    };
    const description = isObj(raw) ? str(raw["description"]) : undefined;
    if (description) model.description = description;
    schemas.push(model);
  }

  // ---- operations ---------------------------------------------------------------------------
  const operations: OperationModel[] = [];
  const paths = isObj(document["paths"]) ? document["paths"] : {};
  const textContent = (content: unknown): Obj | undefined => {
    if (!isObj(content)) return undefined;
    const key = Object.keys(content).find((k) => /^text\//i.test(k));
    return key === undefined ? undefined : (content[key] as Obj | undefined);
  };

  /** Preferred request body encoding among the declared media types. */
  const pickBody = (content: unknown): { kind: BodyKind; schema: Obj } | undefined => {
    if (!isObj(content)) return undefined;
    const json = jsonContent(content);
    if (json) return { kind: "json", schema: json };
    const find = (re: RegExp): Obj | undefined => {
      const key = Object.keys(content).find((k) => re.test(k));
      return key === undefined ? undefined : (content[key] as Obj | undefined);
    };
    const multipart = find(/^multipart\/form-data/i);
    if (multipart) return { kind: "form-data", schema: multipart };
    const urlencoded = find(/^application\/x-www-form-urlencoded/i);
    if (urlencoded) return { kind: "urlencoded", schema: urlencoded };
    const text = find(/^text\/plain/i);
    if (text) return { kind: "text", schema: text };
    for (const key of Object.keys(content)) {
      const entry = content[key];
      const schema = isObj(entry) ? entry["schema"] : undefined;
      if (
        /^application\/octet-stream/i.test(key) ||
        (isObj(schema) && schema["type"] === "string" && schema["format"] === "binary")
      )
        return { kind: "binary", schema: entry as Obj };
    }
    return undefined;
  };

  /** Why `type` cannot be sent as `kind` (the runtime would refuse it), or `undefined`. */
  const bodyProblem = (kind: BodyKind, type: TypeNode): string | undefined => {
    if (kind === "binary")
      return type.kind === "primitive" && type.type === "Blob"
        ? undefined
        : 'a binary request body must be a string with format "binary"';
    if (kind !== "form-data" && kind !== "urlencoded") return undefined;
    if (type.kind !== "object" || type.additional !== null)
      return `a ${kind} body must be an object with declared properties`;
    const field = (t: TypeNode): boolean =>
      isScalarLike(t) || (kind === "form-data" && t.kind === "primitive" && t.type === "Blob");
    const bad = type.properties.find(
      (p) => !(field(p.type) || (p.type.kind === "array" && field(p.type.item))),
    );
    return bad
      ? `${kind} body property "${bad.name}" must be a scalar${kind === "form-data" ? ", file" : ""} or an array of them`
      : undefined;
  };

  const jsonContent = (content: unknown): Obj | undefined => {
    if (!isObj(content)) return undefined;
    const key = Object.keys(content).find((k) => /^application\/(.+\+)?json(\s*;.*)?$/i.test(k));
    return key === undefined ? undefined : (content[key] as Obj | undefined);
  };

  for (const path of Object.keys(paths).sort()) {
    const item = deref(paths[path], `paths.${path}`);
    if (!item) continue;
    if (!path.startsWith("/") || path.startsWith("//")) {
      error("INVALID_PATH", `Path "${path}" must start with a single "/"`);
      continue;
    }
    const templateParams = [...path.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1] as string);

    for (const method of UNSUPPORTED_METHODS)
      if (has(item, method))
        warn(
          "UNSUPPORTED_METHOD",
          `${method.toUpperCase()} ${path} is not supported and was skipped`,
        );

    for (const method of METHODS) {
      const opRaw = item[method];
      if (opRaw === undefined) continue;
      const op = deref(opRaw, `${method.toUpperCase()} ${path}`);
      if (!op) continue;
      const label = `${method.toUpperCase()} ${path}`;
      const explicitId = str(op["operationId"]);
      const id = explicitId ?? synthesizeOperationId(method, path);
      if (cfg.exclude.has(id)) continue;

      // parameters: path-level, overridden by operation-level (same name + location)
      const merged = new Map<string, Obj>();
      for (const list of [item["parameters"], op["parameters"]]) {
        if (!Array.isArray(list)) continue;
        for (const p of list) {
          const param = deref(p, `${label} parameter`);
          if (!param) continue;
          merged.set(`${str(param["in"]) ?? "?"}:${str(param["name"]) ?? "?"}`, param);
        }
      }
      const pathParams: ParameterModel[] = [];
      const queryParams: ParameterModel[] = [];
      const headerParams: ParameterModel[] = [];
      const declaredPath = new Map<string, ParameterModel>();
      for (const param of merged.values()) {
        const name = str(param["name"]);
        const where = str(param["in"]);
        if (!name || !where) {
          error("INVALID_PARAMETER", `${label}: parameter without "name" or "in"`);
          continue;
        }
        const type = convert(param["schema"], `${label} parameter "${name}"`);
        const model: ParameterModel = {
          name,
          type,
          required: where === "path" || param["required"] === true,
        };
        const description = str(param["description"]);
        if (description) model.description = description;
        const queryStyle = where === "query" ? queryStyleOf(param, type) : undefined;
        if (queryStyle) model.style = queryStyle;
        else if (where === "query" && type.kind === "array" && hasUnhandledArrayStyle(param))
          warn(
            "UNSUPPORTED_STYLE",
            `${label}: query parameter "${name}" uses an array style that is not supported; it will be sent exploded (a=1&a=2)`,
          );
        else if (type.kind === "object" || (type.kind === "array" && type.item.kind === "object"))
          error(
            "UNSUPPORTED_PARAMETER",
            `${label}: ${where} parameter "${name}" has an object schema (deepObject/JSON serialization is not supported)`,
          );
        if (where === "path") declaredPath.set(name, model);
        else if (where === "query") {
          queryParams.push(model);
        } else if (where === "header") {
          if (!SKIPPED_HEADERS.has(name.toLowerCase())) headerParams.push(model);
        } else if (where !== "cookie")
          error("INVALID_PARAMETER", `${label}: unknown parameter location "${where}"`);
        else warn("UNSUPPORTED_PARAMETER", `${label}: cookie parameter "${name}" is ignored`);
      }
      for (const name of templateParams) {
        const p = declaredPath.get(name);
        if (!p)
          error("MISSING_PATH_PARAMETER", `${label}: path parameter "{${name}}" is not declared`);
        else pathParams.push(p);
      }
      for (const name of declaredPath.keys())
        if (!templateParams.includes(name))
          error(
            "UNUSED_PATH_PARAMETER",
            `${label}: declared path parameter "${name}" does not appear in the path`,
          );

      // request body
      let body: OperationModel["body"];
      if (op["requestBody"] !== undefined) {
        const rb = deref(op["requestBody"], `${label} requestBody`);
        if (rb) {
          const picked = pickBody(rb["content"]);
          if (!picked) {
            const types = isObj(rb["content"]) ? Object.keys(rb["content"]).join(", ") : "none";
            error(
              "UNSUPPORTED_CONTENT_TYPE",
              `${label}: request body content types [${types}] are not supported (JSON, multipart/form-data, application/x-www-form-urlencoded, text/plain and binary are). Add "${id}" to "exclude" to skip it.`,
            );
          } else if (method === "get" || method === "head")
            error(
              "BODY_NOT_ALLOWED",
              `${label}: ${method.toUpperCase()} operations cannot have a request body`,
            );
          else {
            const type =
              picked.kind === "text"
                ? ({ kind: "primitive", type: "string" } as TypeNode)
                : convert(picked.schema["schema"], `${label} requestBody`);
            const problem = bodyProblem(picked.kind, type);
            if (problem)
              error(
                "UNSUPPORTED_BODY_SCHEMA",
                `${label}: ${problem}. Add "${id}" to "exclude" to skip it.`,
              );
            else body = { type, required: rb["required"] === true, kind: picked.kind };
          }
        }
      }

      // responses
      const responses = isObj(op["responses"]) ? op["responses"] : {};
      const success: TypeNode[] = [];
      const errors: { status: string; type: TypeNode }[] = [];
      let sawSuccess = false;
      const successKinds = new Set<"json" | "text" | "blob">();
      for (const status of Object.keys(responses).sort()) {
        const res = deref(responses[status], `${label} response ${status}`);
        if (!res) continue;
        const isSuccess = /^2(\d\d|XX)$/i.test(status);
        const isError = /^[45](\d\d|XX)$/i.test(status) || status === "default";
        if (!isSuccess && !isError) continue;
        const content = isObj(res["content"]) ? res["content"] : undefined;
        const json = jsonContent(content);
        const text = json ? undefined : textContent(content);
        const noContent =
          content === undefined ||
          Object.keys(content).length === 0 ||
          status === "204" ||
          status === "205";
        let node: TypeNode | undefined;
        if (json) {
          node = convert(json["schema"], `${label} response ${status}`);
          if (isSuccess) successKinds.add("json");
        } else if (noContent) node = isSuccess ? VOID : { kind: "primitive", type: "undefined" };
        else if (text) {
          node = { kind: "primitive", type: "string" };
          if (isSuccess) successKinds.add("text");
        } else if (isSuccess) {
          node = { kind: "primitive", type: "Blob" };
          successKinds.add("blob");
        }
        if (isSuccess) {
          sawSuccess = true;
          if (node) success.push(node);
        } else if (node) errors.push({ status: status.toUpperCase(), type: node });
      }
      if (!sawSuccess) error("NO_SUCCESS_RESPONSE", `${label}: no 2xx response is declared`);

      if (successKinds.size > 1) {
        error(
          "UNSUPPORTED_CONTENT_TYPE",
          `${label}: success responses mix payload kinds [${[...successKinds].join(", ")}]; one operation can return only one kind. Add "${id}" to "exclude" to skip it.`,
        );
      }
      const successNode = success.length === 0 ? VOID : union(success);
      const op_: OperationModel = {
        id,
        idSynthesized: explicitId === undefined,
        method,
        path,
        deprecated: op["deprecated"] === true,
        pathParams,
        queryParams,
        headerParams,
        success: successNode,
        errors,
        responseKind:
          successNode.kind === "primitive" && successNode.type === "void"
            ? "none"
            : (successKinds.values().next().value ?? "json"),
      };
      const summary = str(op["summary"]);
      const description = str(op["description"]);
      if (summary) op_.summary = summary;
      if (description) op_.description = description;
      if (body) op_.body = body;
      operations.push(op_);
    }
  }

  // operationId uniqueness
  const ids = new Map<string, string>();
  for (const op of operations) {
    const other = ids.get(op.id);
    if (other !== undefined)
      error(
        "DUPLICATE_OPERATION_ID",
        `operationId "${op.id}" is used by both ${other} and ${op.method.toUpperCase()} ${op.path}`,
      );
    ids.set(op.id, `${op.method.toUpperCase()} ${op.path}`);
  }

  return {
    model: {
      title: str(info["title"]) ?? "API",
      version: str(info["version"]) ?? "0.0.0",
      schemas,
      operations,
    },
    diagnostics,
  };
}

/**
 * Query serialization other than the exploded default, or `undefined` for the default.
 * Unsupported combinations are errors, never silently sent in a different form.
 */
function queryStyleOf(param: Record<string, unknown>, type: TypeNode): ParameterModel["style"] {
  const style = typeof param["style"] === "string" ? param["style"] : "form";
  const explode = param["explode"];
  if (style === "deepObject") {
    if (type.kind !== "object" || type.additional !== null || explode === false) return undefined;
    return type.properties.every((p) => isScalarLike(p.type)) ? "deepObject" : undefined;
  }
  if (type.kind !== "array" || !isScalarLike(type.item)) return undefined;
  if (style === "form") return explode === false ? "csv" : undefined;
  if (explode === true) return undefined; // delimited styles with explode=true are sent exploded
  if (style === "spaceDelimited") return "space";
  if (style === "pipeDelimited") return "pipe";
  return undefined;
}

function isScalarLike(type: TypeNode): boolean {
  switch (type.kind) {
    case "primitive":
      return type.type === "string" || type.type === "number" || type.type === "boolean";
    case "literal":
      return true;
    case "ref":
      return true; // enums/aliases; the runtime still rejects anything that is not a primitive
    case "union":
      return type.members.every(
        (m) => isScalarLike(m) || (m.kind === "primitive" && m.type === "null"),
      );
    default:
      return false;
  }
}

/** Array style/explode settings that are neither the default nor one of the implemented forms. */
function hasUnhandledArrayStyle(param: Record<string, unknown>): boolean {
  const style = typeof param["style"] === "string" ? param["style"] : "form";
  const explode = param["explode"];
  if (style === "form") return explode === false; // csv was not applicable (non-scalar items)
  if ((style === "spaceDelimited" || style === "pipeDelimited") && explode === true) return false;
  return true;
}
