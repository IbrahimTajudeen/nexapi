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
    const xml = doc(
      `  /up:\n    post:\n      operationId: upload\n      requestBody:\n        content:\n          application/xml:\n            schema: { type: object }\n${op()}`,
    );
    expect(errorsOf(xml)).toContain("UNSUPPORTED_CONTENT_TYPE");
    expect(errorsOf(xml, { exclude: ["upload"] })).toEqual([]);
  });

  it("rejects object-valued query parameters unless they are a supported deepObject", () => {
    const obj = doc(
      `  /a:\n    get:\n      operationId: a\n      parameters: [{ name: f, in: query, schema: { type: object } }]\n${op()}`,
    );
    expect(errorsOf(obj)).toContain("UNSUPPORTED_PARAMETER");
    const nested = doc(
      `  /a:\n    get:\n      operationId: a\n      parameters: [{ name: f, in: query, style: deepObject, explode: true, schema: { type: object, properties: { x: { type: object } } } }]\n${op()}`,
    );
    expect(errorsOf(nested)).toContain("UNSUPPORTED_PARAMETER");
  });

  it("warns about array styles it cannot honour instead of silently changing them", () => {
    const matrix = doc(
      `  /a:\n    get:\n      operationId: a\n      parameters: [{ name: f, in: query, style: matrix, schema: { type: array, items: { type: string } } }]\n${op()}`,
    );
    expect(validateSchema(matrix).diagnostics.map((d) => d.code)).toEqual(["UNSUPPORTED_STYLE"]);
  });
});

describe("generate: query parameter styles", () => {
  const client = (params: string): string =>
    generate(doc(`  /a:\n    get:\n      operationId: a\n      parameters: ${params}\n${op()}`))
      .files[1]?.content as string;
  const arr = "schema: { type: array, items: { type: string } }";

  it("emits queryStyles for csv, space, pipe and deepObject, and nothing for the default", () => {
    const text = client(
      `[{ name: ids, in: query, explode: false, ${arr} }, { name: sp, in: query, style: spaceDelimited, ${arr} }, { name: pi, in: query, style: pipeDelimited, ${arr} }, { name: filter, in: query, style: deepObject, explode: true, schema: { type: object, properties: { a: { type: string }, n: { type: integer } } } }, { name: plain, in: query, ${arr} }]`,
    );
    expect(text).toContain(
      'queryStyles: { ids: "csv", sp: "space", pi: "pipe", filter: "deepObject" }',
    );
    expect(text).not.toContain("plain:");
  });

  it("sends delimited styles with explode=true exploded, with no warning", () => {
    const text = `[{ name: sp, in: query, style: spaceDelimited, explode: true, ${arr} }]`;
    const source = doc(`  /a:\n    get:\n      operationId: a\n      parameters: ${text}\n${op()}`);
    expect(validateSchema(source).diagnostics).toEqual([]);
    expect(client(text)).not.toContain("queryStyles");
  });
});

