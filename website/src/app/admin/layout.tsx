import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/admin/Shell";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
