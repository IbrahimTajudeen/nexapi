/* eslint-disable @typescript-eslint/require-await -- the demo backend is synchronous but must match the async Backend contract */
/**
 * An in-browser stand-in for Supabase, used by `NEXT_PUBLIC_BACKEND=demo` builds. Data lives in
 * localStorage on this device only. It exists so the admin panel and the public pages can be tried
 * without any account; it is not a place to keep real content. It mimics the main database rules
 * (unique values, https links, a published tutorial needs a video), not row level security.
 */
import { byTable } from "../../server/spec";
import { checkImage } from "./cloudinary";
import { demoSeed } from "./seed-data";
import {
  BackendError,
  PRIMARY_KEY,
  type Backend,
  type ListOptions,
  type Me,
  type MediaRow,
  type StaffRole,
  type TableName,
  type Tables,
} from "./types";

const STORE = "nyxapi.demo.db.v1";
const text = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
const AUTH = "nyxapi.demo.auth.v1";

type Db = { [T in TableName]: Tables[T][] };
type Rec = Record<string, unknown>;

const UNIQUE: Partial<Record<TableName, string[]>> = {
  people: ["slug"],
  tutorials: ["slug", "number"],
  releases: ["version"],
  pages: ["slug"],
  roadmap_milestones: ["number"],
  planned_releases: ["version"],
  staff_invites: ["email"],
  media: ["public_id"],
};
const HTTPS: Partial<Record<TableName, string[]>> = {
  people: ["avatar_url", "website"],
  tutorials: ["video_url", "thumbnail_url"],
  releases: ["npm_url", "github_url"],
  issues: ["github_url"],
};
const REQUIRED: Partial<Record<TableName, string[]>> = {
  people: ["slug", "name"],
  tutorials: ["slug", "number", "module", "title"],
  releases: ["version", "title"],
  pages: ["slug", "title"],
  roadmap_milestones: ["number", "title"],
  planned_releases: ["version", "theme"],
  limitations: ["title", "area"],
  issues: ["title", "area"],
  announcements: ["title"],
  tutorial_modules: ["id", "title"],
};

const httpsOk = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  v === "" ||
  (typeof v === "string" && /^(https:\/\/\S+|data:image\/)/i.test(v));

