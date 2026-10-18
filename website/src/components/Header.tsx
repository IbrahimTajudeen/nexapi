"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DOCS_NAV, REPO_URL } from "@/site";
import { SearchButton } from "./Search";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/docs/", label: "Docs" },
  { href: "/playground/", label: "Playground" },
  { href: "/beginners/", label: "Beginners" },
  { href: "/install/", label: "Install" },
  { href: "/contribute/", label: "Contribute" },
];

export function Logo() {
  return (
    <Link href="/" className="brand" aria-label="NyxAPI home">
      <Image src="/brand/mark.png" alt="" width={34} height={34} priority />
      <span>
        Nyx<span className="api">API</span>
      </span>
    </Link>
  );
}

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  const active = (href: string): "page" | undefined =>
    (href === "/" ? path === "/" : path.startsWith(href.replace(/\/$/, ""))) ? "page" : undefined;
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Logo />
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <SearchButton />
          {REPO_URL && (
            <a
              className="icon-btn"
              href={REPO_URL}
              aria-label="NyxAPI on GitHub"
              title="GitHub"
              rel="noopener"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" />
              </svg>
            </a>
          )}
          <ThemeToggle />
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="mobile-nav">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          {DOCS_NAV.map((s) => (
            <div key={s.title}>
              <h3>{s.title}</h3>
              {s.items.map((i) => (
                <Link key={i.href} href={i.href}>
                  {i.title}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