describe("generate: validation", () => {
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

describe("generate: request body kinds and text/binary responses", () => {
  const built = (path: string): { client: string; types: string } => {
    const text = doc(path);
    const out = generate(text);
    return {
      client: out.files[1]?.content as string,
      types: out.files[0]?.content as string,
    };
  };
  const post = (content: string, responses = `        "204": { description: ok }`): string =>
    `  /x:\n    post:\n      operationId: x\n      requestBody:\n        required: true\n        content:\n${content}\n      responses:\n${responses}`;

  it("multipart/form-data: object with scalar and file fields", () => {
    const { client, types } = built(
      post(
        `          multipart/form-data:\n            schema:\n              type: object\n              required: [file]\n              properties:\n                file: { type: string, format: binary }\n                title: { type: string }\n                tags: { type: array, items: { type: string } }`,
      ),
    );
    expect(client).toContain('hasBody: true, bodyKind: "form-data"');
    expect(types).toMatch(/file: Blob;/);
    expect(types).toMatch(/tags\?: string\[\]/);
  });

  it("urlencoded and text/plain bodies; JSON wins when several are declared", () => {
    expect(
      built(
        post(
          `          application/x-www-form-urlencoded:\n            schema: { type: object, properties: { a: { type: string } } }`,
        ),
      ).client,
    ).toContain('bodyKind: "urlencoded"');
    const text = built(post(`          text/plain:\n            schema: { type: string }`));
    expect(text.client).toContain('bodyKind: "text"');
    expect(text.types).toContain("export type XBody = string;");
    const both = built(
      post(
        `          multipart/form-data:\n            schema: { type: object, properties: { a: { type: string } } }\n          application/json:\n            schema: { type: object, properties: { a: { type: string } } }`,
      ),
    ).client;
    expect(both).not.toContain("bodyKind");
  });

  it("binary bodies must be a binary-format string", () => {
    const ok = built(
      post(
        `          application/octet-stream:\n            schema: { type: string, format: binary }`,
      ),
    );
    expect(ok.client).toContain('bodyKind: "binary"');
    expect(ok.types).toContain("export type XBody = Blob;");
    expect(
      errorsOf(
        doc(post(`          application/octet-stream:\n            schema: { type: object }`)),
      ),
    ).toContain("UNSUPPORTED_BODY_SCHEMA");
  });

  it("rejects form bodies the runtime could not send (nested objects, free-form)", () => {
    const nested = doc(
      post(
        `          multipart/form-data:\n            schema: { type: object, properties: { a: { type: object, properties: { b: { type: string } } } } }`,
      ),
    );
    expect(errorsOf(nested)).toContain("UNSUPPORTED_BODY_SCHEMA");
    const free = doc(
      post(`          application/x-www-form-urlencoded:\n            schema: { type: object }`),
    );
    expect(errorsOf(free)).toContain("UNSUPPORTED_BODY_SCHEMA");
    const blobInUrlencoded = doc(
      post(
        `          application/x-www-form-urlencoded:\n            schema: { type: object, properties: { f: { type: string, format: binary } } }`,
      ),
    );
    expect(errorsOf(blobInUrlencoded)).toContain("UNSUPPORTED_BODY_SCHEMA");
  });

  const get = (responses: string): string =>
    `  /r:\n    get:\n      operationId: r\n      responses:\n${responses}`;

  it("text/* and binary success responses become string and Blob", () => {
    const t = built(
      get(
        `        "200": { description: ok, content: { text/csv: { schema: { type: string } } } }`,
      ),
    );
    expect(t.client).toContain('response: "text"');
    expect(t.types).toContain("export type RData = string;");
    const b = built(
      get(
        `        "200": { description: ok, content: { image/png: { schema: { type: string, format: binary } } } }`,
      ),
    );
    expect(b.client).toContain('response: "blob"');
    expect(b.types).toContain("export type RData = Blob;");
  });

  it("an empty 204 alongside a binary 200 is fine, but mixed payload kinds are an error", () => {
    const ok = built(
      get(
        `        "200": { description: ok, content: { application/pdf: { schema: { type: string, format: binary } } } }\n        "204": { description: none }`,
      ),
    );
    expect(ok.client).toContain('response: "blob"');
    const mixed = doc(
      get(
        `        "200": { description: ok, content: { application/json: { schema: { type: string } } } }\n        "202": { description: ok, content: { text/plain: { schema: { type: string } } } }`,
      ),
    );
    expect(errorsOf(mixed)).toContain("UNSUPPORTED_CONTENT_TYPE");
  });
});

describe("generate: response shapes", () => {
  it("emits nothing extra unless validation is enabled", () => {
    const out = generate(fixture, config);
    expect(out.files.map((f) => f.path)).toEqual(["types.ts", "client.ts", "index.ts"]);
    expect(out.files[1]?.content).not.toContain("validate:");
  });

  it("emits shapes.ts and attaches a shape to every JSON endpoint", () => {
    const out = generate(fixture, { ...config, validation: true });
    expect(out.files.map((f) => f.path)).toEqual([
      "types.ts",
      "client.ts",
      "index.ts",
      "shapes.ts",
    ]);
    const client = out.files[1]?.content as string;
    expect(client).toContain("import { shapes, ");
    expect(client).toContain("validate: { shape: GetUserResponse, shapes }");
    const shapes = out.files[3]?.content as string;
    expect(shapes).toContain('"User": {');
    expect(shapes).toContain('export const GetUserResponse: Shape = { k: "ref", name: "User" };');
    // deterministic
    expect(generate(fixture, { ...config, validation: true }).files[3]?.content).toBe(shapes);
  });

  it("skips shapes for endpoints without a JSON payload", () => {
    const text = doc(
      `  /t:\n    get:\n      operationId: t\n      responses:\n        "200": { description: ok, content: { text/plain: { schema: { type: string } } } }\n  /n:\n    delete:\n      operationId: n\n      responses:\n        "204": { description: ok }`,
    );
    const out = generate(text, { validation: true });
    expect(out.files[1]?.content).not.toContain("validate:");
  });

  it("rejects a non-boolean validation setting", () => {
    expect(() => generate(fixture, { validation: "yes" as never })).toThrow();
  });
});

describe("generate: cookie parameters", () => {
  it("warns (does not fail) and leaves the parameter out of the request type", () => {
    const text = doc(
      `  /a:\n    get:\n      operationId: a\n      parameters: [{ name: sid, in: cookie, schema: { type: string } }]\n${op()}`,
    );
    const result = validateSchema(text);
    expect(result.diagnostics.map((d) => [d.level, d.code])).toEqual([
      ["warning", "UNSUPPORTED_PARAMETER"],
    ]);
    expect(result.diagnostics[0]?.message).toContain("credentials");
    expect(generate(text).files[0]?.content).not.toContain("sid");
  });
});

describe("generate: framework-produced specs", () => {
  const read = (name: string): string =>
    readFileSync(new URL(`../../../fixtures/openapi/${name}`, import.meta.url), "utf8");

  it("NestJS (@nestjs/swagger 11, real output): tree, nullable fields, enum and 404 body", () => {
    const out = generate(read("nestjs-swagger.json"));
    const client = out.files[1]?.content as string;
    const types = out.files[0]?.content as string;
    for (const call of [
      "users: {",
      "get: client.query<UsersControllerFindAllRequest",
      "post: client.mutation<NoRequest, UsersControllerCreateBody",
      "byId: (id: string) =>",
      "patch: client.mutation",
      'delete: client.mutation<NoRequest, void, UsersControllerRemoveData, UsersControllerRemoveErrorBody>({ operationId: "UsersController_remove"',
    ])
      expect(client).toContain(call);
    expect(client).toContain('response: "none"'); // @HttpCode(204)
    expect(types).toContain('export type Role = "admin" | "member";');
    expect(types).toContain("zip?: string | null;");
    expect(types).toContain("UsersControllerFindOneErrorBody = ErrorCase<404, ErrorDto>;");
    expect(out.diagnostics).toEqual([]);
  });

  it("ASP.NET Core / Swashbuckle-style spec: 201 bodies, problem+json errors, numeric enums, nullable allOf", () => {
    const out = generate(read("aspnet-swashbuckle.json"), { naming: { stripPathPrefix: "/api" } });
    const client = out.files[1]?.content as string;
    const types = out.files[0]?.content as string;
    expect(client).toContain("users: {");
    expect(client).not.toContain("api: {"); // stripPathPrefix
    expect(client).toContain('path: "/api/Users"'); // requests still use the full path
    expect(client).toContain('bodyKind: "form-data"');
    expect(client).toContain('response: "text"');
    expect(types).toContain("export type Role = 0 | 1 | 2;");
    expect(types).toContain("manager?: UserDto | null;");
    expect(types).toContain("CreateUserErrorBody = ErrorCase<400, ValidationProblemDetails>;");
    expect(types).toContain("GetUsersData = UserDto[];");
    expect(out.diagnostics).toEqual([]);
  });

  it("without stripPathPrefix the shared prefix is an ordinary resource", () => {
    const client = generate(read("aspnet-swashbuckle.json")).files[1]?.content as string;
    expect(client).toContain("api: {");
  });
});

describe("generate: naming.stripPathPrefix", () => {
  const two = doc(
    `  /v1/a:\n    get:\n      operationId: a\n${op()}  /v1/b/{id}:\n    get:\n      operationId: b\n      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]\n${op()}  /v1:\n    get:\n      operationId: root\n${op()}  /other/c:\n    get:\n      operationId: c\n${op()}`,
  );
  it("drops a leading prefix only where something remains, and leaves other paths alone", () => {
    const client = generate(two, { naming: { stripPathPrefix: "/v1" } }).files[1]
      ?.content as string;
    expect(client).toContain("a: {");
    expect(client).toContain("b: {");
    expect(client).toContain("other: {"); // not under the prefix
    expect(client).toContain("v1: {"); // "/v1" alone would be empty, so it is kept
    expect(client).toContain('path: "/v1/a"');
  });

  it("rejects malformed values and reports collisions created by stripping", () => {
    for (const bad of ["api", "/api/{id}", "//x", 5])
      expect(() => generate(two, { naming: { stripPathPrefix: bad as never } })).toThrow();
    const clash = doc(
      `  /x/a:\n    get:\n      operationId: one\n${op()}  /a:\n    get:\n      operationId: two\n${op()}`,
    );
    expect(() => generate(clash, { naming: { stripPathPrefix: "/x" } })).toThrow();
  });
});
