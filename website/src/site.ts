import downloads from "@/generated/downloads.json";

/** Deployment settings. Set these as environment variables at build time (see README). */
export const REPO_URL: string | undefined = process.env.NEXT_PUBLIC_REPO_URL || undefined;
export const SITE_URL: string | undefined = process.env.NEXT_PUBLIC_SITE_URL || undefined;
export const VERSION: string = downloads.version;
export const NODE_MIN = "22.12";

export interface NavItem {
  title: string;
  href: string;
  summary?: string;
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

export const DOCS_NAV: NavSection[] = [
  {
    title: "Start here",
    items: [
      { title: "Introduction", href: "/docs/", summary: "What NyxAPI is and how the pieces fit." },
      {
        title: "Installation",
        href: "/docs/installation/",
        summary: "Install from npm, tarballs or source.",
      },
      {
        title: "Quick start",
        href: "/docs/quick-start/",
        summary: "From an OpenAPI file to a typed call in five minutes.",
      },
    ],
  },
  {
    title: "Guides",
    items: [
      {
        title: "The fluent API",
        href: "/docs/fluent-api/",
        summary: "How paths become typed calls.",
      },
      {
        title: "Code generation",
        href: "/docs/codegen/",
        summary: "Config, naming, validation and CI checks.",
      },
      {
        title: "Queries and caching",
        href: "/docs/queries/",
        summary: "Keys, freshness, single flight, invalidation.",
      },
      {
        title: "Mutations and optimistic updates",
        href: "/docs/mutations/",
        summary: "Patch-based updates that roll back safely.",
      },
      {
        title: "Errors",
        href: "/docs/errors/",
        summary: "Typed HTTP errors you can narrow by status.",
      },
      {
        title: "Pagination",
        href: "/docs/pagination/",
        summary: "Infinite queries in both directions.",
      },
      {
        title: "Schema formats",
        href: "/docs/schemas/",
        summary: "OpenAPI, Swagger 2.0, GraphQL and tRPC: what works and how it is detected.",
      },
      {
        title: "GraphQL",
        href: "/docs/graphql/",
        summary: "Typed queries and mutations from a schema, on the same cache.",
      },
      {
        title: "tRPC",
        href: "/docs/trpc/",
        summary: "Typed keys, prefetch and invalidation for every procedure.",
      },
      { title: "React", href: "/docs/react/", summary: "Hooks, Suspense and server rendering." },
      {
        title: "Security",
        href: "/docs/security/",
        summary: "Origin pinning and credential handling.",
      },
      { title: "Devtools", href: "/docs/devtools/", summary: "Inspect the cache while you build." },
      {
        title: "NestJS and ASP.NET Core",
        href: "/docs/adapters/",
        summary: "Use the OpenAPI output you already have.",
      },
    ],
  },
  {
    title: "No schema",
    items: [
      {
        title: "Manual queries",
        href: "/docs/manual/",
        summary: "Define endpoints by hand when there is no schema to generate from.",
      },
      {
        title: "HTTP requests and methods",
        href: "/docs/http/",
        summary: "Methods, paths, query strings, headers, bodies, responses and errors.",
      },
    ],
  },
  {
    title: "Practice",
    items: [
      {
        title: "Techniques and recipes",
        href: "/docs/techniques/",
        summary: "Fourteen runnable solutions to problems every app meets.",
      },
      {
        title: "Best practices",
        href: "/docs/best-practices/",
        summary: "Defaults, do and avoid lists, and a production checklist.",
      },
      {
        title: "Using the playground",
        href: "/docs/playground/",
        summary:
          "The in-browser editor and terminal: files, commands, shortcuts, storage and limits.",
      },
    ],
  },
  {
    title: "Integrations",
    items: [
      {
        title: "Integration guides",
        href: "/docs/integrations/",
        summary: "How NyxAPI fits into Vite, Next.js, Node, tests and CI.",
      },
      {
        title: "React with Vite",
        href: "/docs/integrations/react-vite/",
        summary: "A single-page app: client module, hooks, Suspense, proxy and devtools.",
      },
      {
        title: "Next.js",
        href: "/docs/integrations/nextjs/",
        summary: "Per-request server clients, dehydrate and hydrate, one browser client.",
      },
      {
        title: "Node servers and scripts",
        href: "/docs/integrations/node-server/",
        summary: "Express handlers, jobs and server rendering without a shared cache.",
      },
      {
        title: "Authentication",
        href: "/docs/integrations/auth/",
        summary: "Bearer tokens, refresh on 401, cookies and per-user clients.",
      },
      {
        title: "Testing",
        href: "/docs/integrations/testing/",
        summary: "A function transport, fake routes and rollback tests.",
      },
      {
        title: "CI and teams",
        href: "/docs/integrations/ci/",
        summary: "Keep generated code in step with the schema; conventions for teams.",
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        title: "API reference",
        href: "/docs/api/",
        summary: "Every public member of the core engine.",
      },
      { title: "CLI", href: "/docs/cli/", summary: "Every command and flag." },
      { title: "Configuration", href: "/docs/config/", summary: "nyx.config.json options." },
      {
        title: "Client options",
        href: "/docs/client-options/",
        summary: "createNyxClient and QueryClient settings.",
      },
      {
        title: "Benchmarks",
        href: "/docs/benchmarks/",
        summary: "How performance is measured, and what it does not show.",
      },
    ],
  },
];

export const DOC_PAGES: NavItem[] = DOCS_NAV.flatMap((s) => s.items);
