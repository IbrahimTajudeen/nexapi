import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2, H3 } from "@/components/Doc";

export const metadata: Metadata = { title: "NestJS and ASP.NET Core" };

export default function Page() {
  return (
    <Doc
      href="/docs/adapters/"
      title="NestJS and ASP.NET Core"
      lede="Both frameworks already publish an OpenAPI document. NexAPI generates from that, so there is nothing extra to install on your server."
    >
      <p>
        An adapter that read your controllers directly would have to copy each framework&apos;s
        routing and validation rules and would drift from them. The OpenAPI output is the
        framework&apos;s own statement of its contract, so that is what NexAPI reads.
      </p>

      <H2>NestJS</H2>
      <p>Export the document at build time, then generate:</p>
      <Code
        lang="ts"
        title="scripts/export-openapi.ts"
      >{`import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { writeFileSync } from "node:fs";
import { AppModule } from "../src/app.module";

const app = await NestFactory.create(AppModule, { logger: false });
const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("My API").setVersion("1").build());
writeFileSync("openapi.json", JSON.stringify(doc, null, 2));
await app.close();`}</Code>
      <Code
        lang="bash"
        title="terminal"
      >{`npx nexapi generate --input openapi.json --output src/api`}</Code>
      <Callout kind="note" title="Tested on real output">
        The NestJS fixture in the repository was produced by running <code>@nestjs/swagger</code> 11
        on a sample app, and the generated client is type-checked and drift-checked in CI.
      </Callout>
      <H3>Things to know</H3>
      <ul>
        <li>
          Operation ids look like <code>UsersController_findAll</code>, which gives long type names.
          The resource tree comes from paths, so it is unaffected. To get short names, pass{" "}
          <code>operationIdFactory: (controllerKey, methodKey) =&gt; methodKey</code> to{" "}
          <code>createDocument</code>. They must stay unique.
        </li>
        <li>
          Document responses with <code>@ApiOkResponse</code>,{" "}
          <code>@ApiNotFoundResponse({"{ type }"})</code> and friends. Only documented responses
          become types.
        </li>
        <li>
          <code>@ApiQuery({"{ enum, isArray }"})</code> loses its enum in{" "}
          <code>@nestjs/swagger</code>&apos;s own output, and the generator reproduces what it is
          given.
        </li>
      </ul>

      <H2>ASP.NET Core</H2>
      <Code
        lang="bash"
        title="terminal"
      >{`dotnet swagger tofile --output openapi.json ./bin/Release/net9.0/Api.dll v1
npx nexapi generate --input openapi.json --output src/api --config nexapi.config.json`}</Code>
      <Code
        lang="json"
        title="nexapi.config.json"
      >{`{ "naming": { "stripPathPrefix": "/api" }, "validation": true }`}</Code>
      <Callout kind="warn" title="About the ASP.NET fixture">
        The development environment had no .NET SDK, so the bundled ASP.NET fixture is{" "}
        <strong>hand-written</strong> to follow Swashbuckle&apos;s documented output. It shows how
        the generator handles those conventions, but run it on your real document before relying on
        it, and please report anything that differs.
      </Callout>
      <H3>Things to know</H3>
      <ul>
        <li>
          <code>UsersController</code> under <code>api/[controller]</code> produces{" "}
          <code>/api/Users</code>. Set <code>naming.stripPathPrefix</code> to <code>/api</code> to
          write <code>api.users</code> instead of <code>api.api.users</code>. Requests still go to{" "}
          <code>/api/Users</code>.
        </li>
        <li>
          Name your actions (<code>Name = &quot;GetUser&quot;</code> or{" "}
          <code>.WithName(&quot;GetUser&quot;)</code>) for stable operation ids. Otherwise they are
          synthesized from method and path.
        </li>
        <li>
          Enums serialize as integers unless you add <code>JsonStringEnumConverter</code>. The
          generated type follows the schema.
        </li>
        <li>
          A request body is optional in the generated signature when the document omits{" "}
          <code>required: true</code>.
        </li>
      </ul>

      <H2>Any other backend</H2>
      <p>
        If your server can produce an OpenAPI 3.0 or 3.1 document, you can try it. Run{" "}
        <code>nexapi validate</code> first to see anything NexAPI cannot represent.
      </p>
    </Doc>
  );
}
