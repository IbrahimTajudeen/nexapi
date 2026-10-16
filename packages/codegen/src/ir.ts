/**
 * The normalized API model. Everything after parsing (validation, naming, emission) works on
 * this and never on raw OpenAPI. Future sources (NestJS decorators, ASP.NET Core API
 * explorer output) only need to produce an `ApiModel`.
 */
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head";

export type TypeNode =
  | { kind: "ref"; name: string }
  | {
      kind: "primitive";
      type: "string" | "number" | "boolean" | "null" | "unknown" | "void" | "undefined" | "Blob";
    }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "array"; item: TypeNode }
  | { kind: "object"; properties: PropertyNode[]; additional: TypeNode | null }
  | { kind: "union"; members: TypeNode[] }
  | { kind: "intersection"; members: TypeNode[] };

export interface PropertyNode {
  name: string;
  type: TypeNode;
  required: boolean;
  description?: string;
  deprecated?: boolean;
}

export interface SchemaModel {
  /** Original component name, e.g. `user-profile`. */
  sourceName: string;
  /** Generated TypeScript identifier. */
  name: string;
  type: TypeNode;
  description?: string;
}

export interface ParameterModel {
  /** Name on the wire. */
  name: string;
  type: TypeNode;
  required: boolean;
  description?: string;
}

export interface OperationModel {
  /** `operationId`, or a deterministic synthesized id. */
  id: string;
  idSynthesized: boolean;
  method: HttpMethod;
  /** Original path template. */
  path: string;
  summary?: string;
  description?: string;
  deprecated: boolean;
  /** In order of appearance in the path. */
  pathParams: ParameterModel[];
  queryParams: ParameterModel[];
  headerParams: ParameterModel[];
  body?: { type: TypeNode; required: boolean };
  /** Union of 2xx payloads; `void` when there is no content. */
  success: TypeNode;
  /** Documented error responses; `status` is `"404"`, `"4XX"` or `"default"`. */
  errors: { status: string; type: TypeNode }[];
  /** `none` when every success response is empty. */
  responseKind: "json" | "none";
}

export interface ApiModel {
  title: string;
  version: string;
  schemas: SchemaModel[];
  operations: OperationModel[];
}

export type DiagnosticLevel = "error" | "warning";

export interface Diagnostic {
  level: DiagnosticLevel;
  /** Stable machine-readable code, e.g. `NAME_COLLISION`. */
  code: string;
  message: string;
}

export class GenerationError extends Error {
  readonly diagnostics: readonly Diagnostic[];
  constructor(diagnostics: readonly Diagnostic[]) {
    super(
      `Generation failed with ${String(diagnostics.filter((d) => d.level === "error").length)} error(s):\n` +
        diagnostics
          .filter((d) => d.level === "error")
          .map((d) => `  [${d.code}] ${d.message}`)
          .join("\n"),
    );
    this.name = "GenerationError";
    this.diagnostics = diagnostics;
  }
}
