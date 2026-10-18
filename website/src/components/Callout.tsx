import type { ReactNode } from "react";

/** `read` (blue) is about queries; `write` (green) about mutations; `warn` is a caution. */
export function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: "note" | "read" | "write" | "warn";
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className={`callout ${kind}`}>
      {title && <div className="callout-title">{title}</div>}
      {children}
    </aside>
  );
}
