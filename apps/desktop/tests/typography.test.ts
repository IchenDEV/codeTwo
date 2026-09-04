import { describe, expect, test } from "bun:test";

import {
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  resolveTypographyProperties,
} from "../src/design/typography";

describe("Codex-aligned typography engine", () => {
  test("resolves every semantic role and compatibility alias from the default controls", () => {
    expect(
      resolveTypographyProperties({
        uiFontSize: DEFAULT_UI_FONT_SIZE,
        codeFontSize: DEFAULT_CODE_FONT_SIZE,
      })
    ).toEqual({
      "--ds-type-large-title-size": "28px",
      "--ds-type-large-title-leading": "34px",
      "--ds-type-page-title-size": "20px",
      "--ds-type-page-title-leading": "28px",
      "--ds-type-section-size": "18px",
      "--ds-type-section-leading": "24px",
      "--ds-type-dialog-size": "16px",
      "--ds-type-dialog-leading": "22px",
      "--ds-type-body-size": "14px",
      "--ds-type-body-leading": "20px",
      "--ds-type-prose-size": "14px",
      "--ds-type-prose-leading": "23px",
      "--ds-type-callout-size": "13px",
      "--ds-type-callout-leading": "18px",
      "--ds-type-metadata-size": "12px",
      "--ds-type-metadata-leading": "16px",
      "--ds-type-caption-size": "11px",
      "--ds-type-caption-leading": "14px",
      "--ds-type-code-size": "12px",
      "--ds-type-code-leading": "18px",
      "--appearance-code-size": "12px",
      "--text-cap": "11px",
      "--text-fine": "13px",
      "--text-hint": "12px",
      "--text-ui": "14px",
      "--text-title": "16px",
      "--text-heading": "18px",
      "--text-display": "20px",
    });
  });

  test("keeps the hierarchy and paired leading when users adjust UI and code independently", () => {
    const properties = resolveTypographyProperties({
      uiFontSize: 16,
      codeFontSize: 14,
    });

    expect(properties["--ds-type-body-size"]).toBe("16px");
    expect(properties["--ds-type-body-leading"]).toBe("22px");
    expect(properties["--ds-type-prose-leading"]).toBe("25px");
    expect(properties["--ds-type-callout-size"]).toBe("15px");
    expect(properties["--ds-type-metadata-size"]).toBe("14px");
    expect(properties["--ds-type-caption-size"]).toBe("13px");
    expect(properties["--ds-type-code-size"]).toBe("14px");
    expect(properties["--ds-type-code-leading"]).toBe("21px");
  });
});
