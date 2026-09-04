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
    "declaration-property-value-allowed-list": {
      "border-radius": ["0", "0px", "50%", "inherit", semanticRadius],
    },
  },
};
