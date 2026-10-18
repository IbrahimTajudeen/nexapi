"use client";
import { useEffect, useState } from "react";
import { GenerationError, generateFrom, type Diagnostic } from "@nyxapi/codegen";
import { GRAPHQL_SAMPLE, SAMPLE_SCHEMA } from "@/lib/sample-schema";
import { highlight } from "@/lib/highlight";
import { CopyButton } from "./CopyButton";

interface Output {
  files: { path: string; content: string }[];
  diagnostics: readonly Diagnostic[];
  failed: boolean;
}

async function run(text: string, validation: boolean, strip: string): Promise<Output> {
  try {
    const config = {
      validation,
      scalars: { DateTime: "string" },
      ...(strip ? { naming: { stripPathPrefix: strip } } : {}),
    };
    const result = await generateFrom(text, config, { sourceName: "schema" });
    return { files: result.files, diagnostics: result.diagnostics, failed: false };
  } catch (error) {
    if (error instanceof GenerationError)
      return { files: [], diagnostics: error.diagnostics, failed: true };
    return {
      files: [],
      diagnostics: [
        {
          level: "error",
          code: "UNEXPECTED",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      failed: true,
    };
  }
}

/** Runs the real code generator in the page. The schema never leaves the browser. */
export function GeneratePlayground() {
  const [text, setText] = useState(SAMPLE_SCHEMA);
  const [validation, setValidation] = useState(true);
  const [strip, setStrip] = useState("");
  const [file, setFile] = useState("client.ts");
  const [out, setOut] = useState<Output>({ files: [], diagnostics: [], failed: false });
  useEffect(() => {
    let live = true;
    void run(text, validation, strip).then((o) => live && setOut(o));
    return () => {
      live = false;
    };
  }, [text, validation, strip]);
  const current = out.files.find((f) => f.path === file) ?? out.files[0];
  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        Paste an OpenAPI 3.x or Swagger 2.0 document (JSON or YAML) or a GraphQL schema (SDL). The
        kind is detected. The generator runs in this page, so your schema is not uploaded.
      </p>
      <div className="cta-row" style={{ alignItems: "center", marginBottom: 12 }}>
        <button type="button" className="btn small" onClick={() => setText(SAMPLE_SCHEMA)}>
          Load the OpenAPI sample
        </button>
        <button type="button" className="btn small" onClick={() => setText(GRAPHQL_SAMPLE)}>
          Load the GraphQL sample
        </button>
        <label className="check" style={{ color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={validation}
            onChange={(e) => setValidation(e.target.checked)}
          />{" "}
          Response validation
        </label>
        <label className="check" style={{ color: "var(--muted)" }}>
          Strip path prefix
          <input
            value={strip}
            onChange={(e) => setStrip(e.target.value)}
            placeholder="/api"
            aria-label="Path prefix to strip"
            style={{
              width: 90,
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              font: "inherit",
            }}
          />
        </label>
      </div>
      <div className="gen-grid">
        <div>
          <label className="sr-only" htmlFor="schema-input">
            Schema
          </label>
          <textarea
            id="schema-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="gen-out" aria-live="polite">
          {out.diagnostics.map((d, i) => (
            <div key={i} className={`diag ${d.level}`}>
              {d.level === "error" ? "Error" : "Warning"} {d.code}: {d.message}
            </div>
          ))}
          {out.files.length > 0 && (
            <>
              <div className="file-tabs" role="tablist">
                {out.files.map((f) => (
                  <button
                    key={f.path}
                    role="tab"
                    type="button"
                    aria-selected={current?.path === f.path}
                    onClick={() => setFile(f.path)}
                  >
                    {f.path}
                  </button>
                ))}
                {current && (
                  <span style={{ marginLeft: "auto" }}>
                    <CopyButton text={current.content} />
                  </span>
                )}
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 14,
                  fontSize: "0.8rem",
                  lineHeight: 1.55,
                  overflow: "auto",
                }}
              >
                <code>{current ? highlight(current.content, "ts") : null}</code>
              </pre>
            </>
          )}
          {out.files.length === 0 && !out.failed && (
            <p className="empty" style={{ padding: 14 }}>
              Nothing generated.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
