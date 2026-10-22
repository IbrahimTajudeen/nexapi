"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, useResourceMutations, useSettingMutation } from "../lib/api/resources";
import { useUploadImage } from "../lib/api/upload";
import { useRows } from "../lib/content";
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

/* ------------------------------------------------------------------ dashboard */

function Stat({ resource }: { resource: (typeof RESOURCES)[number] }) {
  // Shares the cached list with the screen the tile links to, so opening it later is instant.
  const { rows } = useRows(resource.table, { publishedOnly: false, fresh: true });
  const flag = resource.table === "announcements" ? "active" : "published";
  const hidden =
    (rows as Record<string, unknown>[] | null)?.filter((x) => x[flag] === false).length ?? 0;
  return (
    <Link href={`/admin/${resource.id}/`} className="adm-stat">
      <span className="adm-stat-n">{rows?.length ?? "–"}</span>
      <span className="adm-stat-l">{resource.title}</span>
      {hidden > 0 && <span className="adm-stat-d">{hidden} hidden</span>}
    </Link>
  );
}

export function Dashboard() {
  const { role, email } = useAdmin();
  const visible = RESOURCES.filter((r) => atLeast(role, r.minRole));

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
            <Stat key={r.id} resource={r} />
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
  const { toast } = useAdmin();
  const { rows, error } = useRows("site_settings", { publishedOnly: false, fresh: true });
  const save = useSettingMutation();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const busy = save.isPending ? (save.variables?.key ?? "") : "";

  useEffect(() => {
    if (!rows) return;
    setDraft(
      Object.fromEntries(
        SETTINGS.map((s) => [s.key, text(rows.find((r: SettingRow) => r.key === s.key)?.value)]),
      ),
    );
  }, [rows]);

  async function saveKey(key: string): Promise<void> {
    try {
      await save.mutateAsync({ key, value: draft[key] ?? "" });
      toast("Saved.");
    } catch (e) {
      toast(errorMessage(e), "error");
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
            onClick={() => void saveKey(s.key)}
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
  const { toast, role, mode } = useAdmin();
  const { rows: data, error } = useRows("media", {
    orderBy: [{ column: "created_at", ascending: false }],
    publishedOnly: false,
    fresh: true,
  });
  const upload = useUploadImage();
  const { update, remove } = useResourceMutations("media");
  const input = useRef<HTMLInputElement>(null);
  const busy = upload.isPending;

  async function addFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    try {
      for (const f of Array.from(files))
        await upload.mutateAsync({
          file: f,
          folder: "nyxapi/library",
          alt: f.name.replace(/\.[^.]+$/, ""),
        });
      toast(files.length === 1 ? "Image uploaded." : `${String(files.length)} images uploaded.`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
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
      await update.mutateAsync({ id: m.id, patch: { alt } });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function removeImage(m: MediaRow): Promise<void> {
    if (
      !window.confirm(
        "Remove this image from the library? Pages that already use it keep working, but the image link may stop loading if the file is deleted from Cloudinary.",
      )
    )
      return;
    try {
      const result = (await remove.mutateAsync(m.id)) as { assetDeleted?: boolean };
      toast(
        result.assetDeleted || mode === "demo"
          ? "Image removed."
          : "Removed from the library, but the file could not be deleted from Cloudinary.",
        result.assetDeleted || mode === "demo" ? "ok" : "error",
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <section>
      <header className="adm-head">
        <div>
          <h1>Media library</h1>
          <p className="muted">
            Images uploaded to Cloudinary (signed by the server). Use them in profiles, tutorials
            and anywhere that takes an image link.
          </p>
        </div>
        <div>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            hidden
            onChange={(e) => void addFiles(e.target.files)}
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
                  <button className="btn small danger" onClick={() => void removeImage(m)}>
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
  const { toast, userId, email: myEmail, mode } = useAdmin();
  const staff = useRows("staff", {
    orderBy: [{ column: "created_at" }],
    publishedOnly: false,
    fresh: true,
  });
  const invites = useRows("staff_invites", {
    orderBy: [{ column: "created_at", ascending: false }],
    publishedOnly: false,
    fresh: true,
  });
  const people = useRows("people", { orderBy: [{ column: "name" }], publishedOnly: false });
  const staffMut = useResourceMutations("staff");
  const inviteMut = useResourceMutations("staff_invites");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("contributor");
  const [person, setPerson] = useState("");
  const [note, setNote] = useState("");
  const busy = inviteMut.create.isPending;

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const peopleById = useMemo(
    () => new Map((people.rows ?? []).map((p: Person) => [p.id, p.name])),
    [people.rows],
  );

  async function invite(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      toast("Enter a valid email address.", "error");
      return;
    }
    try {
      // The server records who invited them and sends the sign-in email.
      const result = (await inviteMut.create.mutateAsync({
        email: addr,
        role,
        person_id: role === "contributor" && person !== "" ? person : null,
        note: note.trim() || null,
      })) as { emailSent?: boolean; emailError?: string };
      if (result.emailSent === false && mode === "demo")
        toast(
          `Invited ${addr}. Demo mode sends no email; sign in with this address to try the role.`,
        );
      else if (result.emailSent === false)
        toast(
          `Invited ${addr}, but the email could not be sent${result.emailError ? ` (${result.emailError})` : ""}. Ask them to sign in at ${origin}/admin/ with this address.`,
          "error",
        );
      else toast(`Invited ${addr}. A sign-in link is on its way.`);
      setEmail("");
      setNote("");
      setPerson("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function changeRole(s: StaffRow, next: StaffRole): Promise<void> {
    try {
      await staffMut.update.mutateAsync({ id: s.user_id, patch: { role: next } });
      toast(`${s.email} is now ${ROLE_LABEL[next].toLowerCase()}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function removeStaff(s: StaffRow): Promise<void> {
    if (!window.confirm(`Remove ${s.email}? They lose access to this panel straight away.`)) return;
    try {
      await staffMut.remove.mutateAsync(s.user_id);
      toast(`Removed ${s.email}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function revoke(i: InviteRow): Promise<void> {
    if (!window.confirm(`Withdraw the invite for ${i.email}?`)) return;
    try {
      await inviteMut.remove.mutateAsync(i.email);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const pending = (invites.rows ?? []).filter((i: InviteRow) => !i.accepted_at);

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
                {(people.rows ?? []).map((p: Person) => (
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
          They get a sign-in link by email. If it does not arrive, tell them to open{" "}
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
            {(staff.rows ?? []).map((s: StaffRow) => (
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
  const { rows: data, error } = useRows("audit_log", {
    orderBy: [{ column: "at", ascending: false }],
    limit: 200,
    publishedOnly: false,
    fresh: true,
  });
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
