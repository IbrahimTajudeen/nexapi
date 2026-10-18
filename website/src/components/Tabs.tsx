"use client";
import { useEffect, useId, useState, type ReactNode } from "react";

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/** Tabs that remember the chosen group value (e.g. the package manager) across the whole site. */
export function Tabs({ tabs, group }: { tabs: TabDef[]; group?: string }) {
  const uid = useId();
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  useEffect(() => {
    if (!group) return;
    try {
      const saved = localStorage.getItem(`tabs:${group}`);
      if (saved && tabs.some((t) => t.id === saved)) setActive(saved);
    } catch {
      /* storage can be blocked; the default tab is fine */
    }
    const onChange = (e: Event): void => {
      const d = (e as CustomEvent<{ group: string; id: string }>).detail;
      if (d.group === group && tabs.some((t) => t.id === d.id)) setActive(d.id);
    };
    window.addEventListener("nyx-tab", onChange);
    return () => window.removeEventListener("nyx-tab", onChange);
  }, [group]);
  const choose = (id: string): void => {
    setActive(id);
    if (!group) return;
    try {
      localStorage.setItem(`tabs:${group}`, id);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("nyx-tab", { detail: { group, id } }));
  };
  return (
    <div className="tabs">
      <div className="tab-list" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`${uid}-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${uid}-${t.id}-panel`}
            onClick={() => choose(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${uid}-${t.id}-panel`}
          aria-labelledby={`${uid}-${t.id}`}
          hidden={active !== t.id}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
