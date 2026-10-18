import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "examples/*/generated/**",
      "benchmarks/results/**",
      "website/.next/**",
      "website/out/**",
      "website/public/**",
      "website/src/generated/**",
      "website/src/demo/api/**",
      "website/starter/**",
      "website/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: "./tsconfig.typecheck.json", tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["website/**/*.ts", "website/**/*.tsx"],
    languageOptions: {
      parserOptions: { project: "./website/tsconfig.json", tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Tests legitimately poke at internals and use loose mocks.
    files: ["**/test/**", "tests/**"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        document: "readonly",
        Buffer: "readonly",
      },
    },
  },
);
