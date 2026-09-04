import * as typescriptParser from "@typescript-eslint/parser";
export default [
  {
    ignores: [
      "artifacts/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "src-host/**",
      "eslint*.mjs",
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
    rules: { "arrow-body-style": ["error", "as-needed"] },
  },
];
