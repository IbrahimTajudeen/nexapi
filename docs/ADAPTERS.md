# Framework adapters: NestJS and ASP.NET Core

NexAPI generates from an OpenAPI 3.x document. Both frameworks already emit one, so the "adapter" is a
recipe plus tests that the generator copes with what they emit, not a second parser that reads framework
source. (An adapter that read controllers directly would have to re-implement each framework's routing,
DTO and validation rules and would drift from them; the OpenAPI output is the framework's own statement of
its contract.)

## NestJS (`@nestjs/swagger`)

Export the document at build time, then generate:

```ts
// scripts/export-openapi.ts
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { writeFileSync } from "node:fs";
import { AppModule } from "../src/app.module";

const app = await NestFactory.create(AppModule, { logger: false });
const doc = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle("My API").setVersion("1").build(),
);
writeFileSync("openapi.json", JSON.stringify(doc, null, 2));
await app.close();
```

```bash
npx nexapi generate --input openapi.json --output src/api
```

Verified against real output: `fixtures/openapi/nestjs-swagger.json` was produced by `@nestjs/swagger` 11 from
the app in `fixtures/openapi/nestjs-swagger.source.ts.txt`; `examples/nestjs/` holds the generated client, which
is type-checked with the repo and drift-checked by `pnpm generate:check`.

Things to know:

- Operation ids are `Controller_method` (`UsersController_findAll`), so generated type names are long
  (`UsersControllerFindAllData`). The resource tree comes from the paths and is unaffected. Set
  `operationId` yourself with `SwaggerModule.createDocument(app, config, { operationIdFactory: (c, m) => m })`
  if you want short names (they must stay unique).
- Document success and error shapes with `@ApiOkResponse`/`@ApiCreatedResponse`/`@ApiNotFoundResponse({ type })`;
  only documented responses become types (`ErrorCase<404, ErrorDto>`). Undocumented ones are `unknown`.
- `@HttpCode(204)` without `@ApiNoContentResponse` still yields an empty success response, which the
  generator treats as no content.
- `@ApiQuery({ enum, isArray })` loses the enum in `@nestjs/swagger`'s own output (`string[]`); the generator
  faithfully reproduces what it is given.
- Other `nestjs/swagger` plugins or `class-validator` rules are not reflected unless they reach the document.

## ASP.NET Core (Swashbuckle.AspNetCore / `Microsoft.AspNetCore.OpenApi`)

```bash
dotnet swagger tofile --output openapi.json ./bin/Release/net9.0/Api.dll v1     # Swashbuckle CLI
npx nexapi generate --input openapi.json --output src/api --config nexapi.config.json
```

```json
{ "naming": { "stripPathPrefix": "/api" }, "validation": true }
```

**Honesty note:** there is no .NET SDK in the environment this was developed in, so
`fixtures/openapi/aspnet-swashbuckle.json` is hand-written to follow Swashbuckle's documented output
conventions, not produced by running ASP.NET. It exercises: every response repeated as `text/plain`,
`application/json` and `text/json`; `application/problem+json` error bodies; `201 Created`; numeric
enums; `nullable: true` and `allOf`+`nullable` references; `additionalProperties: {}`; request bodies
without `required`; operations without `operationId`. Treat it as evidence of how the generator handles
those conventions, and run it on your real document before relying on it.

Things to know:

- Controllers named `UsersController` under `[Route("api/[controller]")]` produce `/api/Users`: use
  `naming.stripPathPrefix: "/api"` to get `api.users...` instead of `api.api.users...` (requests still go to
  `/api/Users`; path segments keep their case on the wire).
- Name actions (`[HttpGet("{id}", Name = "GetUser")]` or `.WithName("GetUser")` in minimal APIs) to get stable
  operation ids; otherwise ids are synthesized from method and path (`getApiReportsByYear`).
- Enums serialize as integers unless you add `JsonStringEnumConverter`; the generated type follows the
  schema (`0 | 1 | 2`).
- A request body is optional in the generated signature when Swashbuckle omits `required: true`.
