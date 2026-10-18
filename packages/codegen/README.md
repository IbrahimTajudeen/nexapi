# @syncapi/codegen

OpenAPI 3.x parser, normalized API model (`ApiModel`) and deterministic TypeScript generator behind `@syncapi/cli`. Use it directly to generate in a build script:

```ts
import { generate } from "@syncapi/codegen";

const { files, diagnostics } = generate(schemaText, { validation: true });
```

`generate` throws `GenerationError` with every problem found; warnings are returned. Generated code imports `@syncapi/core`, which your project must depend on. Pre-1.0.
