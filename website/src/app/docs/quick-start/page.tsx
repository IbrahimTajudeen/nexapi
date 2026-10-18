import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/Callout";
import { Code } from "@/components/Code";
import { Doc, H2 } from "@/components/Doc";
import { PackageInstall } from "@/components/PackageInstall";

export const metadata: Metadata = { title: "Quick start" };

const SCHEMA = `openapi: 3.0.3
info:
  title: Pet shop
  version: 1.0.0
paths:
  /pets/{id}:
    get:
      operationId: getPet
      summary: Fetch one pet
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          description: The pet
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Pet" }
        "404":
          description: No such pet
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ApiError" }
components:
  schemas:
    Pet:
      type: object
      required: [id, name, species]
      properties:
        id: { type: string }
        name: { type: string }
        species: { type: string, enum: [cat, dog] }
    ApiError:
      type: object
      required: [code, message]
      properties:
        code: { type: string }
        message: { type: string }`;

const MAIN = `import { createNyxClient, HttpError } from "@nyxapi/core";
import { createApi } from "./api/index.js";

// A stand-in server, so this file runs with no backend. Delete \`transport\` to use a real one.
const nyx = createNyxClient({
  baseUrl: "https://api.example.com",
  transport: async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/pets/1") return Response.json({ id: "1", name: "Miso", species: "cat" });
    return Response.json({ code: "not_found", message: "No such pet" }, { status: 404 });
  },
});
const api = createApi(nyx);

const pet = await api.pets.byId("1").get();
console.log(pet.name, pet.species); // Miso cat

try {
  await api.pets.byId("2").get();
} catch (error) {
  if (error instanceof HttpError && error.status === 404) console.log(error.body.message); // No such pet
}`;

export default function Page() {
  return (
    <Doc
      href="/docs/quick-start/"
      title="Quick start"
      lede="Go from an empty folder to a typed API call. You do not need a running backend: the example includes a stand-in server."
    >
      <p>
        This takes about five minutes. If you would like more explanation at each step, the{" "}
        <Link href="/beginners/">beginners guide</Link> covers the same ground slowly.
      </p>

      <ol className="steps">
        <li>
          <strong>Create a project.</strong>
          <Code lang="bash" title="terminal">{`mkdir pets && cd pets
npm init -y
npm pkg set type=module`}</Code>
        </li>
        <li>
          <strong>Install NyxAPI.</strong> See <Link href="/docs/installation/">Installation</Link>{" "}
          for tarballs and other ways to install.
          <PackageInstall packages="@nyxapi/core" />
          <PackageInstall packages="@nyxapi/cli tsx typescript" dev />
        </li>
        <li>
          <strong>Save a schema.</strong> This is a minimal OpenAPI file. Yours will usually come
          from your backend.
          <Code lang="yaml" title="openapi.yaml">
            {SCHEMA}
          </Code>
        </li>
        <li>
          <strong>Generate the client.</strong>
          <Code
            lang="bash"
            title="terminal"
          >{`npx nyx generate --input openapi.yaml --output src/api`}</Code>
          You now have <code>src/api/index.ts</code>, <code>client.ts</code> and{" "}
          <code>types.ts</code>. Open <code>types.ts</code>: you will find a <code>Pet</code> type
          that matches your schema.
        </li>
        <li>
          <strong>Make a call.</strong>
          <Code lang="ts" title="src/main.ts">
            {MAIN}
          </Code>
        </li>
        <li>
          <strong>Run it.</strong>
          <Code lang="bash" title="terminal">{`npx tsx src/main.ts`}</Code>
          <Code lang="text" copy={false} title="output">{`Miso cat
No such pet`}</Code>
        </li>
      </ol>

      <H2>What just happened</H2>
      <ul>
        <li>
          <code>/pets/{"{id}"}</code> became <code>api.pets.byId(id)</code>, and <code>get</code>{" "}
          became a method on it.
        </li>
        <li>
          <code>pet.species</code> is typed <code>&quot;cat&quot; | &quot;dog&quot;</code>, straight
          from the schema.
        </li>
        <li>
          The 404 you documented became a typed error: after checking{" "}
          <code>error.status === 404</code>, <code>error.body.message</code> is a string.
        </li>
      </ul>

      <Callout kind="read" title="Next: caching">
        <p>
          That call went straight to the server. To get caching and shared requests, pass the
          endpoint&apos;s <code>options()</code> to the query client.{" "}
          <Link href="/docs/queries/">Queries and caching</Link> shows how.
        </p>
      </Callout>

      <H2>Keep the client in sync</H2>
      <p>
        Commit the generated folder, and add this to CI. It exits with an error if the schema
        changed but nobody regenerated:
      </p>
      <Code
        lang="bash"
        title="terminal"
      >{`npx nyx generate --input openapi.yaml --output src/api --check`}</Code>
    </Doc>
  );
}
