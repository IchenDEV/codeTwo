import { useSyncExternalStore } from "react";

import {
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  resolveTypographyProperties,
} from "./design/typography";
import { resolveThemeColorProperties } from "./design/theme";
import type { ColorScheme, ThemePalette } from "./design/theme";

export type { ColorScheme, ThemePalette } from "./design/theme";
export type ThemePreference = ColorScheme | "system";
export type AppearanceColorKey = "accent" | "background" | "foreground";
export type PetSize = "small" | "medium" | "large";
export type PetSource = "builtin" | "petshare";
export type FontWeightId = "regular" | "medium" | "semibold";
export type ReduceMotionPreference = "system" | "on" | "off";
export type DiffMarkerPreference = "color" | "symbols";

export interface AppearanceTheme {
  id: string;
  name: string;
  builtin: boolean;
  light: ThemePalette;
  dark: ThemePalette;
}

export interface SchemeAppearanceProfile {
  uiFont: UiFontId;
  uiFontWeight: FontWeightId;
  codeFont: CodeFontId;
  codeFontWeight: FontWeightId;
  sidebarOpacity: number;
  contrast: number;
}

export interface AppearanceSettings {
  version: 3;
  preference: ThemePreference;
  activeThemeId: string;
  customThemes: AppearanceTheme[];
  petEnabled: boolean;
  petActivityEnabled: boolean;
  petSize: PetSize;
  petSource: PetSource;
  petId: string;
  petName: string;
  light: SchemeAppearanceProfile;
  dark: SchemeAppearanceProfile;
  uiFontSize: number;
  codeFontSize: number;
  pointerCursors: boolean;
  reduceMotion: ReduceMotionPreference;
  diffMarkers: DiffMarkerPreference;
}

export const UI_FONTS = [
  {
    id: "system",
    label: "System",
    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: "inter",
    label: "Inter",
    stack: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: "avenir",
    label: "Avenir Next",
    stack: '"Avenir Next", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    id: "helvetica",
    label: "Helvetica Neue",
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
] as const;

export const CODE_FONTS = [
  {
    id: "system-mono",
    label: "System Mono",
    stack: 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace',
  },
  {
    id: "sf-mono",
    label: "SF Mono",
    stack: '"SF Mono", ui-monospace, Menlo, monospace',
  },
  {
    id: "menlo",
    label: "Menlo",
    stack: "Menlo, Monaco, ui-monospace, monospace",
  },
  {
    id: "monaco",
    label: "Monaco",
    stack: "Monaco, Menlo, ui-monospace, monospace",
  },
] as const;

export const FONT_WEIGHTS = [
  { id: "regular", value: 400 },
  { id: "medium", value: 500 },
  { id: "semibold", value: 600 },
] as const;

export type UiFontId = (typeof UI_FONTS)[number]["id"];
export type CodeFontId = (typeof CODE_FONTS)[number]["id"];

const STORAGE_KEY = "codetwo.appearance.v1";
const LEGACY_THEME_KEY = "codetwo.theme";
const THEME_DOCUMENT_FORMAT = "codetwo-theme";
const MAX_CUSTOM_THEMES = 24;

function palette(
  accent: string,
  background: string,
  foreground: string
): ThemePalette {
  return { accent, background, foreground };
}

function themeToken(
  theme: string,
  scheme: ColorScheme,
  role: AppearanceColorKey
): string {
  return `var(--ds-theme-${theme}-${scheme}-${role})`;
}

function builtInTheme(id: string, name: string): AppearanceTheme {
  return {
    id,
    name,
    builtin: true,
    light: palette(
      themeToken(id, "light", "accent"),
      themeToken(id, "light", "background"),
      themeToken(id, "light", "foreground")
    ),
    dark: palette(
      themeToken(id, "dark", "accent"),
      themeToken(id, "dark", "background"),
      themeToken(id, "dark", "foreground")
    ),
  };
}

export const BUILT_IN_THEMES: AppearanceTheme[] = [
  builtInTheme("code2", "C2"),
  builtInTheme("ocean", "Ocean"),
  builtInTheme("grove", "Grove"),
  builtInTheme("ember", "Ember"),
  builtInTheme("iris", "Iris"),
  builtInTheme("rose", "Rose"),
];

const DEFAULT_SCHEME_PROFILE: SchemeAppearanceProfile = {
  uiFont: "system",
  uiFontWeight: "regular",
  codeFont: "system-mono",
  codeFontWeight: "regular",
  sidebarOpacity: 80,
  contrast: 45,
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  version: 3,
  preference: "system",
  activeThemeId: "code2",
  customThemes: [],
  petEnabled: true,
  petActivityEnabled: true,
  petSize: "medium",
  petSource: "builtin",
  petId: "naiwa",
  petName: "Naiwa",
  light: { ...DEFAULT_SCHEME_PROFILE },
  dark: { ...DEFAULT_SCHEME_PROFILE },
  uiFontSize: DEFAULT_UI_FONT_SIZE,
  codeFontSize: DEFAULT_CODE_FONT_SIZE,
  pointerCursors: true,
  reduceMotion: "system",
  diffMarkers: "color",
};

function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isPetSize(value: unknown): value is PetSize {
  return value === "small" || value === "medium" || value === "large";
}

function isPetSource(value: unknown): value is PetSource {
  return value === "builtin" || value === "petshare";
}

function isFontWeight(value: unknown): value is FontWeightId {
  return includesId(FONT_WEIGHTS, value);
}

function isReduceMotion(value: unknown): value is ReduceMotionPreference {
  return value === "system" || value === "on" || value === "off";
}

function isDiffMarkers(value: unknown): value is DiffMarkerPreference {
  return value === "color" || value === "symbols";
}

function safePetId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value)
    ? value
    : null;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const name = value.trim().replaceAll(/\s+/g, " ").slice(0, 40);
  return name || fallback;
}

