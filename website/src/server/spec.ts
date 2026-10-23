/**
 * One description of the site's tables. It drives three things so they cannot drift apart:
 * request validation in the API, the OpenAPI document, and (through a test) the SQL migration.
 */
import type { TableName } from "../lib/backend/types";

export type ColType =
  | "text"
  | "int"
  | "bool"
  | "uuid"
  | "date"
  | "timestamp"
  | "textarray"
  | "json"
  | "jsonobject"
  | "jsonarray";

export interface Col {
  name: string;
  type: ColType;
  nullable?: boolean;
  /** Allowed values for text columns, or array members for text arrays. */
  enum?: readonly string[];
  /** Must be present when creating. */
  required?: boolean;
  /** Set by the database; never accepted from a client. */
  readOnly?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  /** A text value must be an https:// link (a site path such as /docs/ is also allowed with `path`). */
  https?: boolean;
  path?: boolean;
  /** Only an editor may set this; a contributor editing their own profile may not. */
  staffOnly?: boolean;
  description?: string;
  /** JSON Schema of one item, for `jsonarray` columns. */
  items?: Record<string, unknown>;
}

export interface TableSpec {
  table: TableName;
  /** URL segment: /api/<segment> */
  segment: string;
  /** OpenAPI schema name for one row. */
  schema: string;
  /** operationId stem: listPeople, createPerson ... */
  plural: string;
  singular: string;
  pk: string;
  pkType: "uuid" | "text" | "int";
  /** Column that filters public reads (published / active), if any. */
  publicFlag?: "published" | "active";
  /** Who may read the table: everyone (published rows only for visitors), any team member (including contributors), editors and admins, or admins only. */
  read: "public" | "member" | "staff" | "admin";
  /** Lowest role that may write. "member-own": any team member may add; contributors change only what they added. */
  write: "editor" | "admin" | "contributor-own" | "member-own";
  /** Whether POST /<segment> exists. */
  create: boolean;
  columns: readonly Col[];
}

export const AREAS = [
  "core",
  "react",
  "codegen",
  "graphql",
  "trpc",
  "devtools",
  "performance",
  "docs",
  "release",
] as const;
export const LEVELS = ["beginner", "intermediate", "advanced"] as const;

const id: Col = { name: "id", type: "uuid", readOnly: true };
const created: Col = { name: "created_at", type: "timestamp", readOnly: true };
const updated: Col = { name: "updated_at", type: "timestamp", readOnly: true };
const stamps = [created, updated] as const;
const published = (def = true): Col => ({
  name: "published",
  type: "bool",
  description: def ? "Visible on the site." : "Visible on the site. Defaults to hidden.",
});
const sort: Col = { name: "sort", type: "int", min: 0, max: 100000 };

