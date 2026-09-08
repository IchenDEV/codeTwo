import js from "@eslint/js";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

const sourceFiles = ["src/**/*.{js,jsx,ts,tsx}"];
const taskBoardWorkspaceFiles = ["src/taskboard/**/*.{ts,tsx}"];
const taskBoardLegacyFiles = [
  "src/taskboard/TaskEditorDialog.tsx",
  "src/taskboard/taskBoard.ts",
];
const inlineRadiusRestriction = {
  message: "Express border radius through a semantic class or CSS rule, not inline style.",
  selector: "Property[key.name='borderRadius']",
};
const rawTextareaRestriction = {
  message: "Use the shared Textarea component instead of a raw textarea.",
  selector: "JSXOpeningElement[name.name='textarea']",
};
const rawButtonRestriction = {
  message: "Use the shared Button or TooltipButton component instead of a raw button.",
  selector: "JSXOpeningElement[name.name='button']",
};

export default tseslint.config(
  {
    ignores: ["artifacts/**", "build/**", "dist/**", "node_modules/**", "src-host/**"],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.bun,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-regex-spaces": "off",
      "no-useless-escape": "off",
      "prefer-const": "off",
      "preserve-caught-error": "off",
    },
  },
  {
    files: sourceFiles,
    plugins: {
      "better-tailwindcss": betterTailwindcss,
      "react-hooks": reactHooks,
    },
    rules: {
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          entryPoint: "src/styles.css",
          restrict: [
            {
              message: "Use a semantic radius class such as rounded-control or rounded-module.",
              pattern: "^rounded(?:-(?:[trblse]{1,2}-)?(?:sm|md|lg|xl|2xl|3xl)|-(?:[trblse]{1,2}-)?(?:\\[.+\\]|\\(.+\\)))?$",
            },
          ],
        },
      ],
      "no-regex-spaces": "off",
      "no-restricted-syntax": [
        "error",
        rawButtonRestriction,
        rawTextareaRestriction,
        inlineRadiusRestriction,
      ],
      "react-hooks/rules-of-hooks": "error",
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
  {
    files: taskBoardWorkspaceFiles,
    ignores: taskBoardLegacyFiles,
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { sonarjs },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unused-vars": "error",
      complexity: ["error", { max: 21 }],
      "max-lines": ["error", { max: 249 }],
      "no-duplicate-imports": "error",
      "no-restricted-syntax": [
        "error",
        rawButtonRestriction,
        rawTextareaRestriction,
        inlineRadiusRestriction,
      ],
      "sonarjs/cognitive-complexity": ["error", 21],
      "sonarjs/no-all-duplicated-branches": "error",
      "sonarjs/no-identical-conditions": "error",
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-redundant-assignments": "error",
      "sonarjs/no-redundant-boolean": "error",
      "sonarjs/no-redundant-jump": "error",
      "sonarjs/no-unused-collection": "error",
      "sonarjs/unused-import": "error",
    },
  },
);
