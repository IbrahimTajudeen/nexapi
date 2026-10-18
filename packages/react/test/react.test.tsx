// @vitest-environment jsdom
import { Component, StrictMode, Suspense, act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToPipeableStream, renderToString } from "react-dom/server";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createNexClient,
  dehydrate,
  hydrate,
  keepPreviousData,
  type NexClient,
  type QueryOptions,
  type Transport,
} from "@nexapi/core";
import { createApi } from "../../../examples/basic/generated/index.js";
import {
  NexProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Rig {
  nex: NexClient;
  api: ReturnType<typeof createApi>;
  requests: { method: string; path: string; signal: AbortSignal }[];
  users: Record<string, { id: string; name: string; role: "admin" | "member" }>;
  delay: number;
}

function makeRig(): Rig {
  const rig: Rig = {
    requests: [],
    users: {
      "1": { id: "1", name: "Ada", role: "admin" },
      "2": { id: "2", name: "Linus", role: "member" },
    },
    delay: 0,
    nex: undefined as never,
    api: undefined as never,
  };
  const transport: Transport = async (req) => {
    const url = new URL(req.url);
    rig.requests.push({ method: req.method, path: url.pathname, signal: req.signal });
    if (rig.delay) await new Promise((r) => setTimeout(r, rig.delay));
    const id = /\/users\/(.+)$/.exec(url.pathname)?.[1];
    const user = id ? rig.users[id] : undefined;
    if (req.method === "PATCH" && user) {
      const body = (await req.json()) as { name?: string };
      if (body.name === "")
        return Response.json({ code: "invalid", message: "empty" }, { status: 422 });
      Object.assign(user, body);
      return Response.json(user);
    }
    return user
      ? Response.json(user)
      : Response.json({ code: "not_found", message: "x" }, { status: 404 });
  };
  rig.nex = createNexClient({
    baseUrl: "https://api.test/v1",
    transport,
    queryClient: { defaultOptions: { queries: { retry: false } } },
  });
  rig.api = createApi(rig.nex);
  return rig;
}

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const render = (el: ReactElement): Promise<void> => act(async () => root.render(el));
const settle = (ms = 15): Promise<void> =>
  act(async () => void (await new Promise((r) => setTimeout(r, ms))));

describe("useQuery", () => {
  it("renders loading then data, with one request", async () => {
    const rig = makeRig();
    rig.delay = 20;
    const seen: string[] = [];
    function User(): ReactElement {
      const q = useQuery(rig.api.users.byId("1").get.options());
      seen.push(`${q.status}/${q.fetchStatus}`);
      return <p>{q.data ? q.data.name : "loading"}</p>;
    }
    await render(<User />);
    expect(host.textContent).toBe("loading");
    await settle(120);
    expect(host.textContent).toBe("Ada");
    expect(rig.requests).toHaveLength(1);
    expect(seen[0]).toBe("pending/fetching"); // no idle flash on first render
    expect(seen.at(-1)).toBe("success/idle");
  });

  it("issues a single request under Strict Mode and for several components sharing a key", async () => {
    const rig = makeRig();
    function User({ tag }: { tag: string }): ReactElement {
      const q = useQuery(rig.api.users.byId("1").get.options());
      return <i data-tag={tag}>{q.data?.name ?? "…"}</i>;
    }
    await render(
      <StrictMode>
        <User tag="a" />
        <User tag="b" />
      </StrictMode>,
    );
    await settle();
    expect(host.textContent).toBe("AdaAda");
    expect(rig.requests).toHaveLength(1);
    expect(rig.requests[0]?.signal.aborted).toBe(false);
  });

  it("follows key changes without showing the previous key's data", async () => {
    const rig = makeRig();
    const names: (string | undefined)[] = [];
    function User({ id }: { id: string }): ReactElement {
      const q = useQuery(rig.api.users.byId(id).get.options());
      names.push(q.data?.name);
      return <p>{q.data?.name ?? "loading"}</p>;
    }
    await render(<User id="1" />);
    await settle();
    rig.delay = 30;
    names.length = 0;
    await render(<User id="2" />);
    expect(host.textContent).toBe("loading"); // new key starts pending, not "Ada"
    expect(names).not.toContain("Ada");
    await settle(150);
    expect(host.textContent).toBe("Linus");
    expect(rig.requests.map((r) => r.path)).toEqual(["/v1/users/1", "/v1/users/2"]);
  });

  it("keepPreviousData keeps the old key's data visible, flagged as placeholder, until the new key lands", async () => {
    const rig = makeRig();
    const seen: string[] = [];
    function User({ id }: { id: string }): ReactElement {
      const q = useQuery(
        rig.api.users.byId(id).get.options(undefined, { placeholderData: keepPreviousData }),
      );
      seen.push(`${q.data?.name ?? "none"}${q.isPlaceholder ? "*" : ""}`);
      return <p>{q.data?.name ?? "loading"}</p>;
    }
    await render(<User id="1" />);
    await settle();
    rig.delay = 30;
    seen.length = 0;
    await render(<User id="2" />);
    expect(host.textContent).toBe("Ada");
    await settle(150);
    expect(host.textContent).toBe("Linus");
    expect(seen[0]).toBe("Ada*");
    expect(seen.at(-1)).toBe("Linus");
  });

  it("aborts the request when the last subscriber unmounts mid-flight, but not before", async () => {
    const rig = makeRig();
    rig.delay = 50;
    function User(): ReactElement {
      const q = useQuery(rig.api.users.byId("1").get.options());
      return <p>{q.data?.name ?? "…"}</p>;
    }
    function App({ show }: { show: number }): ReactElement {
      return (
        <>
          {Array.from({ length: show }, (_, i) => (
            <User key={i} />
          ))}
        </>
      );
    }
    await render(<App show={2} />);
    await render(<App show={1} />);
    expect(rig.requests[0]?.signal.aborted).toBe(false); // one subscriber still needs it
    await render(<App show={0} />);
    await settle(5);
    expect(rig.requests[0]?.signal.aborted).toBe(true);
    expect(rig.nex.queryClient.isFetching()).toBe(0);
  });

  it("always uses the latest queryFn closure (no stale closures)", async () => {
    const rig = makeRig();
    const calls: string[] = [];
    function Probe({ label }: { label: string }): ReactElement {
      const q = useQuery<string, Error>({
        queryKey: ["probe"],
        queryFn: () => (calls.push(label), Promise.resolve(label)),
        queryClient: rig.nex.queryClient,
        staleTime: Infinity,
      });
      return <p>{q.data}</p>;
    }
    await render(<Probe label="first" />);
    await settle();
    expect(host.textContent).toBe("first");
    await render(<Probe label="second" />); // same key, new closure; fresh data → no refetch yet
    expect(calls).toEqual(["first"]);
    await act(async () => rig.nex.queryClient.invalidateQueries(["probe"])); // e.g. triggered by a mutation
    await settle();
    expect(calls).toEqual(["first", "second"]);
    expect(host.textContent).toBe("second");
  });

  it("re-renders only for the fields in notifyOn, and select narrows what changes", async () => {
    const rig = makeRig();
    let renders = 0;
    function Name(): ReactElement {
      renders++;
      const q = useQuery(
        rig.api.users
          .byId("1")
          .get.options(undefined, { select: (u) => u.name, notifyOn: ["data", "status"] }),
      );
      return <p>{q.data ?? "…"}</p>;
    }
    await render(<Name />);
    await settle();
    expect(host.textContent).toBe("Ada");
    const settled = renders;
    rig.users["1"] = { id: "1", name: "Ada", role: "member" }; // different object, same selected name
    await act(async () => rig.nex.queryClient.invalidateQueries());
    await settle();
    expect(renders).toBe(settled); // fetchStatus flips and the identical selected value did not wake the component
    rig.users["1"] = { id: "1", name: "Grace", role: "member" };
    await act(async () => rig.nex.queryClient.invalidateQueries());
    await settle();
    expect(host.textContent).toBe("Grace");
  });

  it("works with hand-written options through <NexProvider>, and refuses to guess a client", async () => {
    const rig = makeRig();
    const options: QueryOptions<string> = {
      queryKey: ["x"],
      queryFn: () => Promise.resolve("from provider"),
    };
    function Plain(): ReactElement {
      return <p>{useQuery(options).data ?? "…"}</p>;
    }
    await render(
      <NexProvider client={rig.nex.queryClient}>
        <Plain />
      </NexProvider>,
    );
    await settle();
    expect(host.textContent).toBe("from provider");

    await act(async () => root.unmount());
    root = createRoot(host);
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent): void => (e.preventDefault(), void errors.push(e.error));
    window.addEventListener("error", onError);
    class Boundary extends (await import("react")).Component<
      { children: ReactElement },
      { e?: Error }
    > {
      override state: { e?: Error } = {};
      static getDerivedStateFromError(e: Error): { e: Error } {
        return { e };
      }
      override render(): ReactElement {
        return <p>{this.state.e ? this.state.e.message : this.props.children}</p>;
      }
    }
    await render(
      <Boundary>
        <Plain />
      </Boundary>,
    );
    window.removeEventListener("error", onError);
    expect(host.textContent).toContain("No QueryClient found");
  });
});

