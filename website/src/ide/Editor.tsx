"use client";
import { useEffect, useRef } from "react";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { classHighlighter } from "@lezer/highlight";
import { syntaxHighlighting } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { yaml } from "@codemirror/lang-yaml";
import { extname } from "./vfs";

export function languageFor(path: string): { id: string; ext: Extension[] } {
  switch (extname(path)) {
    case ".ts":
      return { id: "TypeScript", ext: [javascript({ typescript: true })] };
    case ".tsx":
      return { id: "TypeScript React", ext: [javascript({ typescript: true, jsx: true })] };
    case ".jsx":
      return { id: "JavaScript React", ext: [javascript({ jsx: true })] };
    case ".js":
    case ".mjs":
    case ".cjs":
      return { id: "JavaScript", ext: [javascript({ jsx: true })] };
    case ".json":
      return { id: "JSON", ext: [json()] };
    case ".md":
      return { id: "Markdown", ext: [markdown()] };
    case ".css":
      return { id: "CSS", ext: [css()] };
    case ".html":
      return { id: "HTML", ext: [html()] };
    case ".yaml":
    case ".yml":
      return { id: "YAML", ext: [yaml()] };
    default:
      return { id: "Plain text", ext: [] };
  }
}

export interface EditorHandle {
  focus: () => void;
}

interface Props {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onSave: () => void;
  onCursor?: (line: number, col: number) => void;
}

/** One CodeMirror view. Each file keeps its own undo history while it stays open. */
export function Editor({ path, value, onChange, onRun, onSave, onCursor }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const cb = useRef({ onChange, onRun, onSave, onCursor });
  cb.current = { onChange, onRun, onSave, onCursor };
  const current = useRef(path);

  const makeState = (p: string, doc: string): EditorState =>
    EditorState.create({
      doc,
      extensions: [
        basicSetup,
        Prec.highest(
          keymap.of([
            indentWithTab,
            {
              key: "Mod-Enter",
              run: () => {
                cb.current.onRun();
                return true;
              },
            },
            {
              key: "Mod-s",
              run: () => {
                cb.current.onSave();
                return true;
              },
            },
          ]),
        ),
        syntaxHighlighting(classHighlighter),
        ...languageFor(p).ext,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            cb.current.onCursor?.(line.number, head - line.from + 1);
          }
        }),
        EditorView.contentAttributes.of({ "aria-label": `Editor for ${p}` }),
      ],
    });

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({ state: makeState(path, value), parent: host.current });
    view.current = v;
    const map = states.current;
    return () => {
      v.destroy();
      view.current = null;
      map.clear();
    };
    // The view is created once; file switches are handled below.
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (current.current !== path) {
      states.current.set(current.current, v.state);
      current.current = path;
      const cached = states.current.get(path);
      v.setState(cached && cached.doc.toString() === value ? cached : makeState(path, value));
    } else if (v.state.doc.toString() !== value) {
      // changed from outside the editor (terminal redirect, rename, generate)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [path, value]);

  return <div className="ide-editor" ref={host} />;
}
