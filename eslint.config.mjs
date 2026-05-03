import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ─── Architecture boundaries (mirror docs/ARCHITECTURE.md "Boundaries" table)
  // These rules keep the Next.js side of the codebase from reaching past
  // src/lib/api.ts. The Go service is the only thing that talks to the DB.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "pg",
              message:
                "The UI must not open a DB connection. Talk to the Go API via src/lib/api.ts.",
            },
            {
              name: "better-sqlite3",
              message:
                "The UI must not open a DB connection. Talk to the Go API via src/lib/api.ts.",
            },
            {
              name: "@prisma/client",
              message:
                "Prisma was removed in the Go rewrite. Talk to the Go API via src/lib/api.ts.",
            },
          ],
          patterns: [
            {
              group: ["@prisma/*"],
              message:
                "Prisma was removed in the Go rewrite. Talk to the Go API via src/lib/api.ts.",
            },
          ],
        },
      ],
    },
  },
  // Only src/lib/api.ts is allowed to call fetch() against the Go API.
  // Everywhere else, import the typed `api` object from there.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/api.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Use the typed `api` object in src/lib/api.ts instead of fetch().",
        },
      ],
    },
  },
]);

export default eslintConfig;
