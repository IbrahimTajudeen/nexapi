/**
 * Demo mode has no server, so this transport answers API requests in the browser by running the
 * same router the Vercel route handler runs, against the demo store in localStorage.
 */
import type { Transport } from "@nyxapi/core";
import { handleApi } from "../../server/api";
import { loadBackend } from "../backend";
import { createDemoDeps } from "../backend/demo-deps";

// The sign-in screen and this transport must share ONE demo store, or each keeps its own copy.
let deps: ReturnType<typeof createDemoDeps> | undefined;

export const demoTransport: Transport = async (request) => {
  if (!deps) {
    const store = await loadBackend();
    if (!store) throw new Error("The demo backend is not available.");
    deps = createDemoDeps(store);
  }
  const url = new URL(request.url);
  const path = url.pathname
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  let body: unknown;
  try {
    body = text === "" ? undefined : JSON.parse(text);
  } catch {
    return Response.json(
      { error: { code: "bad_request", message: "The request body is not valid JSON." } },
      { status: 400 },
    );
  }
  const auth = request.headers.get("authorization");
  const res = await handleApi(
    {
      method: request.method,
      path,
      query: url.searchParams,
      body,
      token: auth?.startsWith("Bearer ") ? auth.slice(7) : null,
      origin: url.origin,
    },
    deps,
  );
  return Response.json(res.body, { status: res.status, headers: res.headers ?? {} });
};
