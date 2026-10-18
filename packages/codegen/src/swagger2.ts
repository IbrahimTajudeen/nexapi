/**
 * Swagger 2.0 → OpenAPI 3.0 conversion, so Swagger documents flow through the one model builder.
 * It covers what the generator reads: servers, paths, parameters, request bodies, responses and
 * schemas. Security definitions are not converted because authentication is configured on the
 * client, not generated.
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch"];
const SCHEMA_KEYS = [
  "type",
  "format",
  "enum",
  "default",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "multipleOf",
  "items",
] as const;

export function isSwagger2(document: unknown): document is Obj {
  return isObj(document) && typeof document["swagger"] === "string";
}

export interface Swagger2Result {
  document: Obj;
  warnings: string[];
}

export function swagger2ToOpenApi3(doc: Obj): Swagger2Result {
  const warnings: string[] = [];
  const version = str(doc["swagger"]) ?? "";
  if (!/^2(\.0)?$/.test(version)) {
    warnings.push(`Swagger ${version} is not 2.0; converting it as 2.0`);
  }
  const defaultConsumes = strings(doc["consumes"]);
  const defaultProduces = strings(doc["produces"]);

  const rewriteRef = (ref: string): string =>
    ref
      .replace(/^#\/definitions\//, "#/components/schemas/")
      .replace(/^#\/parameters\//, "#/components/parameters/")
      .replace(/^#\/responses\//, "#/components/responses/");

  /** Schema Object: 2.0 → 3.0. Only schema-bearing keys are visited, never property names. */
  const schema = (input: unknown): unknown => {
    if (!isObj(input)) return input;
    const out: Obj = {};
    for (const [key, value] of Object.entries(input)) {
      switch (key) {
        case "$ref":
          out[key] = typeof value === "string" ? rewriteRef(value) : value;
          break;
        case "x-nullable":
          if (value === true) out["nullable"] = true;
          break;
        case "discriminator":
          out[key] = typeof value === "string" ? { propertyName: value } : value;
          break;
        case "properties":
          out[key] = isObj(value)
            ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, schema(v)]))
            : value;
          break;
        case "items":
        case "additionalProperties":
        case "not":
          out[key] = schema(value);
          break;
        case "allOf":
        case "oneOf":
        case "anyOf":
          out[key] = Array.isArray(value) ? value.map(schema) : value;
          break;
        default:
          out[key] = value;
      }
    }
    if (out["type"] === "file") {
      out["type"] = "string";
      out["format"] = "binary";
    }
    return out;
  };

  const resolveParam = (p: unknown): Obj | undefined => {
    if (!isObj(p)) return undefined;
    const ref = str(p["$ref"]);
    if (ref === undefined) return p;
    const name = /^#\/parameters\/(.+)$/.exec(ref)?.[1];
    const shared = isObj(doc["parameters"]) ? doc["parameters"] : {};
    const target = name === undefined ? undefined : shared[name];
    return isObj(target) ? target : undefined;
  };

  /** The schema of a non-body parameter: its inline type keywords. */
  const paramSchema = (p: Obj): Obj => {
    const out: Obj = {};
    for (const key of SCHEMA_KEYS) if (p[key] !== undefined) out[key] = p[key];
    if (isObj(out["items"])) out["items"] = paramSchema(out["items"]);
    if (out["type"] === "file") {
      out["type"] = "string";
      out["format"] = "binary";
    }
    return out;
  };

  const convertParam = (p: Obj, where: string): Obj => {
    const location = str(p["in"]) ?? "query";
    const out: Obj = { name: p["name"], in: location };
    if (p["required"] !== undefined) out["required"] = p["required"];
    if (p["description"] !== undefined) out["description"] = p["description"];
    out["schema"] = paramSchema(p);
    if (p["type"] === "array") {
      const format = str(p["collectionFormat"]) ?? "csv";
      if (location === "query") {
        if (format === "multi") out["explode"] = true;
        else if (format === "csv") {
          out["style"] = "form";
          out["explode"] = false;
        } else if (format === "ssv") {
          out["style"] = "spaceDelimited";
          out["explode"] = false;
        } else if (format === "pipes") {
          out["style"] = "pipeDelimited";
          out["explode"] = false;
        } else warnings.push(`${where}: collectionFormat "${format}" is not supported`);
      }
    }
    return out;
  };

  const requestBodyFor = (params: Obj[], consumes: string[], where: string): Obj | undefined => {
    const body = params.find((p) => p["in"] === "body");
    if (body) {
      const types = consumes.length > 0 ? consumes : ["application/json"];
      const s = schema(body["schema"]);
      return {
        required: body["required"] === true,
        content: Object.fromEntries(types.map((t) => [t, { schema: s }])),
      };
    }
    const form = params.filter((p) => p["in"] === "formData");
    if (form.length === 0) return undefined;
    const properties: Obj = {};
    const required: string[] = [];
    for (const p of form) {
      const name = str(p["name"]);
      if (name === undefined) continue;
      properties[name] = paramSchema(p);
      if (p["required"] === true) required.push(name);
    }
    const hasFile = form.some((p) => p["type"] === "file");
    const type = hasFile
      ? "multipart/form-data"
      : consumes.includes("multipart/form-data")
        ? "multipart/form-data"
        : "application/x-www-form-urlencoded";
    if (hasFile && consumes.length > 0 && !consumes.includes("multipart/form-data"))
      warnings.push(`${where}: has a file parameter but does not declare multipart/form-data`);
    const formSchema: Obj = { type: "object", properties };
    if (required.length > 0) formSchema["required"] = required;
    return { required: required.length > 0, content: { [type]: { schema: formSchema } } };
  };

  const convertResponse = (r: unknown, produces: string[]): unknown => {
    if (!isObj(r)) return r;
    const ref = str(r["$ref"]);
    if (ref !== undefined) return { $ref: rewriteRef(ref) };
    const out: Obj = { description: str(r["description"]) ?? "" };
    if (r["schema"] !== undefined) {
      const types = produces.length > 0 ? produces : ["application/json"];
      const s = schema(r["schema"]);
      out["content"] = Object.fromEntries(types.map((t) => [t, { schema: s }]));
    }
    return out;
  };

  const convertOperation = (op: Obj, pathParams: unknown[], where: string): Obj => {
    const out: Obj = {};
    for (const key of ["operationId", "summary", "description", "deprecated", "tags", "security"])
      if (op[key] !== undefined) out[key] = op[key];
    const opParams = Array.isArray(op["parameters"]) ? (op["parameters"] as unknown[]) : [];
    // operation parameters override path-level ones with the same name and location
    const merged = new Map<string, Obj>();
    for (const raw of [...pathParams, ...opParams]) {
      const p = resolveParam(raw);
      if (!p) {
        warnings.push(`${where}: a parameter reference could not be resolved`);
        continue;
      }
      merged.set(`${String(p["in"])}:${String(p["name"])}`, p);
    }
    const all = [...merged.values()];
    const consumes = strings(op["consumes"]).length > 0 ? strings(op["consumes"]) : defaultConsumes;
    const produces = strings(op["produces"]).length > 0 ? strings(op["produces"]) : defaultProduces;
    const parameters = all
      .filter((p) => p["in"] !== "body" && p["in"] !== "formData")
      .map((p) => convertParam(p, where));
    if (parameters.length > 0) out["parameters"] = parameters;
    const body = requestBodyFor(all, consumes, where);
    if (body) out["requestBody"] = body;
    const responses: Obj = {};
    if (isObj(op["responses"]))
      for (const [status, r] of Object.entries(op["responses"]))
        responses[status] = convertResponse(r, produces);
    out["responses"] = responses;
    return out;
  };

  const paths: Obj = {};
  if (isObj(doc["paths"])) {
    for (const [path, item] of Object.entries(doc["paths"])) {
      if (!isObj(item)) continue;
      const pathParams = Array.isArray(item["parameters"]) ? (item["parameters"] as unknown[]) : [];
      const converted: Obj = {};
      for (const method of METHODS) {
        const op = item[method];
        if (isObj(op))
          converted[method] = convertOperation(op, pathParams, `${method.toUpperCase()} ${path}`);
      }
      paths[path] = converted;
    }
  }

  const schemas: Obj = {};
  if (isObj(doc["definitions"]))
    for (const [name, def] of Object.entries(doc["definitions"])) schemas[name] = schema(def);

  const out: Obj = {
    openapi: "3.0.3",
    info: isObj(doc["info"]) ? doc["info"] : { title: "API", version: "0.0.0" },
    paths,
    components: { schemas },
  };
  const host = str(doc["host"]);
  if (host !== undefined) {
    const scheme = strings(doc["schemes"])[0] ?? "https";
    const basePath = str(doc["basePath"]) ?? "";
    out["servers"] = [{ url: `${scheme}://${host}${basePath === "/" ? "" : basePath}` }];
  }
  return { document: out, warnings };
}
