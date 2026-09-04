import * as typescriptParser from "@typescript-eslint/parser";
import importX from "eslint-plugin-import-x";
import unicorn from "eslint-plugin-unicorn";

export default [
  {
    ignores: [
      "artifacts/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "src-host/**",
      "eslint.config.mjs",
      "eslint.fix-safe.mjs",
      "eslint.fix-style.mjs",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: { unicorn, "import-x": importX },
    rules: {
      "unicorn/consistent-arrow-return-style": "error",
      "unicorn/switch-case-braces": "error",
      "unicorn/number-literal-case": "error",
      "unicorn/single-line-block-comment-style": "error",
      "require-unicode-regexp": "error",
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],
    },
  },
];
