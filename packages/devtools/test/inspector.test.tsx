// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NyxProvider } from "@nyxapi/react";
import { QueryClient } from "@nyxapi/core";
import { createInspector } from "@nyxapi/devtools";
import { NyxDevtools } from "@nyxapi/devtools/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const newClient = (): QueryClient => new QueryClient();
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("createInspector", () => {
  it("reports rows without data, logs events, and batches notifications", async () => {
    const client = newClient();
    const inspector = createInspector(client);
    const listener = vi.fn();
    inspector.subscribe(listener);
    await client.fetchQuery({
      queryKey: ["users", { secret: "token-123" }],
      queryFn: () => Promise.resolve({ password: "hunter2" }),
      retry: false,
    });
    await tick();
    const snap = inspector.snapshot();
    expect(snap.queries).toHaveLength(1);
    expect(snap.queries[0]).toMatchObject({
      status: "success",
      hasData: true,
      fetchStatus: "idle",
    });
    expect(JSON.stringify(snap)).not.toContain("hunter2");
    expect(snap.events.map((e) => e.type)).toEqual(expect.arrayContaining(["added", "success"]));
    expect(listener.mock.calls.length).toBeLessThan(snap.events.length + 1);
    expect(inspector.snapshot()).toBe(snap); // stable until a change
    inspector.dispose();
  });

  it("records errors, applies redact, and supports invalidate/remove", async () => {
    const client = newClient();
    const inspector = createInspector(client, { redact: () => "[hidden]" });
    await client
      .fetchQuery({
        queryKey: ["bad"],
        queryFn: () => Promise.reject(new Error("boom")),
        retry: false,
      })
      .catch(() => undefined);
    await client.fetchQuery({ queryKey: ["ok"], queryFn: () => Promise.resolve(1), retry: false });
    const rows = inspector.snapshot().queries;
    expect(rows.find((r) => r.status === "error")?.error).toEqual({
      name: "Error",
      message: "boom",
    });
    const ok = rows.find((r) => r.status === "success");
    if (!ok) throw new Error("no row");
    expect(inspector.inspectData(ok.hash)).toBe("[hidden]");
    await inspector.invalidate(ok.hash);
    inspector.remove(ok.hash);
    expect(inspector.snapshot().queries.some((r) => r.hash === ok.hash)).toBe(false);
    expect(inspector.snapshot().events.at(-1)?.type).toBe("removed");
    inspector.dispose();
  });

  it("bounds the event log", async () => {
    const client = newClient();
    const inspector = createInspector(client, { maxEvents: 3 });
    for (let i = 0; i < 5; i++)
      await client.fetchQuery({
        queryKey: ["k", i],
        queryFn: () => Promise.resolve(i),
        retry: false,
      });
    expect(inspector.snapshot().events).toHaveLength(3);
    inspector.dispose();
  });
});

describe("NyxDevtools", () => {
  let host: HTMLElement | undefined;
  afterEach(() => {
    host?.remove();
    vi.unstubAllEnvs();
  });

  const mount = async (el: React.ReactElement): Promise<void> => {
    host = document.createElement("div");
    document.body.append(host);
    await act(async () => createRoot(host as HTMLElement).render(el));
  };

  it("lists queries, shows data only on request, and removes rows", async () => {
    const client = newClient();
    await client.fetchQuery({
      queryKey: ["a"],
      queryFn: () => Promise.resolve({ v: 1 }),
      retry: false,
    });
    await mount(
      <NyxProvider client={client}>
        <NyxDevtools defaultOpen />
      </NyxProvider>,
    );
    const panel = host?.querySelector('[data-testid="nyx-devtools"]');
    expect(panel?.textContent).toContain('["a"]');
    expect(host?.querySelector('[data-testid="nyx-devtools-data"]')).toBeNull();
    const button = (name: string): HTMLButtonElement | undefined =>
      [...(host?.querySelectorAll("button") ?? [])].find((b) => b.textContent === name);
    await act(async () => button("data")?.click());
    expect(host?.querySelector('[data-testid="nyx-devtools-data"]')?.textContent).toContain(
      '"v": 1',
    );
    await act(async () => button("remove")?.click());
    expect(client.findAll()).toHaveLength(0);
  });

  it("renders nothing in production unless forced", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const client = newClient();
    await mount(<NyxDevtools client={client} defaultOpen />);
    expect(host?.innerHTML).toBe("");
    await act(async () => void 0);
    host?.remove();
    await mount(<NyxDevtools client={client} defaultOpen force />);
    expect(host?.querySelector('[data-testid="nyx-devtools"]')).not.toBeNull();
  });
});
