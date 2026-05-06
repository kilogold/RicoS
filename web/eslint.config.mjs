import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/infrastructure/**"],
              message:
                "app/ is transport-only and cannot import infrastructure adapters directly.",
            },
            {
              group: [
                "@/lib/commerce/**/adapters/**",
                "@/lib/commerce/**/use-cases/**",
                "@/lib/commerce/**/ports/**",
                "@/lib/commerce/**/runtime",
                "@/lib/commerce/**/runtime/**",
              ],
              message:
                "Import boundary entrypoints (index.ts), not boundary internals.",
            },
            {
              group: [
                "@/lib/commerce/web-api/*/*/**",
                "@/lib/commerce/web-client/*/*/**",
                "@/lib/shared/*/*/**",
              ],
              message:
                "Deep imports are disallowed from app/. Import boundary entrypoints only.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/commerce/web-api/**"],
              message:
                "components/ cannot import web-api boundaries directly.",
            },
            {
              group: ["@/lib/infrastructure/**"],
              message:
                "components/ cannot import infrastructure adapters directly.",
            },
            {
              group: [
                "@/lib/commerce/web-api/*/*/**",
                "@/lib/commerce/web-client/*/*/**",
                "@/lib/shared/*/*/**",
              ],
              message:
                "Deep imports are disallowed from components/. Import boundary entrypoints only.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/commerce/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**", "@/components/**", "@/lib/infrastructure/**"],
              message:
                "Domain modules must stay framework- and infrastructure-agnostic.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
