import Link from "next/link";
import type { ReactNode } from "react";
import { DOC_PAGES } from "@/site";
import { slug } from "@/lib/slug";

export function H2({ children }: { children: string }) {
  const id = slug(children);
  return (
    <h2 id={id}>
      {children}
      <a className="anchor" href={`#${id}`} aria-label={`Link to ${children}`}>
        #
      </a>
    </h2>
  );
}

export function H3({ children }: { children: string }) {
  const id = slug(children);
  return (
    <h3 id={id}>
      {children}
      <a className="anchor" href={`#${id}`} aria-label={`Link to ${children}`}>
        #
      </a>
    </h3>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Page wrapper: title, lede, content and previous/next links taken from the nav order. */
export function Doc({
  href,
  title,
  lede,
  children,
}: {
  href: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  const i = DOC_PAGES.findIndex((p) => p.href === href);
  const prev = i > 0 ? DOC_PAGES[i - 1] : undefined;
  const next = i >= 0 && i < DOC_PAGES.length - 1 ? DOC_PAGES[i + 1] : undefined;
  return (
    <article className="doc">
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
      {children}
      <nav className="pager" aria-label="Previous and next pages">
        {prev ? (
          <Link href={prev.href}>
            <small>Previous</small>
            {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={next.href} className="next">
            <small>Next</small>
            {next.title}
          </Link>
        )}
      </nav>
    </article>
  );
}
