import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Doc, H2, H3, Table } from "@/components/Doc";

export const metadata: Metadata = { title: "API reference" };

const c = (text: string, key?: string) => <code key={key ?? text}>{text}</code>;

export default function Page() {
  return (
    <Doc
      href="/docs/api/"
      title="API reference"
      lede="Every public member of the core engine in one place: the query client, the generated endpoint objects, the errors and the request settings. Each guide links back here for the exact shape."
    >
      <Callout kind="read" title="Where each thing lives">
        Everything on this page is exported from <code>@nyxapi/core</code>. GraphQL and tRPC add
        their own clients on top of it; see <a href="/docs/graphql/">GraphQL</a> and{" "}
        <a href="/docs/trpc/">tRPC</a>.
      </Callout>

      <H2>The query client</H2>
      <p>
        <code>nyx.queryClient</code> (or <code>new QueryClient(options)</code>) owns one isolated
        cache. Create one per user or request on a server; nothing is global.
      </p>
      <H3>Constructor options</H3>
      <Table
        head={["Option", "Type", "Meaning"]}
        rows={[
          [
            c("defaultOptions.queries"),
            c("QueryDefaults"),
            "Defaults under every query: staleTime, gcTime, enabled, retry, retryDelay, refetchOnMount, refetchOnWindowFocus, refetchOnReconnect, structuralSharing.",
          ],
          [
            c("focusManager"),
            c("FocusManager"),
            "Tells the cache when the window regains focus. Replace it in tests or non-browser runtimes.",
          ],
          [
            c("onlineManager"),
            c("OnlineManager"),
            "Tells the cache whether the network is up. Drives networkMode and refetchOnReconnect.",
          ],
          [
            c("onUpdaterError"),
            c("(error) => void"),
            "Called when an optimistic or cache updater throws. The broken patch is skipped and the cache stays consistent.",
          ],
        ]}
      />
      <H3>Methods</H3>
      <Table
        head={["Member", "Returns", "What it does"]}
        rows={[
          [
            c("fetchQuery(options)"),
            c("Promise<TData>"),
            "Fresh cached data, or a fetch. Identical in-flight requests are shared (single flight). Rejects on failure.",
          ],
          [
            c("prefetchQuery(options)"),
            c("Promise<void>"),
            "Like fetchQuery but never rejects and returns nothing.",
          ],
          [
            c("getData(key)"),
            c("TData | undefined"),
            "The visible value: confirmed data with unsettled optimistic patches on top. Never fetches.",
          ],
          [
            c("setData(key, updater)"),
            c("TData | undefined"),
            "Write confirmed data, creating the entry if needed. A fetch that started earlier cannot overwrite it. Updaters see confirmed data, not patches.",
          ],
          [
            c("getQuery(key)"),
            c("Query | undefined"),
            "The cache entry itself: state, observers, options.",
          ],
          [c("findAll(target?)"), c("Query[]"), "Every entry matching a key prefix or a filter."],
          [
            c("invalidateQueries(target?)"),
            c("Promise<void>"),
            "Marks matching entries stale and refetches, and waits for, the ones being observed.",
          ],
          [
            c("refetchQueries(target?)"),
            c("Promise<void>"),
            "Refetches matching entries that know how to fetch themselves, observed or not.",
          ],
          [
            c("cancelQueries(target?)"),
            c("void"),
            "Aborts matching in-flight fetches. Data already cached is kept.",
          ],
          [c("removeQueries(target?)"), c("void"), "Deletes matching entries."],
          [
            c("clear()"),
            c("void"),
            "Deletes every entry. Observers keep working and re-create entries on next use.",
          ],
          [
            c("isFetching(target?)"),
            c("number"),
            "How many matching entries are fetching right now.",
          ],
          [c("isMutating()"), c("number"), "How many mutations are in flight."],
          [
            c("optimistic(target, updater)"),
            c("OptimisticTransaction"),
            "Layers a change over matching entries that hold data. Each call is its own transaction with rollback() and commit().",
          ],
          [
            c("mutate(options, variables)"),
            c("Promise<TData>"),
            "Runs a mutation through its lifecycle: onMutate, request, onSuccess or onError, onSettled, invalidation.",
          ],
          [
            c("subscribeCache(listener)"),
            c("() => void"),
            "Called with added, updated and removed events. Returns an unsubscribe function.",
          ],
          [
            c("mutationCache"),
            c("MutationCache"),
            "Tracks in-flight mutations: size, getAll(), subscribe().",
          ],
          [c("size"), c("number"), "Number of entries in the cache."],
          [
            c("dispose()"),
            c("void"),
            "Detaches focus and online listeners. Call when a client is discarded.",
          ],
        ]}
      />
      <H3>Filters</H3>
      <p>
        Anywhere a method takes <code>target</code> you can pass a key (a prefix match) or a filter
        object:
      </p>
      <Table
        head={["Field", "Meaning"]}
        rows={[
          [c("queryKey"), "Prefix match by default."],
          [c("exact"), "true: the key must match exactly."],
          [c("active"), "true: only observed entries. false: only unobserved ones."],
          [c("predicate"), "A function receiving the Query; return true to include it."],
        ]}
      />

      <H2>Endpoint objects</H2>
      <p>
        Generated clients expose one of two shapes per operation. A GET is a query endpoint; every
        other method is a mutation endpoint.
      </p>
      <H3>Query endpoints (GET)</H3>
      <Table
        head={["Member", "What it does"]}
        rows={[
          [c("endpoint(request?)"), "Runs the request directly, without the cache."],
          [
            c("endpoint.options(request?, config?)"),
            "Builds query options for fetchQuery or useQuery. config accepts every query option, including select.",
          ],
          [
            c("endpoint.key(request?)"),
            "The typed cache key. Without a request it is the prefix shared by every variant.",
          ],
          [
            c("endpoint.prefetch(request?, config?)"),
            "Fetches into the cache if not fresh; never rejects.",
          ],
          [
            c("endpoint.invalidate(request?)"),
            "Invalidates one variant, or all variants without a request, and refetches observed ones.",
          ],
        ]}
      />
      <H3>Mutation endpoints (POST, PUT, PATCH, DELETE)</H3>
      <Table
        head={["Member", "What it does"]}
        rows={[
          [
            c("endpoint(body?, request?)"),
            "Runs the request directly. The body comes first when the operation has one.",
          ],
          [
            c("endpoint.options(request?, config?)"),
            "Builds mutation options. The body is supplied later as the mutation variables. config accepts every mutation option.",
          ],
          [c("endpoint.key()"), "The mutation key, also usable as a filter prefix."],
        ]}
      />
      <p>
        Direct calls also accept <code>{"{ signal }"}</code> to cancel the request. The signal is
        never part of a cache key.
      </p>

      <H2>Request settings</H2>
      <p>
        Generated endpoints fill these in for you. They matter when you call{" "}
        <code>client.http.request(spec)</code> directly, or when a generated option names one.
      </p>
      <Table
        head={["Field", "Type", "Meaning"]}
        rows={[
          [c("method"), c("HttpMethod"), "get, post, put, patch, delete, head or options."],
          [
            c("path"),
            c("string"),
            "Template such as /users/{id}. Path values are strictly encoded; empty, . and .. are rejected.",
          ],
          [
            c("params"),
            c("Record<string, string | number | boolean>"),
            "Values for the path placeholders.",
          ],
          [
            c("query"),
            c("Record<string, unknown>"),
            "Primitives, Dates and arrays of them. undefined and null are skipped; non-finite numbers are rejected.",
          ],
          [
            c("queryStyles"),
            c("Record<string, QueryStyle>"),
            "csv, space, pipe or deepObject per parameter. The default repeats the parameter (a=1&a=2).",
          ],
          [
            c("headers"),
            c("Record<string, string | number | boolean | undefined>"),
            "Per-request headers; an undefined value removes a client-level header.",
          ],
          [c("body"), c("unknown"), "The payload. Its encoding is set by bodyKind."],
          [
            c("bodyKind"),
            c('"json" | "form-data" | "urlencoded" | "binary" | "text"'),
            "How body is encoded. Default json.",
          ],
          [
            c("response"),
            c('"json" | "none" | "text" | "blob"'),
            "How a successful body is decoded. none ignores it (204 endpoints). Default json.",
          ],
          [c("signal"), c("AbortSignal"), "Cancels the request."],
          [c("timeoutMs"), c("number"), "Per-request timeout, overriding the client default."],
        ]}
      />

      <H2>Errors</H2>
      <p>
        Everything NyxAPI raises itself extends <code>NyxError</code>. Errors carry the method and a
        sanitized URL (origin and path, never the query string), and never request headers or
        bodies, so logging one cannot leak a credential. Try each one in the{" "}
        <a href="/docs/errors/">failure explorer</a>.
      </p>
      <Table
        head={["Class", "Raised when", "Useful fields", "Default retry"]}
        rows={[
          [
            c("HttpError"),
            "The server answered with a non-2xx status.",
            "status, statusText, body, method, url",
            "5xx, 408 and 429 yes; other 4xx no",
          ],
          [c("NetworkError"), "No response at all (DNS, reset, CORS).", "cause", "Yes"],
          [c("TimeoutError"), "The request exceeded its timeout.", "timeoutMs", "Yes"],
          [c("ParseError"), "A 2xx body is not the expected format.", "status, cause", "No"],
          [
            c("ResponseValidationError"),
            "A 2xx body does not match its generated shape (validation on).",
            "issues: path, expected, received",
            "No",
          ],
          [
            c("RequestError"),
            "The request could not be built (bad path value, bad query value).",
            "message",
            "No",
          ],
          [c("ResponseTooLargeError"), "A body exceeded maxResponseBytes.", "limit", "Never"],
          [
            c("OperationError"),
            "A GraphQL or tRPC operation failed.",
            "protocol, code, details, retryable",
            "Only if retryable",
          ],
          [
            c("CancelledError"),
            "A query fetch was cancelled.",
            "message",
            "Not applicable: cancelling stops the fetch",
          ],
        ]}
      />
      <p>
        <code>NyxError.retryable</code> lets an error state its own retry behavior. When it is{" "}
        <code>undefined</code> the engine uses its defaults above; a numeric <code>retry</code>{" "}
        option ignores it.
      </p>

      <H2>Hydration</H2>
      <Table
        head={["Function", "What it does"]}
        rows={[
          [
            c("dehydrate(client, options?)"),
            "Serializes successful entries (confirmed data only; never errors, patches or in-flight work). options.shouldDehydrate filters entries.",
          ],
          [
            c("hydrate(client, state)"),
            "Loads dehydrated entries. Input is validated as untrusted, and an entry never replaces newer data.",
          ],
        ]}
      />
      <Callout kind="warn" title="Embedding state in HTML">
        When you put dehydrated state in a page, escape <code>&lt;</code> in the JSON, for example{" "}
        <code>{'JSON.stringify(state).replace(/</g, "\\\\u003c")'}</code>.
      </Callout>
    </Doc>
  );
}