function safePalette(value: unknown): ThemePalette | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ThemePalette>;
  if (
    !isHexColor(candidate.accent) ||
    !isHexColor(candidate.background) ||
    !isHexColor(candidate.foreground)
  ) {
    return null;
  }
  return {
    accent: candidate.accent.toLowerCase(),
    background: candidate.background.toLowerCase(),
    foreground: candidate.foreground.toLowerCase(),
  };
}

function safeCustomTheme(
  value: unknown,
  fallbackId: string
): AppearanceTheme | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<AppearanceTheme>;
  const light = safePalette(candidate.light);
  const dark = safePalette(candidate.dark);
  if (!light || !dark) {
    return null;
  }
  return {
    id:
      typeof candidate.id === "string" &&
      /^custom-[\w-]{1,80}$/.test(candidate.id)
        ? candidate.id
        : fallbackId,
    name: safeName(candidate.name, "Imported theme"),
    builtin: false,
    light,
    dark,
  };
}

function includesId<T extends readonly { id: string }[]>(
  items: T,
  value: unknown
): value is T[number]["id"] {
  return typeof value === "string" && items.some((item) => item.id === value);
}

function safeSchemeProfile(
  value: unknown,
  fallback: SchemeAppearanceProfile
): SchemeAppearanceProfile {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<SchemeAppearanceProfile>)
      : {};
  return {
    uiFont: includesId(UI_FONTS, candidate.uiFont)
      ? candidate.uiFont
      : fallback.uiFont,
    uiFontWeight: isFontWeight(candidate.uiFontWeight)
      ? candidate.uiFontWeight
      : fallback.uiFontWeight,
    codeFont: includesId(CODE_FONTS, candidate.codeFont)
      ? candidate.codeFont
      : fallback.codeFont,
    codeFontWeight: isFontWeight(candidate.codeFontWeight)
      ? candidate.codeFontWeight
      : fallback.codeFontWeight,
    sidebarOpacity: clamp(
      candidate.sidebarOpacity,
      40,
      100,
      fallback.sidebarOpacity
    ),
    contrast: clamp(candidate.contrast, 0, 100, fallback.contrast),
  };
}

