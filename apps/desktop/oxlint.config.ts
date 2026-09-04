import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";

const jsPlugins = selectJsPlugins(["github", "sonarjs", "react-doctor"]);

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

const radiusClassRestriction = {
  message:
    "Use a semantic radius class such as rounded-control or rounded-module.",
  pattern:
    "^rounded(?:-(?:[trblse]{1,2}-)?(?:sm|md|lg|xl|2xl|3xl)|-(?:[trblse]{1,2}-)?(?:\\[.+\\]|\\(.+\\)))?$",
};

/**
 * Style / complexity / pedantic rules that fight dense desktop UI, oxfmt, or
 * Ultracite's own oxlint.config (complexity family off). Kept off so product
 * type-safety and UI constraints stay the actionable signal.
 */
const houseNoiseOff = {
  // Ultracite upstream oxlint.config also disables these.
  complexity: "off",
  "max-statements": "off",
  "sonarjs/cognitive-complexity": "off",
  "sonarjs/expression-complexity": "off",
  "sonarjs/too-many-break-or-continue-in-loop": "off",
  "sonarjs/no-nested-functions": "off",
  "sonarjs/max-union-size": "off",
  "sonarjs/no-nested-incdec": "off",
  "sonarjs/no-duplicate-string": "off",
  "sonarjs/publicly-writable-directories": "off",
  "sonarjs/no-undefined-assignment": "off",
  // oxfmt / existing idioms.
  curly: "off",
  "no-negated-condition": "off",
  "unicorn/no-negated-condition": "off",
  "no-empty-function": "off",
  "no-use-before-define": "off",
  "prefer-destructuring": "off",
  "prefer-named-capture-group": "off",
  "no-shadow": "off",
  "no-plusplus": "off",
  "no-inline-comments": "off",
  "require-unicode-regexp": "off",
  "default-case": "off",
  "no-bitwise": "off",
  "no-await-in-loop": "off",
  "no-promise-executor-return": "off",
  // Unicorn pedantry (encoding labels, dataset vs getAttribute, Array.from, …).
  "unicorn/prefer-spread": "off",
  "unicorn/prefer-dom-node-dataset": "off",
  "unicorn/catch-error-name": "off",
  "unicorn/text-encoding-identifier-case": "off",
  "unicorn/numeric-separators-style": "off",
  "unicorn/prefer-at": "off",
  "unicorn/no-array-sort": "off",
  "unicorn/import-style": "off",
  "unicorn/consistent-function-scoping": "off",
  "unicorn/no-await-expression-member": "off",
  "unicorn/consistent-existence-index-check": "off",
  "unicorn/prefer-export-from": "off",
  "unicorn/no-useless-undefined": "off",
  "unicorn/prefer-string-replace-all": "off",
  "unicorn/prefer-number-properties": "off",
  "unicorn/prefer-optional-catch-binding": "off",
  "unicorn/prefer-ternary": "off",
  "unicorn/no-lonely-if": "off",
  "unicorn/no-hex-escape": "off",
  "unicorn/escape-case": "off",
  "unicorn/no-null": "off",
  // Promise style; desktop uses callbacks and voided promises intentionally.
  "promise/prefer-await-to-callbacks": "off",
  "promise/avoid-new": "off",
  "promise/no-callback-in-promise": "off",
  "promise/no-nesting": "off",
  // a11y backlog — product constraints stay on shared Button/Textarea.
  "github/a11y-no-title-attribute": "off",
  "github/a11y-role-supports-aria-props": "off",
  "github/prefer-observers": "off",
  "github/array-foreach": "off",
  "jsx-a11y/prefer-tag-over-role": "off",
  // React 18 / Compiler / dense App.tsx realities (already justified for doctor).
  "react/set-state-in-effect": "off",
  "react/exhaustive-effect-dependencies": "off",
  "react/no-object-type-as-default-prop": "off",
  "react/immutability": "off",
  "react/jsx-handler-names": "off",
  "react-doctor/no-effect-with-fresh-deps": "off",
  "react-doctor/js-combine-iterations": "off",
  "react-doctor/no-array-index-as-key": "off",
  "react-doctor/no-adjust-state-on-prop-change": "off",
  "react-doctor/no-chain-state-updates": "off",
  "react-doctor/js-hoist-intl": "off",
  "react-doctor/js-set-map-lookups": "off",
  "react-doctor/prefer-module-scope-pure-function": "off",
  "react-doctor/async-await-in-loop": "off",
  "react-doctor/js-tosorted-immutable": "off",
  "react-doctor/prefer-useReducer": "off",
  // TypeScript style that does not change safety.
  "typescript/ban-ts-comment": "off",
  "typescript/array-type": "off",
  "typescript/consistent-type-definitions": "off",
  "typescript/consistent-type-imports": "off",
  "typescript/promise-function-async": "off",
  "typescript/use-unknown-in-catch-callback-variable": "off",
  "typescript/no-unnecessary-boolean-literal-compare": "off",
  "typescript/parameter-properties": "off",
  "typescript/consistent-return": "off",
  "typescript/return-await": "off",
  "typescript/no-invalid-void-type": "off",
  "typescript/non-nullable-type-assertion-style": "off",
  "typescript/no-dynamic-delete": "off",
  "typescript/switch-exhaustiveness-check": "off",
  "typescript/no-unnecessary-type-conversion": "off",
  "typescript/restrict-template-expressions": "off",
  "typescript/no-base-to-string": "off",
  "typescript/prefer-regexp-exec": "off",
  "typescript/method-signature-style": "off",
  "typescript/prefer-readonly": "off",
  "typescript/no-unnecessary-type-parameters": "off",
  "typescript/no-deprecated": "off",
  "typescript/no-misused-spread": "off",
  // Remaining sonar / unicorn / react-doctor pedantry.
  "sonarjs/no-wildcard-import": "off",
  "sonarjs/variable-name": "off",
  "sonarjs/no-nested-template-literals": "off",
  "sonarjs/no-unused-vars": "off",
  "sonarjs/function-name": "off",
  "sonarjs/pseudo-random": "off",
  "sonarjs/no-all-duplicated-branches": "off",
  "sonarjs/public-static-readonly": "off",
  "unicorn/no-array-for-each": "off",
  "unicorn/no-useless-collection-argument": "off",
  "unicorn/prefer-array-find": "off",
  "unicorn/prefer-code-point": "off",
  "unicorn/no-useless-spread": "off",
  "unicorn/no-immediate-mutation": "off",
  "unicorn/prefer-query-selector": "off",
  "unicorn/no-object-as-default-parameter": "off",
  "unicorn/prefer-number-coercion": "off",
  "unicorn/new-for-builtins": "off",
  "node/callback-return": "off",
  "class-methods-use-this": "off",
  "no-script-url": "off",
  "react/jsx-no-constructed-context-values": "off",
  "react/button-has-type": "off",
  "react/hook-use-state": "off",
  "react/rule-suppression": "off",
  "react-doctor/rerender-lazy-state-init": "off",
  "react-doctor/react-compiler-no-manual-memoization": "off",
  "react-doctor/rerender-lazy-ref-init": "off",
  "react-doctor/rendering-hydration-mismatch-time": "off",
  "react-doctor/no-barrel-import": "off",
  "react-doctor/js-flatmap-filter": "off",
  "react-doctor/prefer-module-scope-static-value": "off",
  "react-doctor/js-length-check-first": "off",
  "react-doctor/prefer-dynamic-import": "off",
  "react-doctor/rerender-state-only-in-handlers": "off",
  "jsx-a11y/label-has-associated-control": "off",
  "jsx-a11y/no-static-element-interactions": "off",
  "github/no-blur": "off",
  "import/default": "off",
  "import/first": "off",
  "import/no-duplicates": "off",
  "no-duplicate-imports": "off",
  "prefer-const": "off",
  "no-unused-vars": "off",
  "react-doctor/no-reset-all-state-on-prop-change": "off",
  "react-doctor/client-localstorage-no-version": "off",
  "react-doctor/effect-needs-cleanup": "off",
  "react/static-components": "off",
  "react/no-react-children": "off",
  "react/purity": "off",
  "jsx-a11y/no-noninteractive-element-interactions": "off",
  "sonarjs/no-collapsible-if": "off",
  "sonarjs/no-clear-text-protocols": "off",
  "sonarjs/no-useless-react-setstate": "off",
  "unicorn/prefer-add-event-listener": "off",
  "unicorn/no-array-reduce": "off",
  "promise/prefer-catch": "off",
  // Desktop intentionally uses `x || fallback` for empty-string coalescing.
  // Remaining hits are always-truthy object / union checks that need typing,
  // not boolean rewrites; keep off until those types are narrowed.
  "typescript/strict-boolean-expressions": "off",
  // tsgolint marks unresolved deep icon imports as error-typed; ambient modules fix most.
  // Remaining IPC / Excalidraw / monaco boundary any stays until typed shims land.
  "typescript/no-unsafe-type-assertion": "off",
  "typescript/no-unsafe-argument": "off",
  "typescript/no-unsafe-assignment": "off",
  "typescript/no-unsafe-call": "off",
  "typescript/no-unsafe-member-access": "off",
  "typescript/no-unsafe-return": "off",
  "typescript/prefer-nullish-coalescing": "off",
  "typescript/no-unnecessary-type-assertion": "off",
  "typescript/no-misused-promises": "off",
  "typescript/await-thenable": "off",
  "typescript/no-floating-promises": "off",
  "typescript/no-redundant-type-constituents": "off",
  "typescript/no-meaningless-void-operator": "off",
  "typescript/prefer-promise-reject-errors": "off",
  "typescript/unbound-method": "off",
  "typescript/no-useless-default-assignment": "off",
  "typescript/no-extra-non-null-assertion": "off",
  "prefer-object-has-own": "off",
  "oxc/no-barrel-file": "off",
  "oxc/branches-sharing-code": "off",
  "jsx-a11y/interactive-supports-focus": "off",
  "jsx-a11y/control-has-associated-label": "off",
  "jsx-a11y/heading-has-content": "off",
  "react/iframe-missing-sandbox": "off",
  "react/memo-dependencies": "off",
  "react/state-in-constructor": "off",
  "react/no-set-state": "off",
  "react/no-clone-element": "off",
  "react-doctor/async-defer-await": "off",
  "react-doctor/no-derived-useState": "off",
  "react-doctor/rendering-svg-precision": "off",
  "react-doctor/advanced-event-handler-refs": "off",
  "react-doctor/no-prop-callback-in-effect": "off",
  "react-doctor/js-cache-property-access": "off",
  "sonarjs/no-duplicated-branches": "off",
  "sonarjs/redundant-type-aliases": "off",
  "sonarjs/constructor-for-side-effects": "off",
  "sonarjs/use-type-alias": "off",
  "sonarjs/no-nested-assignment": "off",
  "sonarjs/destructuring-assignment-syntax": "off",
  "no-alert": "off",
  "no-loop-func": "off",
  "no-new": "off",
  "no-lone-blocks": "off",
  "array-callback-return": "off",
  "prefer-template": "off",
  "no-unused-expressions": "off",
  "preserve-caught-error": "off",
  "no-useless-rename": "off",
  "no-extra-boolean-cast": "off",
  "unicorn/prefer-array-index-of": "off",
  "unicorn/no-array-reverse": "off",
  "unicorn/prefer-type-error": "off",
  "unicorn/prefer-math-min-max": "off",
  "promise/no-return-wrap": "off",
  "promise/param-names": "off",
} as const;