describe("useMutation", () => {
  it("exposes status, supports optimistic UI in another component and rolls back on failure", async () => {
    const rig = makeRig();
    let mutate!: ReturnType<typeof useMutation<unknown, Error, { name: string }>>["mutate"];
    const statuses: string[] = [];
    function Name(): ReactElement {
      const q = useQuery(rig.api.users.byId("1").get.options(undefined, { staleTime: Infinity }));
      return <p id="name">{q.data?.name ?? "…"}</p>;
    }
    function Editor(): ReactElement {
      const m = useMutation(
        rig.api.users.byId("1").patch.options(undefined, {
          onMutate: (vars, { optimistic }) =>
            void optimistic<{ name: string }>(rig.api.users.byId("1").get.key(), (old) =>
              old ? { ...old, ...vars } : undefined,
            ),
        }),
      );
      mutate = m.mutate as typeof mutate;
      statuses.push(m.status);
      return <p id="status">{m.status}</p>;
    }
    await render(
      <>
        <Name />
        <Editor />
      </>,
    );
    await settle();
    rig.delay = 30;
    await act(async () => mutate({ name: "Optimistic" }));
    expect(host.querySelector("#status")?.textContent).toBe("pending");
    expect(host.querySelector("#name")?.textContent).toBe("Optimistic");
    await settle(150);
    expect(host.querySelector("#status")?.textContent).toBe("success");

    await act(async () => mutate({ name: "" })); // server rejects with 422
    expect(host.querySelector("#name")?.textContent).toBe(""); // optimistic value shown while pending
    await settle(150);
    expect(host.querySelector("#status")?.textContent).toBe("error");
    expect(host.querySelector("#name")?.textContent).toBe("Optimistic"); // rolled back to confirmed
    expect(statuses).toContain("pending");
  });

  it("keeps a stable mutate function across renders", async () => {
    const rig = makeRig();
    const fns = new Set<unknown>();
    function M(): ReactElement {
      const m = useMutation(rig.api.users.byId("1").patch.options());
      fns.add(m.mutate);
      return <p>{m.status}</p>;
    }
    await render(<M />);
    await render(<M />);
    expect(fns.size).toBe(1);
  });
});

