"use client";
import { useState } from "react";
import { Console } from "./Console";
import { GeneratePlayground } from "./GeneratePlayground";
import { ReactDemo } from "./ReactDemo";
import { EXAMPLES, type ExampleId } from "@/lib/examples";

const TITLES: Record<ExampleId, string> = {
  singleFlight: "Five callers, one request",
  firstCall: "Your first call",
  login: "Log in (POST with a body)",
  list: "Query parameters",
  typedError: "Typed errors",
  freshness: "Freshness and invalidation",
  prefetch: "Prefetch and read the cache",
  optimistic: "Optimistic update",
  rollback: "Roll back on failure",
  retries: "Retries on a failing server",
  pagination: "Infinite pagination",
  cacheKeys: "Cache keys",
  inspect: "Look inside the cache",
};

type Tab = "code" | "react" | "generate";

export function PlaygroundTabs() {
  const [tab, setTab] = useState<Tab>("code");
  const [id, setId] = useState<ExampleId>("singleFlight");
  return (
    <div>
      <div className="pg-tabs" role="tablist" aria-label="Playground modes">
        <button
          role="tab"
          type="button"
          aria-selected={tab === "code"}
          onClick={() => setTab("code")}
        >
          Run code
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === "react"}
          onClick={() => setTab("react")}
        >
          React demo
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === "generate"}
          onClick={() => setTab("generate")}
        >
          Generate a client
        </button>
      </div>

      {tab === "code" && (
        <div>
          <p className="hint" style={{ marginTop: 0 }}>
            Real NexAPI against an in-memory mock API (users, login, pagination). In scope:{" "}
            <code>api</code>, <code>nex</code>, <code>core</code>, <code>server</code>,{" "}
            <code>log</code> and <code>sleep</code>. Ctrl+Enter runs.
          </p>
          <div className="cta-row" style={{ alignItems: "center" }}>
            <label htmlFor="example-select" style={{ fontWeight: 650 }}>
              Example
            </label>
            <select
              id="example-select"
              value={id}
              onChange={(e) => setId(e.target.value as ExampleId)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--surface)",
                color: "var(--ink)",
                font: "inherit",
              }}
            >
              {(Object.keys(EXAMPLES) as ExampleId[]).map((k) => (
                <option key={k} value={k}>
                  {TITLES[k]}
                </option>
              ))}
            </select>
          </div>
          <Console key={id} code={EXAMPLES[id].code} title={`${id}.js`} />
        </div>
      )}
      {tab === "react" && <ReactDemo />}
      {tab === "generate" && <GeneratePlayground />}
    </div>
  );
}
