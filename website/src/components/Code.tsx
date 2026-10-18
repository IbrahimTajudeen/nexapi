import { highlight, type Lang } from "@/lib/highlight";
import { CopyButton } from "./CopyButton";

export function Code({
  children,
  lang = "ts",
  title,
  copy = true,
}: {
  children: string;
  lang?: Lang;
  title?: string;
  copy?: boolean;
}) {
  const code = children.replace(/^\n/, "").replace(/\s+$/, "");
  return (
    <div className="code">
      {(title || copy) && (
        <div className="code-head">
          <span>{title ?? lang}</span>
          {copy && <CopyButton text={code} />}
        </div>
      )}
      <pre tabIndex={0}>
        <code>{highlight(code, lang)}</code>
      </pre>
    </div>
  );
}
