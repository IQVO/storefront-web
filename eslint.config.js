import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".opencode/", ".claude/", ".codex/", ".agents/", "build/", ".react-router/", "coverage/", "node_modules/", ".lighthouseci/", "playwright-report/", "test-results/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      eqeqeq: "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^https?:\\/\\//]",
          message: "WHAT: absolute URL literal. WHY: the web talks only to /api/storefront (ADR 0002). FIX: use the relative base in app/lib/api.ts.",
        },
      ],
    },
  },
  { files: ["**/*.server.ts", "**/*.test.{ts,tsx}", "e2e/**", "server/**", "scripts/**", "*.config.*"], rules: { "no-restricted-syntax": "off" } },
);
