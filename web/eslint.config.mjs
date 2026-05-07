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
  ]),
  {
    files: ["app/api/**/*.ts", "app/api/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/infrastructure/*", "@/lib/infrastructure/**"],
              message:
                "app/api cannot import infrastructure directly; use a web-api boundary HTTP adapter.",
            },
            {
              group: [
                "@/lib/commerce/web-api/*/config",
                "@/lib/commerce/web-api/*/config/**",
                "@/lib/commerce/web-api/*/use-cases/*",
                "@/lib/commerce/web-api/*/use-cases/**",
                "@/lib/commerce/web-api/*/adapters/ingress/*",
                "@/lib/commerce/web-api/*/adapters/ingress/**",
              ],
              message:
                "app/api must import only boundary HTTP adapter entrypoints (adapters/http).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["components/**/*.ts", "components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/commerce/web-api/*", "@/lib/commerce/web-api/**"],
              message: "components cannot import web-api boundaries.",
            },
            {
              group: ["@/lib/infrastructure/*", "@/lib/infrastructure/**"],
              message: "components cannot import infrastructure adapters.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/commerce/domain/**/*.ts", "lib/commerce/domain/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/app/*",
                "@/app/**",
                "@/components/*",
                "@/components/**",
                "@/lib/infrastructure/*",
                "@/lib/infrastructure/**",
              ],
              message:
                "domain contracts must remain framework and infrastructure agnostic.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
