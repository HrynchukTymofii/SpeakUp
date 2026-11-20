// Root ESLint flat config, used by the Node packages (api, worker, shared).
// apps/web has its own config that adds the Next.js rules.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/cdk.out/**", // AWS CDK synth output
      "**/src/generated/**", // Prisma client output — not our code
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Allow intentionally unused args/vars when prefixed with "_".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Type-only imports keep runtime imports honest (pairs with verbatimModuleSyntax).
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // k6 scripts run in k6's own JS runtime, which provides these globals (docs/load-testing.md).
    files: ["load-tests/**/*.js"],
    languageOptions: {
      globals: { __ENV: "readonly", __VU: "readonly", __ITER: "readonly", open: "readonly" },
    },
  },
);
