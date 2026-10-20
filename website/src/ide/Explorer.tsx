"use client";
import { useEffect, useRef, useState } from "react";
import { basename, dirname, type Vfs } from "./vfs";

interface Props {
  vfs: Vfs;
  version: number;
  active: string | null;
  selectedDir: string;
  onSelectDir: (dir: string) => void;
  onOpen: (path: string) => void;
  onCreate: (dir: string, name: string, kind: "file" | "dir") => string | null;
  onRename: (path: string, name: string) => string | null;
  onDelete: (path: string) => void;
  onUpload: (dir: string, files: FileList) => void;
  onDownload: (path: string) => void;
}

type Editing =
  { type: "create"; dir: string; kind: "file" | "dir" } | { type: "rename"; path: string } | null;

const Icon = ({ d }: { d: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);
const ICON = {
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  newFile: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 12v6M9 15h6",
  newFolder:
    "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  chevron: "m9 6 6 6-6 6",
};

function NameInput({
  initial,
  onDone,
  onCancel,
}: {
  initial: string;
  onDone: (name: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(initial);
  // Enter, Escape and blur can all fire for one edit; only the first one counts.
  const settled = useRef(false);
  const settle = (fn: () => void): void => {
    if (settled.current) return;
    settled.current = true;
    fn();
  };
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="ide-name"
      value={v}
      aria-label="Name"
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => settle(() => (v.trim() ? onDone(v.trim()) : onCancel()))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") settle(() => (v.trim() ? onDone(v.trim()) : onCancel()));
        if (e.key === "Escape") settle(onCancel);
      }}
    />
  );
}

export function Explorer(p: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);

  // keep the active file's folders open
  useEffect(() => {
    if (!p.active) return;
    setOpen((prev) => {
      const next = new Set(prev);
      for (let d = dirname(p.active ?? "/"); d !== "/"; d = dirname(d)) next.add(d);
      return next;
    });
  }, [p.active]);

  const toggle = (d: string): void =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });

  const startCreate = (kind: "file" | "dir"): void => {
    setError(null);
    setOpen((prev) => new Set(prev).add(p.selectedDir));
    setEditing({ type: "create", dir: p.selectedDir, kind });
  };

  const finish = (name: string): void => {
    if (!editing) return;
    const result =
      editing.type === "create"
        ? p.onCreate(editing.dir, name, editing.kind)
        : p.onRename(editing.path, name);
    if (result) setError(result);
    else setError(null);
    setEditing(null);
  };

  const renderDir = (dir: string, depth: number): React.ReactNode => {
    const entries = p.vfs.list(dir);
    const rows: React.ReactNode[] = [];
    if (editing?.type === "create" && editing.dir === dir)
      rows.push(
        <li key="__new" style={{ paddingLeft: 10 + depth * 14 }} className="ide-row">
          <Icon d={editing.kind === "dir" ? ICON.folder : ICON.file} />
          <NameInput initial="" onDone={finish} onCancel={() => setEditing(null)} />
        </li>,
      );
    for (const e of entries) {
      const isOpen = open.has(e.path);
      const renaming = editing?.type === "rename" && editing.path === e.path;
      rows.push(
        <li key={e.path} role="none">
          <div
            className={`ide-row${p.active === e.path ? " active" : ""}${p.selectedDir === e.path ? " sel" : ""}`}
            style={{ paddingLeft: 10 + depth * 14 }}
            role="treeitem"
            aria-selected={p.active === e.path}
            aria-expanded={e.kind === "dir" ? isOpen : undefined}
            tabIndex={0}
            onClick={() => {
              if (e.kind === "dir") {
                toggle(e.path);
                p.onSelectDir(e.path);
              } else {
                p.onOpen(e.path);
                p.onSelectDir(dirname(e.path));
              }
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") (ev.currentTarget as HTMLElement).click();
              if (ev.key === "F2") setEditing({ type: "rename", path: e.path });
              if (ev.key === "Delete") p.onDelete(e.path);
            }}
          >
            {e.kind === "dir" ? (
              <span className={`chev${isOpen ? " open" : ""}`}>
                <Icon d={ICON.chevron} />
              </span>
            ) : (
              <span className="chev" />
            )}
            <Icon d={e.kind === "dir" ? ICON.folder : ICON.file} />
            {renaming ? (
              <NameInput initial={e.name} onDone={finish} onCancel={() => setEditing(null)} />
            ) : (
              <span className="ide-name-text">{e.name}</span>
            )}
            {!renaming && (
              <span className="ide-row-actions">
                <button
                  type="button"
                  aria-label={`Rename ${e.name}`}
                  title="Rename (F2)"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setEditing({ type: "rename", path: e.path });
                  }}
                >
                  ✎
                </button>
                {e.kind === "file" && (
                  <button
                    type="button"
                    aria-label={`Download ${e.name}`}
                    title="Download"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      p.onDownload(e.path);
                    }}
                  >
                    ↓
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Delete ${e.name}`}
                  title="Delete"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    p.onDelete(e.path);
                  }}
                >
                  ×
                </button>
              </span>
            )}
          </div>
          {e.kind === "dir" && isOpen && <ul role="group">{renderDir(e.path, depth + 1)}</ul>}
        </li>,
      );
    }
    return rows;
  };

  return (
    <div className="ide-explorer" data-version={p.version}>
      <div className="ide-pane-head">
        <span>Explorer</span>
        <span className="ide-tools">
          <button
            type="button"
            title="New file"
            aria-label="New file"
            onClick={() => startCreate("file")}
          >
            <Icon d={ICON.newFile} />
          </button>
          <button
            type="button"
            title="New folder"
            aria-label="New folder"
            onClick={() => startCreate("dir")}
          >
            <Icon d={ICON.newFolder} />
          </button>
          <button
            type="button"
            title="Upload files from your computer"
            aria-label="Upload files"
            onClick={() => upload.current?.click()}
          >
            <Icon d={ICON.upload} />
          </button>
        </span>
        <input
          ref={upload}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) p.onUpload(p.selectedDir, e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <div className="ide-target" title="New files and uploads go here">
        in <code>{p.selectedDir}</code>
        {p.selectedDir !== "/" && (
          <button type="button" className="link-btn" onClick={() => p.onSelectDir("/")}>
            root
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="ide-error">
          {error}
        </p>
      )}
      <ul className="ide-tree" role="tree" aria-label="Files">
        {renderDir("/", 0)}
      </ul>
      {p.vfs.list("/").length === 0 && editing === null && (
        <p className="ide-empty">
          No files. Use the icons above, or type <code>new basics</code> in the terminal.
        </p>
      )}
      <span className="sr-only">{basename(p.selectedDir)}</span>
    </div>
  );
}