export const TABLES: readonly TableSpec[] = [
  {
    table: "people",
    segment: "people",
    schema: "Person",
    plural: "People",
    singular: "Person",
    pk: "id",
    pkType: "uuid",
    publicFlag: "published",
    read: "public",
    write: "contributor-own",
    create: true,
    columns: [
      id,
      { name: "slug", type: "text", required: true, maxLength: 80, staffOnly: true },
      { name: "name", type: "text", required: true, maxLength: 120 },
      {
        name: "roles",
        type: "textarray",
        enum: ["contributor", "tutor", "maintainer"],
        staffOnly: true,
      },
      { name: "headline", type: "text", nullable: true, maxLength: 160 },
      { name: "bio", type: "text", nullable: true, maxLength: 4000 },
      { name: "avatar_url", type: "text", nullable: true, https: true },
      { name: "avatar_public_id", type: "text", nullable: true },
      { name: "location", type: "text", nullable: true, maxLength: 120 },
      { name: "website", type: "text", nullable: true, https: true },
      { name: "socials", type: "jsonobject", description: "Map of network name to https link." },
      { name: "contributions", type: "textarray" },
      { name: "featured", type: "bool", staffOnly: true },
      { ...published(false), staffOnly: true },
      { ...sort, staffOnly: true },
      { name: "joined_on", type: "date", nullable: true, staffOnly: true },
      { name: "user_id", type: "uuid", nullable: true, readOnly: true },
      ...stamps,
    ],
  },
  {
    table: "tutorial_modules",
    segment: "tutorial-modules",
    schema: "TutorialModule",
    plural: "TutorialModules",
    singular: "TutorialModule",
    pk: "id",
    pkType: "text",
    read: "public",
    write: "editor",
    create: true,
    columns: [
      { name: "id", type: "text", required: true, maxLength: 60 },
      { name: "title", type: "text", required: true },
      { name: "level", type: "text", required: true, enum: LEVELS },
      { name: "summary", type: "text" },
      { name: "outcome", type: "text" },
      sort,
      ...stamps,
    ],
  },
  {
    table: "tutorials",
    segment: "tutorials",
    schema: "Tutorial",
    plural: "Tutorials",
    singular: "Tutorial",
    pk: "id",
    pkType: "uuid",
    publicFlag: "published",
    read: "public",
    write: "editor",
    create: true,
    columns: [
      id,
      { name: "slug", type: "text", required: true, maxLength: 80 },
      { name: "number", type: "int", required: true, min: 1 },
      { name: "module", type: "text", required: true },
      { name: "level", type: "text", required: true, enum: LEVELS },
      { name: "minutes", type: "int", required: true, min: 1, max: 240 },
      { name: "title", type: "text", required: true },
      { name: "summary", type: "text" },
      {
        name: "content",
        type: "jsonobject",
        description: "Goals, outline, tutor notes, samples and docs links.",
      },
      { name: "status", type: "text", enum: ["open", "claimed", "published"] },
      { name: "tutor_id", type: "uuid", nullable: true },
      { name: "video_url", type: "text", nullable: true, https: true },
      { name: "thumbnail_url", type: "text", nullable: true, https: true },
      published(),
      { name: "published_at", type: "date", nullable: true },
      ...stamps,
    ],
  },
  {
    table: "releases",
    segment: "releases",
    schema: "Release",
    plural: "Releases",
    singular: "Release",
    pk: "id",
    pkType: "uuid",
    publicFlag: "published",
    read: "public",
    write: "editor",
    create: true,
    columns: [
      id,
      { name: "version", type: "text", required: true, maxLength: 40 },
      { name: "released_on", type: "date", nullable: true },
      { name: "title", type: "text", required: true },
      { name: "summary", type: "text" },
      {
        name: "features",
        type: "jsonarray",
        description: "Highlights of the release.",
        items: {
          type: "object",
          required: ["label", "detail"],
          properties: { label: { type: "string" }, detail: { type: "string" } },
        },
      },
      { name: "fixes", type: "textarray" },
      { name: "upgrade", type: "textarray" },
      { name: "limits", type: "textarray" },
      { name: "npm_url", type: "text", nullable: true, https: true },
      { name: "github_url", type: "text", nullable: true, https: true },
      published(false),
      ...stamps,
    ],
  },
  {
    table: "roadmap_milestones",
    segment: "roadmap-milestones",
    schema: "RoadmapMilestone",
    plural: "RoadmapMilestones",
    singular: "RoadmapMilestone",
    pk: "id",
    pkType: "uuid",
    publicFlag: "published",
    read: "public",
    write: "editor",
    create: true,
    columns: [
      id,
      { name: "number", type: "int", required: true, min: 1 },
      { name: "title", type: "text", required: true },
      { name: "summary", type: "text" },
      {
        name: "items",
        type: "jsonarray",
        description: "The items in the milestone.",
        items: {
          type: "object",
          required: ["text", "status", "area"],
          properties: {
            text: { type: "string" },
            status: {
              type: "string",
              enum: ["shipped", "partial", "planned", "exploring", "not-planned"],
            },
            area: { type: "string", enum: [...AREAS] },
          },
        },
      },
      published(),
      ...stamps,
    ],
  },
  {
    table: "planned_releases",
    segment: "planned-releases",
    schema: "PlannedRelease",
    plural: "PlannedReleases",
    singular: "PlannedRelease",
    pk: "id",
    pkType: "uuid",
    publicFlag: "published",
    read: "public",
    write: "editor",
    create: true,
    columns: [
      id,
      { name: "version", type: "text", required: true },
      { name: "theme", type: "text", required: true },
      { name: "items", type: "textarray" },
      sort,
      published(),
      ...stamps,
    ],
  },
  {
    table: "limitations",
    segment: "limitations",
    schema: "Limitation",
    plural: "Limitations",
    singular: "Limitation",
    pk: "id",
    pkType: "uuid",
    publicFlag: "published",
    read: "public",
    write: "editor",
    create: true,
    columns: [
      id,
      { name: "title", type: "text", required: true },
      { name: "detail", type: "text" },
      { name: "workaround", type: "text" },
      { name: "area", type: "text", required: true, enum: AREAS },
      sort,
      published(),
      ...stamps,
    ],
  },
  {
    table: "issues",
    segment: "issues",
    schema: "Issue",
    plural: "Issues",
    singular: "Issue",
    pk: "id",
    pkType: "uuid",
    publicFlag: "published",
    read: "public",
    write: "editor",
    create: true,
    columns: [
      id,
      { name: "title", type: "text", required: true },
      { name: "detail", type: "text" },
      { name: "area", type: "text", required: true, enum: AREAS },
      { name: "size", type: "text", enum: ["small", "medium", "large"] },
      { name: "status", type: "text", enum: ["open", "claimed", "closed"] },
      { name: "github_url", type: "text", nullable: true, https: true },
      {
        name: "claimed_by",
        type: "uuid",
        nullable: true,
        description: "The person who claimed it.",
      },
      sort,
      published(),
      ...stamps,
    ],
  },
  {
    table: "pages",
    segment: "pages",
    schema: "Page",
    plural: "Pages",
    singular: "Page",
    pk: "id",
    pkType: "uuid",
    publicFlag: "published",
    read: "public",
    write: "editor",
    create: true,
    columns: [
      id,
      { name: "slug", type: "text", required: true, maxLength: 80 },
      { name: "title", type: "text", required: true },
      { name: "summary", type: "text" },
      { name: "section", type: "text" },
      { name: "body", type: "text", description: "Markdown." },
      { name: "show_in_nav", type: "bool" },
      sort,
      published(false),
      ...stamps,
    ],
  },
  {
    table: "announcements",
    segment: "announcements",
    schema: "Announcement",
    plural: "Announcements",
    singular: "Announcement",
    pk: "id",
    pkType: "uuid",
    publicFlag: "active",
    read: "public",
    write: "editor",
    create: true,
    columns: [
      id,
      { name: "title", type: "text", required: true, maxLength: 160 },
      { name: "body", type: "text", maxLength: 600 },
      { name: "link_url", type: "text", nullable: true, https: true, path: true },
      { name: "link_label", type: "text", nullable: true },
      { name: "level", type: "text", enum: ["info", "success", "warning"] },
      { name: "starts_at", type: "timestamp", nullable: true },
      { name: "ends_at", type: "timestamp", nullable: true },
      { name: "active", type: "bool" },
      ...stamps,
    ],
  },
  {
    table: "site_settings",
    segment: "settings",
    schema: "Setting",
    plural: "Settings",
    singular: "Setting",
    pk: "key",
    pkType: "text",
    read: "public",
    write: "editor",
    create: false,
    columns: [
      { name: "key", type: "text", required: true, maxLength: 80 },
      { name: "value", type: "json", required: true },
      { name: "updated_at", type: "timestamp", readOnly: true },
    ],
  },
  {
    table: "media",
    segment: "media",
    schema: "Media",
    plural: "Media",
    singular: "Media",
    pk: "id",
    pkType: "uuid",
    read: "member",
    write: "member-own",
    create: true,
    columns: [
      id,
      { name: "public_id", type: "text", required: true },
      { name: "url", type: "text", required: true, https: true },
      { name: "width", type: "int", nullable: true },
      { name: "height", type: "int", nullable: true },
      { name: "format", type: "text", nullable: true },
      { name: "bytes", type: "int", nullable: true },
      { name: "folder", type: "text", nullable: true },
      { name: "alt", type: "text" },
      { name: "created_by", type: "uuid", nullable: true, readOnly: true },
      ...stamps,
    ],
  },
  {
    table: "staff",
    segment: "staff",
    schema: "StaffMember",
    plural: "Staff",
    singular: "StaffMember",
    pk: "user_id",
    pkType: "uuid",
    read: "admin",
    write: "admin",
    create: false,
    columns: [
      { name: "user_id", type: "uuid", readOnly: true },
      { name: "email", type: "text", readOnly: true },
      { name: "role", type: "text", required: true, enum: ["admin", "editor", "contributor"] },
      { name: "display_name", type: "text", nullable: true },
      { name: "created_at", type: "timestamp", readOnly: true },
    ],
  },
  {
    table: "staff_invites",
    segment: "invites",
    schema: "Invite",
    plural: "Invites",
    singular: "Invite",
    pk: "email",
    pkType: "text",
    read: "admin",
    write: "admin",
    create: true,
    columns: [
      { name: "email", type: "text", required: true, maxLength: 254 },
      { name: "role", type: "text", required: true, enum: ["admin", "editor", "contributor"] },
      { name: "person_id", type: "uuid", nullable: true },
      { name: "note", type: "text", nullable: true, maxLength: 300 },
      { name: "invited_by", type: "uuid", nullable: true, readOnly: true },
      { name: "created_at", type: "timestamp", readOnly: true },
      { name: "accepted_at", type: "timestamp", nullable: true, readOnly: true },
    ],
  },
  {
    table: "audit_log",
    segment: "audit",
    schema: "AuditEntry",
    plural: "Audit",
    singular: "AuditEntry",
    pk: "id",
    pkType: "int",
    read: "admin",
    write: "admin",
    create: false,
    columns: [
      { name: "id", type: "int", readOnly: true },
      { name: "at", type: "timestamp", readOnly: true },
      { name: "user_id", type: "uuid", nullable: true, readOnly: true },
      { name: "email", type: "text", nullable: true, readOnly: true },
      { name: "table_name", type: "text", readOnly: true },
      { name: "op", type: "text", readOnly: true },
      { name: "row_id", type: "text", nullable: true, readOnly: true },
      { name: "changed", type: "textarray", readOnly: true },
    ],
  },
];

export const bySegment = (segment: string): TableSpec | undefined =>
  TABLES.find((t) => t.segment === segment);
export const byTable = (table: TableName): TableSpec => {
  const t = TABLES.find((x) => x.table === table);
  if (!t) throw new Error(`Unknown table ${table}`);
  return t;
};