export function normalizeAppearanceSettings(
  value: unknown
): AppearanceSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Omit<
          Partial<AppearanceSettings>,
          "version" | "light" | "dark"
        > & {
          version?: number;
          light?: unknown;
          dark?: unknown;
          uiFont?: unknown;
          codeFont?: unknown;
          sidebarOpacity?: unknown;
          contrast?: unknown;
        })
      : {};
  const uiFontSize =
    candidate.version !== 2 &&
    candidate.version !== 3 &&
    candidate.uiFontSize === 13
      ? DEFAULT_UI_FONT_SIZE
      : candidate.uiFontSize;
  const legacyProfile = safeSchemeProfile(
    {
      uiFont: candidate.uiFont,
      codeFont: candidate.codeFont,
      sidebarOpacity: candidate.sidebarOpacity,
      contrast: candidate.contrast,
    },
    DEFAULT_SCHEME_PROFILE
  );
  const requestedPetSource = isPetSource(candidate.petSource)
    ? candidate.petSource
    : DEFAULT_APPEARANCE_SETTINGS.petSource;
  const petId = safePetId(candidate.petId);
  const petSource =
    requestedPetSource === "petshare" && petId
      ? requestedPetSource
      : DEFAULT_APPEARANCE_SETTINGS.petSource;
  const customThemes: AppearanceTheme[] = [];
  const seenThemeIds = new Set<string>();
  if (Array.isArray(candidate.customThemes)) {
    for (const [index, value] of candidate.customThemes.entries()) {
      if (customThemes.length >= MAX_CUSTOM_THEMES) {
        break;
      }
      const theme = safeCustomTheme(value, `custom-imported-${index}`);
      if (!theme || seenThemeIds.has(theme.id)) {
        continue;
      }
      seenThemeIds.add(theme.id);
      customThemes.push(theme);
    }
  }
  const availableIds = new Set(
    Iterator.concat(
      BUILT_IN_THEMES.map((theme) => theme.id),
      customThemes.map((theme) => theme.id)
    )
  );
  return {
    version: 3,
    preference: isPreference(candidate.preference)
      ? candidate.preference
      : DEFAULT_APPEARANCE_SETTINGS.preference,
    activeThemeId:
      typeof candidate.activeThemeId === "string" &&
      availableIds.has(candidate.activeThemeId)
        ? candidate.activeThemeId
        : DEFAULT_APPEARANCE_SETTINGS.activeThemeId,
    customThemes,
    petEnabled:
      typeof candidate.petEnabled === "boolean"
        ? candidate.petEnabled
        : DEFAULT_APPEARANCE_SETTINGS.petEnabled,
    petActivityEnabled:
      typeof candidate.petActivityEnabled === "boolean"
        ? candidate.petActivityEnabled
        : DEFAULT_APPEARANCE_SETTINGS.petActivityEnabled,
    petSize: isPetSize(candidate.petSize)
      ? candidate.petSize
      : DEFAULT_APPEARANCE_SETTINGS.petSize,
    petSource,
    petId:
      petSource === "petshare" && petId
        ? petId
        : DEFAULT_APPEARANCE_SETTINGS.petId,
    petName:
      petSource === "petshare"
        ? safeName(
            candidate.petName,
            petId ?? DEFAULT_APPEARANCE_SETTINGS.petName
          )
        : DEFAULT_APPEARANCE_SETTINGS.petName,
    light: safeSchemeProfile(candidate.light, legacyProfile),
    dark: safeSchemeProfile(candidate.dark, legacyProfile),
    uiFontSize: clamp(
      uiFontSize,
      12,
      16,
      DEFAULT_APPEARANCE_SETTINGS.uiFontSize
    ),
    codeFontSize: clamp(
      candidate.codeFontSize,
      11,
      18,
      DEFAULT_APPEARANCE_SETTINGS.codeFontSize
    ),
    pointerCursors:
      typeof candidate.pointerCursors === "boolean"
        ? candidate.pointerCursors
        : DEFAULT_APPEARANCE_SETTINGS.pointerCursors,
    reduceMotion: isReduceMotion(candidate.reduceMotion)
      ? candidate.reduceMotion
      : DEFAULT_APPEARANCE_SETTINGS.reduceMotion,
    diffMarkers: isDiffMarkers(candidate.diffMarkers)
      ? candidate.diffMarkers
      : DEFAULT_APPEARANCE_SETTINGS.diffMarkers,
  };
}

