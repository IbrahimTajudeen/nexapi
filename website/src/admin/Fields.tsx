"use client";

import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { imageUrl } from "../lib/backend/cloudinary";
import type { TableName } from "../lib/backend/types";
import { useAdmin } from "./AdminContext";
import {
  SOCIAL_NETWORKS,
  getPath,
  text as scalar,
  toLocalInput,
  type Field,
  type Values,
} from "./form";

interface Props {
  field: Field;
  values: Values;
  error: string | undefined;
  errors: Record<string, string>;
  mode: "create" | "edit";
  onChange: (name: string, value: unknown) => void;
}

function Shell({
  field,
  error,
  children,
  id,
}: {
  field: Field;
  error: string | undefined;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div className={`adm-field${field.wide ? " wide" : ""}${error ? " invalid" : ""}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {field.help && !error && <small className="muted">{field.help}</small>}
      {error && (
        <small className="adm-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function FieldInput({ field, values, error, errors, mode, onChange }: Props) {
  const id = useId();
  const raw = getPath(values, field.name);
  const set = (v: unknown): void => onChange(field.name, v);
  const disabled = mode === "edit" && field.lockOnEdit === true;
  const text = scalar(raw);
  const common = {
    id,
    disabled,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-e` : undefined,
  };

  switch (field.type) {
    case "boolean":
      return (
        <div className={`adm-field adm-check${field.wide ? " wide" : ""}`}>
          <label className="adm-switch">
            <input
              type="checkbox"
              checked={raw === true}
              onChange={(e) => set(e.target.checked)}
              id={id}
            />
            <span className="adm-track" aria-hidden="true" />
            <span>{field.label}</span>
          </label>
          {field.help && <small className="muted">{field.help}</small>}
        </div>
      );
    case "textarea":
      return (
        <Shell field={field} error={error} id={id}>
          <textarea
            {...common}
            rows={4}
            value={text}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            onChange={(e) => set(e.target.value)}
          />
        </Shell>
      );
    case "markdown":
      return (
        <Shell field={field} error={error} id={id}>
          <MarkdownEditor id={id} value={text} onChange={set} />
        </Shell>
      );
    case "number":
      return (
        <Shell field={field} error={error} id={id}>
          <input
            {...common}
            type="number"
            inputMode="numeric"
            value={text}
            min={field.min}
            max={field.max}
            onChange={(e) => set(e.target.value)}
          />
        </Shell>
      );
    case "date":
      return (
        <Shell field={field} error={error} id={id}>
          <input {...common} type="date" value={text} onChange={(e) => set(e.target.value)} />
        </Shell>
      );
    case "datetime":
      return (
        <Shell field={field} error={error} id={id}>
          <input
            {...common}
            type="datetime-local"
            value={toLocalInput(raw)}
            onChange={(e) => set(e.target.value)}
          />
        </Shell>
      );
    case "select":
      return (
        <Shell field={field} error={error} id={id}>
          <select {...common} value={text} onChange={(e) => set(e.target.value)}>
            {!field.required ? (
              <option value="">None</option>
            ) : (
              text === "" && (
                <option value="" disabled>
                  Choose…
                </option>
              )
            )}
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Shell>
      );
    case "multiselect": {
      const chosen = Array.isArray(raw) ? raw.map(String) : [];
      return (
        <div
          className={`adm-field${field.wide ? " wide" : ""}${error ? " invalid" : ""}`}
          role="group"
          aria-labelledby={`${id}-l`}
        >
          <span id={`${id}-l`} className="adm-label">
            {field.label}
            {field.required && <span aria-hidden="true"> *</span>}
          </span>
          <div className="adm-chips">
            {(field.options ?? []).map((o) => {
              const on = chosen.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  className={`adm-chip${on ? " on" : ""}`}
                  aria-pressed={on}
                  onClick={() =>
                    set(on ? chosen.filter((c) => c !== o.value) : [...chosen, o.value])
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {error && (
            <small className="adm-error" role="alert">
              {error}
            </small>
          )}
        </div>
      );
    }
    case "lines": {
      const lines = Array.isArray(raw) ? raw.map(String) : [];
      return (
        <Shell field={field} error={error} id={id}>
          <textarea
            {...common}
            rows={Math.min(10, Math.max(3, lines.length + 1))}
            value={lines.join("\n")}
            onChange={(e) => set(e.target.value.split("\n"))}
          />
        </Shell>
      );
    }
    case "tags": {
      const tags = Array.isArray(raw) ? raw.map(String) : [];
      return (
        <Shell field={field} error={error} id={id}>
          <input
            {...common}
            value={tags.join(", ")}
            onChange={(e) => set(e.target.value.split(","))}
          />
        </Shell>
      );
    }
    case "json": {
      const shown = typeof raw === "string" ? raw : JSON.stringify(raw ?? null, null, 2);
      return (
        <Shell field={field} error={error} id={id}>
          <textarea
            {...common}
            className="adm-mono"
            rows={10}
            spellCheck={false}
            value={shown === "null" ? "" : shown}
            onChange={(e) => set(e.target.value)}
          />
        </Shell>
      );
    }
    case "image":
      return (
        <ImageField
          id={id}
          field={field}
          error={error}
          url={text}
          onChange={set}
          onPublicId={(p) => field.publicIdField && onChange(field.publicIdField, p)}
        />
      );
    case "socials": {
      const map =
        typeof raw === "object" && raw !== null && !Array.isArray(raw)
          ? (raw as Record<string, string>)
          : {};
      return (
        <div className="adm-field wide">
          <span className="adm-label">{field.label}</span>
          <div className="adm-socials">
            {SOCIAL_NETWORKS.map((n) => {
              const e = errors[`${field.name}.${n.key}`];
              return (
                <label key={n.key} className={e ? "invalid" : ""}>
                  <span>{n.label}</span>
                  <input
                    type="url"
                    value={map[n.key] ?? ""}
                    placeholder={n.placeholder}
                    aria-invalid={e ? true : undefined}
                    onChange={(ev) => set({ ...map, [n.key]: ev.target.value })}
                  />
                  {e && <small className="adm-error">{e}</small>}
                </label>
              );
            })}
          </div>
          {field.help && <small className="muted">{field.help}</small>}
        </div>
      );
    }
    case "relation":
      return <RelationField id={id} field={field} error={error} value={text} onChange={set} />;
    case "repeater":
      return (
        <Repeater
          field={field}
          rows={Array.isArray(raw) ? (raw as Values[]) : []}
          errors={errors}
          onChange={set}
        />
      );
    default:
      return (
        <Shell field={field} error={error} id={id}>
          <input
            {...common}
            type={field.type === "url" ? "url" : "text"}
            value={text}
            maxLength={field.maxLength}
            placeholder={field.placeholder ?? (field.type === "url" ? "https://" : undefined)}
            onChange={(e) => set(e.target.value)}
          />
        </Shell>
      );
  }
}

function MarkdownEditor({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  return (
    <div className="adm-md">
      <div className="adm-tabs" role="tablist">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "on" : ""}
            onClick={() => setTab(t)}
          >
            {t === "write" ? "Write" : "Preview"}
          </button>
        ))}
      </div>
      {tab === "write" ? (
        <textarea
          id={id}
          className="adm-mono"
          rows={16}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck
        />
      ) : (
        <div className="adm-preview prose">
          {value.trim() === "" ? (
            <p className="muted">Nothing to preview yet.</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          )}
        </div>
      )}
    </div>
  );
}

function ImageField({
  id,
  field,
  error,
  url,
  onChange,
  onPublicId,
}: {
  id: string;
  field: Field;
  error: string | undefined;
  url: string;
  onChange: (v: string) => void;
  onPublicId: (p: string) => void;
}) {
  const { backend, toast } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    setBusy(true);
    try {
      const media = await backend.uploadImage(
        file,
        field.folder ?? "nyxapi",
        file.name.replace(/\.[^.]+$/, ""),
      );
      onChange(media.url);
      onPublicId(media.public_id);
      toast("Image uploaded.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Shell field={field} error={error} id={id}>
      <div className="adm-image">
        {url ? (
          <img
            src={imageUrl(url, { width: 160, height: 160, face: true })}
            alt=""
            width={80}
            height={80}
          />
        ) : (
          <span className="adm-noimg" aria-hidden="true">
            No image
          </span>
        )}
        <div className="adm-image-actions">
          <input
            ref={input}
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            hidden
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? "Uploading…" : url ? "Replace image" : "Upload image"}
          </button>
          {url && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                onChange("");
                onPublicId("");
              }}
            >
              Remove
            </button>
          )}
        </div>
        <input
          type="url"
          className="adm-image-url"
          aria-label={`${field.label} link`}
          placeholder="…or paste an https:// link"
          value={url.startsWith("data:") ? "" : url}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </Shell>
  );
}