describe("server rendering", () => {
  it("hydrates a dehydrated server cache so the client renders data with no request", async () => {
    const server = makeRig();
    await server.api.users.byId("1").get.prefetch();
    const payload = JSON.stringify(dehydrate(server.nex.queryClient)).replace(/</g, "\\u003c");

    const browser = makeRig();
    hydrate(browser.nex.queryClient, JSON.parse(payload));
    function User(): ReactElement {
      const q = useQuery(browser.api.users.byId("1").get.options(undefined, { staleTime: 60_000 }));
      return <p>{q.data?.name ?? "loading"}</p>;
    }
    expect(renderToString(<User />)).toContain("Ada"); // first paint already has the data
    await render(<User />);
    await settle();
    expect(host.textContent).toBe("Ada");
    expect(browser.requests).toHaveLength(0); // fresh: not refetched
  });

  it("renders pending without fetching, and never shares a cache between requests", async () => {
    const alice = makeRig();
    const bob = makeRig();
    alice.users["1"] = { id: "1", name: "Alice's view", role: "admin" };
    function User({ rig }: { rig: Rig }): ReactElement {
      const q = useQuery(rig.api.users.byId("1").get.options());
      return <p>{q.data?.name ?? "loading"}</p>;
    }
    expect(renderToString(<User rig={alice} />)).toContain("loading");
    expect(alice.requests).toHaveLength(0); // effects (and therefore fetches) never run on the server

    await alice.api.users.byId("1").get.prefetch(); // e.g. a route loader for this request
    expect(renderToString(<User rig={alice} />)).toContain("Alice&#x27;s view");
    expect(renderToString(<User rig={bob} />)).toContain("loading"); // bob's client never saw alice's data
    expect(bob.requests).toHaveLength(0);
  });
});

