# @nyxapi/trpc

Put a tRPC v11 client on the NyxAPI cache. Every procedure gets typed query keys, `options`, `prefetch`, `invalidate` and engine-backed mutations, with the same single-flight dedup, retries and optimistic updates as REST and GraphQL. Types are read from the client you pass in; there is no code generation and no tRPC import.

```ts
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createNyxTrpc } from "@nyxapi/trpc";
import type { AppRouter } from "./server";

const trpc = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/trpc" })] });
const { api, queryClient } = createNyxTrpc(trpc);

const user = await api.users.byId.query({ id: "1" });
await api.users.byId.query.prefetch({ id: "1" });
await queryClient.mutate(api.users.rename.mutate.options(), { id: "1", name: "Ada" });
await api.users.byId.query.invalidate({ id: "1" });
```

Failures become `TrpcError` (with `code` and `httpStatus`), retried only when transient (network, 408, 429, 5xx). Procedures without input take no argument (`api.ping.query()`).