function RelationField({
  id,
  field,
  error,
  value,
  onChange,
}: {
  id: string;
  field: Field;
  error: string | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  const { backend } = useAdmin();
  const [rows, setRows] = useState<{ value: string; label: string }[]>([]);
  const rel = field.relation;
  useEffect(() => {
    if (!rel) return;
    let live = true;
    const table: TableName = rel.table;
    void backend.list(table).then((r) => {
      if (!live) return;
      const key = "id";
      setRows(
        (r as unknown as Record<string, unknown>[]).map((x) => ({
          value: String(x[key]),
          label: String(x[rel.label] ?? x[key]),
        })),
      );
    });
    return () => {
      live = false;
    };
  }, [backend, rel]);
  return (
    <Shell field={field} error={error} id={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {!field.required ? (
          <option value="">{rel?.none ?? "None"}</option>
        ) : (
          value === "" && (
            <option value="" disabled>
              Choose…
            </option>
          )
        )}
        {value !== "" && !rows.some((r) => r.value === value) && (
          <option value={value}>{value}</option>
        )}
        {rows.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

function Repeater({
  field,
  rows,
  errors,
  onChange,
}: {
  field: Field;
  rows: Values[];
  errors: Record<string, string>;
  onChange: (v: unknown) => void;
}) {
  const subs = field.fields ?? [];
  const blank = (): Values =>
    Object.fromEntries(
      subs.map((s) => [s.name, s.type === "select" ? (s.options?.[0]?.value ?? "") : ""]),
    );
  const move = (i: number, d: number): void => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const copy = [...rows];
    const a = copy[i];
    const b = copy[j];
    if (a === undefined || b === undefined) return;
    copy[i] = b;
    copy[j] = a;
    onChange(copy);
  };
  return (
    <div className="adm-field wide">
      <span className="adm-label">{field.label}</span>
      <ol className="adm-repeater">
        {rows.map((row, i) => (
          <li key={i} className="adm-repeat-row">
            <div className="adm-repeat-fields">
              {subs.map((s) => (
                <FieldInput
                  key={s.name}
                  field={{ ...s, wide: s.type === "textarea" }}
                  values={row}
                  mode="create"
                  error={errors[`${field.name}.${String(i)}.${s.name}`]}
                  errors={errors}
                  onChange={(n, v) =>
                    onChange(rows.map((r, k) => (k === i ? { ...r, [n]: v } : r)))
                  }
                />
              ))}
            </div>
            <div className="adm-repeat-actions">
              <button
                type="button"
                className="btn small"
                aria-label={`Move ${field.label} item ${String(i + 1)} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn small"
                aria-label={`Move ${field.label} item ${String(i + 1)} down`}
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn small"
                aria-label={`Remove ${field.label} item ${String(i + 1)}`}
                onClick={() => onChange(rows.filter((_, k) => k !== i))}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn small" onClick={() => onChange([...rows, blank()])}>
        Add {field.label.toLowerCase().replace(/s$/, "")}
      </button>
    </div>
  );
}
