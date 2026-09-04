const semanticRadius =
  /^var\(--(?:ds-(?:radius-(?:micro|control|module|modal)|(?:button|input|card|dialog|composer|menu|menu-item)-radius)|canvas-(?:radius-(?:control|module)|button-radius)|tabs-indicator-radius)\)$/;

/**
 * Stylelint stays product-focused: semantic border-radius allow-list plus a
 * small CSS hygiene set. Ultracite's Stylelint preset is not used here because
 * its notation/order rules fight the design-token CSS source of truth.
 */
export default {
  ignoreFiles: ["artifacts/**", "dist/**", "node_modules/**"],
  rules: {
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["apply", "custom-variant", "layer", "theme", "utility"],
      },
    ],
    "block-no-empty": true,
    "color-no-invalid-hex": true,
    "declaration-block-no-duplicate-custom-properties": true,
    "declaration-block-no-duplicate-properties": true,
    "declaration-property-value-allowed-list": {
      "border-radius": ["0", "0px", "50%", "inherit", semanticRadius],
    },
    "font-family-no-duplicate-names": true,
    "function-calc-no-unspaced-operator": true,
    "keyframe-block-no-duplicate-selectors": true,
    "no-duplicate-selectors": true,
    "property-no-unknown": true,
    "selector-pseudo-class-no-unknown": true,
    "selector-pseudo-element-no-unknown": true,
    "string-no-newline": true,
    "unit-no-unknown": true,
  },
};
