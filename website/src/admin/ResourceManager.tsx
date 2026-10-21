"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { imageUrl } from "../lib/backend/cloudinary";
import { PRIMARY_KEY } from "../lib/backend/types";
import { useAdmin } from "./AdminContext";
import { FieldInput } from "./Fields";
import { atLeast, getPath, text, toPayload, validate, type Field, type Values } from "./form";
import type { Column, Resource } from "./resources";

type Row = Record<string, unknown>;

/** Fields a contributor may change on their own profile (mirrors the guard trigger in the database). */
const CONTRIBUTOR_FIELDS = new Set([
  "name",
  "avatar_url",
  "headline",
  "bio",
  "location",
  "website",
  "socials",
  "contributions",
]);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function cell(row: Row, col: Column): React.ReactNode {
  const v = getPath(row, col.key);
  switch (col.kind) {
    case "bool":
      return (
        <span
          className={`adm-dot ${v === true ? "on" : ""}`}
          role="img"
          aria-label={v === true ? "Yes" : "No"}
        />
      );
    case "image":
      return typeof v === "string" && v ? (
        <img
          className="adm-thumb"
          src={imageUrl(v, { width: 64, height: 64, face: true })}
          alt=""
          width={32}
          height={32}
        />
      ) : (
        <span className="adm-thumb empty" aria-hidden="true" />
      );
    case "badge":
      return v ? <span className={`adm-badge b-${text(v)}`}>{text(v)}</span> : "";
    case "list":
      return Array.isArray(v) ? v.join(", ") : "";
    case "date":
      return typeof v === "string" && v ? v.slice(0, 10) : "";
    default:
      return v === null || v === undefined ? "" : text(v);
  }
}

