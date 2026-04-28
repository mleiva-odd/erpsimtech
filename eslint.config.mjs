import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agent/**",
    "prisma/seed.js",
    "scratch/**",
    "Rediseñar landing y login/**",
    "Rediseñar landing y login/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^(?:_|req)$",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^(?:_|error|e)$",
        },
      ],
      "@next/next/no-img-element": "warn",
    },
  },
]);

export default eslintConfig;
