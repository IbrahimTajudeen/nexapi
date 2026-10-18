# @syncapi/cli

```bash
npx syncapi generate --input ./openapi.yaml --output ./src/api
npx syncapi generate --check     # CI: fail when generated files are stale
npx syncapi validate ./openapi.yaml
```

Reads `syncapi.config.json` (or `--config`). Remote schemas are fetched only when passed explicitly with `--input <url>`. Generated code imports `@syncapi/core`; add it to your project. Pre-1.0.
