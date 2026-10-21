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
import { loadBackend } from "../lib/backend";
import type { Backend, Me, StaffRole } from "../lib/backend/types";

type Gate =
  | { state: "loading" }
  | { state: "no-backend" }
  | { state: "signed-out"; backend: Backend }
  | { state: "not-invited"; backend: Backend; email: string }
  | { state: "error"; message: string }
  | { state: "ready"; backend: Backend; me: Me; role: StaffRole };

interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}

interface Ctx {
  backend: Backend;
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

export function AdminGate({ children }: { children: (ctx: Ctx) => ReactNode }) {
  const [gate, setGate] = useState<Gate>({ state: "loading" });
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

  const refresh = useCallback(async (backend: Backend) => {
    try {
      const me = await backend.auth.me();
      if (!me) setGate({ state: "signed-out", backend });
      else if (!me.role) setGate({ state: "not-invited", backend, email: me.session.email });
      else setGate({ state: "ready", backend, me, role: me.role });
    } catch (e) {
      setGate({
        state: "error",
        message: e instanceof Error ? e.message : "Could not reach the backend.",
      });
    }
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    let live = true;
    void loadBackend().then((backend) => {
      if (!live) return;
      if (!backend) {
        setGate({ state: "no-backend" });
        return;
      }
      void refresh(backend);
      off = backend.auth.onChange(() => void refresh(backend));
    });
    return () => {
      live = false;
      off?.();
    };
  }, [refresh]);

  const ctx = useMemo<Ctx | null>(() => {
    if (gate.state !== "ready") return null;
    return {
      backend: gate.backend,
      email: gate.me.session.email,
      userId: gate.me.session.userId,
      role: gate.role,
      toast,
      signOut: async () => {
        await gate.backend.auth.signOut();
        await refresh(gate.backend);
      },
    };
  }, [gate, toast, refresh]);

  let body: ReactNode;
  if (gate.state === "loading") body = <p className="adm-center muted">Loading…</p>;
  else if (gate.state === "no-backend") body = <NoBackend />;
  else if (gate.state === "error")
    body = (
      <p className="adm-center adm-error" role="alert">
        {gate.message}
      </p>
    );
  else if (gate.state === "signed-out") body = <SignIn backend={gate.backend} />;
  else if (gate.state === "not-invited")
    body = (
      <div className="adm-card adm-narrow">
        <h1>No access yet</h1>
        <p>
          You are signed in as <strong>{gate.email}</strong>, but this address has not been invited
          to manage the site. Ask an admin to invite it, then sign in again.
        </p>
        <button
          className="btn"
          onClick={() => void gate.backend.auth.signOut().then(() => refresh(gate.backend))}
        >
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
        admin panel on, create a Supabase project and set these variables before building:
      </p>
      <pre className="adm-pre">
        {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-unsigned-preset`}
      </pre>
      <p className="muted">
        The full steps are in <code>docs/BACKEND.md</code>. To try the panel without any account,
        build with <code>NEXT_PUBLIC_BACKEND=demo</code>; data then stays in your browser only.
      </p>
    </div>
  );
}
