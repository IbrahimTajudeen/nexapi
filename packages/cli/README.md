# @nyxapi/cli

```bash
npx nyxapi generate --input ./openapi.yaml --output ./src/api
npx nyxapi generate --check     # CI: fail when generated files are stale
npx nyxapi validate ./openapi.yaml
```

Reads `nyxapi.config.json` (or `--config`). Remote schemas are fetched only when passed explicitly with `--input <url>`. Generated code imports `@nyxapi/core`; add it to your project. Pre-1.0.
