# @nyxapi/codegen

Schema parsers, the normalized API model and the deterministic TypeScript generators behind `@nyxapi/cli`. Reads OpenAPI 3.0/3.1, Swagger 2.0 (converted to OpenAPI 3 first) and GraphQL (SDL or introspection JSON). Use it directly in a build script:

```ts
import { generateFrom } from "@nyxapi/codegen";

const { files, diagnostics } = await generateFrom(schemaText, { validation: true });
```

`generateFrom` detects the schema kind (or honor `config.kind`) and is async because GraphQL support loads the `graphql` package on demand. The synchronous `generate(text, config)` handles OpenAPI/Swagger only. For GraphQL pass your own operations with `generateFrom(sdl, config, { documents: [{ name, text }] })`.

Both throw `GenerationError` with every problem found; warnings are returned. The config format is described by `@nyxapi/codegen/config.schema.json`. Generated REST code imports `@nyxapi/core`; generated GraphQL code imports `@nyxapi/graphql`.
