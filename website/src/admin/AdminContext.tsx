"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@nyxapi/react";
import { api, nyx } from "../lib/api/client";
import { errorMessage, isUnauthorized } from "../lib/api/resources";
import { loadBackend } from "../lib/backend";
import type { Backend, StaffRole } from "../lib/backend/types";

interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}

interface Ctx {
  /** "demo" when data lives in this browser only. */
  mode: Backend["mode"];
  auth: Backend["auth"];
  email: string;
  userId: string;
  role: StaffRole;
  toast: (text: string, kind?: "ok" | "error") => void;
  signOut: () => Promise<void>;
}

const AdminCtx = createContext<Ctx | null>(null);

export function useAdmin(): Ctx {
  const c = useContext(AdminCtx);
  if (!c) throw new Error("useAdmin must be used inside <AdminGate>");
  return c;
}

type Session =
  | { state: "loading" }
  | { state: "none" }
  | { state: "ready"; backend: Backend; token: string | null };

export function AdminGate({ children }: { children: (ctx: Ctx) => ReactNode }) {
  const [session, setSession] = useState<Session>({ state: "loading" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const toast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = next.current++;
    setToasts((t) => [...t, { id, text, kind }]);
    window.setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === "error" ? 7000 : 3500,
    );
  }, []);

  // Sign-in itself (the emailed link and the session) stays with Supabase Auth in the browser;
  // everything else goes through the API with the session's token.
  useEffect(() => {
    let off: (() => void) | undefined;
    let live = true;
    void loadBackend().then((backend) => {
      if (!live) return;
      if (!backend) {
        setSession({ state: "none" });
        return;
      }
      const read = async (): Promise<void> => {
        const token = await backend.auth.accessToken();
        if (live) setSession({ state: "ready", backend, token });
      };
      void read();
      off = backend.auth.onChange(() => {
        // A different person may be signing in: never show them the last person's cache.
        nyx.queryClient.clear();
        void read();
      });
    });
    return () => {
      live = false;
      off?.();
    };
  }, []);

  const token = session.state === "ready" ? session.token : null;
  const me = useQuery(
    api.me.get.options(undefined, { enabled: token !== null, retry: false, staleTime: 60_000 }),
  );
  const rejected = isUnauthorized(me.error);

  useEffect(() => {
    // The token is no longer accepted (expired or revoked): drop the session so the form shows.
    if (rejected && session.state === "ready") void session.backend.auth.signOut();
  }, [rejected, session]);

  const role = me.data?.role ?? null;
  const ctx = useMemo<Ctx | null>(() => {
    if (session.state !== "ready" || !me.data || !role) return null;
    const backend = session.backend;
    return {
      mode: backend.mode,
      auth: backend.auth,
      email: me.data.email,
      userId: me.data.userId,
      role,
      toast,
      signOut: () => backend.auth.signOut(),
    };
  }, [session, me.data, role, toast]);

  let body: ReactNode;
  if (session.state === "loading" || (token !== null && me.isPending && !me.error))
    body = <p className="adm-center muted">Loading…</p>;
  else if (session.state === "none") body = <NoBackend />;
  else if (token === null || rejected) body = <SignIn backend={session.backend} />;
  else if (me.error)
    body = (
      <p className="adm-center adm-error" role="alert">
        {errorMessage(me.error)}
      </p>
    );
  else if (!role)
    body = (
      <div className="adm-card adm-narrow">
        <h1>No access yet</h1>
        <p>
          You are signed in as <strong>{me.data?.email}</strong>, but this address has not been
          invited to manage the site. Ask an admin to invite it, then sign in again.
        </p>
        <button className="btn" onClick={() => void session.backend.auth.signOut()}>
          Sign out
        </button>
      </div>
    );
  else body = ctx ? <AdminCtx.Provider value={ctx}>{children(ctx)}</AdminCtx.Provider> : null;

  return (
    <>
      {body}
      <div className="adm-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`adm-toast ${t.kind}`}
            role={t.kind === "error" ? "alert" : "status"}
          >
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

function SignIn({ backend }: { backend: Backend }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      await backend.auth.sendLink(email.trim().toLowerCase());
      setState("sent");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send the link.");
      setState("error");
    }
  }

  return (
    <form className="adm-card adm-narrow" onSubmit={(e) => void submit(e)}>
      <h1>Sign in</h1>
      <p className="muted">
        Enter the email address you were invited with. We will send you a one-time link; there is no
        password to remember.
      </p>
      <label className="adm-field">
        <span>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      {backend.mode === "demo" && (
        <p className="adm-note" role="note">
          Demo mode: no email is sent and any address works. Use an address containing “editor” or
          “contributor” to see those roles; anything else signs you in as an admin.
        </p>
      )}
      <button className="btn primary" disabled={state === "sending" || state === "sent"}>
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state === "sent" && (
        <p className="adm-ok" role="status">
          Check your inbox for <strong>{email}</strong> and open the link on this device.
        </p>
      )}
      {state === "error" && (
        <p className="adm-error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}

function NoBackend() {
  return (
    <div className="adm-card adm-narrow">
      <h1>The admin panel is not connected</h1>
      <p>
        This build has no backend configured, so the site shows its built-in content. To turn the
        admin panel on, create a Supabase project and set these variables in Vercel (or .env.local):
      </p>
      <pre className="adm-pre">
        {`SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
CLOUDINARY_CLOUD_NAME=your-cloud
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret`}
      </pre>
      <p className="muted">
        The full steps are in <code>docs/BACKEND.md</code>. To try the panel without any account,
        build with <code>NEXT_PUBLIC_BACKEND=demo</code>; data then stays in your browser only.
      </p>
    </div>
  );
}
