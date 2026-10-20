import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/Callout";
import { Doc, H2, Table } from "@/components/Doc";
import { BUILTIN_PACKAGES } from "@/ide/packages";
import { PLANNED_FRAMEWORKS, TEMPLATES } from "@/ide/templates";

export const metadata: Metadata = { title: "Using the playground" };

export default function Page() {
  return (
    <Doc
      href="/docs/playground/"
      title="Using the playground"
      lede="A code editor, file explorer and terminal that run in your browser. Write NyxAPI and React code, run it against a mock API, and generate clients from your own schema. Nothing is uploaded."
    >
      <p>
        Open the <Link href="/playground/">playground</Link>. Your first visit starts with a small
        project and a README. Everything you create is saved on this device and is still there when
        you come back.
      </p>

      <H2>What is in the window</H2>
      <Table
        head={["Area", "What it does"]}
        rows={[
          [
            "Explorer",
            "Create files and folders, rename (F2), delete, upload from your computer, download a file.",
          ],
          [
            "Editor",
            "Syntax highlighting for TypeScript, JavaScript, JSX, JSON, YAML, Markdown, CSS and HTML. Tabs keep their own undo history.",
          ],
          [
            "Terminal",
            "A small shell over your files. Type help. Tab completes, the arrow keys walk your history, && chains commands, > and >> redirect output.",
          ],
          ["Output", "Console output from the Run button."],
          [
            "Preview",
            "Where a React app renders. It opens by itself when your code renders into #root.",
          ],
          [
            "Mock API",
            "Every request your code sent, with controls for latency and for the server returning 500.",
          ],
        ]}
      />

      <H2>Running code</H2>
      <p>
        Press <code>Ctrl</code> + <code>Enter</code> (or <strong>Run</strong>) to run the open file,
        or use the terminal: <code>node file.js</code>, <code>tsx file.ts</code>,{" "}
        <code>nyx run file.ts</code> or <code>npm start</code> in a project that has a{" "}
        <code>start</code> script. TypeScript and JSX are compiled on the fly. Top-level{" "}
        <code>await</code> works in the file you run, and relative imports between your files work.
        Each run starts a fresh mock server and a fresh cache.
      </p>

      <H2>What your code can import</H2>
      <ul>
        {BUILTIN_PACKAGES.map((p) => (
          <li key={p}>
            <code>{p}</code>
            {p === "playground"
              ? " exports nyx, api, server, core, createApi and createEngine, all pointed at the mock API."
              : ""}
          </li>
        ))}
      </ul>
      <p>
        The examples in these docs run unchanged as files: the variables{" "}
        <code>api, nyx, core, log, sleep, server</code> are also available as globals, and{" "}
        <code>fetch</code> talks to the mock API. Use <strong>Docs examples</strong> in the toolbar
        to open any of them, or the &quot;Open in the playground&quot; link under a runnable
        example.
      </p>

      <H2>Terminal commands</H2>
      <Table
        head={["Command", "Does"]}
        rows={[
          [<code key="a">ls, cd, pwd, tree, cat</code>, "Look around."],
          [<code key="b">touch, mkdir -p, rm -r, mv, cp -r</code>, "Change files."],
          [<code key="c">echo text &gt; file</code>, "Write a file (>> appends)."],
          [<code key="d">node, tsx, nyx run</code>, "Run a file."],
          [
            <code key="e">nyx generate [-i schema] [-o dir]</code>,
            "The real code generator. Reads nyx.config.json when present.",
          ],
          [<code key="f">nyx validate [schema]</code>, "Check a schema and report problems."],
          [
            <code key="g">new &lt;template&gt;, templates</code>,
            "Start a project from a template.",
          ],
          [
            <code key="h">npm run &lt;script&gt;, npm start</code>,
            "Run a script from the nearest package.json.",
          ],
          [<code key="i">packages</code>, "List what can be imported."],
          [<code key="j">reset</code>, "Delete everything saved in this browser (asks first)."],
        ]}
      />

      <H2>Starter projects</H2>
      <Table
        head={["Template", "What you get"]}
        rows={TEMPLATES.map((t) => [<code key={t.id}>{t.id}</code>, `${t.title}. ${t.summary}`])}
      />
      <p>
        Vue, Svelte and Solid appear in the menu as planned. There are no adapters for them yet (
        {PLANNED_FRAMEWORKS.map((f) => f.title).join(", ")} are on the{" "}
        <Link href="/roadmap/">roadmap</Link>
        ), so nothing runs for them. The core library is framework independent, so you can already
        use NyxAPI from any framework&apos;s own components through <code>@nyxapi/core</code>.
      </p>

      <H2>Where your files are stored</H2>
      <p>
        In your browser&apos;s IndexedDB, with localStorage as a fallback. The status text in the
        toolbar tells you which one is in use, or why saving failed. Files live in this browser
        profile only: clearing site data deletes them, and they do not follow you to another device.
        Use <strong>Workspace, Export</strong> to download a backup and <strong>Import</strong> to
        restore one.
      </p>

      <H2>Limits you should know</H2>
      <Callout kind="note" title="Honest limits">
        <ul>
          <li>TypeScript is transpiled, not type-checked, so type errors do not show up here.</li>
          <li>Packages cannot be installed. Only the built-in list above is available.</li>
          <li>
            Requests go to the in-browser mock API. Real URLs are not reachable from the playground.
          </li>
          <li>Code runs inside this page. Only run code you wrote or trust.</li>
          <li>
            Only the file you run may use top-level <code>await</code>.
          </li>
          <li>Running a file does not stop an earlier run that is still going.</li>
        </ul>
      </Callout>
    </Doc>
  );
}
