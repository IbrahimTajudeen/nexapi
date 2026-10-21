"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isHttps } from "../admin/form";
import { useRows } from "../lib/content";

const KEY = "nyxapi.dismissed.announcements";

function dismissed(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** The newest announcement that is active and inside its schedule, until the visitor closes it. */
export function AnnouncementBanner() {
  const { rows } = useRows("announcements", {
    orderBy: [{ column: "created_at", ascending: false }],
  });
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => setClosed(dismissed()), []);

  const now = Date.now();
  const a = (rows ?? []).find(
    (r) =>
      r.active &&
      !closed.includes(r.id) &&
      (!r.starts_at || Date.parse(r.starts_at) <= now) &&
      (!r.ends_at || Date.parse(r.ends_at) > now),
  );
  if (!a) return null;

  const href =
    a.link_url && (isHttps(a.link_url) || /^\/[^/]/.test(a.link_url)) ? a.link_url : null;
  const close = (): void => {
    const next = [...closed, a.id];
    setClosed(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: it simply comes back on the next visit */
    }
  };

  return (
    <div className={`announce ${a.level}`} role="region" aria-label="Announcement">
      <p>
        <strong>{a.title}</strong>
        {a.body && <span> {a.body}</span>}
        {href &&
          (href.startsWith("/") ? (
            <Link href={href}>{a.link_label ?? "Learn more"}</Link>
          ) : (
            <a href={href} rel="noopener noreferrer">
              {a.link_label ?? "Learn more"}
            </a>
          ))}
      </p>
      <button type="button" onClick={close} aria-label="Dismiss announcement">
        ×
      </button>
    </div>
  );
}
