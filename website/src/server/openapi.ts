/**
 * Builds the OpenAPI 3.0 document for the site's API from the table spec. The client in
 * src/api is generated from this document with `nyx generate`, and the same document is served
 * live at /api/openapi.json.
 */
import { TABLES, type Col, type TableSpec } from "./spec.ts";

type Json = Record<string, unknown>;

function colSchema(c: Col): Json {
  const s: Json = {};
  switch (c.type) {
    case "text":
      s["type"] = "string";
      if (c.enum) s["enum"] = [...c.enum];
      if (c.maxLength !== undefined) s["maxLength"] = c.maxLength;
      break;
    case "int":
      s["type"] = "integer";
      if (c.min !== undefined) s["minimum"] = c.min;
      if (c.max !== undefined) s["maximum"] = c.max;
      break;
    case "bool":
      s["type"] = "boolean";
      break;
    case "uuid":
      s["type"] = "string";
      s["format"] = "uuid";
      break;
    case "date":
      s["type"] = "string";
      s["format"] = "date";
      break;
    case "timestamp":
      s["type"] = "string";
      s["format"] = "date-time";
      break;
    case "textarray":
      s["type"] = "array";
      s["items"] = c.enum ? { type: "string", enum: [...c.enum] } : { type: "string" };
      break;
    case "jsonobject":
      s["type"] = "object";
      s["additionalProperties"] = true;
      break;
    case "jsonarray":
      s["type"] = "array";
      s["items"] = c.items ?? { type: "object", additionalProperties: true };
      break;
    case "json":
      break;
  }
  if (c.nullable) s["nullable"] = true;
  if (c.description) s["description"] = c.description;
  return s;
}

function object(spec: TableSpec, pick: (c: Col) => boolean, required: (c: Col) => boolean): Json {
  const cols = spec.columns.filter(pick);
  const req = cols.filter(required).map((c) => c.name);
  return {
    type: "object",
    properties: Object.fromEntries(cols.map((c) => [c.name, colSchema(c)])),
    ...(req.length ? { required: req } : {}),
    additionalProperties: false,
  };
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json): Json => ({ "application/json": { schema } });
const errors = (...codes: string[]): Json =>
  Object.fromEntries(
    codes.map((c) => [c, { description: DESCRIBE[c] ?? "Error", content: json(ref("ErrorBody")) }]),
  );
const DESCRIBE: Record<string, string> = {
  "400": "The request could not be understood.",
  "401": "Sign in first.",
  "403": "Your role cannot do that.",
  "404": "Not found.",
  "409": "That conflicts with something that already exists.",
  "422": "Some fields are not valid.",
  "503": "Not configured on the server.",
};

