"use client";

import { NyxProvider } from "@nyxapi/react";
import type { ReactNode } from "react";
import { nyx } from "../lib/api/client";

/** One shared NyxAPI client for the whole site: public pages and the admin use the same cache. */
export function Providers({ children }: { children: ReactNode }) {
  return <NyxProvider client={nyx.queryClient}>{children}</NyxProvider>;
}
