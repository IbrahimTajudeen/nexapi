# @nyxapi/codegen

OpenAPI 3.x parser, normalized API model (`ApiModel`) and deterministic TypeScript generator behind `@nyxapi/cli`. Use it directly to generate in a build script:

```ts
import { generate } from "@nyxapi/codegen";

const { files, diagnostics } = generate(schemaText, { validation: true });
```

`generate` throws `GenerationError` with every problem found; warnings are returned. Generated code imports `@nyxapi/core`, which your project must depend on. Pre-1.0.
