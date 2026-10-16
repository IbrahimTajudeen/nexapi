import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  GenerationError,
  generate,
  synthesizeOperationId,
  toCamel,
  toPascal,
  typeName,
  validateSchema,
  type NexApiConfig,
} from "../src/index.js";

const fixture = readFileSync(
  new URL("../../../fixtures/openapi/basic.yaml", import.meta.url),
  "utf8",
);
const config: NexApiConfig = {
  overrides: { operations: { listUsers: { path: ["users", "list"] } } },
};

const doc = (paths: string, schemas = ""): string =>
  `openapi: 3.0.3\ninfo: { title: T, version: "1" }\npaths:\n${paths}\n${schemas ? `components:\n  schemas:\n${schemas}\n` : ""}`;

const op = (extra = ""): string =>
  `      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema: { type: string }\n${extra}`;

function errorsOf(text: string, cfg: NexApiConfig = {}): string[] {
  try {
    generate(text, cfg);
    return [];
  } catch (e) {
    if (e instanceof GenerationError)
      return e.diagnostics.filter((d) => d.level === "error").map((d) => d.code);
    throw e;
  }
}

describe("naming", () => {
  it("converts words deterministically", () => {
    expect(toPascal("get-user_ByID")).toBe("GetUserById");
    expect(toCamel("user-profiles")).toBe("userProfiles");
    expect(toCamel("v2")).toBe("v2");
    expect(toPascal("123abc")).toBe("_123Abc");
    expect(synthesizeOperationId("get", "/users/{id}/posts")).toBe("getUsersByIdPosts");
  });
  it("renames type names that would shadow globals", () => {
    expect(typeName("Record")).toBe("RecordModel");
    expect(typeName("date")).toBe("DateModel");
    expect(typeName("user")).toBe("User");
  });
});

