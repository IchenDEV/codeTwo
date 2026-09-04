import typescript from "@typescript-eslint/eslint-plugin";
import * as typescriptParser from "@typescript-eslint/parser";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import unicorn from "eslint-plugin-unicorn";
import core from "ultracite/eslint/core";
import react from "ultracite/eslint/react";

const sourceFiles = ["src/**/*.{js,jsx,ts,tsx}"];
const inlineRadiusRestriction = {
  message:
    "Express border radius through a semantic class or CSS rule, not inline style.",
  selector: "Property[key.name='borderRadius']",
};
const rawTextareaRestriction = {
  message: "Use the shared Textarea component instead of a raw textarea.",
  selector: "JSXOpeningElement[name.name='textarea']",
};
const rawButtonRestriction = {
  message:
    "Use the shared Button or TooltipButton component instead of a raw button.",
  selector: "JSXOpeningElement[name.name='button']",
};

export default [
  {
    ignores: [
      "artifacts/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "src-host/**",
      // Flat-config / JSON / Vite entrypoints stay outside product lint.
      "eslint.config.mjs",
      "eslint.fix-safe.mjs",
      "prettier.config.mjs",
      "stylelint.config.mjs",
      "tsconfig.json",
      "tsconfig.node.json",
      "tsconfig.eslint.json",
      "vite.config.ts",
      "vite.canvas.config.ts",
      "electrobun.config.ts",
    ],
  },
  ...core,
  ...react,
  {
    // Point every TS/TSX file at the ESLint project (src + tests + Vite entrypoints).
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: "./tsconfig.eslint.json",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
  },
  {
    files: sourceFiles,
    plugins: {
      "better-tailwindcss": betterTailwindcss,
    },
    rules: {
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          entryPoint: "src/styles.css",
          restrict: [
            {
              message:
                "Use a semantic radius class such as rounded-control or rounded-module.",
              pattern:
                "^rounded(?:-(?:[trblse]{1,2}-)?(?:sm|md|lg|xl|2xl|3xl)|-(?:[trblse]{1,2}-)?(?:\\[.+\\]|\\(.+\\)))?$",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        rawButtonRestriction,
        rawTextareaRestriction,
        inlineRadiusRestriction,
      ],
    },
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      // House standard: prefer `function` declarations for named callables.
      // Arrow functions remain allowed for inline callbacks and short lambdas.
      "func-style": ["error", "declaration", { allowArrowFunctions: true }],
      // Nullish checks use `== null` / `!= null` (covers null | undefined) as in
      // the typescript-eslint strict-boolean migration guide.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-eq-null": "off",
      // Keep Ultracite formats, but allow unused `_` params, env-style
      // UPPER_CASE wire keys, and quoted protocol properties.
      "@typescript-eslint/naming-convention": [
        "error",
        {
          format: ["camelCase", "PascalCase", "snake_case"],
          leadingUnderscore: "allow",
          selector: "default",
        },
        {
          format: ["camelCase", "PascalCase", "snake_case", "UPPER_CASE"],
          leadingUnderscore: "allow",
          selector: "objectLiteralProperty",
        },
        {
          format: ["camelCase", "PascalCase", "snake_case", "UPPER_CASE"],
          leadingUnderscore: "allow",
          selector: "typeProperty",
        },
        {
          format: null,
          modifiers: ["requiresQuotes"],
          selector: "typeProperty",
        },
        {
          format: null,
          modifiers: ["requiresQuotes"],
          selector: "objectLiteralProperty",
        },
      ],
    },
  },
  {
    // React JSX callbacks read clearer as `() => (` … `)`.
    // Prettier also owns wrapping of short array/object arrow returns; keep
    // unicorn/consistent-arrow-return-style off so it does not fight Prettier
    // (single-line implicit vs multiline block) on `.ts` sources either.
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      unicorn,
    },
    rules: {
      "unicorn/consistent-arrow-return-style": "off",
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "arrow-body-style": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      unicorn,
    },
    rules: {
      // Imperative commands may return boolean success flags; prefixing them with
      // `is`/`did` obscures the action. Keep the rule for variables, fields, and args.
      "unicorn/consistent-boolean-name": [
        "error",
        {
          checkArguments: "always",
          checkFields: "never",
          checkFunctions: "never",
          checkMethods: "never",
          checkVariables: "always",
        },
      ],
    },
  },
  {
    files: ["src/components/ui/textarea.tsx"],
    rules: {
      "no-restricted-syntax": ["error", inlineRadiusRestriction],
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        rawTextareaRestriction,
        inlineRadiusRestriction,
      ],
      // Fixtures and mocks intentionally use loose JSON shapes; keep no-unsafe
      // strict for production sources only.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-type-assertion": "off",
    },
  },
];
