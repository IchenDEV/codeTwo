export type ColorScheme = "light" | "dark"

export interface ThemePalette {
  accent: string
  background: string
  foreground: string
}

interface ToneScale {
  surface: number
  raised: number
  sidebar: number
  muted: number
  fillQuiet: number
  fillRest: number
  fillHover: number
  terminal: number
}

const TONE_SCALE: Record<ColorScheme, ToneScale> = {
  light: {
    surface: 2,
    raised: 0.25,
    sidebar: 3,
    muted: 6,
    fillQuiet: 2.5,
    fillRest: 4,
    fillHover: 6.5,
    terminal: 88,
  },
  dark: {
    surface: 7,
    raised: 11,
    sidebar: 5,
    muted: 14,
    fillQuiet: 4,
    fillRest: 6,
    fillHover: 9,
    terminal: 3,
  },
}

function mix(foreground: string, amount: number, background: string): string {
  return `color-mix(in oklch, ${foreground} ${amount}%, ${background})`
}

/**
 * Resolves the complete color interface consumed by the desktop renderer.
 *
 * Product modules never calculate theme colors. They consume semantic utilities backed by these
 * properties, so a palette or tonal adjustment remains local to this module.
 */
export function resolveThemeColorProperties(
  source: ThemePalette,
  scheme: ColorScheme,
  contrast: number,
): Record<string, string> {
  const { accent, background, foreground } = source
  const tones = TONE_SCALE[scheme]
  const surface = mix(foreground, tones.surface, background)
  const raised = mix(foreground, tones.raised, background)
  const sidebar = mix(foreground, tones.sidebar, background)
  const muted = mix(foreground, tones.muted, background)
  const mutedForeground = mix(foreground, 58 + Math.round(contrast * 0.2), background)
  const border = mix(foreground, 8 + Math.round(contrast * 0.12), background)
  const accentSurface = mix(accent, 12 + Math.round(contrast * 0.04), background)

  return {
    "--background": background,
    "--foreground": foreground,
    "--card": surface,
    "--card-foreground": foreground,
    "--popover": raised,
    "--popover-foreground": foreground,
    "--primary": accent,
    "--primary-foreground": background,
    "--secondary": muted,
    "--secondary-foreground": foreground,
    "--muted": muted,
    "--muted-foreground": mutedForeground,
    "--accent": accentSurface,
    "--accent-foreground": foreground,
    "--border": border,
    "--input": border,
    "--ring": accent,
    "--sidebar": sidebar,
    "--sidebar-foreground": foreground,
    "--sidebar-border": border,
    "--terminal": mix(foreground, tones.terminal, background),
    "--ds-color-canvas": background,
    "--ds-color-sidebar": sidebar,
    "--ds-color-surface": surface,
    "--ds-color-raised": raised,
    "--ds-color-modal": scheme === "light" ? background : raised,
    "--ds-color-text": foreground,
    "--ds-color-text-muted": mutedForeground,
    "--ds-color-fill-quiet": mix(foreground, tones.fillQuiet, background),
    "--ds-color-fill-rest": mix(foreground, tones.fillRest, background),
    "--ds-color-fill-hover": mix(foreground, tones.fillHover, background),
    "--ds-color-primary": accent,
    "--ds-color-primary-hover": mix(foreground, 8, accent),
    "--ds-color-primary-text": background,
    "--ds-color-focus": foreground,
  }
}
