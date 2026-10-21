/**
 * Row types and the backend contract for the site's content. These mirror
 * supabase/migrations/0001_init.sql column for column.
 */
export type StaffRole = "admin" | "editor" | "contributor";
export type PersonRole = "contributor" | "tutor" | "maintainer";
export type Level = "beginner" | "intermediate" | "advanced";
export type Area =
  | "core"
  | "react"
  | "codegen"
  | "graphql"
  | "trpc"
  | "devtools"
  | "performance"
  | "docs"
  | "release";

interface Stamped {
  created_at: string;
  updated_at: string;
}

export interface Person extends Stamped {
  id: string;
  slug: string;
  name: string;
  roles: PersonRole[];
  headline: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_public_id: string | null;
  location: string | null;
  website: string | null;
  socials: Record<string, string>;
  contributions: string[];
  featured: boolean;
  published: boolean;
  sort: number;
  joined_on: string | null;
  user_id: string | null;
}

export interface TutorialModuleRow extends Stamped {
  id: string;
  title: string;
  level: Level;
  summary: string;
  outcome: string;
  sort: number;
}

export interface TutorialRow extends Stamped {
  id: string;
  slug: string;
  number: number;
  module: string;
  level: Level;
  minutes: number;
  title: string;
  summary: string;
  content: Record<string, unknown>;
  status: "open" | "claimed" | "published";
  tutor_id: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  published: boolean;
  published_at: string | null;
}

export interface ReleaseRow extends Stamped {
  id: string;
  version: string;
  released_on: string | null;
  title: string;
  summary: string;
  features: { label: string; detail: string }[];
  fixes: string[];
  upgrade: string[];
  limits: string[];
  npm_url: string | null;
  github_url: string | null;
  published: boolean;
}

export interface MilestoneItem {
  text: string;
  status: "shipped" | "partial" | "planned" | "exploring" | "not-planned";
  area: Area;
}
export interface MilestoneRow extends Stamped {
  id: string;
  number: number;
  title: string;
  summary: string;
  items: MilestoneItem[];
  published: boolean;
}

export interface PlannedReleaseRow extends Stamped {
  id: string;
  version: string;
  theme: string;
  items: string[];
  sort: number;
  published: boolean;
}

export interface LimitationRow extends Stamped {
  id: string;
  title: string;
  detail: string;
  workaround: string;
  area: Area;
  sort: number;
  published: boolean;
}

export interface IssueRow extends Stamped {
  id: string;
  title: string;
  detail: string;
  area: Area;
  size: "small" | "medium" | "large";
  status: "open" | "claimed" | "closed";
  github_url: string | null;
  claimed_by: string | null;
  sort: number;
  published: boolean;
}

export interface PageRow extends Stamped {
  id: string;
  slug: string;
  title: string;
  summary: string;
  section: string;
  body: string;
  show_in_nav: boolean;
  sort: number;
  published: boolean;
}

export interface AnnouncementRow extends Stamped {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  level: "info" | "success" | "warning";
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
}

export interface SettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface MediaRow extends Stamped {
  id: string;
  public_id: string;
  url: string;
  width: number | null;
  height: number | null;
  format: string | null;
  bytes: number | null;
  folder: string | null;
  alt: string;
  created_by: string | null;
}

export interface StaffRow {
  user_id: string;
  email: string;
  role: StaffRole;
  display_name: string | null;
  created_at: string;
}

export interface InviteRow {
  email: string;
  role: StaffRole;
  person_id: string | null;
  note: string | null;
  invited_by: string | null;
  created_at: string;
  accepted_at: string | null;
}

export interface AuditRow {
  id: number;
  at: string;
  user_id: string | null;
  email: string | null;
  table_name: string;
  op: string;
  row_id: string | null;
  changed: string[];
}

export interface Tables {
  people: Person;
  tutorial_modules: TutorialModuleRow;
  tutorials: TutorialRow;
  releases: ReleaseRow;
  roadmap_milestones: MilestoneRow;
  planned_releases: PlannedReleaseRow;
  limitations: LimitationRow;
  issues: IssueRow;
  pages: PageRow;
  announcements: AnnouncementRow;
  site_settings: SettingRow;
  media: MediaRow;
  staff: StaffRow;
  staff_invites: InviteRow;
  audit_log: AuditRow;
}
export type TableName = keyof Tables;

/** The column that identifies a row in each table. */
export const PRIMARY_KEY: Record<TableName, string> = {
  people: "id",
  tutorial_modules: "id",
  tutorials: "id",
  releases: "id",
  roadmap_milestones: "id",
  planned_releases: "id",
  limitations: "id",
  issues: "id",
  pages: "id",
  announcements: "id",
  site_settings: "key",
  media: "id",
  staff: "user_id",
  staff_invites: "email",
  audit_log: "id",
};

export interface ListOptions {
  orderBy?: { column: string; ascending?: boolean }[];
  /** Only rows with `published = true` (or `active` for announcements). Public pages always set this. */
  publishedOnly?: boolean;
  limit?: number;
}

export interface Session {
  userId: string;
  email: string;
}

export interface Me {
  session: Session;
  /** Null when signed in but not invited. */
  role: StaffRole | null;
}

/** Errors from the backend, with a message that is safe to show to the person using the admin panel. */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

export interface UploadedImage {
  public_id: string;
  url: string;
  width: number | null;
  height: number | null;
  format: string | null;
  bytes: number | null;
}

export interface Backend {
  mode: "supabase" | "demo";
  list<T extends TableName>(table: T, options?: ListOptions): Promise<Tables[T][]>;
  insert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]>;
  update<T extends TableName>(table: T, key: string, patch: Partial<Tables[T]>): Promise<Tables[T]>;
  remove<T extends TableName>(table: T, key: string): Promise<void>;
  /** Insert or replace by primary key (used by settings). */
  upsert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]>;
  auth: {
    me(): Promise<Me | null>;
    onChange(listener: () => void): () => void;
    /** Email a one-time sign-in link. */
    sendLink(email: string): Promise<void>;
    signOut(): Promise<void>;
  };
  uploadImage(file: File, folder: string, alt: string): Promise<MediaRow>;
}
