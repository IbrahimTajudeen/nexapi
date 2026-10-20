"use client";
import { useEffect, useRef, useState } from "react";
import type { Shell, OutKind } from "./shell";

export interface TermLine {
  id: number;
  kind: OutKind | "cmd";
  text: string;
}

export function Terminal({
  shell,
  lines,
  prompt,
  onRun,
  focusSignal,
}: {
  shell: Shell;
  lines: TermLine[];
  prompt: string;
  onRun: (line: string) => Promise<void>;
  focusSignal: number;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, [focusSignal, busy]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [lines.length, busy]);

  const submit = async (): Promise<void> => {
    const line = value;
    setValue("");
    setCursor(null);
    setBusy(true);
    try {
      await onRun(line);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="ide-term"
      onClick={() => {
        if (!window.getSelection()?.toString()) input.current?.focus();
      }}
    >
      <div className="ide-term-log" ref={log} role="log" aria-live="polite">
        {lines.length === 0 && (
          <div className="term-info">Type help to see what this terminal can do.</div>
        )}
        {lines.map((l) => (
          <div key={l.id} className={`term-${l.kind}`}>
            {l.text}
          </div>
        ))}
      </div>
      <div className="ide-term-input">
        <span className="term-prompt" aria-hidden="true">
          {prompt}
        </span>
        <input
          ref={input}
          value={value}
          disabled={busy}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Terminal input"
          placeholder={busy ? "Running..." : ""}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            const h = shell.history;
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const next = cursor === null ? h.length - 1 : Math.max(cursor - 1, 0);
              if (h[next] !== undefined) {
                setCursor(next);
                setValue(h[next]);
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (cursor === null) return;
              const next = cursor + 1;
              if (next >= h.length) {
                setCursor(null);
                setValue("");
              } else {
                setCursor(next);
                setValue(h[next] ?? "");
              }
            } else if (e.key === "Tab") {
              e.preventDefault();
              const options = shell.complete(value);
              if (options.length === 1) setValue(options[0] ?? value);
              else if (options.length > 1) {
                let prefix = options[0] ?? "";
                for (const o of options) while (!o.startsWith(prefix)) prefix = prefix.slice(0, -1);
                if (prefix.length > value.length) setValue(prefix);
              }
            } else if (e.key === "l" && e.ctrlKey) {
              e.preventDefault();
              void onRun("clear");
            }
          }}
        />
      </div>
    </div>
  );
}
