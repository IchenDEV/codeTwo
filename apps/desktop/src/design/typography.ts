export const defaultUiFontSize = 14;
export const defaultCodeFontSize = 12;

export interface TypographyPreferences {
  uiFontSize: number;
  codeFontSize: number;
}

export type TypographyProperties = Record<`--${string}`, string>;

function px(value: number): string {
  return `${value}px`;
}

export function resolveTypographyProperties({
  uiFontSize,
  codeFontSize,
}: TypographyPreferences): TypographyProperties {
  const uiDelta = uiFontSize - defaultUiFontSize;
  const largeTitle = uiFontSize + 14;
  const pageTitle = uiFontSize + 6;
  const section = uiFontSize + 4;
  const dialog = uiFontSize + 2;
  const callout = uiFontSize - 1;
  const metadata = uiFontSize - 2;
  const caption = uiFontSize - 3;
  const codeLeading = Math.round(codeFontSize * 1.5);

  return {
    "--appearance-code-size": px(codeFontSize),
    "--ds-type-body-leading": px(20 + uiDelta),
    "--ds-type-body-size": px(uiFontSize),
    "--ds-type-callout-leading": px(18 + uiDelta),
    "--ds-type-callout-size": px(callout),
    "--ds-type-caption-leading": px(14 + uiDelta),
    "--ds-type-caption-size": px(caption),
    "--ds-type-code-leading": px(codeLeading),
    "--ds-type-code-size": px(codeFontSize),
    "--ds-type-dialog-leading": px(22 + uiDelta),
    "--ds-type-dialog-size": px(dialog),
    "--ds-type-large-title-leading": px(34 + uiDelta),
    "--ds-type-large-title-size": px(largeTitle),
    "--ds-type-metadata-leading": px(16 + uiDelta),
    "--ds-type-metadata-size": px(metadata),
    "--ds-type-page-title-leading": px(28 + uiDelta),
    "--ds-type-page-title-size": px(pageTitle),
    "--ds-type-prose-leading": px(23 + uiDelta),
    "--ds-type-prose-size": px(uiFontSize),
    "--ds-type-section-leading": px(24 + uiDelta),
    "--ds-type-section-size": px(section),
    "--text-cap": px(caption),
    "--text-display": px(pageTitle),
    "--text-fine": px(callout),
    "--text-heading": px(section),
    "--text-hint": px(metadata),
    "--text-title": px(dialog),
    "--text-ui": px(uiFontSize),
  };
}
