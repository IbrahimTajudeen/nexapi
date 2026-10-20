/**
 * Starter projects for the IDE. Each becomes a folder in the user's workspace. Sample code avoids
 * backticks so it can live inside these template strings.
 */
import { SAMPLE_SCHEMA } from "../lib/sample-schema";
import { EXAMPLES, type ExampleId } from "../lib/examples";
import { GUIDE_EXAMPLES, type GuideExampleId } from "../lib/guide-examples";

export interface Template {
  id: string;
  title: string;
  summary: string;
  /** Path of the file to open first, relative to the project folder. */
  open: string;
  files: Record<string, string>;
}

/** Frameworks that are on the roadmap but have no adapter yet. Shown disabled, never faked. */
export const PLANNED_FRAMEWORKS = [
  { id: "vue", title: "Vue", note: "Adapter is being explored. See the roadmap." },
  { id: "svelte", title: "Svelte", note: "Adapter is being explored. See the roadmap." },
  { id: "solid", title: "Solid", note: "Adapter is being explored. See the roadmap." },
] as const;

const pkg = (name: string, scripts: Record<string, string>): string =>
  JSON.stringify({ name, private: true, scripts }, null, 2) + "\n";

export const TEMPLATES: Template[] = [
  {
    id: "basics",
    title: "NyxAPI basics",
    summary: "A typed client, a cached query and a mutation against the mock API.",
    open: "index.ts",
    files: {
      "index.ts": [
        "// Run with Ctrl+Enter, or in the terminal:  npm start",
        '// "playground" gives you a ready client, the generated api and the mock server.',
        'import { api, nyx, server } from "playground";',
        "",
        "// A direct call always sends a request.",
        'const user = await api.users.byId("1").get();',
        'console.log("Hello,", user.name);',
        "",
        "// Through the query client with a staleTime, the second ask is answered from the cache.",
        'const options = api.users.byId("1").get.options(undefined, { staleTime: 60_000 });',
        "await nyx.queryClient.fetchQuery(options);",
        "await nyx.queryClient.fetchQuery(options);",
        'console.log("Requests sent to the server:", server.requestCount());',
        'console.log("Entries in the cache:", nyx.queryClient.findAll().length);',
        "",
        "// A write.",
        'const session = await api.auth.login.post({ email: "ada@example.test", password: "secret" });',
        'console.log("Logged in, token starts with", String(session.token).slice(0, 6));',
        "",
      ].join("\n"),
      "README.md":
        "# NyxAPI basics\n\nEdit `index.ts`, press Ctrl+Enter, and read the Output panel.\nOpen the terminal and try `ls`, `cat index.ts`, `npm start`.\n",
      "package.json": pkg("nyxapi-basics", { start: "tsx index.ts" }),
    },
  },
  {
    id: "manual",
    title: "Manual endpoints (no schema)",
    summary: "Define queries and mutations by hand when there is nothing to generate from.",
    open: "index.js",
    files: {
      "index.js": [
        "// No OpenAPI file? Describe the endpoint yourself.",
        'import { nyx, core } from "playground";',
        "",
        'const listUsers = nyx.query({ method: "get", path: "/users" });',
        'const getUser = nyx.query({ method: "get", path: "/users/{id}", params: { id: "99" } });',
        'const createUser = nyx.mutation({ method: "post", path: "/users", hasBody: true });',
        "",
        'const admins = await listUsers({ query: { role: ["admin"], limit: 5 } });',
        'console.log(admins.total, "admins:", admins.items.map((u) => u.name).join(", "));',
        "",
        "const made = await nyx.queryClient.mutate(createUser.options(undefined, { invalidates: [listUsers.key()] }), {",
        '  name: "Alan Turing",',
        '  email: "alan@example.test",',
        "});",
        'console.log("Created", made.id, made.name);',
        "",
        "try {",
        "  await getUser();",
        "} catch (error) {",
        '  if (error instanceof core.HttpError) console.log("Typed error, status", error.status);',
        "  else throw error;",
        "}",
        "",
      ].join("\n"),
      "http.js": [
        "// Every HTTP method, against the mock server's /echo route.",
        'import { nyx } from "playground";',
        "",
        'for (const method of ["get", "post", "put", "patch", "delete"]) {',
        "  const echo = await nyx.http.request({",
        "    method,",
        '    path: "/echo",',
        '    body: method === "get" ? undefined : { hello: "nyx" },',
        "  });",
        '  console.log(method.toUpperCase().padEnd(6), "server saw", echo.method, JSON.stringify(echo.body));',
        "}",
        "",
      ].join("\n"),
      "README.md":
        "# Manual endpoints\n\n`index.js` defines endpoints by hand. `http.js` sends each HTTP method.\nRun either with `node index.js` or `node http.js`.\n",
      "package.json": pkg("nyxapi-manual", { start: "node index.js", http: "node http.js" }),
    },
  },
  {
    id: "react",
    title: "React app",
    summary: "A React app on @nyxapi/react with live devtools. Renders in the Preview tab.",
    open: "App.tsx",
    files: {
      "main.tsx": [
        'import { createRoot } from "react-dom/client";',
        'import { NyxProvider } from "@nyxapi/react";',
        'import { NyxDevtools } from "@nyxapi/devtools/react";',
        'import { nyx } from "playground";',
        'import { App } from "./App";',
        'import "./styles.css";',
        "",
        'createRoot(document.getElementById("root")!).render(',
        "  <NyxProvider client={nyx.queryClient}>",
        "    <App />",
        "    <NyxDevtools client={nyx.queryClient} force />",
        "  </NyxProvider>,",
        ");",
        "",
      ].join("\n"),
      "App.tsx": [
        'import { useState } from "react";',
        'import { useQuery } from "@nyxapi/react";',
        'import { api } from "playground";',
        "",
        "function Users({ onPick }: { onPick: (id: string) => void }) {",
        "  const list = useQuery(api.users.list.get.options(undefined, { staleTime: 30_000 }));",
        "  if (list.isPending) return <p>Loading users...</p>;",
        '  if (list.isError) return <p role="alert">Could not load users.</p>;',
        "  return (",
        "    <ul>",
        "      {list.data.items.map((u) => (",
        "        <li key={u.id}>",
        "          <button onClick={() => onPick(u.id)}>{u.name}</button> <small>{u.role}</small>",
        "        </li>",
        "      ))}",
        "    </ul>",
        "  );",
        "}",
        "",
        "function Details({ id }: { id: string }) {",
        "  const user = useQuery(api.users.byId(id).get.options(undefined, { staleTime: 30_000 }));",
        "  if (user.isPending) return <p>Loading...</p>;",
        "  if (user.isError) return <p>Not found.</p>;",
        "  return <h2>{user.data.name}</h2>;",
        "}",
        "",
        "export function App() {",
        '  const [id, setId] = useState("1");',
        "  return (",
        '    <main className="app">',
        "      <h1>Users</h1>",
        '      <div className="cols">',
        "        <Users onPick={setId} />",
        "        <Details id={id} />",
        "      </div>",
        "      <p>Two components, one cache. Open the panel in the corner to inspect it.</p>",
        "    </main>",
        "  );",
        "}",
        "",
      ].join("\n"),
      "styles.css": [
        "body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; color: #1a2330; }",
        ".cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }",
        "button { padding: 4px 10px; cursor: pointer; }",
        "ul { padding-left: 0; list-style: none; }",
        "li { margin: 6px 0; }",
        "",
      ].join("\n"),
      "README.md":
        "# React app\n\nPress Ctrl+Enter on `main.tsx` (or `tsx main.tsx` in the terminal). The app appears in the Preview tab.\nEdit `App.tsx` and run again.\n",
      "package.json": pkg("nyxapi-react", { start: "tsx main.tsx" }),
    },
  },
  {
    id: "generate",
    title: "Generate a client from OpenAPI",
    summary: "Run the real nyx generator on a schema, then import what it wrote.",
    open: "README.md",
    files: {
      "openapi.yaml": SAMPLE_SCHEMA,
      "nyx.config.json":
        JSON.stringify({ input: "./openapi.yaml", output: "./src/api" }, null, 2) + "\n",
      "use.ts": [
        'import { createNyxClient } from "@nyxapi/core";',
        'import { createApi } from "./src/api/index";',
        'import { server } from "playground";',
        "",
        "// Point the generated client at the mock server.",
        'const nyx = createNyxClient({ baseUrl: "https://api.example.com/v1", transport: server.transport });',
        "const api = createApi(nyx);",
        "",
        'console.log((await api.users.byId("1").get()).name);',
        "",
      ].join("\n"),
      "README.md":
        "# Generate a client\n\n1. `nyx validate`  checks the schema\n2. `nyx generate`  writes `src/api/`\n3. `tree`  to look at the result, `cat src/api/client.ts` to read it\n4. `tsx use.ts`  runs code that imports the generated client\n\nTry editing `openapi.yaml` (add an endpoint) and generate again.\n",
      "package.json": pkg("nyxapi-generate", {
        generate: "nyx generate",
        validate: "nyx validate",
        start: "tsx use.ts",
      }),
    },
  },
  {
    id: "blank",
    title: "Blank project",
    summary: "An empty TypeScript file and nothing else.",
    open: "index.ts",
    files: {
      "index.ts":
        'import { api, nyx, server } from "playground";\n\nconsole.log("Ready", Object.keys(api));\n',
      "package.json": pkg("my-project", { start: "tsx index.ts" }),
    },
  },
];