export function buildOpenApi(origin?: string): Json {
  const schemas: Json = {
    ErrorBody: {
      type: "object",
      required: ["error"],
      properties: {
        error: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            fields: { type: "object", additionalProperties: { type: "string" } },
          },
        },
      },
    },
    DeleteResult: {
      type: "object",
      required: ["deleted"],
      properties: { deleted: { type: "boolean" } },
    },
    MediaDeleteResult: {
      type: "object",
      required: ["deleted", "assetDeleted"],
      properties: {
        deleted: { type: "boolean" },
        assetDeleted: {
          type: "boolean",
          description: "False when the file could not be removed from Cloudinary.",
        },
      },
    },
    Me: {
      type: "object",
      required: ["userId", "email", "role"],
      properties: {
        userId: { type: "string" },
        email: { type: "string" },
        role: {
          type: "string",
          enum: ["admin", "editor", "contributor"],
          nullable: true,
          description: "Null when signed in but not invited.",
        },
      },
    },
    Status: {
      type: "object",
      required: ["configured", "mode"],
      properties: {
        configured: { type: "boolean" },
        mode: { type: "string", enum: ["supabase", "demo"] },
      },
    },
    SignedUpload: {
      type: "object",
      required: [
        "cloudName",
        "apiKey",
        "timestamp",
        "signature",
        "folder",
        "allowedFormats",
        "uploadUrl",
      ],
      properties: {
        cloudName: { type: "string" },
        apiKey: { type: "string" },
        timestamp: { type: "integer" },
        signature: { type: "string" },
        folder: { type: "string" },
        allowedFormats: { type: "string" },
        uploadUrl: { type: "string" },
      },
    },
    SignUploadRequest: {
      type: "object",
      properties: { folder: { type: "string", maxLength: 80 } },
      additionalProperties: false,
    },
    InviteResult: {
      type: "object",
      required: ["invite", "emailSent"],
      properties: {
        invite: ref("Invite"),
        emailSent: { type: "boolean" },
        emailError: { type: "string" },
      },
    },
    SettingUpdate: {
      type: "object",
      required: ["value"],
      properties: { value: {} },
      additionalProperties: false,
    },
  };
  const paths: Json = {
    "/status": {
      get: {
        operationId: "getStatus",
        summary: "Whether the backend is configured",
        responses: { "200": { description: "Status", content: json(ref("Status")) } },
      },
    },
    "/me": {
      get: {
        operationId: "getMe",
        summary: "Who you are and what you may do",
        security: [{ bearer: [] }],
        responses: {
          "200": { description: "The signed-in person", content: json(ref("Me")) },
          ...errors("401"),
        },
      },
    },
    "/media/sign": {
      post: {
        operationId: "signMediaUpload",
        summary: "Sign an image upload for Cloudinary",
        security: [{ bearer: [] }],
        requestBody: { required: true, content: json(ref("SignUploadRequest")) },
        responses: {
          "200": { description: "Upload parameters", content: json(ref("SignedUpload")) },
          ...errors("401", "403", "503"),
        },
      },
    },
  };

  const idName = (t: TableSpec): string => (t.table === "site_settings" ? "key" : "id");
  const idParam = (t: TableSpec): Json => ({
    name: idName(t),
    in: "path",
    required: true,
    schema:
      t.pkType === "uuid"
        ? { type: "string", format: "uuid" }
        : t.pkType === "int"
          ? { type: "integer" }
          : { type: "string" },
  });

  for (const t of TABLES) {
    // A row always carries every column, nullable ones as null.
    schemas[t.schema] = object(
      t,
      () => true,
      () => true,
    );
    const writable = (c: Col): boolean => !c.readOnly;
    if (t.create) schemas[`${t.schema}Create`] = object(t, writable, (c) => c.required === true);
    if (t.write !== "admin" || t.table === "staff")
      schemas[`${t.schema}Update`] = object(
        t,
        (c) => writable(c) && c.name !== t.pk,
        () => false,
      );
    if (t.table === "staff_invites") delete schemas["InviteUpdate"];

    const base = `/${t.segment}`;
    const collection: Json = {};
    collection["get"] = {
      operationId: `list${t.plural}`,
      summary: `List ${t.plural.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}`,
      description:
        t.read === "public"
          ? "Anyone can read published rows. Signed-in staff also see unpublished ones unless `published=true`."
          : "Staff only.",
      ...(t.read === "public" ? {} : { security: [{ bearer: [] }] }),
      parameters: [
        ...(t.publicFlag
          ? [
              {
                name: "published",
                in: "query",
                schema: { type: "boolean" },
                description: "Only published rows (staff can opt in; visitors always get this).",
              },
            ]
          : []),
        {
          name: "order",
          in: "query",
          schema: { type: "string" },
          description:
            "Comma separated columns; prefix with - for descending, for example sort,-created_at.",
        },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000 } },
      ],
      responses: {
        "200": { description: "Rows", content: json({ type: "array", items: ref(t.schema) }) },
        ...errors("400", "401", "403"),
      },
    };
    if (t.create) {
      const created = t.table === "staff_invites" ? ref("InviteResult") : ref(t.schema);
      collection["post"] = {
        operationId: t.table === "staff_invites" ? "createInvite" : `create${t.singular}`,
        summary:
          t.table === "staff_invites"
            ? "Invite someone and email them a sign-in link"
            : `Create ${t.singular}`,
        security: [{ bearer: [] }],
        requestBody: { required: true, content: json(ref(`${t.schema}Create`)) },
        responses: {
          "201": { description: "Created", content: json(created) },
          ...errors("401", "403", "409", "422"),
        },
      };
    }
    paths[base] = collection;

    const item: Json = {};
    if (t.table === "site_settings") {
      item["put"] = {
        operationId: "putSetting",
        summary: "Create or replace a setting",
        security: [{ bearer: [] }],
        parameters: [idParam(t)],
        requestBody: { required: true, content: json(ref("SettingUpdate")) },
        responses: {
          "200": { description: "Saved", content: json(ref(t.schema)) },
          ...errors("401", "403", "422"),
        },
      };
    } else {
      if (schemas[`${t.schema}Update`]) {
        item["patch"] = {
          operationId: `update${t.singular}`,
          summary: `Change ${t.singular}`,
          security: [{ bearer: [] }],
          parameters: [idParam(t)],
          requestBody: { required: true, content: json(ref(`${t.schema}Update`)) },
          responses: {
            "200": { description: "Updated", content: json(ref(t.schema)) },
            ...errors("401", "403", "404", "409", "422"),
          },
        };
      }
      if (t.table !== "audit_log")
        item["delete"] = {
          operationId: `delete${t.singular}`,
          summary: `Delete ${t.singular}`,
          security: [{ bearer: [] }],
          parameters: [idParam(t)],
          responses: {
            "200": {
              description: "Deleted",
              content: json(ref(t.table === "media" ? "MediaDeleteResult" : "DeleteResult")),
            },
            ...errors("401", "403", "404", "409"),
          },
        };
    }
    paths[`${base}/{${idName(t)}}`] = item;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "NyxAPI site API",
      version: "1.0.0",
      description:
        "The API behind the NyxAPI website: content, people, media and the team. The website's own front end uses a client generated from this document.",
    },
    servers: [{ url: origin ? `${origin}/api` : "/api" }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: "A Supabase access token from signing in.",
        },
      },
    },
  };
}
