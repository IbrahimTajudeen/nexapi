"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminGate, useAdmin } from "./AdminContext";
import { atLeast } from "./form";
import { RESOURCES } from "./resources";

const GROUPS = ["People", "Learning", "Product", "Site"] as const;

function Sidebar() {
  const { role, email, signOut, backend } = useAdmin();
  const path = usePathname();
  const active = (href: string): boolean => path === href || path === href.replace(/\/$/, "");
  const item = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={active(href) ? "on" : ""}
      aria-current={active(href) ? "page" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <aside className="adm-side" aria-label="Admin sections">
      <nav>
        {item("/admin/", "Dashboard")}
        {GROUPS.map((g) => {
          const list = RESOURCES.filter((r) => r.group === g && atLeast(role, r.minRole));
          if (list.length === 0) return null;
          return (
            <div key={g} className="adm-side-group">
              <span className="adm-side-h">{g}</span>
              {list.map((r) =>
                item(
                  `/admin/${r.id}/`,
                  r.id === "people" && role === "contributor" ? "My profile" : r.title,
                ),
              )}
              {g === "Site" && atLeast(role, "editor") && (
                <>
                  {item("/admin/media/", "Media library")}
                  {item("/admin/settings/", "Settings")}
                </>
              )}
            </div>
          );
        })}
        {role === "admin" && (
          <div className="adm-side-group">
            <span className="adm-side-h">Admin</span>
            {item("/admin/team/", "Team and invites")}
            {item("/admin/audit/", "Activity log")}
          </div>
        )}
      </nav>
      <div className="adm-me">
        <span className="adm-me-email" title={email}>
          {email}
        </span>
        <span className="adm-badge">{role}</span>
        {backend.mode === "demo" && <span className="adm-badge b-warning">demo data</span>}
        <button className="btn small" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="adm">
      <AdminGate>
        {(ctx) => (
          <div className="adm-layout">
            <Sidebar />
            <div className="adm-main">
              {ctx.backend.mode === "demo" && (
                <p className="adm-note" role="note">
                  Demo mode: everything you change is stored in this browser only and is not shared.
                  Configure Supabase to use real data.
                </p>
              )}
              {children}
            </div>
          </div>
        )}
      </AdminGate>
    </div>
  );
}
