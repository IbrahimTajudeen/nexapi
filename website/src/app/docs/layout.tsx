import type { ReactNode } from "react";
import { MobileDocsNav, Sidebar, Toc } from "@/components/DocsNav";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wrap docs-layout">
      <Sidebar />
      <div style={{ minWidth: 0 }}>
        <MobileDocsNav />
        {children}
      </div>
      <Toc />
    </div>
  );
}
