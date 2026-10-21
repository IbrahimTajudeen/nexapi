"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { imageUrl } from "../lib/backend/cloudinary";
import type {
  AuditRow,
  InviteRow,
  MediaRow,
  Person,
  SettingRow,
  StaffRole,
  StaffRow,
} from "../lib/backend/types";
import { useAdmin } from "./AdminContext";
import { atLeast, text } from "./form";
import { RESOURCES } from "./resources";

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  editor: "Editor",
  contributor: "Contributor",
};
const ROLE_HELP: Record<StaffRole, string> = {
  admin: "Everything, including inviting and removing people.",
  editor: "All site content, media and settings.",
  contributor: "Only their own profile on the Community page.",
};

function useLoad<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): { data: T | null; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const run = useCallback(fn, deps);
  useEffect(() => {
    let live = true;
    run().then(
      (d) => {
        if (live) {
          setData(d);
          setError("");
        }
      },
      (e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : "Could not load.");
      },
    );
    return () => {
      live = false;
    };
  }, [run, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

/* ------------------------------------------------------------------ dashboard */

export function Dashboard() {
  const { backend, role, email } = useAdmin();
  const visible = RESOURCES.filter((r) => atLeast(role, r.minRole));
  const { data } = useLoad(async () => {
    const out: Record<string, { total: number; draft: number }> = {};
    for (const r of visible) {
      if (r.ownRowOnly && role === "contributor") continue;
      const rows = (await backend.list(r.table)) as unknown as Record<string, unknown>[];
      const flag = r.table === "announcements" ? "active" : "published";
      out[r.id] = { total: rows.length, draft: rows.filter((x) => x[flag] === false).length };
    }
    return out;
  }, [backend, role]);

  return (
    <section>
      <header className="adm-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            Signed in as {email} · {ROLE_LABEL[role]}
          </p>
        </div>
      </header>
      {role === "contributor" ? (
        <div className="adm-card">
          <h2>Your profile</h2>
          <p>
            Add your photo, a short bio and your social links. An editor publishes it to the
            Community page.
          </p>
          <Link className="btn primary" href="/admin/people/">
            Edit my profile
          </Link>
        </div>
      ) : (
        <div className="adm-stats">
          {visible.map((r) => (
            <Link key={r.id} href={`/admin/${r.id}/`} className="adm-stat">
              <span className="adm-stat-n">{data?.[r.id]?.total ?? "–"}</span>
              <span className="adm-stat-l">{r.title}</span>
              {(data?.[r.id]?.draft ?? 0) > 0 && (
                <span className="adm-stat-d">{data?.[r.id]?.draft} hidden</span>
              )}
            </Link>
          ))}
        </div>
      )}
      {atLeast(role, "editor") && (
        <div className="adm-card">
          <h2>Quick start</h2>
          <ul className="adm-list">
            <li>
              Add a contributor or tutor under <Link href="/admin/people/">People</Link>, with a
              photo and social links, then publish them.
            </li>
            <li>
              Mark a tutorial as claimed or published under{" "}
              <Link href="/admin/tutorials/">Tutorials</Link>.
            </li>
            <li>
              Post a site-wide notice under <Link href="/admin/announcements/">Announcements</Link>.
            </li>
            {role === "admin" && (
              <li>
                Invite helpers under <Link href="/admin/team/">Team</Link>.
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ settings */

const SETTINGS: { key: string; label: string; help: string }[] = [
  {
    key: "community.intro",
    label: "Community page introduction",
    help: "The paragraph under the heading of the Community page.",
  },
  {
    key: "tutors.intro",
    label: "Tutors introduction",
    help: "The paragraph above the tutors on the Community page.",
  },
];

export function SettingsPage() {
  const { backend, toast } = useAdmin();
  const { data, error, reload } = useLoad(() => backend.list("site_settings"), [backend]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!data) return;
    setDraft(
      Object.fromEntries(
        SETTINGS.map((s) => [s.key, text(data.find((r: SettingRow) => r.key === s.key)?.value)]),
      ),
    );
  }, [data]);

  async function save(key: string): Promise<void> {
    setBusy(key);
    try {
      await backend.upsert("site_settings", { key, value: draft[key] ?? "" });
      toast("Saved.");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save.", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <section>
      <header className="adm-head">
        <div>
          <h1>Site settings</h1>
          <p className="muted">
            Short pieces of text used around the site. Settings are public, so never put secrets
            here.
          </p>
        </div>
      </header>
      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}
      {SETTINGS.map((s) => (
        <div key={s.key} className="adm-card">
          <div className="adm-field wide">
            <label htmlFor={`s-${s.key}`}>{s.label}</label>
            <textarea
              id={`s-${s.key}`}
              rows={3}
              value={draft[s.key] ?? ""}
              onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
            />
            <small className="muted">{s.help}</small>
          </div>
          <button
            className="btn primary"
            disabled={busy === s.key}
            onClick={() => void save(s.key)}
          >
            {busy === s.key ? "Saving…" : "Save"}
          </button>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ media */

export function MediaPage() {
  const { backend, toast, role } = useAdmin();
  const { data, error, reload } = useLoad(
    () => backend.list("media", { orderBy: [{ column: "created_at", ascending: false }] }),
    [backend],
  );
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files))
        await backend.uploadImage(f, "nyxapi/library", f.name.replace(/\.[^.]+$/, ""));
      toast(files.length === 1 ? "Image uploaded." : `${String(files.length)} images uploaded.`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function copy(m: MediaRow): Promise<void> {
    try {
      await navigator.clipboard.writeText(m.url);
      toast("Link copied.");
    } catch {
      toast("Copy is not available here. Select the link instead.", "error");
    }
  }

  async function rename(m: MediaRow): Promise<void> {
    const alt = window.prompt("Description of the image (for screen readers)", m.alt);
    if (alt === null) return;
    try {
      await backend.update("media", m.id, { alt });
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save.", "error");
    }
  }

  async function remove(m: MediaRow): Promise<void> {
    if (
      !window.confirm(
        "Remove this image from the library? Pages that already use it keep working; the file stays in Cloudinary until you delete it there.",
      )
    )
      return;
    try {
      await backend.remove("media", m.id);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not remove.", "error");
    }
  }

  return (
    <section>
      <header className="adm-head">
        <div>
          <h1>Media library</h1>
          <p className="muted">
            Images uploaded to Cloudinary. Use them in profiles, tutorials and anywhere that takes
            an image link.
          </p>
        </div>
        <div>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
          <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : "Upload images"}
          </button>
        </div>
      </header>
      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}
      {data && data.length === 0 && (
        <div className="adm-empty">
          <p>No images yet. PNG, JPEG, WebP, GIF or AVIF up to 5 MB.</p>
        </div>
      )}
      <ul className="adm-media">
        {(data ?? []).map((m) => (
          <li key={m.id} className="adm-media-item">
            <img src={imageUrl(m.url, { width: 360, height: 240 })} alt={m.alt} loading="lazy" />
            <div className="adm-media-meta">
              <strong title={m.public_id}>{m.alt || m.public_id.split("/").pop()}</strong>
              <small className="muted">
                {m.width && m.height ? `${String(m.width)}×${String(m.height)}` : ""}{" "}
                {m.bytes ? `· ${String(Math.round(m.bytes / 1024))} KB` : ""}
              </small>
              <div className="adm-media-actions">
                <button className="btn small" onClick={() => void copy(m)}>
                  Copy link
                </button>
                <button className="btn small" onClick={() => void rename(m)}>
                  Describe
                </button>
                {atLeast(role, "editor") && (
                  <button className="btn small danger" onClick={() => void remove(m)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ team */

export function TeamPage() {
  const { backend, toast, userId, email: myEmail } = useAdmin();
  const staff = useLoad(
    () => backend.list("staff", { orderBy: [{ column: "created_at" }] }),
    [backend],
  );
  const invites = useLoad(
    () => backend.list("staff_invites", { orderBy: [{ column: "created_at", ascending: false }] }),
    [backend],
  );
  const people = useLoad(
    () => backend.list("people", { orderBy: [{ column: "name" }] }),
    [backend],
  );
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("contributor");
  const [person, setPerson] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const peopleById = useMemo(
    () => new Map((people.data ?? []).map((p: Person) => [p.id, p.name])),
    [people.data],
  );

  async function invite(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      toast("Enter a valid email address.", "error");
      return;
    }
    setBusy(true);
    try {
      await backend.insert("staff_invites", {
        email: addr,
        role,
        person_id: role === "contributor" && person !== "" ? person : null,
        note: note.trim() || null,
        invited_by: userId,
      });
      toast(`Invited ${addr}. Ask them to sign in at ${origin}/admin/ with this address.`);
      setEmail("");
      setNote("");
      setPerson("");
      invites.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not invite.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(s: StaffRow, next: StaffRole): Promise<void> {
    try {
      await backend.update("staff", s.user_id, { role: next });
      toast(`${s.email} is now ${ROLE_LABEL[next].toLowerCase()}.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change the role.", "error");
    }
    staff.reload();
  }

  async function removeStaff(s: StaffRow): Promise<void> {
    if (!window.confirm(`Remove ${s.email}? They lose access to this panel straight away.`)) return;
    try {
      await backend.remove("staff", s.user_id);
      toast(`Removed ${s.email}.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove.", "error");
    }
    staff.reload();
  }

  async function revoke(i: InviteRow): Promise<void> {
    if (!window.confirm(`Withdraw the invite for ${i.email}?`)) return;
    try {
      await backend.remove("staff_invites", i.email);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not withdraw.", "error");
    }
    invites.reload();
  }

  const pending = (invites.data ?? []).filter((i) => !i.accepted_at);

  return (
    <section>
      <header className="adm-head">
        <div>
          <h1>Team</h1>
          <p className="muted">
            Invite people to help run the site. They sign in with an email link, no password.
          </p>
        </div>
      </header>

      <form className="adm-card" onSubmit={(e) => void invite(e)}>
        <h2>Invite someone</h2>
        <div className="adm-grid">
          <div className="adm-field">
            <label htmlFor="inv-email">Email</label>
            <input
              id="inv-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <div className="adm-field">
            <label htmlFor="inv-role">Role</label>
            <select
              id="inv-role"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <small className="muted">{ROLE_HELP[role]}</small>
          </div>
          {role === "contributor" && (
            <div className="adm-field">
              <label htmlFor="inv-person">Their profile</label>
              <select id="inv-person" value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Not linked yet</option>
                {(people.data ?? []).map((p: Person) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <small className="muted">
                The Community profile they may edit. Create it under People first.
              </small>
            </div>
          )}
          <div className="adm-field">
            <label htmlFor="inv-note">Note (optional)</label>
            <input
              id="inv-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why they were invited"
            />
          </div>
        </div>
        <button className="btn primary" disabled={busy}>
          {busy ? "Inviting…" : "Send invite"}
        </button>
        <p className="muted adm-fine">
          This records the invite. It does not send an email by itself; tell them to open{" "}
          <code>{origin}/admin/</code> and sign in with the invited address.
        </p>
      </form>

      <h2 className="adm-h2">Members</h2>
      {staff.error && (
        <p className="adm-error" role="alert">
          {staff.error}
        </p>
      )}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(staff.data ?? []).map((s) => (
              <tr key={s.user_id}>
                <td data-label="Email">
                  {s.email}
                  {s.user_id === userId && <span className="adm-badge"> you</span>}
                </td>
                <td data-label="Role">
                  <select
                    aria-label={`Role for ${s.email}`}
                    value={s.role}
                    onChange={(e) => void changeRole(s, e.target.value as StaffRole)}
                  >
                    {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="adm-actions">
                  <button
                    className="btn small danger"
                    disabled={s.email === myEmail}
                    onClick={() => void removeStaff(s)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="adm-h2">Pending invites</h2>
      {pending.length === 0 ? (
        <div className="adm-empty">
          <p>No pending invites.</p>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Profile</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pending.map((i) => (
                <tr key={i.email}>
                  <td data-label="Email">{i.email}</td>
                  <td data-label="Role">{ROLE_LABEL[i.role]}</td>
                  <td data-label="Profile">
                    {i.person_id ? (peopleById.get(i.person_id) ?? "Linked") : ""}
                  </td>
                  <td className="adm-actions">
                    <button className="btn small danger" onClick={() => void revoke(i)}>
                      Withdraw
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ audit */

export function AuditPage() {
  const { backend } = useAdmin();
  const { data, error } = useLoad(
    () => backend.list("audit_log", { orderBy: [{ column: "at", ascending: false }], limit: 200 }),
    [backend],
  );
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter(
      (r: AuditRow) =>
        s === "" || `${r.email ?? ""} ${r.table_name} ${r.op}`.toLowerCase().includes(s),
    );
  }, [data, q]);
  return (
    <section>
      <header className="adm-head">
        <div>
          <h1>Activity log</h1>
          <p className="muted">
            Who changed what, newest first. Shows the last 200 changes and the names of the fields,
            never their content.
          </p>
        </div>
      </header>
      <div className="adm-toolbar">
        <input
          type="search"
          aria-label="Filter activity"
          placeholder="Filter by person, table or action…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">Action</th>
              <th scope="col">Where</th>
              <th scope="col">Fields</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="When">{new Date(r.at).toLocaleString()}</td>
                <td data-label="Who">{r.email ?? "system"}</td>
                <td data-label="Action">
                  <span className={`adm-badge b-${r.op.toLowerCase()}`}>{r.op.toLowerCase()}</span>
                </td>
                <td data-label="Where">{r.table_name}</td>
                <td data-label="Fields">{r.changed.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && rows.length === 0 && (
        <div className="adm-empty">
          <p>Nothing recorded yet.</p>
        </div>
      )}
    </section>
  );
}
