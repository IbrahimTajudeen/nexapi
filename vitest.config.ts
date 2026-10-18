import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string): string =>
  fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@nyxapi/core": src("core"),
      "@nyxapi/codegen": src("codegen"),
      "@nyxapi/react": src("react"),
      "@nyxapi/devtools/react": fileURLToPath(
        new URL("./packages/devtools/src/react.tsx", import.meta.url),
      ),
      "@nyxapi/devtools": src("devtools"),
      "@": fileURLToPath(new URL("./website/src", import.meta.url)),
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
      "website/test/**/*.test.ts",
    ],
    environment: "node",
  },
});
