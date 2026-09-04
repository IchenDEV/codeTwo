import typescript from "@typescript-eslint/eslint-plugin";
import * as typescriptParser from "@typescript-eslint/parser";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
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
  ...core,
  ...react,
  {
    // Ultracite core currently wires the TS parser for `**/*.ts` only; React apps need `.tsx`.
    files: ["**/*.tsx"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
  },
  {
    ignores: [
      "artifacts/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "src-host/**",
    ],
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
    files: ["src/components/ui/textarea.tsx"],
    rules: {
      "no-restricted-syntax": ["error", inlineRadiusRestriction],
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        rawTextareaRestriction,
        inlineRadiusRestriction,
      ],
    },
  },
];
