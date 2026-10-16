# NexAPI

Schema-generated, fluent, fully typed API client with a standalone query/mutation engine (no React required) and a React adapter.

> **Status: 0.0.x, first vertical slice.** Not published to npm. See [ROADMAP.md](ROADMAP.md) for what is and isn't done, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) / [docs/API-DESIGN.md](docs/API-DESIGN.md) for the design and public contracts.

```ts
const user = await api.users.byId("42").get();
const session = await api.auth.login.post({ email: "dev@example.com", password: "secret" });
const page = await api.users.list.get({ query: { page: 1, limit: 20 } });

// React
const user = useQuery(api.users.byId(userId).get.options());
const update = useMutation(api.users.byId(userId).patch.options());
update.mutate({ name: "New name" });
```

## Try it

```bash
pnpm install
pnpm check                 # lint + typecheck + tests + build + generated-code drift check
pnpm generate:example      # fixtures/openapi/basic.yaml → examples/basic/generated/
pnpm bench                 # headless benchmarks (see benchmarks/README.md)
```

Generate your own client:

```bash
node packages/cli/dist/cli.js generate --input ./openapi.yaml --output ./src/api
node packages/cli/dist/cli.js generate --input https://example.com/openapi.json --output ./src/api   # remote only via explicit --input
node packages/cli/dist/cli.js validate ./openapi.yaml
node packages/cli/dist/cli.js generate --check     # CI: fail if generated files are stale
```

```ts
import { createNexClient } from "@nexapi/core";
import { createApi } from "./api/index.js";

const nex = createNexClient({
  baseUrl: "https://api.example.com/v1",
  getToken: () => session.token,
});
const api = createApi(nex); // one NexClient per user/request on the server
```

Without an OpenAPI schema nothing can be generated: a base URL alone does not reveal a server's routes. Hand-written endpoints are possible with `nex.query<…>()`/`nex.mutation<…>()`; adapters that produce the same normalized model from NestJS or ASP.NET Core are on the roadmap.

## Layout

`packages/{core,codegen,cli,react,devtools}` · `fixtures/openapi` · `examples/basic` · `tests` (end-to-end against a local HTTP server) · `benchmarks` · `docs`

## Requirements

Node ≥ 22.12 (ESM only), modern browsers. Development was verified on Node 22.22.0 with pnpm 10.28 and TypeScript 5.9 (TypeScript 7 is not yet supported by typescript-eslint).
