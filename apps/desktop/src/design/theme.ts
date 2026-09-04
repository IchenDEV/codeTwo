export type ColorScheme = "light" | "dark";

export interface ThemePalette {
  accent: string;
  background: string;
  foreground: string;
}

interface ToneScale {
  surface: number;
  raised: number;
  sidebar: number;
  muted: number;
  fillQuiet: number;
  fillRest: number;
  fillHover: number;
  terminal: number;
}

const toneScale: Record<ColorScheme, ToneScale> = {
  dark: {
    fillHover: 9,
    fillQuiet: 4,
    fillRest: 6,
    muted: 14,
    raised: 11,
    sidebar: 5,
    surface: 7,
    terminal: 3,
  },
  light: {
    fillHover: 6.5,
    fillQuiet: 2.5,
    fillRest: 4,
    muted: 6,
    raised: 0.25,
    sidebar: 3,
    surface: 1,
    terminal: 88,
  },
};

function mix(foreground: string, amount: number, background: string): string {
  return `color-mix(in oklch, ${foreground} ${amount}%, ${background})`;
}

export function resolveThemeColorProperties(
  source: ThemePalette,
  scheme: ColorScheme,
  contrast: number
): Record<string, string> {
  const { accent, background, foreground } = source;
  const tones = toneScale[scheme];
  const surface = mix(foreground, tones.surface, background);
  const raised = mix(foreground, tones.raised, background);
  const sidebar = mix(foreground, tones.sidebar, background);
  const muted = mix(foreground, tones.muted, background);
  const mutedForeground = mix(
    foreground,
    58 + Math.round(contrast * 0.2),
    background
  );
  const border = mix(foreground, 8 + Math.round(contrast * 0.12), background);
  const accentSurface = mix(
    accent,
    12 + Math.round(contrast * 0.04),
    background
  );

  return {
    "--accent": accentSurface,
    "--accent-foreground": foreground,
    "--background": background,
    "--border": border,
    "--card": surface,
    "--card-foreground": foreground,
    "--ds-color-canvas": background,
    "--ds-color-fill-hover": mix(foreground, tones.fillHover, background),
    "--ds-color-fill-quiet": mix(foreground, tones.fillQuiet, background),
    "--ds-color-fill-rest": mix(foreground, tones.fillRest, background),
    "--ds-color-focus": foreground,
    "--ds-color-modal": scheme === "light" ? background : raised,
    "--ds-color-primary": accent,
    "--ds-color-primary-hover": mix(foreground, 8, accent),
    "--ds-color-primary-text": background,
    "--ds-color-raised": raised,
    "--ds-color-sidebar": sidebar,
    "--ds-color-surface": surface,
    "--ds-color-text": foreground,
    "--ds-color-text-muted": mutedForeground,
    "--foreground": foreground,
    "--input": border,
    "--muted": muted,
    "--muted-foreground": mutedForeground,
    "--popover": raised,
    "--popover-foreground": foreground,
    "--primary": accent,
    "--primary-foreground": background,
    "--ring": accent,
    "--secondary": muted,
    "--secondary-foreground": foreground,
    "--sidebar": sidebar,
    "--sidebar-border": border,
    "--sidebar-foreground": foreground,
    "--terminal": mix(foreground, tones.terminal, background),
  };
}