describe("useInfiniteQuery", () => {
  it("renders pages, loads more on demand and keeps a stable fetchNextPage", async () => {
    const rig = makeRig();
    const fns = new Set<unknown>();
    function Feed(): ReactElement {
      const q = useInfiniteQuery<{ n: number; next: number | null }, Error, number>({
        queryKey: ["feed"],
        queryFn: ({ pageParam }) =>
          Promise.resolve({ n: pageParam, next: pageParam < 2 ? pageParam + 1 : null }),
        initialPageParam: 0,
        getNextPageParam: (last) => last.next,
        queryClient: rig.nex.queryClient,
        retry: false,
      });
      fns.add(q.fetchNextPage);
      return (
        <div>
          <p id="items">{q.data?.pages.map((p) => p.n).join(",") ?? "…"}</p>
          <button
            disabled={!q.hasNextPage || q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            more
          </button>
        </div>
      );
    }
    await render(<Feed />);
    await settle();
    expect(host.querySelector("#items")?.textContent).toBe("0");
    const button = host.querySelector("button");
    await act(async () => {
      void rig.api.users.byId("9").get.invalidate(); // what a boundary's reset handler does
      button?.click();
    });
    await settle();
    await act(async () => button?.click());
    await settle();
    expect(host.querySelector("#items")?.textContent).toBe("0,1,2");
    expect(button?.disabled).toBe(true); // no next page
    expect(fns.size).toBe(1);
  });
});

class Boundary extends Component<
  { children: ReactNode; onError?: (e: unknown) => void },
  { error: unknown; failed: boolean }
> {
  override state = { error: undefined as unknown, failed: false };
  static getDerivedStateFromError(error: unknown): { error: unknown; failed: boolean } {
    return { error, failed: true };
  }
  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error);
  }
  reset = (): void => this.setState({ error: undefined, failed: false });
  override render(): ReactNode {
    return this.state.failed ? (
      <button onClick={this.reset}>failed: {(this.state.error as Error).name}</button>
    ) : (
      this.props.children
    );
  }
}

describe("useSuspenseQuery", () => {
  it("shows the fallback until the first data arrives, then renders defined data with one request", async () => {
    const rig = makeRig();
    rig.delay = 20;
    function User({ id }: { id: string }): ReactElement {
      const q = useSuspenseQuery(rig.api.users.byId(id).get.options());
      return <p>{q.data.name.toUpperCase()}</p>;
    }
    await render(
      <Suspense fallback={<i>loading</i>}>
        <User id="1" />
        <User id="1" />
      </Suspense>,
    );
    expect(host.textContent).toBe("loading");
    await settle(80);
    expect(host.textContent).toBe("ADAADA");
    expect(rig.requests).toHaveLength(1); // both components shared one run
  });

  it("does not suspend on cached data, even stale; refetches in the background", async () => {
    const rig = makeRig();
    rig.nex.queryClient.buildQuery({
      queryKey: rig.api.users.byId("1").get.key(),
      initialData: { id: "1", name: "Cached", role: "admin" },
      initialDataUpdatedAt: 1, // long ago, so stale
    });
    rig.users["1"] = { id: "1", name: "Fresh", role: "admin" };
    rig.delay = 20;
    function User(): ReactElement {
      const q = useSuspenseQuery(rig.api.users.byId("1").get.options());
      return <p>{q.data.name}</p>;
    }
    await render(
      <Suspense fallback={<i>loading</i>}>
        <User />
      </Suspense>,
    );
    expect(host.textContent).toBe("Cached");
    await settle(80);
    expect(host.textContent).toBe("Fresh");
  });

  it("throws a failed first load to the error boundary; invalidating then resetting retries once", async () => {
    const rig = makeRig();
    const caught: unknown[] = [];
    function User({ id }: { id: string }): ReactElement {
      const q = useSuspenseQuery(rig.api.users.byId(id).get.options());
      return <p>{q.data.name}</p>;
    }
    await render(
      <Boundary onError={(e) => caught.push(e)}>
        <Suspense fallback={<i>loading</i>}>
          <User id="9" />
        </Suspense>
      </Boundary>,
    );
    await settle(30);
    expect(host.textContent).toBe("failed: HttpError");
    expect(caught).toHaveLength(1);
    const before = rig.requests.length;

    rig.users["9"] = { id: "9", name: "Now exists", role: "member" };
    const button = host.querySelector("button");
    await act(async () => {
      void rig.api.users.byId("9").get.invalidate(); // what a boundary's reset handler does
      button?.click();
    });
    await settle(30);
    expect(host.textContent).toBe("Now exists");
    expect(rig.requests.length).toBe(before + 1); // exactly one retry
  });

  it("a failed background refetch keeps rendering the data and does not throw", async () => {
    const rig = makeRig();
    function User(): ReactElement {
      const q = useSuspenseQuery({
        ...rig.api.users.byId("1").get.options(undefined, { staleTime: 0 }),
      });
      return <p>{q.data.name}</p>;
    }
    await render(
      <Boundary>
        <Suspense fallback={<i>loading</i>}>
          <User />
        </Suspense>
      </Boundary>,
    );
    await settle(30);
    expect(host.textContent).toBe("Ada");
    delete rig.users["1"]; // the next refetch 404s
    await act(
      async () =>
        void (await rig.nex.queryClient.refetchQueries({ queryKey: [] }).catch(() => undefined)),
    );
    await settle(30);
    expect(host.textContent).toBe("Ada");
  });

  it("streaming SSR waits for the data on the server, in the request's own client", async () => {
    const rig = makeRig();
    rig.delay = 10;
    function User(): ReactElement {
      const q = useSuspenseQuery(rig.api.users.byId("1").get.options());
      return <p>{q.data.name}</p>;
    }
    const html = await new Promise<string>((resolve, reject) => {
      let out = "";
      const sink = new Writable({
        write(chunk: Buffer, _enc, done) {
          out += chunk.toString("utf8");
          done();
        },
        final(done) {
          resolve(out);
          done();
        },
      });
      const stream = renderToPipeableStream(
        <NexProvider client={rig.nex.queryClient}>
          <Suspense fallback={<i>loading</i>}>
            <User />
          </Suspense>
        </NexProvider>,
        { onAllReady: () => stream.pipe(sink), onError: reject },
      );
    });
    expect(html).toContain("<p>Ada</p>");
    expect(html).not.toContain("loading");
    expect(rig.requests).toHaveLength(1);
  });
});

