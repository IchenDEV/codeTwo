import * as typescriptParser from "@typescript-eslint/parser";
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
    plugins: { unicorn },
    rules: {
      curly: ["error", "all"],
      "require-unicode-regexp": "error",
      "unicorn/switch-case-braces": "error",
      "unicorn/number-literal-case": "error",
      eqeqeq: ["error", "always"],
      "no-eq-null": "error",
    },
  },
];
