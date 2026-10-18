# @nexapi/cli

```bash
npx nexapi generate --input ./openapi.yaml --output ./src/api
npx nexapi generate --check     # CI: fail when generated files are stale
npx nexapi validate ./openapi.yaml
```

Reads `nexapi.config.json` (or `--config`). Remote schemas are fetched only when passed explicitly with `--input <url>`. Generated code imports `@nexapi/core`; add it to your project. Pre-1.0.
