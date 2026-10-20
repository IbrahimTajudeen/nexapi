"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Editor, languageFor } from "./Editor";
import { Explorer } from "./Explorer";
import { Terminal, type TermLine } from "./Terminal";
import { Shell, type OutKind } from "./shell";
import { createSession, formatArg, type Level, type Session } from "./runtime";
import {
  clearWorkspace,
  isWorkspace,
  loadWorkspace,
  saveWorkspace,
  type Workspace,
} from "./storage";
import {
  EXAMPLE_IDS,
  PLANNED_FRAMEWORKS,
  TEMPLATES,
  WELCOME_README,
  exampleFile,
  templateById,
} from "./templates";
import { FsError, Vfs, basename, dirname, extname } from "./vfs";

type Panel = "terminal" | "output" | "preview" | "network";
const RUNNABLE = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const PREVIEW_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>';

interface OutLine {
  id: number;
  kind: Level | "info";
  text: string;
}

const safeGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

let lineId = 0;

export function Ide() {
  const vfs = useRef<Vfs>(new Vfs()).current;
  const version = useSyncExternalStore(
    useCallback((cb: () => void) => vfs.subscribe(cb), [vfs]),
    () => vfs.version,
    () => 0,
  );
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [selectedDir, setSelectedDir] = useState("/");
  const [panel, setPanel] = useState<Panel>("terminal");
  const [termLines, setTermLines] = useState<TermLine[]>([]);
  const [outLines, setOutLines] = useState<OutLine[]>([]);
  const [termFocus, setTermFocus] = useState(0);
  const [cursorPos, setCursorPos] = useState<[number, number]>([1, 1]);
  const [saveState, setSaveState] = useState<string>("Loading…");
  const [running, setRunning] = useState(false);
  const [panelH, setPanelH] = useState(260);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [menu, setMenu] = useState<"new" | "examples" | "more" | null>(null);
  const [latency, setLatency] = useState(150);
  const [failing, setFailing] = useState(false);
  const [netTick, setNetTick] = useState(0);
  const [cwdLabel, setCwdLabel] = useState("/");
  const [notice, setNotice] = useState<string | null>(null);

  const iframe = useRef<HTMLIFrameElement>(null);
  const session = useRef<Session | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const settings = useRef({ latency, failing });
  settings.current = { latency, failing };

  const pushTerm = useCallback((kind: TermLine["kind"], text: string) => {
    setTermLines((prev) => [...prev.slice(-999), { id: lineId++, kind, text }]);
  }, []);
  const pushOut = useCallback((kind: OutLine["kind"], text: string) => {
    setOutLines((prev) => [...prev.slice(-999), { id: lineId++, kind, text }]);
  }, []);

  const openFile = useCallback((path: string) => {
    setOpen((o) => (o.includes(path) ? o : [...o, path]));
    setActive(path);
  }, []);

  const scaffold = useCallback(
    (id: string): string | null => {
      const t = templateById(id);
      if (!t) return null;
      const name = vfs.uniqueName("/", id);
      for (const [p, content] of Object.entries(t.files)) vfs.write(`/${name}/${p}`, content);
      openFile(`/${name}/${t.open}`);
      setSelectedDir(`/${name}`);
      return `/${name}`;
    },
    [vfs, openFile],
  );

  // ----- run -----
  const freshPreview = useCallback((): Promise<Document | undefined> => {
    const frame = iframe.current;
    if (!frame) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const done = (): void => resolve(frame.contentDocument ?? undefined);
      frame.addEventListener("load", done, { once: true });
      frame.srcdoc = PREVIEW_HTML;
    });
  }, []);

  const runFile = useCallback(
    async (path: string, sink: (level: Level | "info", text: string) => void): Promise<void> => {
      session.current?.dispose();
      const doc = await freshPreview();
      const s = await createSession(vfs, {
        write: (level, text) => sink(level, text),
        previewDocument: doc,
      });
      s.server.latency = settings.current.latency;
      s.server.failing = settings.current.failing;
      session.current = s;
      const t0 = performance.now();
      sink("info", `▶ ${path}`);
      try {
        await s.run(path);
      } finally {
        setNetTick((n) => n + 1);
      }
      await new Promise((r) => setTimeout(r, 60));
      sink("info", `Finished in ${String(Math.round(performance.now() - t0))} ms`);
      const root = doc?.getElementById("root");
      if (root && root.childNodes.length > 0) setPanel("preview");
    },
    [vfs, freshPreview],
  );

  // ----- shell -----
  const shell = useMemo(
    () =>
      new Shell({
        vfs,
        print: (kind: OutKind, text: string) => pushTerm(kind, text),
        clear: () => setTermLines([]),
        runFile: (p) =>
          runFile(p, (level, text) =>
            pushTerm(level === "error" ? "err" : level === "info" ? "info" : "out", text),
          ),
        open: openFile,
        reset: async () => {
          if (!window.confirm("Delete every file in this workspace? This cannot be undone.")) {
            pushTerm("info", "Reset cancelled.");
            return;
          }
          await clearWorkspace();
          vfs.load({ files: {}, dirs: [] });
          setOpen([]);
          setActive(null);
          setSelectedDir("/");
          pushTerm("info", "Workspace cleared. Try: new basics");
        },
        scaffold,
        templates: () => TEMPLATES.map((t) => ({ id: t.id, title: t.title })),
      }),
    [vfs, pushTerm, runFile, openFile, scaffold],
  );

  const runCommand = useCallback(
    async (line: string): Promise<void> => {
      pushTerm("cmd", `${shell.prompt()} ${line}`);
      await shell.exec(line);
      setCwdLabel(shell.cwd);
      if (shell.cwd !== "/") setSelectedDir(shell.cwd);
    },
    [shell, pushTerm],
  );

  const runActive = useCallback(async (): Promise<void> => {
    const file = active;
    if (!file) return;
    if (!RUNNABLE.has(extname(file))) {
      setNotice(`${basename(file)} is not a runnable file. Open a .js, .ts, .jsx or .tsx file.`);
      return;
    }
    setNotice(null);
    setRunning(true);
    setPanel((p) => (p === "terminal" || p === "network" ? "output" : p));
    setOutLines([]);
    try {
      await runFile(file, pushOut);
    } catch (e) {
      pushOut("error", formatArg(e));
      setPanel("output");
    } finally {
      setRunning(false);
    }
  }, [active, runFile, pushOut]);

  // ----- load & persist -----
  useEffect(() => {
    let live = true;
    void (async () => {
      const w = await loadWorkspace();
      if (!live) return;
      if (w) {
        vfs.load(w.snapshot);
        setOpen(w.open.filter((p) => vfs.isFile(p)));
        setActive(w.active && vfs.isFile(w.active) ? w.active : null);
        shell.cwd = vfs.isDir(w.cwd) ? w.cwd : "/";
        setCwdLabel(shell.cwd);
        setSaveState("Saved in this browser");
      } else {
        vfs.write("/README.md", WELCOME_README);
        const dir = scaffold("basics");
        if (dir) {
          shell.cwd = dir;
          setCwdLabel(dir);
        }
        pushTerm("info", "Welcome. Press Ctrl+Enter to run the open file, or type help here.");
      }
      const params = new URLSearchParams(window.location.search);
      const ex = params.get("example");
      const tpl = params.get("template");
      if (ex) {
        const f = exampleFile(ex);
        if (f) {
          if (!vfs.isFile(f.path)) vfs.write(f.path, f.content);
          openFile(f.path);
        }
      } else if (tpl && templateById(tpl)) scaffold(tpl);
      const h = Number(safeGet("nyxapi.ide.panelH"));
      if (h >= 120 && h <= 700) setPanelH(h);
      setReady(true);
    })();
    return () => {
      live = false;
    };
    // run once
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(async (): Promise<void> => {
    const w: Workspace = {
      version: 1,
      snapshot: vfs.snapshot(),
      open: openRef.current,
      active,
      cwd: shell.cwd,
    };
    const where = await saveWorkspace(w);
    setSaveState(
      where === "idb"
        ? "Saved in this browser"
        : where === "local"
          ? "Saved (localStorage)"
          : `Not saved: ${where}`,
    );
  }, [vfs, active, shell]);
  useEffect(() => {
    if (!ready) return;
    setSaveState("Saving…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(), 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ready, version, open, active, cwdLabel, persist]);

  // ----- keyboard -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setPanel("terminal");
        setTermFocus((n) => n + 1);
      }
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ----- file operations -----
  const onCreate = (dir: string, name: string, kind: "file" | "dir"): string | null => {
    if (/[\\/]/.test(name) && !/^[^\\/]+(\/[^\\/]+)*$/.test(name))
      return "Names cannot contain backslashes.";
    const path = dir === "/" ? `/${name}` : `${dir}/${name}`;
    try {
      if (vfs.exists(path)) return `${name} already exists here.`;
      if (kind === "dir") vfs.mkdir(path, true);
      else {
        vfs.write(path, "");
        openFile(path);
      }
      return null;
    } catch (e) {
      return e instanceof FsError ? e.message : "Could not create that.";
    }
  };
  const onRename = (path: string, name: string): string | null => {
    if (name.includes("/")) return "A name cannot contain a slash. Use move in the terminal.";
    const to = `${dirname(path) === "/" ? "" : dirname(path)}/${name}`;
    if (to === path) return null;
    try {
      vfs.move(path, to);
      const remap = (p: string): string =>
        p === path ? to : p.startsWith(path + "/") ? to + p.slice(path.length) : p;
      setOpen((o) => o.map(remap));
      setActive((a) => (a ? remap(a) : a));
      return null;
    } catch (e) {
      return e instanceof FsError ? e.message : "Could not rename.";
    }
  };
  const onDelete = (path: string): void => {
    const isDir = vfs.isDir(path);
    if (
      !window.confirm(
        `Delete ${isDir ? "folder" : "file"} ${path}${isDir ? " and everything in it" : ""}?`,
      )
    )
      return;
    vfs.remove(path, true);
    const gone = (p: string): boolean => p === path || p.startsWith(path + "/");
    setOpen((o) => o.filter((p) => !gone(p)));
    setActive((a) => (a && gone(a) ? null : a));
    if (gone(selectedDir)) setSelectedDir("/");
  };
  const onUpload = (dir: string, files: FileList): void => {
    for (const f of Array.from(files)) {
      if (f.size > 1_000_000) {
        setNotice(`${f.name} is larger than 1 MB and was skipped.`);
        continue;
      }
      void f.text().then((text) => {
        const name = vfs.uniqueName(dir, f.name);
        vfs.write(dir === "/" ? `/${name}` : `${dir}/${name}`, text);
      });
    }
  };
  const download = (name: string, text: string, type = "text/plain"): void => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const closeTab = (path: string): void => {
    setOpen((o) => {
      const next = o.filter((p) => p !== path);
      if (active === path) setActive(next[next.length - 1] ?? null);
      return next;
    });
  };

  const startDrag = (e: React.PointerEvent): void => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelH;
    const move = (ev: PointerEvent): void =>
      setPanelH(Math.min(700, Math.max(120, startH + startY - ev.clientY)));
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPanelH((h) => {
        safeSet("nyxapi.ide.panelH", String(h));
        return h;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const fileText = active && vfs.isFile(active) ? vfs.read(active) : "";
  const requests = session.current?.server.log() ?? [];
  const lang = active ? languageFor(active).id : "";

  if (!ready) return <div className="ide-loading">Opening your workspace…</div>;

  return (
    <div className="ide" onClick={() => menu && setMenu(null)}>
      <div className="ide-toolbar" role="toolbar" aria-label="Playground actions">
        <button
          type="button"
          className="ide-btn burger"
          aria-label="Toggle explorer"
          aria-pressed={explorerOpen}
          onClick={(e) => {
            e.stopPropagation();
            setExplorerOpen((o) => !o);
          }}
        >
          ☰
        </button>
        <button
          type="button"
          className="ide-btn run"
          disabled={running || !active}
          onClick={() => void runActive()}
          title="Run the open file (Ctrl+Enter)"
        >
          {running ? "Running…" : "▶ Run"}
        </button>
        <div className="ide-menu">
          <button
            type="button"
            className="ide-btn"
            aria-haspopup="menu"
            aria-expanded={menu === "new"}
            onClick={(e) => {
              e.stopPropagation();
              setMenu(menu === "new" ? null : "new");
            }}
          >
            New project ▾
          </button>
          {menu === "new" && (
            <div className="ide-dropdown" role="menu">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    scaffold(t.id);
                    setMenu(null);
                  }}
                >
                  <strong>{t.title}</strong>
                  <small>{t.summary}</small>
                </button>
              ))}
              <div className="ide-sep">Other frameworks</div>
              {PLANNED_FRAMEWORKS.map((f) => (
                <button key={f.id} type="button" role="menuitem" disabled>
                  <strong>{f.title} (planned)</strong>
                  <small>{f.note}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ide-menu">
          <button
            type="button"
            className="ide-btn"
            aria-haspopup="menu"
            aria-expanded={menu === "examples"}
            onClick={(e) => {
              e.stopPropagation();
              setMenu(menu === "examples" ? null : "examples");
            }}
          >
            Docs examples ▾
          </button>
          {menu === "examples" && (
            <div className="ide-dropdown tall" role="menu">
              {EXAMPLE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const f = exampleFile(id);
                    if (f) {
                      if (!vfs.isFile(f.path)) vfs.write(f.path, f.content);
                      openFile(f.path);
                    }
                    setMenu(null);
                  }}
                >
                  <strong>{id}</strong>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ide-menu">
          <button
            type="button"
            className="ide-btn"
            aria-haspopup="menu"
            aria-expanded={menu === "more"}
            onClick={(e) => {
              e.stopPropagation();
              setMenu(menu === "more" ? null : "more");
            }}
          >
            Workspace ▾
          </button>
          {menu === "more" && (
            <div className="ide-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  download(
                    "nyxapi-workspace.json",
                    JSON.stringify(
                      { version: 1, snapshot: vfs.snapshot(), open, active, cwd: shell.cwd },
                      null,
                      2,
                    ),
                    "application/json",
                  );
                  setMenu(null);
                }}
              >
                <strong>Export workspace</strong>
                <small>Download everything as one JSON file.</small>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  importRef.current?.click();
                  setMenu(null);
                }}
              >
                <strong>Import workspace</strong>
                <small>Replace this workspace with an exported file.</small>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  void runCommand("reset");
                  setPanel("terminal");
                }}
              >
                <strong>Reset workspace</strong>
                <small>Delete all files saved in this browser.</small>
              </button>
            </div>
          )}
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void f.text().then((t) => {
              try {
                const parsed: unknown = JSON.parse(t);
                if (!isWorkspace(parsed)) throw new Error("not a NyxAPI workspace file");
                if (!window.confirm("Replace the current workspace with this file?")) return;
                vfs.load(parsed.snapshot);
                setOpen(parsed.open.filter((p) => vfs.isFile(p)));
                setActive(parsed.active && vfs.isFile(parsed.active) ? parsed.active : null);
                setNotice("Workspace imported.");
              } catch (err) {
                setNotice(`Import failed: ${err instanceof Error ? err.message : "invalid file"}`);
              }
            });
          }}
        />
        <span className="ide-spacer" />
        <span className="ide-save" aria-live="polite">
          {saveState}
        </span>
      </div>

      <div className={`ide-main${explorerOpen ? "" : " no-explorer"}`}>
        {explorerOpen && (
          <Explorer
            vfs={vfs}
            version={version}
            active={active}
            selectedDir={selectedDir}
            onSelectDir={setSelectedDir}
            onOpen={openFile}
            onCreate={onCreate}
            onRename={onRename}
            onDelete={onDelete}
            onUpload={onUpload}
            onDownload={(p) => download(basename(p), vfs.read(p))}
          />
        )}
        <div className="ide-work">
          <div className="ide-tabs" role="tablist" aria-label="Open files">
            {open.map((p) => (
              <div
                key={p}
                role="presentation"
                className={`ide-tab${p === active ? " active" : ""}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={p === active}
                  title={p}
                  onClick={() => setActive(p)}
                >
                  {basename(p)}
                </button>
                <button
                  type="button"
                  className="x"
                  aria-label={`Close ${basename(p)}`}
                  onClick={() => closeTab(p)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {notice && (
            <p className="ide-notice" role="status">
              {notice}{" "}
              <button type="button" className="link-btn" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </p>
          )}
          <div className="ide-editor-wrap">
            {active ? (
              <Editor
                path={active}
                value={fileText}
                onChange={(v) => vfs.write(active, v)}
                onRun={() => void runActive()}
                onSave={() => void persist()}
                onCursor={(l, c) => setCursorPos([l, c])}
              />
            ) : (
              <div className="ide-welcome">
                <h2>NyxAPI playground</h2>
                <p>
                  A real editor, terminal and runtime in your browser. Files are saved on this
                  device.
                </p>
                <ul>
                  <li>Open a file in the explorer, or create one with the icons above it.</li>
                  <li>
                    Start a project from <strong>New project</strong>, or type{" "}
                    <code>new react</code> in the terminal.
                  </li>
                  <li>
                    Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to run the open file.
                  </li>
                </ul>
              </div>
            )}
          </div>

          <div
            className="ide-split"
            onPointerDown={startDrag}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize panel"
          />
          <div className="ide-panel" style={{ height: panelH }}>
            <div className="ide-panel-tabs" role="tablist" aria-label="Panels">
              {(["terminal", "output", "preview", "network"] as Panel[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={panel === p}
                  onClick={() => setPanel(p)}
                >
                  {p === "network" ? "Mock API" : p[0]?.toUpperCase() + p.slice(1)}
                </button>
              ))}
              {panel === "output" && (
                <button type="button" className="link-btn" onClick={() => setOutLines([])}>
                  Clear
                </button>
              )}
            </div>
            <div className="ide-panel-body">
              <div hidden={panel !== "terminal"} className="ide-fill">
                <Terminal
                  shell={shell}
                  lines={termLines}
                  prompt={cwdLabel === "/" ? "/ $" : `${cwdLabel} $`}
                  onRun={runCommand}
                  focusSignal={termFocus}
                />
              </div>
              <div
                hidden={panel !== "output"}
                className="ide-fill ide-output"
                role="log"
                aria-live="polite"
              >
                {outLines.length === 0 && (
                  <div className="term-info">
                    Press Run (Ctrl+Enter) to see console output here.
                  </div>
                )}
                {outLines.map((l) => (
                  <div
                    key={l.id}
                    className={`term-${l.kind === "error" ? "err" : l.kind === "warn" ? "warn" : l.kind === "info" ? "info" : "out"}`}
                  >
                    {l.text}
                  </div>
                ))}
              </div>
              <div hidden={panel !== "preview"} className="ide-fill ide-preview">
                <iframe ref={iframe} title="App preview" srcDoc={PREVIEW_HTML} />
              </div>
              <div hidden={panel !== "network"} className="ide-fill ide-net" data-tick={netTick}>
                <div className="ide-net-controls">
                  <label>
                    Latency {latency} ms
                    <input
                      type="range"
                      min={0}
                      max={2000}
                      step={50}
                      value={latency}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setLatency(n);
                        if (session.current) session.current.server.latency = n;
                      }}
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={failing}
                      onChange={(e) => {
                        setFailing(e.target.checked);
                        if (session.current) session.current.server.failing = e.target.checked;
                      }}
                    />
                    Server returns 500
                  </label>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setNetTick((n) => n + 1)}
                  >
                    Refresh
                  </button>
                </div>
                {requests.length === 0 && (
                  <div className="term-info">No requests yet. Run a file that calls the API.</div>
                )}
                {requests.map((r) => (
                  <div key={r.id} className="req">
                    <span className="m">{r.method}</span>
                    <span style={{ flex: 1, wordBreak: "break-all" }}>{r.path}</span>
                    <span className={r.status < 400 ? "st-ok" : "st-bad"}>{r.status}</span>
                    <span className="empty">{r.ms}ms</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="ide-status">
        <span>{active ?? "No file open"}</span>
        <span className="ide-spacer" />
        {active && (
          <span>
            Ln {cursorPos[0]}, Col {cursorPos[1]}
          </span>
        )}
        {lang && <span>{lang}</span>}
        <span>Transpiled, not type-checked</span>
      </div>
    </div>
  );
}
