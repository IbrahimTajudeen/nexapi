import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { uploadToCloudinary } from "./cloudinary";
import {
  BackendError,
  PRIMARY_KEY,
  type Backend,
  type ListOptions,
  type Me,
  type MediaRow,
  type StaffRole,
  type StaffRow,
  type TableName,
  type Tables,
} from "./types";

/** Turn a database error into something a person can act on. */
export function explain(error: { message: string; code?: string }): BackendError {
  const code = error.code;
  if (code === "42501") return new BackendError("You do not have permission to do that.", code);
  if (code === "23505")
    return new BackendError("Something with that name or number already exists.", code);
  if (code === "23514")
    return new BackendError(
      "A value was rejected by the database rules (for example a link must start with https://).",
      code,
    );
  if (code === "23503")
    return new BackendError("That item is linked to something that no longer exists.", code);
  if (code === "23502") return new BackendError("A required field is empty.", code);
  if (code === "PGRST116")
    return new BackendError("That item was not found, or you may not change it.", code);
  return new BackendError(error.message, code);
}

const isRole = (v: unknown): v is StaffRole =>
  v === "admin" || v === "editor" || v === "contributor";

export function createSupabaseBackend(
  url: string,
  anonKey: string,
  client?: SupabaseClient,
): Backend {
  const sb =
    client ??
    createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

  const run = async <T>(
    p: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
  ): Promise<T> => {
    const { data, error } = await p;
    if (error) throw explain(error);
    if (data === null) throw new BackendError("The database returned nothing.");
    return data;
  };

  return {
    mode: "supabase",

    async list<T extends TableName>(table: T, options: ListOptions = {}): Promise<Tables[T][]> {
      const name: string = table;
      let q = sb.from(name).select("*");
      if (options.publishedOnly) {
        q =
          table === "announcements"
            ? q.eq("active", true)
            : table === "tutorial_modules"
              ? q
              : q.eq("published", true);
      }
      for (const o of options.orderBy ?? [])
        q = q.order(o.column, { ascending: o.ascending ?? true });
      if (options.limit) q = q.limit(options.limit);
      return (await run(q)) as Tables[T][];
    },

    async insert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]> {
      const name: string = table;
      const rec: Record<string, unknown> = { ...row };
      return (await run(sb.from(name).insert(rec).select().single())) as unknown as Tables[T];
    },

    async update<T extends TableName>(
      table: T,
      key: string,
      patch: Partial<Tables[T]>,
    ): Promise<Tables[T]> {
      const name: string = table;
      const pk: string = PRIMARY_KEY[table];
      const rec: Record<string, unknown> = { ...patch };
      return (await run(
        sb.from(name).update(rec).eq(pk, key).select().single(),
      )) as unknown as Tables[T];
    },

    async upsert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]> {
      const name: string = table;
      const pk: string = PRIMARY_KEY[table];
      const rec: Record<string, unknown> = { ...row };
      return (await run(
        sb.from(name).upsert(rec, { onConflict: pk }).select().single(),
      )) as unknown as Tables[T];
    },

    async remove<T extends TableName>(table: T, key: string): Promise<void> {
      const name: string = table;
      const pk: string = PRIMARY_KEY[table];
      const { error, count } = await sb.from(name).delete({ count: "exact" }).eq(pk, key);
      if (error) throw explain(error);
      if (count === 0) throw new BackendError("Nothing was deleted. You may not have permission.");
    },

    auth: {
      async me(): Promise<Me | null> {
        const { data } = await sb.auth.getSession();
        const user = data.session?.user;
        if (!user) return null;
        const session = { userId: user.id, email: user.email ?? "" };
        // Accept a pending invite (does nothing when there is none), then read the role.
        const claimed = await sb.rpc("claim_invite");
        if (!claimed.error && isRole(claimed.data)) return { session, role: claimed.data };
        const own = await sb
          .from("staff")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle<Pick<StaffRow, "role">>();
        return { session, role: own.data && isRole(own.data.role) ? own.data.role : null };
      },
      onChange(listener) {
        const { data } = sb.auth.onAuthStateChange(() => listener());
        return () => data.subscription.unsubscribe();
      },
      async sendLink(email) {
        const redirect =
          typeof window === "undefined" ? undefined : `${window.location.origin}/admin/`;
        const { error } = await sb.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: redirect ? { emailRedirectTo: redirect } : {},
        });
        if (error) throw new BackendError(error.message, error.code);
      },
      async signOut() {
        await sb.auth.signOut();
      },
    },

    async uploadImage(file, folder, alt): Promise<MediaRow> {
      const up = await uploadToCloudinary(file, folder);
      const { data } = await sb.auth.getUser();
      return (await run(
        sb
          .from("media")
          .insert({ ...up, folder, alt, created_by: data.user?.id ?? null })
          .select()
          .single(),
      )) as unknown as MediaRow;
    },
  };
}