function read(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeAppearanceSettings(JSON.parse(raw));
    }
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    return normalizeAppearanceSettings({
      ...DEFAULT_APPEARANCE_SETTINGS,
      preference: isPreference(legacy) ? legacy : "system",
    });
  } catch {
    return DEFAULT_APPEARANCE_SETTINGS;
  }
}

const listeners = new Set<() => void>();
let snapshot = read();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(LEGACY_THEME_KEY, snapshot.preference);
  } catch {
    /*
    private mode — settings stay live for this process
    */
  }
}

function emit(next: AppearanceSettings): void {
  snapshot = normalizeAppearanceSettings(next);
  persist();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppearanceSettings(): AppearanceSettings {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function getAppearanceSettings(): AppearanceSettings {
  return snapshot;
}

export function setAppearanceSettings(
  patch:
    | Partial<AppearanceSettings>
    | ((current: AppearanceSettings) => AppearanceSettings)
): void {
  const next =
    typeof patch === "function" ? patch(snapshot) : { ...snapshot, ...patch };
  emit(next);
}

export function resetAppearanceSettings(): void {
  emit(DEFAULT_APPEARANCE_SETTINGS);
}

/**
Restore visual appearance without changing the companion configured on its own settings page.
*/
export function resetVisualAppearanceSettings(): void {
  emit({
    ...DEFAULT_APPEARANCE_SETTINGS,
    petEnabled: snapshot.petEnabled,
    petActivityEnabled: snapshot.petActivityEnabled,
    petSize: snapshot.petSize,
    petSource: snapshot.petSource,
    petId: snapshot.petId,
    petName: snapshot.petName,
  });
}

/**
Restore only settings owned by the Pets page.
*/
export function resetPetSettings(): void {
  emit({
    ...snapshot,
    petEnabled: DEFAULT_APPEARANCE_SETTINGS.petEnabled,
    petActivityEnabled: DEFAULT_APPEARANCE_SETTINGS.petActivityEnabled,
    petSize: DEFAULT_APPEARANCE_SETTINGS.petSize,
    petSource: DEFAULT_APPEARANCE_SETTINGS.petSource,
    petId: DEFAULT_APPEARANCE_SETTINGS.petId,
    petName: DEFAULT_APPEARANCE_SETTINGS.petName,
  });
}

export function themeCatalog(settings = snapshot): AppearanceTheme[] {
  return [...BUILT_IN_THEMES, ...settings.customThemes];
}

export function themeById(id: string, settings = snapshot): AppearanceTheme {
  return (
    themeCatalog(settings).find((theme) => theme.id === id) ??
    BUILT_IN_THEMES[0]
  );
}

function cssVariableName(value: string): string | null {
  return /^var\((--[\w-]+)\)$/.exec(value)?.[1] ?? null;
}

export function resolveThemeColor(value: string): string {
  const variable = cssVariableName(value);
  if (!variable || typeof document === "undefined") {
    return value;
  }
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
}

export function materializeTheme(theme: AppearanceTheme): AppearanceTheme {
  const resolvePalette = (source: ThemePalette): ThemePalette => ({
										    accent: resolveThemeColor(source.accent),
										    background: resolveThemeColor(source.background),
										    foreground: resolveThemeColor(source.foreground),
										  });
  const light = resolvePalette(theme.light);
  const dark = resolvePalette(theme.dark);
  if (![...Object.values(light), ...Object.values(dark)].every(isHexColor)) {
    throw new Error("Theme colors are not available yet.");
  }
  return { ...theme, light, dark };
}

function customId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function duplicateTheme(id: string, name?: string): AppearanceTheme {
  if (snapshot.customThemes.length >= MAX_CUSTOM_THEMES) {
    throw new Error("Theme limit reached.");
  }
  const source = materializeTheme(themeById(id));
  const copy: AppearanceTheme = {
    ...source,
    id: customId(),
    name: safeName(name, `${source.name} Copy`),
    builtin: false,
  };
  emit({
    ...snapshot,
    activeThemeId: copy.id,
    customThemes: [...snapshot.customThemes, copy],
  });
  return copy;
}

export function updateCustomTheme(
  id: string,
  patch: Partial<Omit<AppearanceTheme, "id" | "builtin">>
): void {
  const customThemes = snapshot.customThemes.map((theme) => {
    if (theme.id !== id) {
      return theme;
    }
    return (
      safeCustomTheme({ ...theme, ...patch, id, builtin: false }, id) ?? theme
    );
  });
  emit({ ...snapshot, customThemes });
}

export function removeCustomTheme(id: string): void {
  const customThemes = snapshot.customThemes.filter((theme) => theme.id !== id);
  emit({
    ...snapshot,
    customThemes,
    activeThemeId:
      snapshot.activeThemeId === id
        ? DEFAULT_APPEARANCE_SETTINGS.activeThemeId
        : snapshot.activeThemeId,
  });
}

interface ThemeDocument {
  format: typeof THEME_DOCUMENT_FORMAT;
  version: 1;
  theme: Pick<AppearanceTheme, "name" | "light" | "dark">;
}

export function serializeAppearanceTheme(id: string): string {
  const theme = materializeTheme(themeById(id));
  const document: ThemeDocument = {
    format: THEME_DOCUMENT_FORMAT,
    version: 1,
    theme: { name: theme.name, light: theme.light, dark: theme.dark },
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function importAppearanceTheme(source: string): AppearanceTheme {
  if (snapshot.customThemes.length >= MAX_CUSTOM_THEMES) {
    throw new Error("Theme limit reached.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Invalid theme JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid theme document.");
  }
  const document = parsed as Partial<ThemeDocument>;
  if (document.format !== THEME_DOCUMENT_FORMAT || document.version !== 1) {
    throw new Error("Unsupported theme format.");
  }
  const imported = safeCustomTheme(
    { ...document.theme, id: customId(), builtin: false },
    customId()
  );
  if (!imported) {
    throw new Error("Theme colors must use six-digit hex values.");
  }
  emit({
    ...snapshot,
    activeThemeId: imported.id,
    customThemes: [...snapshot.customThemes, imported],
  });
  return imported;
}

function fontStack<T extends readonly { id: string; stack: string }[]>(
  items: T,
  id: string
): string {
  return items.find((item) => item.id === id)?.stack ?? items[0].stack;
}

function fontWeight(id: FontWeightId): number {
  return (
    FONT_WEIGHTS.find((item) => item.id === id)?.value ?? FONT_WEIGHTS[0].value
  );
}

/**
Applies validated appearance settings to both the legacy and new semantic token layers.
*/
export function applyAppearanceSettings(
  root: HTMLElement,
  settings: AppearanceSettings,
  scheme: ColorScheme
): void {
  const selected = themeById(settings.activeThemeId, settings);
  const source = selected[scheme];
  const profile = settings[scheme];
  const uiWeight = fontWeight(profile.uiFontWeight);
  const properties: Record<string, string> = {
    ...resolveThemeColorProperties(source, scheme, profile.contrast),
    "--appearance-font-ui": fontStack(UI_FONTS, profile.uiFont),
    "--appearance-font-ui-weight": `${uiWeight}`,
    "--appearance-font-code-weight": `${fontWeight(profile.codeFontWeight)}`,
    "--font-mono": fontStack(CODE_FONTS, profile.codeFont),
    "--ds-font-ui": fontStack(UI_FONTS, profile.uiFont),
    "--ds-font-mono": fontStack(CODE_FONTS, profile.codeFont),
    ...resolveTypographyProperties(settings),
    "--appearance-sidebar-opacity": `${profile.sidebarOpacity}%`,
    "--appearance-macos-panel-tint-opacity": `${Math.round(profile.sidebarOpacity * 0.45)}%`,
  };
  for (const [name, value] of Object.entries(properties)) {
    root.style.setProperty(name, value);
  }
  root.dataset.appearancePointerCursors = settings.pointerCursors
    ? "true"
    : "false";
  root.dataset.reduceMotion = settings.reduceMotion;
  root.dataset.diffMarkers = settings.diffMarkers;
}