export function ResourceManager({ resource }: { resource: Resource }) {
  const { backend, role, userId, toast } = useAdmin();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ mode: "create" | "edit"; row: Row } | null>(null);
  const pk = PRIMARY_KEY[resource.table];
  const own = resource.ownRowOnly === true && role === "contributor";
  const canCreate = !own && atLeast(role, resource.canCreate ?? "editor");
  const canDelete = !own && atLeast(role, resource.canDelete ?? "editor");

  const load = useCallback(async () => {
    try {
      const all = (await backend.list(resource.table, {
        orderBy: resource.orderBy,
      })) as unknown as Row[];
      setRows(own ? all.filter((r) => r["user_id"] === userId) : all);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [backend, resource, own, userId]);

  useEffect(() => {
    setRows(null);
    setEditing(null);
    setQuery("");
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!rows || q === "") return rows;
    return rows.filter((r) => resource.search.some((k) => text(r[k]).toLowerCase().includes(q)));
  }, [rows, query, resource.search]);

  async function remove(row: Row): Promise<void> {
    const name = text(row[resource.titleKey]) || "this item";
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    try {
      await backend.remove(resource.table, String(row[pk]));
      toast(`Deleted “${name}”.`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete.", "error");
    }
  }

  async function togglePublished(row: Row): Promise<void> {
    const flag = resource.table === "announcements" ? "active" : "published";
    try {
      await backend.update(resource.table, String(row[pk]), {
        [flag]: row[flag] !== true,
      });
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update.", "error");
    }
  }

  if (editing)
    return (
      <Editor
        resource={resource}
        mode={editing.mode}
        initial={editing.row}
        own={own}
        onClose={() => setEditing(null)}
        onSaved={async (msg) => {
          toast(msg);
          setEditing(null);
          await load();
        }}
      />
    );

  const publishable = resource.fields.some((f) => f.name === "published" || f.name === "active");
  const flagName = resource.table === "announcements" ? "active" : "published";

  return (
    <section aria-labelledby="res-title">
      <header className="adm-head">
        <div>
          <h1 id="res-title">{resource.title}</h1>
          <p className="muted">{resource.description}</p>
        </div>
        {canCreate && (
          <button
            className="btn primary"
            onClick={() => setEditing({ mode: "create", row: structuredClone(resource.defaults) })}
          >
            New {resource.singular}
          </button>
        )}
      </header>

      <div className="adm-toolbar">
        <input
          type="search"
          aria-label={`Search ${resource.title.toLowerCase()}`}
          placeholder={`Search ${resource.title.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {rows && (
          <span className="muted">
            {shown?.length === rows.length
              ? `${String(rows.length)} total`
              : `${String(shown?.length ?? 0)} of ${String(rows.length)}`}
          </span>
        )}
      </div>

      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}
      {!rows && !error && <p className="muted">Loading…</p>}
      {shown && shown.length === 0 && (
        <div className="adm-empty">
          <p>
            {query
              ? "Nothing matches your search."
              : own
                ? "Your profile has not been linked yet. Ask an admin to link it to your invite."
                : `No ${resource.title.toLowerCase()} yet.`}
          </p>
        </div>
      )}
      {shown && shown.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                {resource.columns.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
                <th scope="col" className="adm-actions-h">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={String(row[pk])}>
                  {resource.columns.map((c, i) => (
                    <td key={c.key} data-label={c.label}>
                      {i === (resource.columns[0]?.kind === "image" ? 1 : 0) ? (
                        <button
                          className="adm-link"
                          onClick={() => setEditing({ mode: "edit", row })}
                        >
                          {cell(row, c)}
                        </button>
                      ) : (
                        cell(row, c)
                      )}
                    </td>
                  ))}
                  <td className="adm-actions">
                    <button className="btn small" onClick={() => setEditing({ mode: "edit", row })}>
                      Edit
                    </button>
                    {publishable && !own && (
                      <button className="btn small" onClick={() => void togglePublished(row)}>
                        {row[flagName] === true
                          ? flagName === "active"
                            ? "Pause"
                            : "Unpublish"
                          : flagName === "active"
                            ? "Activate"
                            : "Publish"}
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn small danger" onClick={() => void remove(row)}>
                        Delete
                      </button>
                    )}
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

function Editor({
  resource,
  mode,
  initial,
  own,
  onClose,
  onSaved,
}: {
  resource: Resource;
  mode: "create" | "edit";
  initial: Row;
  own: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { backend, toast } = useAdmin();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const pk = PRIMARY_KEY[resource.table];

  const fields: Field[] = useMemo(
    () => (own ? resource.fields.filter((f) => CONTRIBUTOR_FIELDS.has(f.name)) : resource.fields),
    [own, resource.fields],
  );
  const groups = useMemo(() => {
    const out: { name: string; fields: Field[] }[] = [];
    for (const f of fields) {
      const g = f.group ?? "Details";
      const hit = out.find((x) => x.name === g);
      if (hit) hit.fields.push(f);
      else out.push({ name: g, fields: [f] });
    }
    return out;
  }, [fields]);

  const change = useCallback((name: string, value: unknown) => {
    setValues((v) => {
      // dotted names and plain names share one setter
      const [head, ...rest] = name.split(".");
      if (head === undefined) return v;
      if (rest.length === 0) return { ...v, [head]: value };
      const set = (obj: Values, path: string[]): Values => {
        const [h, ...t] = path;
        if (h === undefined) return obj;
        if (t.length === 0) return { ...obj, [h]: value };
        const child =
          typeof obj[h] === "object" && obj[h] !== null && !Array.isArray(obj[h])
            ? (obj[h] as Values)
            : {};
        return { ...obj, [h]: set(child, t) };
      };
      return set(v, [head, ...rest]);
    });
    setErrors((e) => {
      if (!(name in e)) return e;
      const { [name]: _gone, ...rest } = e;
      return rest;
    });
  }, []);

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const found = validate(fields, values, mode);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      toast("Please fix the highlighted fields.", "error");
      document
        .querySelector(".adm-field.invalid")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(fields, values, mode);
      if (mode === "create") {
        await backend.insert(resource.table, payload);
        await onSaved(`Created ${resource.singular}.`);
      } else {
        const changed = Object.fromEntries(
          Object.entries(payload).filter(([k, v]) => !same(v, initial[k])),
        );
        if (Object.keys(changed).length === 0) {
          await onSaved("No changes to save.");
          return;
        }
        await backend.update(resource.table, String(initial[pk]), changed);
        await onSaved(`Saved ${resource.singular}.`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save.", "error");
      setSaving(false);
    }
  }

  const title =
    mode === "create"
      ? `New ${resource.singular}`
      : `Edit ${text(initial[resource.titleKey]) || resource.singular}`;
  const publicPath = mode === "edit" ? resource.publicPath?.(initial) : null;

  return (
    <form onSubmit={(e) => void save(e)} noValidate aria-labelledby="ed-title" className="adm-form">
      <header className="adm-head">
        <div>
          <button type="button" className="adm-back" onClick={onClose}>
            ← {resource.title}
          </button>
          <h1 id="ed-title">{title}</h1>
        </div>
        <div className="adm-head-actions">
          {publicPath && (
            <a className="btn" href={publicPath} target="_blank" rel="noreferrer">
              View on site
            </a>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
          </button>
        </div>
      </header>
      {own && (
        <p className="adm-note">
          You can edit your own profile. An editor decides when it is published and featured.
        </p>
      )}
      {groups.map((g) => (
        <fieldset key={g.name} className="adm-group">
          <legend>{g.name}</legend>
          <div className="adm-grid">
            {g.fields.map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                values={values}
                mode={mode}
                error={errors[f.name]}
                errors={errors}
                onChange={change}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </form>
  );
}
