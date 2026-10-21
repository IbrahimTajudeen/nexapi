"use client";

import { useAdmin } from "./AdminContext";
import { atLeast } from "./form";
import { resourceById } from "./resources";
import { ResourceManager } from "./ResourceManager";
import { AuditPage, Dashboard, MediaPage, SettingsPage, TeamPage } from "./Special";

function Denied() {
  return (
    <div className="adm-card adm-narrow">
      <h1>Not available</h1>
      <p>Your role does not include this section.</p>
    </div>
  );
}

export function AdminRoute({ slug }: { slug: string }) {
  const { role } = useAdmin();
  switch (slug) {
    case "dashboard":
      return <Dashboard />;
    case "settings":
      return atLeast(role, "editor") ? <SettingsPage /> : <Denied />;
    case "media":
      return atLeast(role, "editor") ? <MediaPage /> : <Denied />;
    case "team":
      return role === "admin" ? <TeamPage /> : <Denied />;
    case "audit":
      return role === "admin" ? <AuditPage /> : <Denied />;
    default: {
      const r = resourceById(slug);
      if (!r) return <Denied />;
      return atLeast(role, r.minRole) ? <ResourceManager resource={r} /> : <Denied />;
    }
  }
}
