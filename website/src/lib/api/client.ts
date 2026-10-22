/**
 * The site's own NyxAPI client: generated from openapi/site-api.json (see nyx.config.json) and
 * used by every page. One client per browser tab: it owns the HTTP credentials and the cache.
 */
import { createNyxClient, type Transport } from "@nyxapi/core";
import { createApi } from "../../api";
import { backendMode, loadBackend } from "../backend";

/** Only demo builds load the in-browser API; real builds talk to /api on the server. */
const demo: Transport = async (request) =>
  (await import("./demo-transport")).demoTransport(request);

export const nyx = createNyxClient({
  // Server rendering never fetches (effects do not run); this origin is only a valid placeholder.
  baseUrl:
    typeof window === "undefined" ? "http://localhost:3000/api" : `${window.location.origin}/api`,
  ...(backendMode === "demo" ? { transport: demo } : {}),
  getToken: async () => (await (await loadBackend())?.auth.accessToken()) ?? null,
  timeoutMs: 15_000,
  maxResponseBytes: 5_000_000,
  queryClient: {
    // Public content changes when an editor saves, not every minute: serve it from the cache for
    // five minutes and keep it around for half an hour. Admin screens ask for fresher data.
    defaultOptions: {
      queries: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false },
    },
  },
});

export const api = createApi(nyx);