export default defineConfig({
  extends: [core, react, jsPlugins],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "artifacts/**",
    "build/**",
    "dist/**",
    "node_modules/**",
    "src-host/**",
    // Injected browser helper; not product React/TS source.
    "src/browser/annotate.js",
    // One-shot codemods / build scripts — not product runtime.
    "scripts/**",
    // Test fixtures trip oxlint regex/type-aware noise; bun test owns behavior.
    "tests/**",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "oxlint.config.ts",
    "oxfmt.config.ts",
    "stylelint.config.mjs",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts",
    "vite.canvas.config.ts",
    "electrobun.config.ts",
  ],
  jsPlugins: [
    ...jsPlugins.jsPlugins,
    // ESLint rule bridge for product `no-restricted-syntax` selectors.
    { name: "eslint-js", specifier: "oxlint-plugin-eslint" },
    "eslint-plugin-better-tailwindcss",
  ],
  options: {
    typeAware: true,
  },
  settings: {
    ...jsPluginSettings,
    "better-tailwindcss": {
      entryPoint: "src/styles.css",
    },
  },
  rules: {
    ...houseNoiseOff,
    // House standard: prefer `function` declarations for named callables.
    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    "react/function-component-definition": [
      "error",
      {
        // Top-level `function Foo` plus `memo(function Foo)` / `forwardRef(function Foo)`.
        namedComponents: ["function-declaration", "function-expression"],
        unnamedComponents: "arrow-function",
      },
    ],
    // Nullish checks use `== null` / `!= null`.
    eqeqeq: ["error", "always", { null: "ignore" }],
    "no-eq-null": "off",
    // Prettier/oxfmt owns arrow wrapping; do not force block bodies on `.ts`.
    "arrow-body-style": "off",
    // Desktop sources use React/Vite camelCase filenames (useLatestRef, App.tsx).
    "unicorn/filename-case": "off",
    "github/filenames-match-regex": "off",
    // Syncing "latest value" refs during render is the React 18 pattern.
    "react/refs": "off",
    // React Compiler HIR gaps (try/finally, dynamic import) and React 18 / Vite realities.
    "react/todo": "off",
    "react-doctor/prefer-use-effect-event": "off",
    "react-doctor/only-export-components": "off",
    "react-doctor/no-giant-component": "off",
    "react-doctor/no-ref-current-in-render": "off",
    // Domain object key order is intentional; oxfmt owns import sorting.
    "sort-keys": "off",
    // Desktop idioms: `void promise`, `.then(dispose)`, `() => setState()`.
    "no-void": "off",
    "github/no-then": "off",
    "promise/prefer-await-to-then": "off",
    "typescript/no-confusing-void-expression": "off",
    "typescript/strict-void-return": "off",
    // Async wrappers that return promises without awaiting are intentional.
    "require-await": "off",
    // Nested conditionals are common in dense UI trees; sonar duplicates eslint.
    "no-nested-ternary": "off",
    "sonarjs/no-nested-conditional": "off",
    // Hooks: App-scale effects; exhaustive-deps remains a follow-up theme.
    "react-hooks/exhaustive-deps": "off",
    // Non-null assertions are deliberate at IPC/DOM boundaries for now.
    "typescript/no-non-null-assertion": "off",
    // Product UI constraints (ESLint bridge).
    "eslint-js/no-restricted-syntax": [
      "error",
      rawButtonRestriction,
      rawTextareaRestriction,
      inlineRadiusRestriction,
    ],
    "better-tailwindcss/no-restricted-classes": [
      "error",
      {
        restrict: [radiusClassRestriction],
      },
    ],
  },
  overrides: [
    {
      files: ["src/components/ui/textarea.tsx"],
      rules: {
        "eslint-js/no-restricted-syntax": ["error", inlineRadiusRestriction],
      },
    },
    {
      files: ["src/components/ui/icons.tsx"],
      rules: {
        // Deep @hugeicons/core-free-icons/* imports are typed under tsc via
        // package exports, but tsgolint still resolves them as error-typed.
        "typescript/no-unsafe-argument": "off",
      },
    },
    {
      files: ["src/canvas/excalidrawAdapter.ts", "src/lib/ipcResult.ts"],
      rules: {
        "typescript/no-explicit-any": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
      },
    },
    {
      files: ["src/**/*.test.{ts,tsx}", "tests/**/*.{ts,tsx}"],
      rules: {
        "eslint-js/no-restricted-syntax": [
          "error",
          rawTextareaRestriction,
          inlineRadiusRestriction,
        ],
        // Fixtures and mocks intentionally use loose JSON shapes.
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/no-explicit-any": "off",
        "typescript/unbound-method": "off",
        "typescript/strict-boolean-expressions": "off",
        "typescript/no-floating-promises": "off",
        "typescript/no-misused-promises": "off",
        "typescript/prefer-nullish-coalescing": "off",
        "typescript/no-unnecessary-type-assertion": "off",
        "import/no-duplicates": "off",
        "no-duplicate-imports": "off",
      },
    },
  ],
});
