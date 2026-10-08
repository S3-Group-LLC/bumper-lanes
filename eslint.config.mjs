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
    rules: {
      // Apostrophes and quotes in prose are safe and intentional; escaping them
      // in source hurts readability and re-triggers on every new copy edit.
      "react/no-unescaped-entities": "off",
      // Google Fonts download during the build, which breaks offline builds (Codex).
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/font/google",
              message:
                "Builds must work offline. Use a system font stack in src/app/globals.css, or save the font file in the project and use next/font/local.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
