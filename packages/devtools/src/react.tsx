import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from "react";
import type { QueryClient } from "@nexapi/core";
import { useQueryClient } from "@nexapi/react";
import { createInspector, type Inspector, type QueryInfo } from "./inspector.js";

export interface NexDevtoolsProps {
  /** Defaults to the client from `NexProvider`. */
  client?: QueryClient;
  /** Render even when `process.env.NODE_ENV === "production"`. Default false. */
  force?: boolean;
  /** Start expanded. Default false. */
  defaultOpen?: boolean;
  /** Forwarded to the inspector; see `InspectorOptions.redact`. */
  redact?: (key: readonly unknown[], data: unknown) => unknown;
}

function isProduction(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.NODE_ENV === "production";
}

function label(q: QueryInfo): string {
  return q.fetchStatus === "idle" ? q.status : `${q.status}/${q.fetchStatus}`;
}

const box = {
  position: "fixed",
  bottom: 8,
  right: 8,
  zIndex: 2147483000,
  font: "12px/1.4 ui-monospace, monospace",
  background: "#111",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 6,
  maxWidth: 480,
  maxHeight: "60vh",
  overflow: "auto",
  padding: 8,
} as const;

const button = {
  font: "inherit",
  fontSize: 11,
  color: "#e6eef5",
  background: "#1b2a37",
  border: "1px solid #35495a",
  borderRadius: 5,
  padding: "2px 8px",
  marginRight: 4,
  cursor: "pointer",
} as const;

const keyStyle = {
  background: "transparent",
  border: 0,
  padding: 0,
  color: "#9fd8ff",
  font: "inherit",
  wordBreak: "break-all",
} as const;

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

const list = { listStyle: "none", padding: 0, margin: "8px 0" } as const;

/**
 * Minimal cache panel. It shows query state, observer counts and recent events, and offers
 * refetch/invalidate/remove. Cached data is not rendered unless "data" is clicked for a row.
 * Renders nothing in production unless `force` is set.
 */
export function NexDevtools(props: NexDevtoolsProps): ReactElement | null {
  if (!props.force && isProduction()) return null;
  return <Panel {...props} />;
}

function Panel({ client, defaultOpen = false, redact }: NexDevtoolsProps): ReactElement {
  const target = useQueryClient(client);
  const inspector: Inspector = useMemo(
    () => createInspector(target, redact ? { redact } : {}),
    [target, redact],
  );
  useEffect(() => () => inspector.dispose(), [inspector]);
  const snap = useSyncExternalStore(inspector.subscribe, inspector.snapshot, inspector.snapshot);
  const [open, setOpen] = useState(defaultOpen);
  const [shown, setShown] = useState<string | null>(null);

  if (!open) {
    return (
      <div style={box}>
        <button type="button" style={button} onClick={() => setOpen(true)}>
          NexAPI ({snap.queries.length})
        </button>
      </div>
    );
  }
  return (
    <div style={box} data-testid="nex-devtools">
      <button type="button" style={button} onClick={() => setOpen(false)}>
        close
      </button>{" "}
      {plural(snap.queries.length, "query", "queries")},{" "}
      {snap.mutations.filter((m) => m.status === "pending").length} pending{" "}
      {snap.mutations.filter((m) => m.status === "pending").length === 1 ? "mutation" : "mutations"}
      <ul style={list}>
        {snap.queries.map((q) => (
          <li key={q.hash} style={{ margin: "0 0 10px" }}>
            <div style={{ marginBottom: 3 }}>
              <code style={keyStyle}>{JSON.stringify(q.key)}</code> {label(q)} obs:{q.observers}
              {q.isInvalidated ? " stale!" : ""}
              {q.error ? ` ${q.error.name}` : ""}
            </div>
            <button type="button" style={button} onClick={() => void inspector.refetch(q.hash)}>
              refetch
            </button>
            <button type="button" style={button} onClick={() => void inspector.invalidate(q.hash)}>
              invalidate
            </button>
            <button type="button" style={button} onClick={() => inspector.remove(q.hash)}>
              remove
            </button>
            <button
              type="button"
              style={button}
              onClick={() => setShown(shown === q.hash ? null : q.hash)}
            >
              data
            </button>
            {shown === q.hash && (
              <pre
                data-testid="nex-devtools-data"
                style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", color: "#c9e6a8" }}
              >
                {JSON.stringify(inspector.inspectData(q.hash), null, 2) ?? "undefined"}
              </pre>
            )}
          </li>
        ))}
      </ul>
      <div>events</div>
      <ol style={{ margin: "4px 0 0", paddingLeft: 22 }}>
        {snap.events.slice(-20).map((e) => (
          <li key={e.id}>
            {e.type} <code style={keyStyle}>{JSON.stringify(e.key)}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}
