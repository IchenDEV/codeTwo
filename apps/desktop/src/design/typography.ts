export const DEFAULT_UI_FONT_SIZE = 14;
export const DEFAULT_CODE_FONT_SIZE = 12;

export interface TypographyPreferences {
  uiFontSize: number;
  codeFontSize: number;
}

export type TypographyProperties = Record<`--${string}`, string>;

function px(value: number): string {
  return `${value}px`;
}

/**
 * Resolves the complete renderer type contract from the two user-facing controls.
 *
 * Product components consume semantic roles; they never derive a local scale. Keeping this
 * function pure also lets CSS defaults, appearance hydration, previews, and tests agree on the
 * exact Codex-aligned rhythm.
 */
export function resolveTypographyProperties({
  uiFontSize,
  codeFontSize,
}: TypographyPreferences): TypographyProperties {
  const uiDelta = uiFontSize - DEFAULT_UI_FONT_SIZE;
  const largeTitle = uiFontSize + 14;
  const pageTitle = uiFontSize + 6;
  const section = uiFontSize + 4;
  const dialog = uiFontSize + 2;
  const callout = uiFontSize - 1;
  const metadata = uiFontSize - 2;
  const caption = uiFontSize - 3;
  const codeLeading = Math.round(codeFontSize * 1.5);

  return {
    "--ds-type-large-title-size": px(largeTitle),
    "--ds-type-large-title-leading": px(34 + uiDelta),
    "--ds-type-page-title-size": px(pageTitle),
    "--ds-type-page-title-leading": px(28 + uiDelta),
    "--ds-type-section-size": px(section),
    "--ds-type-section-leading": px(24 + uiDelta),
    "--ds-type-dialog-size": px(dialog),
    "--ds-type-dialog-leading": px(22 + uiDelta),
    "--ds-type-body-size": px(uiFontSize),
    "--ds-type-body-leading": px(20 + uiDelta),
    "--ds-type-prose-size": px(uiFontSize),
    "--ds-type-prose-leading": px(23 + uiDelta),
    "--ds-type-callout-size": px(callout),
    "--ds-type-callout-leading": px(18 + uiDelta),
    "--ds-type-metadata-size": px(metadata),
    "--ds-type-metadata-leading": px(16 + uiDelta),
    "--ds-type-caption-size": px(caption),
    "--ds-type-caption-leading": px(14 + uiDelta),
    "--ds-type-code-size": px(codeFontSize),
    "--ds-type-code-leading": px(codeLeading),
    "--appearance-code-size": px(codeFontSize),

    // CSS-only compatibility aliases. The source scanner prevents product code from using them.
    "--text-cap": px(caption),
    "--text-fine": px(callout),
    "--text-hint": px(metadata),
    "--text-ui": px(uiFontSize),
    "--text-title": px(dialog),
    "--text-heading": px(section),
    "--text-display": px(pageTitle),
  };
}
