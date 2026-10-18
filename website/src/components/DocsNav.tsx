"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DOCS_NAV } from "@/site";

export function Sidebar() {
  const path = usePathname();
  return (
    <nav className="sidebar" aria-label="Documentation">
      {DOCS_NAV.map((s) => (
        <div key={s.title}>
          <h4>{s.title}</h4>
          {s.items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={path === i.href ? "page" : undefined}>
              {i.title}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function MobileDocsNav() {
  const path = usePathname();
  const router = useRouter();
  return (
    <div className="mobile-docs-nav">
      <label className="sr-only" htmlFor="docs-select">
        Documentation page
      </label>
      <select id="docs-select" value={path} onChange={(e) => router.push(e.target.value)}>
        {DOCS_NAV.map((s) => (
          <optgroup key={s.title} label={s.title}>
            {s.items.map((i) => (
              <option key={i.href} value={i.href}>
                {i.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

interface Heading {
  id: string;
  text: string;
  level: number;
}

export function Toc() {
  const path = usePathname();
  const [heads, setHeads] = useState<Heading[]>([]);
  const [active, setActive] = useState("");
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".doc h2[id], .doc h3[id]")];
    setHeads(
      els.map((e) => ({
        id: e.id,
        text: e.firstChild?.textContent ?? e.id,
        level: e.tagName === "H2" ? 2 : 3,
      })),
    );
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [path]);
  if (heads.length === 0) return <aside className="toc" aria-hidden="true" />;
  return (
    <aside className="toc" aria-label="On this page">
      <h4>On this page</h4>
      {heads.map((h) => (
        <a
          key={h.id}
          href={`#${h.id}`}
          data-active={active === h.id}
          style={{ paddingLeft: h.level === 3 ? 24 : 12 }}
        >
          {h.text}
        </a>
      ))}
    </aside>
  );
}