export const templateById = (id: string): Template | undefined =>
  TEMPLATES.find((t) => t.id === id);

/** Every runnable docs example as a ready-to-run file. */
export function exampleFile(id: string): { path: string; content: string } | null {
  const ex =
    id in EXAMPLES
      ? EXAMPLES[id as ExampleId]
      : id in GUIDE_EXAMPLES
        ? GUIDE_EXAMPLES[id as GuideExampleId]
        : null;
  return ex ? { path: `/examples/${id}.js`, content: ex.code.replace(/^\n/, "") } : null;
}
export const EXAMPLE_IDS: string[] = [...Object.keys(EXAMPLES), ...Object.keys(GUIDE_EXAMPLES)];

export const WELCOME_README = `# NyxAPI playground

A real editor, terminal and runtime, all in your browser. Your files are saved on this device
(IndexedDB) and never uploaded.

- Explorer on the left: create files and folders, rename, delete.
- Ctrl+Enter runs the open file. Ctrl+\` focuses the terminal. Ctrl+S saves (it also autosaves).
- Terminal: type help. Try: ls, tree, cat, node, tsx, nyx generate, new react.
- Built-in packages: @nyxapi/core, @nyxapi/codegen, @nyxapi/react, @nyxapi/devtools/react, react, react-dom.
- "playground" exports nyx, api, server (a mock API) and core. Examples from the docs run as-is.
- TypeScript and JSX are compiled, not type-checked. Packages cannot be downloaded.
- Code runs in this page, so only run code you wrote or trust.
`;