describe("generate: the basic fixture", () => {
  const result = generate(fixture, config);
  const byPath = Object.fromEntries(result.files.map((f) => [f.path, f.content]));

  it("produces types, client and index", () => {
    expect(result.files.map((f) => f.path)).toEqual(["types.ts", "client.ts", "index.ts"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("is byte-for-byte deterministic across runs and across schema key reordering", () => {
    const again = generate(fixture, config);
    expect(again.files).toEqual(result.files);
    // reversing the key order of `paths` and `components.schemas` must not change a single byte
    const parsed = parse(fixture) as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    const reverse = <T>(o: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(o).reverse());
    parsed.paths = reverse(parsed.paths);
    parsed.components.schemas = reverse(parsed.components.schemas);
    const reordered = stringify(parsed);
    expect(reordered.indexOf("/users/{id}")).toBeLessThan(reordered.indexOf("/auth/login")); // really reordered
    expect(generate(reordered, config).files).toEqual(result.files);
  });

  it("emits no timestamps or absolute paths", () => {
    for (const f of result.files) {
      expect(f.content).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(f.content).not.toContain("/home/");
      expect(f.content.endsWith("\n")).toBe(true);
    }
  });

  it("builds the resource tree with path params bound by navigation", () => {
    const client = byPath["client.ts"] as string;
    expect(client).toContain("auth: {");
    expect(client).toContain("byId: (id: string) => ({");
    expect(client).toContain("params: { id: id }");
    expect(client).toContain("list: {"); // override
    expect(client).toContain("client.mutation<NoRequest, LoginBody, LoginData, LoginErrorBody>");
    expect(client).toContain(
      "client.mutation<NoRequest, void, DeleteUserData, DeleteUserErrorBody>",
    );
    expect(client).toContain('response: "none"');
    expect(client).toContain("@deprecated");
  });

  it("maps schemas faithfully", () => {
    const types = byPath["types.ts"] as string;
    expect(types).toContain('export type Role = "admin" | "member";');
    expect(types).toContain("email?: string | null;"); // optional + nullable
    expect(types).toContain("role: Role;"); // required
    expect(types).toContain("export type DeleteUserData = void;");
    expect(types).toContain("export type LoginErrorBody = ErrorCase<401, ApiError>;");
    expect(types).toContain('import type { ErrorCase } from "@nexapi/core";');
    expect(types).toContain("export type GetUserErrorBody = ErrorCase<404, ApiError>;");
    expect(types).toMatch(
      /export interface ListUsersRequest \{\n {2}query\?: \{\n[\s\S]*role\?: Role\[\];/,
    );
  });

  it("makes the request object required only when a required parameter exists", () => {
    const text = doc(
      `  /s:\n    get:\n      operationId: search\n      parameters:\n        - { name: q, in: query, required: true, schema: { type: string } }\n        - { name: x-tenant, in: header, schema: { type: string } }\n${op()}`,
    );
    const types = generate(text).files[0]?.content as string;
    expect(types).toMatch(/interface SearchRequest \{\n {2}query: \{/);
    expect(types).toMatch(/headers\?: \{\n {4}"x-tenant"\?: string;/);
  });
});

describe("generate: schema features", () => {
  const schemas = `    A: { type: object, required: [x], properties: { x: { type: integer }, y: { type: string, enum: [a, b] } } }
    B: { allOf: [{ $ref: "#/components/schemas/A" }, { type: object, properties: { z: { type: boolean } } }] }
    C: { oneOf: [{ $ref: "#/components/schemas/A" }, { type: string }] }
    D: { type: object, additionalProperties: { type: number } }
    E: { type: [string, "null"] }
    F: { type: array, items: { oneOf: [{ type: string }, { type: number }] } }
    G: { type: object, properties: { self: { $ref: "#/components/schemas/G" } } }
    H: { type: object, properties: { "odd-name": { type: string, description: "close */ early" } } }
    I: { const: fixed }
    J: { type: string, format: binary }`;
  const types = generate(doc(`  /a:\n    get:\n      operationId: a\n${op()}`, schemas)).files[0]
    ?.content as string;

  it("handles allOf, oneOf, maps, 3.1 nullable types, arrays, recursion, consts and binary", () => {
    expect(types).toContain("export type B = A & {\n  z?: boolean;\n};");
    expect(types).toContain("export type C = A | string;");
    expect(types).toContain("export type D = Record<string, number>;");
    expect(types).toContain("export type E = string | null;");
    expect(types).toContain("export type F = (string | number)[];");
    expect(types).toContain("self?: G;");
    expect(types).toContain('"odd-name"?: string;');
    expect(types).toContain('export type I = "fixed";');
    expect(types).toContain("export type J = Blob;");
  });

  it("neutralizes comment terminators in descriptions", () => {
    expect(types).not.toContain("close */ early");
    expect(types).toContain("close *\\/ early");
  });

  it("synthesizes operationIds and tolerates hostile keys without polluting prototypes", () => {
    const text = doc(
      `  /users/{id}:\n    parameters:\n      - { name: id, in: path, required: true, schema: { type: string } }\n    get:\n${op()}`,
      `    __proto__: { type: string }\n    constructor: { type: string }`,
    );
    const r = generate(text);
    expect(r.model.operations[0]?.id).toBe("getUsersById");
    expect(({} as Record<string, unknown>)["type"]).toBeUndefined();
  });
});

describe("generate: invalid input is reported, never silently skipped", () => {
  it("rejects non-OpenAPI-3 documents and malformed YAML", () => {
    expect(errorsOf("swagger: '2.0'\npaths: {}")).toEqual(["UNSUPPORTED_VERSION"]);
    expect(errorsOf("- just\n- a list")).toEqual(["INVALID_DOCUMENT"]);
    expect(errorsOf("openapi: [unclosed")).toEqual(["PARSE_ERROR"]);
    expect(errorsOf("a: 1\na: 2")).toEqual(["PARSE_ERROR"]); // duplicate keys
  });

  it("rejects external and unresolved references", () => {
    const ext = doc(
      `  /a:\n    get:\n      operationId: a\n      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema: { $ref: "other.yaml#/X" }`,
    );
    expect(errorsOf(ext)).toContain("EXTERNAL_REF");
    const dangling = doc(
      `  /a:\n    get:\n      operationId: a\n      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema: { $ref: "#/components/schemas/Nope" }`,
    );
    expect(errorsOf(dangling)).toContain("UNRESOLVED_REF");
  });

  it("reports path parameter mismatches", () => {
    expect(errorsOf(doc(`  /u/{id}:\n    get:\n      operationId: a\n${op()}`))).toContain(
      "MISSING_PATH_PARAMETER",
    );
    expect(
      errorsOf(
        doc(
          `  /u:\n    get:\n      operationId: a\n      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]\n${op()}`,
        ),
      ),
    ).toContain("UNUSED_PATH_PARAMETER");
  });

  it("reports duplicate operationIds, missing success responses and GET bodies", () => {
    expect(
      errorsOf(
        doc(
          `  /a:\n    get:\n      operationId: same\n${op()}\n  /b:\n    get:\n      operationId: same\n${op()}`,
        ),
      ),
    ).toContain("DUPLICATE_OPERATION_ID");
    expect(
      errorsOf(
        doc(
          `  /a:\n    get:\n      operationId: a\n      responses:\n        "404": { description: nope }`,
        ),
      ),
    ).toContain("NO_SUCCESS_RESPONSE");
    expect(
      errorsOf(
        doc(
          `  /a:\n    get:\n      operationId: a\n      requestBody:\n        content:\n          application/json:\n            schema: { type: string }\n${op()}`,
        ),
      ),
    ).toContain("BODY_NOT_ALLOWED");
  });

  it("refuses unsupported content types unless the operation is excluded", () => {
    const multipart = doc(
      `  /up:\n    post:\n      operationId: upload\n      requestBody:\n        content:\n          multipart/form-data:\n            schema: { type: object }\n${op()}`,
    );
    expect(errorsOf(multipart)).toContain("UNSUPPORTED_CONTENT_TYPE");
    expect(errorsOf(multipart, { exclude: ["upload"] })).toEqual([]);
  });

  it("rejects object-valued query parameters and warns about unsupported array styles", () => {
    const obj = doc(
      `  /a:\n    get:\n      operationId: a\n      parameters: [{ name: f, in: query, schema: { type: object } }]\n${op()}`,
    );
    expect(errorsOf(obj)).toContain("UNSUPPORTED_PARAMETER");
    const csv = doc(
      `  /a:\n    get:\n      operationId: a\n      parameters: [{ name: f, in: query, explode: false, schema: { type: array, items: { type: string } } }]\n${op()}`,
    );
    expect(validateSchema(csv).diagnostics.map((d) => d.code)).toEqual(["UNSUPPORTED_STYLE"]);
  });

  it("reports every error, not just the first", () => {
    const text = doc(
      `  /u/{id}:\n    get:\n      operationId: a\n      responses:\n        "404": { description: nope }`,
    );
    expect(errorsOf(text).sort()).toEqual(["MISSING_PATH_PARAMETER", "NO_SUCCESS_RESPONSE"]);
  });

  it("validates the config", () => {
    expect(errorsOf(fixture, { exclude: 5 as never })).toEqual(["INVALID_CONFIG"]);
    expect(errorsOf(fixture, { nope: 1 } as never)).toEqual(["INVALID_CONFIG"]);
  });
});

describe("generate: naming collisions and ambiguous routes", () => {
  it("detects schemas that map to one TypeScript name", () => {
    const text = doc(
      `  /a:\n    get:\n      operationId: a\n${op()}`,
      `    user-profile: { type: string }\n    UserProfile: { type: string }`,
    );
    expect(errorsOf(text)).toContain("NAME_COLLISION");
  });

  it("detects path segments that map to one property", () => {
    const text = doc(
      `  /user-profile:\n    get:\n      operationId: a\n${op()}\n  /userProfile:\n    get:\n      operationId: b\n${op()}`,
    );
    expect(errorsOf(text)).toContain("NAME_COLLISION");
  });

  it("detects a resource named like an HTTP method", () => {
    const text = doc(
      `  /users:\n    get:\n      operationId: a\n${op()}\n  /users/get:\n    get:\n      operationId: b\n${op()}`,
    );
    expect(errorsOf(text)).toContain("NAME_COLLISION");
  });

  it("detects generated operation type names colliding with schemas", () => {
    const text = doc(
      `  /a:\n    get:\n      operationId: login\n${op()}`,
      `    LoginData: { type: string }`,
    );
    expect(errorsOf(text)).toContain("NAME_COLLISION");
  });

  it("detects equivalent templated paths and lets overrides resolve them", () => {
    const p = (path: string, id: string): string =>
      `  ${path}:\n    get:\n      operationId: ${id}\n      parameters: [{ name: ${path.includes("{id}") ? "id" : "userId"}, in: path, required: true, schema: { type: string } }]\n${op()}`;
    const text = doc(`${p("/users/{id}", "byId")}\n${p("/users/{userId}", "byUserId")}`);
    expect(errorsOf(text)).toContain("AMBIGUOUS_ROUTE");
    const resolved = generate(text, {
      overrides: { operations: { byUserId: { path: ["accounts", "{userId}"] } } },
    });
    expect(resolved.files[1]?.content).toContain("accounts: {");
  });

  it("validates overrides", () => {
    const bad = (path: string[]): string[] =>
      errorsOf(fixture, { overrides: { operations: { getUser: { path } } } });
    expect(bad(["people"])).toContain("INVALID_OVERRIDE"); // must list {id}
    expect(bad(["people", "{nope}"])).toContain("INVALID_OVERRIDE");
    expect(bad(["not valid", "{id}"])).toContain("INVALID_OVERRIDE");
    expect(errorsOf(fixture, { overrides: { operations: { ghost: { path: ["x"] } } } })).toContain(
      "UNKNOWN_OVERRIDE",
    );
  });

  it("suffixes shadowed path-parameter variables deterministically", () => {
    const text = doc(
      `  /orgs/{org-id}/users/{orgId}:\n    get:\n      operationId: a\n      parameters:\n        - { name: org-id, in: path, required: true, schema: { type: string } }\n        - { name: orgId, in: path, required: true, schema: { type: string } }\n${op()}`,
    );
    const client = generate(text).files[1]?.content as string;
    expect(client).toContain("(orgId: string)");
    expect(client).toContain("(orgId2: string)");
    expect(client).toContain('params: { "org-id": orgId, orgId: orgId2 }');
  });
});

describe("generate: status-discriminated errors", () => {
  const responses = (extra: string): string =>
    `      responses:\n        "200": { description: ok, content: { application/json: { schema: { type: string } } } }\n${extra}`;
  const typesOf = (extra: string): string =>
    generate(doc(`  /a:\n    get:\n      operationId: a\n${responses(extra)}`)).files[0]
      ?.content as string;

  it("emits one ErrorCase per status, with ranges/default as number and empty bodies as undefined", () => {
    const types = typesOf(
      `        "404": { description: nf }\n        "422": { description: bad, content: { application/json: { schema: { type: object, properties: { f: { type: string } } } } } }\n        "5XX": { description: boom, content: { application/json: { schema: { type: string } } } }\n        default: { description: other, content: { application/json: { schema: { type: integer } } } }`,
    );
    expect(types).toContain(
      "export type AErrorBody = ErrorCase<404, undefined> | ErrorCase<422, {\n  f?: string;\n}> | ErrorCase<number, string> | ErrorCase<number, number>;",
    );
  });

  it("falls back to unknown (and omits the core import) when no error is documented", () => {
    const types = typesOf("");
    expect(types).toContain("export type AErrorBody = unknown;");
    expect(types).not.toContain("ErrorCase");
  });
});