function load(): Db {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* start from the seed */
  }
  return demoSeed();
}

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${String(Date.now())}-${String(Math.random()).slice(2)}`;

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return text(a).localeCompare(text(b));
}

/** The demo "token" is just the role and email; there is no server to check it. */
export const demoToken = (role: StaffRole, email: string): string => `demo:${role}:${email}`;

function readAuth(): { signedIn: boolean; role: StaffRole; email: string } {
  try {
    const raw = localStorage.getItem(AUTH);
    if (raw) return JSON.parse(raw) as { signedIn: boolean; role: StaffRole; email: string };
  } catch {
    /* default */
  }
  return { signedIn: false, role: "admin", email: "admin@demo.test" };
}

export function createDemoBackend(): Backend {
  const db = load();
  const listeners = new Set<() => void>();
  const save = (): void => {
    try {
      localStorage.setItem(STORE, JSON.stringify(db));
    } catch {
      /* storage full or blocked: the demo keeps working in memory */
    }
  };
  const rows = <T extends TableName>(t: T): Rec[] => db[t] as unknown as Rec[];

  const validate = (t: TableName, row: Rec, existingKey?: string): void => {
    for (const f of REQUIRED[t] ?? [])
      if (row[f] === undefined || row[f] === null || row[f] === "")
        throw new BackendError("A required field is empty.", "23502");
    for (const f of HTTPS[t] ?? [])
      if (!httpsOk(row[f]))
        throw new BackendError(
          "A value was rejected by the database rules (for example a link must start with https://).",
          "23514",
        );
    if (t === "people") {
      const s = row["socials"];
      if (
        s &&
        typeof s === "object" &&
        !Object.values(s).every((v) => typeof v === "string" && httpsOk(v))
      )
        throw new BackendError(
          "A value was rejected by the database rules (for example a link must start with https://).",
          "23514",
        );
      if (typeof row["slug"] === "string" && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row["slug"]))
        throw new BackendError(
          "A value was rejected by the database rules (for example a link must start with https://).",
          "23514",
        );
    }
    if (t === "tutorials" && row["status"] === "published" && !row["video_url"])
      throw new BackendError(
        "A value was rejected by the database rules (for example a link must start with https://).",
        "23514",
      );
    const pk = PRIMARY_KEY[t];
    for (const col of UNIQUE[t] ?? []) {
      const clash = rows(t).find((r) => r[col] === row[col] && String(r[pk]) !== existingKey);
      if (clash)
        throw new BackendError("Something with that name or number already exists.", "23505");
    }
  };

  const notify = (): void => listeners.forEach((l) => l());
  const audit = (table: TableName, op: string, id: string, changed: string[]): void => {
    if (table === "audit_log") return;
    const a = readAuth();
    const log = db.audit_log;
    log.unshift({
      id: (log[0]?.id ?? 0) + 1,
      at: new Date().toISOString(),
      user_id: "demo",
      email: a.email,
      table_name: table,
      op,
      row_id: id,
      changed,
    });
    db.audit_log = log.slice(0, 200);
  };

  return {
    mode: "demo",

    async list<T extends TableName>(table: T, options: ListOptions = {}): Promise<Tables[T][]> {
      let out = [...rows(table)];
      if (options.publishedOnly) {
        out = out.filter((r) =>
          table === "announcements"
            ? r["active"] === true
            : table === "tutorial_modules"
              ? true
              : r["published"] === true,
        );
      }
      for (const o of [...(options.orderBy ?? [])].reverse())
        out.sort((a, b) => compare(a[o.column], b[o.column]) * (o.ascending === false ? -1 : 1));
      if (options.limit) out = out.slice(0, options.limit);
      return out as unknown as Tables[T][];
    },

    async insert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]> {
      const pk = PRIMARY_KEY[table];
      const now = new Date().toISOString();
      const rec: Rec = { ...(row as Rec) };
      if (pk === "id" && !rec["id"]) rec["id"] = newId();
      if (!("created_at" in rec) && table !== "site_settings" && table !== "staff")
        rec["created_at"] = now;
      if (table !== "staff" && table !== "staff_invites" && table !== "audit_log")
        rec["updated_at"] = now;
      validate(table, rec);
      // A database returns every column; fill the ones the caller left out the way the schema would.
      for (const c of byTable(table).columns) {
        if (c.name in rec) continue;
        rec[c.name] = c.nullable
          ? null
          : c.type === "int"
            ? 0
            : c.type === "bool"
              ? false
              : c.type === "textarray" || c.type === "jsonarray"
                ? []
                : c.type === "jsonobject"
                  ? {}
                  : "";
      }
      if (rows(table).some((r) => r[pk] === rec[pk]))
        throw new BackendError("Something with that name or number already exists.", "23505");
      rows(table).push(rec);
      audit(table, "INSERT", String(rec[pk]), []);
      save();
      notify();
      return rec as unknown as Tables[T];
    },

    async update<T extends TableName>(
      table: T,
      key: string,
      patch: Partial<Tables[T]>,
    ): Promise<Tables[T]> {
      const pk = PRIMARY_KEY[table];
      const list = rows(table);
      const i = list.findIndex((r) => String(r[pk]) === key);
      const current = list[i];
      if (!current)
        throw new BackendError("That item was not found, or you may not change it.", "PGRST116");
      const next: Rec = { ...current, ...(patch as Rec) };
      if ("updated_at" in current) next["updated_at"] = new Date().toISOString();
      validate(table, next, key);
      const changed = Object.keys(next).filter(
        (k) => k !== "updated_at" && JSON.stringify(next[k]) !== JSON.stringify(current[k]),
      );
      list[i] = next;
      audit(table, "UPDATE", key, changed.sort());
      save();
      notify();
      return next as unknown as Tables[T];
    },

    async upsert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]> {
      const pk = PRIMARY_KEY[table];
      const key = (row as Rec)[pk];
      if (key !== undefined && rows(table).some((r) => r[pk] === key))
        return this.update(table, text(key), row);
      return this.insert(table, row);
    },

    async remove<T extends TableName>(table: T, key: string): Promise<void> {
      const pk = PRIMARY_KEY[table];
      const list = rows(table);
      const i = list.findIndex((r) => String(r[pk]) === key);
      if (i === -1) throw new BackendError("Nothing was deleted. You may not have permission.");
      list.splice(i, 1);
      audit(table, "DELETE", key, []);
      save();
      notify();
    },

    auth: {
      async me(): Promise<Me | null> {
        const a = readAuth();
        return a.signedIn ? { session: { userId: "demo", email: a.email }, role: a.role } : null;
      },
      async accessToken() {
        const a = readAuth();
        return a.signedIn ? demoToken(a.role, a.email) : null;
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async sendLink(email) {
        // Demo only: signs in at once. An address containing "editor" or "contributor" gets that role.
        const e = email.trim().toLowerCase();
        const role: StaffRole = e.includes("contributor")
          ? "contributor"
          : e.includes("editor")
            ? "editor"
            : "admin";
        localStorage.setItem(AUTH, JSON.stringify({ signedIn: true, role, email: e }));
        notify();
      },
      async signOut() {
        const a = readAuth();
        localStorage.setItem(AUTH, JSON.stringify({ ...a, signedIn: false }));
        notify();
      },
    },

    async uploadImage(file, folder, alt): Promise<MediaRow> {
      const problem = checkImage(file);
      if (problem) throw new BackendError(problem);
      const url = await shrinkToDataUrl(file);
      return this.insert("media", {
        public_id: `demo/${folder}/${String(Date.now())}`,
        url,
        width: null,
        height: null,
        format: file.type.split("/")[1] ?? null,
        bytes: file.size,
        folder,
        alt,
        created_by: null,
      });
    },
  };
}

/** Downscale to at most 384px so a handful of avatars fit in localStorage. */
async function shrinkToDataUrl(file: File): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(new BackendError("Could not read that file."));
    r.readAsDataURL(file);
  });
  if (typeof document === "undefined" || file.type === "image/gif") return src;
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 384 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
