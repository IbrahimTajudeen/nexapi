/** Packages the playground provides. Kept separate so docs pages can list them without loading React. */
export const BUILTIN_PACKAGES = [
  "@nyxapi/core",
  "@nyxapi/codegen",
  "@nyxapi/react",
  "@nyxapi/devtools/react",
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "playground",
] as const;
