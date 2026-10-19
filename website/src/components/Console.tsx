"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createEngine, type Engine } from "@/lib/engine";
import { formatValue as format, runSnippet } from "@/lib/run";

interface OutLine {
  id: number;
  kind: "log" | "err" | "ok";
  text: string;
}

export interface Preset {
  label: string;
  code: string;
}

/**
 * Editable JavaScript that runs against the real NyxAPI engine and an in-memory mock API.
 * Variables in scope: `api`, `nyx`, `core`, `log`, `sleep`, `server`. Nothing leaves the page.
 */
export function Console({
  code,
  presets,
  title = "playground.js",
  rows,
  compact = false,
}: {
  code: string;
  presets?: Preset[];
  title?: string;
  rows?: number;
  compact?: boolean;
}) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [source, setSource] = useState(code);
  const [out, setOut] = useState<OutLine[]>([]);
  const [running, setRunning] = useState(false);
  const [failing, setFailing] = useState(false);
  const counter = useRef(0);
  const [, force] = useState(0);

  useEffect(() => {
    setEngine(createEngine());
  }, []);

  // A parent that controls `code` (the option labs) replaces what is in the editor.
  useEffect(() => {
    setSource(code);
  }, [code]);

  const log = useSyncExternalStore(
    useCallback((cb: () => void) => engine?.server.subscribe(cb) ?? (() => undefined), [engine]),
    () => engine?.server.log().length ?? 0,
    () => 0,
  );
  void log;

  const push = useCallback((kind: OutLine["kind"], text: string) => {
    setOut((o) => [...o, { id: counter.current++, kind, text }]);
  }, []);

  const run = useCallback(async () => {
    if (!engine || running) return;
    setRunning(true);
    setOut([]);
    const logFn = (...values: unknown[]): void => push("log", values.map(format).join(" "));
    try {
      const result = await runSnippet(engine, source, logFn);
      if (result !== undefined) push("ok", `→ ${format(result)}`);
      else push("ok", "Done.");
    } catch (error) {
      push("err", format(error));
    } finally {
      setRunning(false);
      setFailing(engine.server.failing);
      force((n) => n + 1);
    }
  }, [engine, running, source, push]);

  const reset = (): void => {
    engine?.nyx.queryClient.clear();
    engine?.server.reset();
    if (engine) engine.server.failing = false;
    setFailing(false);
    setOut([]);
  };

  const requests = engine?.server.log() ?? [];

  return (
    <div className="console">
      <div className="console-bar">
        <span className="dots" aria-hidden="true">
          <i />
          <i />
        </span>
        <span>{title}</span>
        <span style={{ marginLeft: "auto" }}>edit, then Run</span>
      </div>
      <div className="console-body">
        <label className="sr-only" htmlFor={`code-${title}`}>
          Code
        </label>
        <textarea
          id={`code-${title}`}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={rows ?? Math.min(16, source.split("\n").length + 1)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
        />
      </div>
      <div className="console-actions">
        <button
          type="button"
          className="btn primary small"
          onClick={() => void run()}
          disabled={!engine || running}
        >
          {running ? "Running…" : "Run"}
        </button>
        <button type="button" className="btn small" onClick={reset} disabled={!engine}>
          Reset cache and server
        </button>
        {presets?.map((p) => (
          <button
            key={p.label}
            type="button"
            className="btn small"
            onClick={() => setSource(p.code)}
          >
            {p.label}
          </button>
        ))}
        {engine && (
          <>
            <label className="range">
              Latency {engine.server.latency} ms
              <input
                type="range"
                min={0}
                max={2000}
                step={50}
                defaultValue={engine.server.latency}
                onChange={(e) => {
                  engine.server.latency = Number(e.target.value);
                  force((n) => n + 1);
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={failing}
                onChange={(e) => {
                  engine.server.failing = e.target.checked;
                  setFailing(e.target.checked);
                }}
              />
              Server returns 500
            </label>
          </>
        )}
      </div>
      {!compact && (
        <div className="console-out">
          <div aria-live="polite">
            <h5>Output</h5>
            {out.length === 0 && <span className="empty">Press Run to see the result.</span>}
            {out.map((l) => (
              <div key={l.id} className={`out-line ${l.kind === "log" ? "" : l.kind}`}>
                {l.text}
              </div>
            ))}
          </div>
          <div>
            <h5>
              Network ({requests.length} request{requests.length === 1 ? "" : "s"} to the mock API)
            </h5>
            {requests.length === 0 && <span className="empty">No requests yet.</span>}
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
      )}
    </div>
  );
}
