import { parse } from "yaml";
import { resolveConfig, validateConfig, type NyxApiConfig } from "./config.js";
import { emit, type GeneratedFile } from "./emit.js";
import { GenerationError, type ApiModel, type Diagnostic } from "./ir.js";
import { generateGraphQL, looksLikeGraphQL, type GraphQLDocumentInput } from "./graphql.js";
import { buildApiModel } from "./model.js";
import { buildTree } from "./tree.js";

export * from "./ir.js";
export { validateConfig, resolveConfig, type NyxApiConfig, type ResolvedConfig } from "./config.js";
export { buildApiModel } from "./model.js";
export type { GeneratedFile } from "./emit.js";
export { introspectionQuery, looksLikeGraphQL, type GraphQLDocumentInput } from "./graphql.js";
export { toCamel, toPascal, typeName, synthesizeOperationId } from "./naming.js";

export interface GenerateResult {
  files: GeneratedFile[];
  model: ApiModel;
  /** Warnings only: errors throw `GenerationError`. */
  diagnostics: Diagnostic[];
}

/** Parse JSON or YAML text. JSON is a subset of YAML, so one parser handles both. */
export function parseSchemaText(text: string, sourceName = "schema"): unknown {
  try {
    return parse(text, { maxAliasCount: 100 }) as unknown;
  } catch (cause) {
    throw new GenerationError([
      {
        level: "error",
        code: "PARSE_ERROR",
        message: `${sourceName}: ${cause instanceof Error ? cause.message : String(cause)}`,
      },
    ]);
  }
}

/** Validate a schema without generating. Returns all diagnostics (errors included). */
export function validateSchema(
  text: string,
  config: NyxApiConfig = {},
  sourceName?: string,
): { model: ApiModel; diagnostics: Diagnostic[] } {
  const doc = parseSchemaText(text, sourceName);
  const { model, diagnostics } = buildApiModel(doc, config);
  if (diagnostics.some((d) => d.level === "error")) return { model, diagnostics };
  const cfg = resolveConfig(config);
  emit(model, buildTree(model.operations, cfg, diagnostics), cfg, diagnostics);
  return { model, diagnostics };
}

/**
 * OpenAPI text → generated TypeScript files. Deterministic: the same schema and config always
 * produce byte-identical output (no timestamps, no unordered iteration).
 */
export function generate(
  text: string,
  config: NyxApiConfig = {},
  sourceName?: string,
): GenerateResult {
  const { problems } = validateConfig(config);
  if (problems.length > 0)
    throw new GenerationError(
      problems.map((message) => ({ level: "error" as const, code: "INVALID_CONFIG", message })),
    );
  const doc = parseSchemaText(text, sourceName);
  const { model, diagnostics } = buildApiModel(doc, config);
  if (diagnostics.some((d) => d.level === "error")) throw new GenerationError(diagnostics);
  const cfg = resolveConfig(config);
  const root = buildTree(model.operations, cfg, diagnostics);
  const files = emit(model, root, cfg, diagnostics);
  if (diagnostics.some((d) => d.level === "error")) throw new GenerationError(diagnostics);
  return { files, model, diagnostics };
}

/** Which kind of schema is this text? Honors `config.kind`, then file name, then contents. */
export function detectKind(
  text: string,
  config: NyxApiConfig = {},
  sourceName = "",
): "openapi" | "swagger" | "graphql" {
  if (config.kind !== undefined && config.kind !== "auto")
    return config.kind === "swagger" ? "swagger" : config.kind;
  if (looksLikeGraphQL(text, sourceName)) return "graphql";
  return /^\s*["']?swagger["']?\s*:/m.test(text) || /"swagger"\s*:/.test(text.slice(0, 2048))
    ? "swagger"
    : "openapi";
}

export interface GenerateOptions {
  /** GraphQL operation documents (see the `documents` config key). */
  documents?: readonly GraphQLDocumentInput[];
  sourceName?: string;
}

/**
 * Any supported schema (OpenAPI 3.x, Swagger 2.0, GraphQL) → generated TypeScript files.
 * Async because GraphQL support loads the `graphql` package on demand.
 */
export async function generateFrom(
  text: string,
  config: NyxApiConfig = {},
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const { problems } = validateConfig(config);
  if (problems.length > 0)
    throw new GenerationError(
      problems.map((message) => ({ level: "error" as const, code: "INVALID_CONFIG", message })),
    );
  if (detectKind(text, config, options.sourceName) === "graphql")
    return generateGraphQL(text, config, options.documents ?? [], options.sourceName);
  return generate(text, config, options.sourceName);
}
