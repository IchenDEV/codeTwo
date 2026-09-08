import ultracite from "ultracite/stylelint";

const semanticRadius =
  /^var\(--(?:ds-(?:radius-(?:micro|control|module|modal)|(?:button|input|card|dialog|composer|menu|menu-item)-radius)|canvas-(?:radius-(?:control|module)|button-radius)|tabs-indicator-radius)\)$/;

const ignoreAtRules = new Set([
  ...(ultracite.rules?.["at-rule-no-unknown"]?.[1]?.ignoreAtRules ?? []),
  "apply",
  "custom-variant",
  "layer",
  "theme",
  "utility",
]);

// Product CSS uses BEM (`block__element--modifier`) and Tailwind-style paired tokens
// (`--text-body--line-height`). Stylelint matches custom properties without the `--` prefix.
const bemSelector =
  /^(?:[a-z][a-z0-9]*(?:-+[a-z0-9]+)*(?:__(?:[a-z0-9]+(?:-+[a-z0-9]+)*)(?:--+[a-z0-9]+(?:-+[a-z0-9]+)*)*)?(?:--+[a-z0-9]+(?:-+[a-z0-9]+)*)?|[A-Z][A-Za-z0-9]*(?:[_-]{1,2}[A-Za-z0-9]+)*)$/;
const tokenCustomProperty =
  /^[a-z][a-z0-9]*(?:-+[a-z0-9]+)*(?:--+[a-z0-9]+(?:-+[a-z0-9]+)*)*$/;

export default {
  ...ultracite,
  ignoreFiles: ["artifacts/**", "dist/**", "node_modules/**"],
  rules: {
    ...ultracite.rules,
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [...ignoreAtRules],
      },
    ],
    "custom-property-pattern": [
      tokenCustomProperty.source,
      {
        message: "Expected custom property name to use kebab-case tokens",
      },
    ],
    "declaration-property-value-allowed-list": {
      "border-radius": ["0", "0px", "50%", "inherit", semanticRadius],
    },
    // Tailwind v4 `@utility` blocks use `&` without a classic selector scoping root.
    "nesting-selector-no-missing-scoping-root": null,
    "selector-class-pattern": [
      bemSelector.source,
      {
        message:
          "Expected class selector to be kebab-case or BEM (block__element--modifier)",
        resolveNestedSelectors: true,
      },
    ],
  },
};
