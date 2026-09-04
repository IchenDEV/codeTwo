import { describe, expect, test } from "bun:test";

import { resolveThemeColorProperties } from "../src/design/theme";

const palette = {
  accent: "#356de6",
  background: "#ffffff",
  foreground: "#172033",
};

describe("theme color resolution", () => {
  test("keeps the complete light neutral ladder subtle and ordered", () => {
    const properties = resolveThemeColorProperties(palette, "light", 45);

    expect(properties).toMatchObject({
      "--background": palette.background,
      "--ds-color-canvas": palette.background,
      "--ds-color-surface": "color-mix(in oklch, #172033 1%, #ffffff)",
      "--ds-color-raised": "color-mix(in oklch, #172033 0.25%, #ffffff)",
      "--ds-color-modal": palette.background,
      "--ds-color-fill-quiet": "color-mix(in oklch, #172033 2.5%, #ffffff)",
      "--ds-color-fill-rest": "color-mix(in oklch, #172033 4%, #ffffff)",
      "--ds-color-fill-hover": "color-mix(in oklch, #172033 6.5%, #ffffff)",
    });
  });

  test("preserves the established dark neutral ladder", () => {
    const properties = resolveThemeColorProperties(
      {
        accent: "#77a7ff",
        background: "#18191d",
        foreground: "#f2f4f8",
      },
      "dark",
      45
    );

    expect(properties).toMatchObject({
      "--ds-color-surface": "color-mix(in oklch, #f2f4f8 7%, #18191d)",
      "--ds-color-raised": "color-mix(in oklch, #f2f4f8 11%, #18191d)",
      "--ds-color-modal": "color-mix(in oklch, #f2f4f8 11%, #18191d)",
      "--ds-color-fill-quiet": "color-mix(in oklch, #f2f4f8 4%, #18191d)",
      "--ds-color-fill-rest": "color-mix(in oklch, #f2f4f8 6%, #18191d)",
      "--ds-color-fill-hover": "color-mix(in oklch, #f2f4f8 9%, #18191d)",
    });
  });

  test("maps legacy and semantic roles through the same resolved values", () => {
    const properties = resolveThemeColorProperties(palette, "light", 45);

    expect(properties["--card"]).toBe(properties["--ds-color-surface"]);
    expect(properties["--popover"]).toBe(properties["--ds-color-raised"]);
    expect(properties["--foreground"]).toBe(properties["--ds-color-text"]);
    expect(properties["--primary"]).toBe(properties["--ds-color-primary"]);
  });
});