describe("useSuspenseInfiniteQuery", () => {
  type FeedPage = { n: number; next: number | null };
  const feedOptions = (
    rig: Rig,
    calls: number[],
    fail = { on: false },
  ): Parameters<typeof useSuspenseInfiniteQuery<FeedPage, Error, number>>[0] => ({
    queryKey: ["suspense-feed"],
    queryFn: async ({ pageParam }) => {
      calls.push(pageParam);
      await new Promise((r) => setTimeout(r, 10));
      if (fail.on) throw new Error("down");
      return { n: pageParam, next: pageParam < 2 ? pageParam + 1 : null };
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.next,
    queryClient: rig.nex.queryClient,
    retry: false,
  });

  it("suspends for the first page (one request for siblings), then pages load without suspending", async () => {
    const rig = makeRig();
    const calls: number[] = [];
    const options = feedOptions(rig, calls);
    function Feed(): ReactElement {
      const q = useSuspenseInfiniteQuery(options);
      return (
        <div>
          <p id="items">{q.data.pages.map((p) => p.n).join(",")}</p>
          <button disabled={!q.hasNextPage} onClick={() => void q.fetchNextPage()}>
            more
          </button>
        </div>
      );
    }
    await render(
      <Suspense fallback={<i>loading</i>}>
        <Feed />
        <Feed />
      </Suspense>,
    );
    expect(host.textContent).toBe("loading");
    await settle(60);
    expect(host.querySelector("#items")?.textContent).toBe("0");
    expect(calls).toEqual([0]);
    await act(async () => host.querySelector("button")?.click());
    expect(host.textContent).not.toContain("loading"); // loading more never falls back
    await settle(60);
    expect(host.querySelector("#items")?.textContent).toBe("0,1");
  });

  it("throws a failed first page to the error boundary; invalidate then reset retries", async () => {
    const rig = makeRig();
    const calls: number[] = [];
    const fail = { on: true };
    const options = feedOptions(rig, calls, fail);
    function Feed(): ReactElement {
      const q = useSuspenseInfiniteQuery(options);
      return <p>{q.data.pages.length} page(s)</p>;
    }
    await render(
      <Boundary>
        <Suspense fallback={<i>loading</i>}>
          <Feed />
        </Suspense>
      </Boundary>,
    );
    await settle(60);
    expect(host.textContent).toBe("failed: Error");
    expect(calls).toEqual([0]);
    fail.on = false;
    await act(async () => {
      void rig.nex.queryClient.invalidateQueries({ queryKey: ["suspense-feed"] });
      host.querySelector("button")?.click();
    });
    await settle(60);
    expect(host.textContent).toBe("1 page(s)");
    expect(calls).toEqual([0, 0]);
  });
});
