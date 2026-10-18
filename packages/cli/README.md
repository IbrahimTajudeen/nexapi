# @nyxapi/cli

The `nyx` command: generate typed clients from **OpenAPI 3.x, Swagger 2.0 or GraphQL**.

```bash
npm install -g @nyxapi/cli     # then use `nyx` directly (`nyxapi` still works as an alias)

nyx init                       # writes nyx.config.json
nyx generate                   # reads the config, writes the client
nyx generate --watch           # regenerate on every change
nyx generate --check           # CI: fail when generated files are stale
nyx validate ./openapi.yaml
nyx --version
```

Or per project, without a global install: `npm i -D @nyxapi/cli` and `npx nyx generate`.

```bash
nyx generate --input ./openapi.yaml --output ./src/api
nyx generate --input ./schema.graphql --output ./src/gql
nyx generate --input https://api.example.com/graphql --kind graphql   # introspects the endpoint
```

Reads `nyx.config.json` (or the older `nyxapi.config.json`, or `--config`). The input kind is detected from the file; force it with `--kind`. Remote schemas are fetched only when passed explicitly with `--input <url>`, with a 10 MB cap, at most 5 redirects and no https→http downgrade; `--header "Name: value"` credentials are never logged or sent to another origin. Generated REST code imports `@nyxapi/core`; generated GraphQL code imports `@nyxapi/graphql`.
