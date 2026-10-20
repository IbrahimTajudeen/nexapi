"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import index from "@/generated/search-index.json";

interface Entry {
  title: string;
  page: string;
  href: string;
  text: string;
}

export function SearchButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        className="icon-btn search-btn"
        onClick={() => setOpen(true)}
        aria-label="Search the site (Ctrl K)"
        title="Search (Ctrl K)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const all = index as Entry[];
    if (terms.length === 0) return all.filter((e) => e.href.indexOf("#") === -1).slice(0, 12);
    return all
      .map((e) => {
        const hay = `${e.title} ${e.page} ${e.text}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return null;
        const score = terms.reduce(
          (s, t) =>
            s +
            (e.title.toLowerCase().includes(t) ? 3 : 0) +
            (e.page.toLowerCase().includes(t) ? 1 : 0),
          0,
        );
        return { e, score };
      })
      .filter((x): x is { e: Entry; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((x) => x.e);
  }, [q]);
  const go = (e: Entry): void => {
    onClose();
    router.push(e.href);
  };
  return (
    <div
      className="search-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="search-box">
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter" && results[sel]) go(results[sel]);
          }}
          placeholder="Search pages and sections…"
          aria-label="Search"
        />
        <div className="search-results">
          {results.length === 0 && (
            <p style={{ padding: 12, margin: 0 }} className="hint">
              Nothing matches “{q}”. Try a shorter word, like “cache” or “retry”.
            </p>
          )}
          {results.map((r, i) => (
            <a
              key={r.href}
              href={r.href}
              data-sel={i === sel}
              onClick={(e) => {
                e.preventDefault();
                go(r);
              }}
            >
              {r.title}
              <small>{r.page}</small>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
