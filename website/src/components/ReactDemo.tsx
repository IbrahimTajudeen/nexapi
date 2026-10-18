"use client";
import { useEffect, useState } from "react";
import { HttpError } from "@nexapi/core";
import { NexProvider, useMutation, useQuery } from "@nexapi/react";
import { NexDevtools } from "@nexapi/devtools/react";
import { createEngine, type Engine } from "@/lib/engine";

function refusal(error: unknown): string {
  if (error instanceof HttpError) {
    const message = (error.body as { message?: unknown } | null)?.message;
    return typeof message === "string" ? message : `status ${String(error.status)}`;
  }
  return error instanceof Error ? error.message : "unknown error";
}

function Users({
  engine,
  selected,
  onSelect,
}: {
  engine: Engine;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const list = useQuery(engine.api.users.list.get.options(undefined, { staleTime: 30_000 }));
  if (list.isPending) return <p className="hint">Loading users…</p>;
  if (list.isError && !list.data)
    return <p role="alert">Could not load users: {list.error?.message}</p>;
  return (
    <div>
      {list.data?.items.map((u) => (
        <div className="user-row" key={u.id}>
          <button
            type="button"
            className="btn small"
            aria-pressed={selected === u.id}
            onClick={() => onSelect(u.id)}
          >
            {u.name}
          </button>
          <span className="badge">{u.role}</span>
        </div>
      ))}
    </div>
  );
}

function Detail({ engine, id }: { engine: Engine; id: string }) {
  const user = useQuery(engine.api.users.byId(id).get.options(undefined, { staleTime: 30_000 }));
  const [name, setName] = useState("");
  const key = engine.api.users.byId(id).get.key();
  const rename = useMutation(
    engine.api.users.byId(id).patch.options(undefined, {
      onMutate: (patch, { optimistic }) => {
        optimistic(key, (old: { name: string } | undefined) => (old ? { ...old, ...patch } : old));
      },
      invalidates: [key],
    }),
  );
  useEffect(() => setName(""), [id]);
  return (
    <div>
      <h3 style={{ marginBottom: 6 }}>
        {user.isPending ? "Loading…" : (user.data?.name ?? "Unknown")}{" "}
        {user.isFetching && <span className="badge live">fetching</span>}
        {rename.isPending && <span className="badge write">saving</span>}
      </h3>
      {user.isError && !user.data && <p role="alert">{user.error?.message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rename.mutate({ name });
          setName("");
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}
      >
        <label className="sr-only" htmlFor="rename-input">
          New name
        </label>
        <input
          id="rename-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New name (empty is rejected)"
          style={{
            flex: 1,
            minWidth: 180,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            color: "var(--ink)",
            font: "inherit",
          }}
        />
        <button type="submit" className="btn green small">
          Rename
        </button>
      </form>
      {rename.isError && (
        <p role="alert" className="hint" style={{ color: "#d14343" }}>
          The server refused: {refusal(rename.error)}. The optimistic name was rolled back.
        </p>
      )}
      <p className="hint">
        Rename shows the new name instantly (an optimistic patch), then the server confirms. Submit
        it empty to see the rollback.
      </p>
    </div>
  );
}

/** A real React app on @nexapi/react, talking to the in-browser mock API, with the devtools panel. */
export function ReactDemo() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [selected, setSelected] = useState("1");
  const [failing, setFailing] = useState(false);
  useEffect(() => {
    const e = createEngine();
    e.server.latency = 600;
    setEngine(e);
  }, []);
  if (!engine) return <p className="hint">Starting…</p>;
  return (
    <NexProvider client={engine.nex.queryClient}>
      <div className="demo-card">
        <div className="cta-row" style={{ marginBottom: 14 }}>
          <label className="check" style={{ color: "var(--muted)" }}>
            <input
              type="checkbox"
              checked={failing}
              onChange={(e) => {
                engine.server.failing = e.target.checked;
                setFailing(e.target.checked);
              }}
            />
            Server returns 500
          </label>
          <button
            type="button"
            className="btn small"
            onClick={() => void engine.nex.queryClient.invalidateQueries()}
          >
            Invalidate everything
          </button>
        </div>
        <div className="grid cols-2">
          <Users engine={engine} selected={selected} onSelect={setSelected} />
          <Detail engine={engine} id={selected} />
        </div>
      </div>
      <p className="hint">
        The panel in the corner is @nexapi/devtools, inspecting this demo&apos;s cache live.
      </p>
      <NexDevtools client={engine.nex.queryClient} force />
    </NexProvider>
  );
}
