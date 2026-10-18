"use client";
import { useEffect, useState } from "react";
import { highlight, type Lang } from "@/lib/highlight";
import { CopyButton } from "./CopyButton";
import { SITE_URL } from "@/site";

const PLACEHOLDER = "https://your-nexapi-site.example";

/** The address of this site, so copied commands point at the place the visitor is actually on. */
export function useSiteUrl(): string {
  const [url, setUrl] = useState(SITE_URL ?? PLACEHOLDER);
  useEffect(() => {
    if (!SITE_URL && window.location.protocol.startsWith("http")) setUrl(window.location.origin);
  }, []);
  return url.replace(/\/$/, "");
}

/** A command block where `{{site}}` is replaced by this site's address. */
export function SiteCommand({
  children,
  lang = "bash",
  title = "terminal",
}: {
  children: string;
  lang?: Lang;
  title?: string;
}) {
  const site = useSiteUrl();
  const code = children.replace(/^\n/, "").replace(/\s+$/, "").replaceAll("{{site}}", site);
  return (
    <div className="code">
      <div className="code-head">
        <span>{title}</span>
        <CopyButton text={code} />
      </div>
      <pre tabIndex={0}>
        <code>{highlight(code, lang)}</code>
      </pre>
    </div>
  );
}
