import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string): string =>
  fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@nexapi/core": src("core"),
      "@nexapi/codegen": src("codegen"),
      "@nexapi/react": src("react"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
