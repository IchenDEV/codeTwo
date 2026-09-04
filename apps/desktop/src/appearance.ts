import { useSyncExternalStore } from "react";

import { resolveThemeColorProperties } from "./design/theme";
import type { ColorScheme, ThemePalette } from "./design/theme";
import {
  defaultCodeFontSize,
  defaultUiFontSize,
  resolveTypographyProperties,
} from "./design/typography";
import { asJsonObject } from "./lib/jsonValue";
import type { JsonObject } from "./lib/jsonValue";

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

export const uiFonts = [
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

export const codeFonts = [
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

export const fontWeights = [
  { id: "regular", value: 400 },
  { id: "medium", value: 500 },
  { id: "semibold", value: 600 },
] as const;

export type UiFontId = (typeof uiFonts)[number]["id"];
export type CodeFontId = (typeof codeFonts)[number]["id"];

const storageKey = "codetwo.appearance.v1";
const legacyThemeKey = "codetwo.theme";
const themeDocumentFormat = "codetwo-theme";
const maxCustomThemes = 24;

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
    builtin: true,
    dark: palette(
      themeToken(id, "dark", "accent"),
      themeToken(id, "dark", "background"),
      themeToken(id, "dark", "foreground")
    ),
    id,
    light: palette(
      themeToken(id, "light", "accent"),
      themeToken(id, "light", "background"),
      themeToken(id, "light", "foreground")
    ),
    name,
  };
}

export const builtInThemes: AppearanceTheme[] = [
  builtInTheme("code2", "C2"),
  builtInTheme("ocean", "Ocean"),
  builtInTheme("grove", "Grove"),
  builtInTheme("ember", "Ember"),
  builtInTheme("iris", "Iris"),
  builtInTheme("rose", "Rose"),
];

const defaultSchemeProfile: SchemeAppearanceProfile = {
  codeFont: "system-mono",
  codeFontWeight: "regular",
  contrast: 45,
  sidebarOpacity: 80,
  uiFont: "system",
  uiFontWeight: "regular",
};

export const defaultAppearanceSettings: AppearanceSettings = {
  activeThemeId: "code2",
  codeFontSize: defaultCodeFontSize,
  customThemes: [],
  dark: { ...defaultSchemeProfile },
  diffMarkers: "color",
  light: { ...defaultSchemeProfile },
  petActivityEnabled: true,
  petEnabled: true,
  petId: "naiwa",
  petName: "Naiwa",
  petSize: "medium",
  petSource: "builtin",
  pointerCursors: true,
  preference: "system",
  reduceMotion: "system",
  uiFontSize: defaultUiFontSize,
  version: 3,
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

function hasId<T extends readonly { id: string }[]>(
  items: T,
  value: unknown
): value is T[number]["id"] {
  return typeof value === "string" && items.some((item) => item.id === value);
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
  return hasId(fontWeights, value);
}

function isReduceMotion(value: unknown): value is ReduceMotionPreference {
  return value === "system" || value === "on" || value === "off";
}

function isDiffMarkers(value: unknown): value is DiffMarkerPreference {
  return value === "color" || value === "symbols";
}

function safePetId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/u.test(value)
    ? value
    : null;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/iu.test(value);
}

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const name = value.trim().replaceAll(/\s+/gu, " ").slice(0, 40);
  return name || fallback;
}

function safePalette(value: unknown): ThemePalette | null {
  const candidate = asJsonObject(value);
  if (candidate == null) {
    return null;
  }
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
  const candidate = asJsonObject(value);
  if (candidate == null) {
    return null;
  }
  const light = safePalette(candidate.light);
  const dark = safePalette(candidate.dark);
  if (!light || !dark) {
    return null;
  }
  return {
    builtin: false,
    dark,
    id:
      typeof candidate.id === "string" &&
      /^custom-[\w-]{1,80}$/u.test(candidate.id)
        ? candidate.id
        : fallbackId,
    light,
    name: safeName(candidate.name, "Imported theme"),
  };
}

function safeSchemeProfile(
  value: unknown,
  fallback: SchemeAppearanceProfile
): SchemeAppearanceProfile {
  const candidate = asJsonObject(value) ?? {};
  return {
    codeFont: hasId(codeFonts, candidate.codeFont)
      ? candidate.codeFont
      : fallback.codeFont,
    codeFontWeight: isFontWeight(candidate.codeFontWeight)
      ? candidate.codeFontWeight
      : fallback.codeFontWeight,
    contrast: clamp(candidate.contrast, 0, 100, fallback.contrast),
    sidebarOpacity: clamp(
      candidate.sidebarOpacity,
      40,
      100,
      fallback.sidebarOpacity
    ),
    uiFont: hasId(uiFonts, candidate.uiFont)
      ? candidate.uiFont
      : fallback.uiFont,
    uiFontWeight: isFontWeight(candidate.uiFontWeight)
      ? candidate.uiFontWeight
      : fallback.uiFontWeight,
  };
}

export function normalizeAppearanceSettings(
  value: unknown
): AppearanceSettings {
  const candidate: JsonObject = asJsonObject(value) ?? {};
  const uiFontSize =
    candidate.version !== 2 &&
    candidate.version !== 3 &&
    candidate.uiFontSize === 13
      ? defaultUiFontSize
      : candidate.uiFontSize;
  const legacyProfile = safeSchemeProfile(
    {
      codeFont: candidate.codeFont,
      contrast: candidate.contrast,
      sidebarOpacity: candidate.sidebarOpacity,
      uiFont: candidate.uiFont,
    },
    defaultSchemeProfile
  );
  const requestedPetSource = isPetSource(candidate.petSource)
    ? candidate.petSource
    : defaultAppearanceSettings.petSource;
  const petId = safePetId(candidate.petId);
  const petSource =
    requestedPetSource === "petshare" && petId != null && petId !== ""
      ? requestedPetSource
      : defaultAppearanceSettings.petSource;
  const customThemes: AppearanceTheme[] = [];
  const seenThemeIds = new Set<string>();
  if (Array.isArray(candidate.customThemes)) {
    for (const [index, value] of candidate.customThemes.entries()) {
      if (customThemes.length >= maxCustomThemes) {
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
  const availableIds = new Set<string>();
  for (const theme of builtInThemes) {
    availableIds.add(theme.id);
  }
  for (const theme of customThemes) {
    availableIds.add(theme.id);
  }
  return {
    activeThemeId:
      typeof candidate.activeThemeId === "string" &&
      availableIds.has(candidate.activeThemeId)
        ? candidate.activeThemeId
        : defaultAppearanceSettings.activeThemeId,
    codeFontSize: clamp(
      candidate.codeFontSize,
      11,
      18,
      defaultAppearanceSettings.codeFontSize
    ),
    customThemes,
    dark: safeSchemeProfile(candidate.dark, legacyProfile),
    diffMarkers: isDiffMarkers(candidate.diffMarkers)
      ? candidate.diffMarkers
      : defaultAppearanceSettings.diffMarkers,
    light: safeSchemeProfile(candidate.light, legacyProfile),
    petActivityEnabled:
      typeof candidate.petActivityEnabled === "boolean"
        ? candidate.petActivityEnabled
        : defaultAppearanceSettings.petActivityEnabled,
    petEnabled:
      typeof candidate.petEnabled === "boolean"
        ? candidate.petEnabled
        : defaultAppearanceSettings.petEnabled,
    petId:
      petSource === "petshare" && petId != null && petId !== ""
        ? petId
        : defaultAppearanceSettings.petId,
    petName:
      petSource === "petshare"
        ? safeName(
            candidate.petName,
            petId ?? defaultAppearanceSettings.petName
          )
        : defaultAppearanceSettings.petName,
    petSize: isPetSize(candidate.petSize)
      ? candidate.petSize
      : defaultAppearanceSettings.petSize,
    petSource,
    pointerCursors:
      typeof candidate.pointerCursors === "boolean"
        ? candidate.pointerCursors
        : defaultAppearanceSettings.pointerCursors,
    preference: isPreference(candidate.preference)
      ? candidate.preference
      : defaultAppearanceSettings.preference,
    reduceMotion: isReduceMotion(candidate.reduceMotion)
      ? candidate.reduceMotion
      : defaultAppearanceSettings.reduceMotion,
    uiFontSize: clamp(uiFontSize, 12, 16, defaultAppearanceSettings.uiFontSize),
    version: 3,
  };
}

function read(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw != null && raw !== "") {
      return normalizeAppearanceSettings(JSON.parse(raw));
    }
    const legacy = localStorage.getItem(legacyThemeKey);
    return normalizeAppearanceSettings({
      ...defaultAppearanceSettings,
      preference: isPreference(legacy) ? legacy : "system",
    });
  } catch {
    return defaultAppearanceSettings;
  }
}

const listeners = new Set<() => void>();
let snapshot = read();

function persist(): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
    localStorage.setItem(legacyThemeKey, snapshot.preference);
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
  emit(defaultAppearanceSettings);
}

export function resetVisualAppearanceSettings(): void {
  emit({
    ...defaultAppearanceSettings,
    petActivityEnabled: snapshot.petActivityEnabled,
    petEnabled: snapshot.petEnabled,
    petId: snapshot.petId,
    petName: snapshot.petName,
    petSize: snapshot.petSize,
    petSource: snapshot.petSource,
  });
}

export function resetPetSettings(): void {
  emit({
    ...snapshot,
    petActivityEnabled: defaultAppearanceSettings.petActivityEnabled,
    petEnabled: defaultAppearanceSettings.petEnabled,
    petId: defaultAppearanceSettings.petId,
    petName: defaultAppearanceSettings.petName,
    petSize: defaultAppearanceSettings.petSize,
    petSource: defaultAppearanceSettings.petSource,
  });
}

export function themeCatalog(settings = snapshot): AppearanceTheme[] {
  return [...builtInThemes, ...settings.customThemes];
}

export function themeById(id: string, settings = snapshot): AppearanceTheme {
  return (
    themeCatalog(settings).find((theme) => theme.id === id) ?? builtInThemes[0]
  );
}

function cssVariableName(value: string): string | null {
  return /^var\((--[\w-]+)\)$/u.exec(value)?.[1] ?? null;
}

export function resolveThemeColor(value: string): string {
  const variable = cssVariableName(value);
  if (variable == null || variable === "" || typeof document === "undefined") {
    return value;
  }
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
}

export function materializeTheme(theme: AppearanceTheme): AppearanceTheme {
  const resolvePalette = (source: ThemePalette): ThemePalette => {
    return {
      accent: resolveThemeColor(source.accent),
      background: resolveThemeColor(source.background),
      foreground: resolveThemeColor(source.foreground),
    };
  };
  const light = resolvePalette(theme.light);
  const dark = resolvePalette(theme.dark);
  const colors = [
    light.accent,
    light.background,
    light.foreground,
    dark.accent,
    dark.background,
    dark.foreground,
  ];
  if (!colors.every(isHexColor)) {
    throw new Error("Theme colors are not available yet.");
  }
  return { ...theme, dark, light };
}

function customId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function duplicateTheme(id: string, name?: string): AppearanceTheme {
  if (snapshot.customThemes.length >= maxCustomThemes) {
    throw new Error("Theme limit reached.");
  }
  const source = materializeTheme(themeById(id));
  const copy: AppearanceTheme = {
    ...source,
    builtin: false,
    id: customId(),
    name: safeName(name, `${source.name} Copy`),
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
      safeCustomTheme({ ...theme, ...patch, builtin: false, id }, id) ?? theme
    );
  });
  emit({ ...snapshot, customThemes });
}

export function removeCustomTheme(id: string): void {
  const customThemes = snapshot.customThemes.filter((theme) => theme.id !== id);
  emit({
    ...snapshot,
    activeThemeId:
      snapshot.activeThemeId === id
        ? defaultAppearanceSettings.activeThemeId
        : snapshot.activeThemeId,
    customThemes,
  });
}

interface ThemeDocument {
  format: typeof themeDocumentFormat;
  version: 1;
  theme: Pick<AppearanceTheme, "name" | "light" | "dark">;
}

export function serializeAppearanceTheme(id: string): string {
  const theme = materializeTheme(themeById(id));
  const document: ThemeDocument = {
    format: themeDocumentFormat,
    theme: { dark: theme.dark, light: theme.light, name: theme.name },
    version: 1,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function importAppearanceTheme(source: string): AppearanceTheme {
  if (snapshot.customThemes.length >= maxCustomThemes) {
    throw new Error("Theme limit reached.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Invalid theme JSON.");
  }
  if (parsed == null || typeof parsed !== "object") {
    throw new Error("Invalid theme document.");
  }
  const document = parsed as Partial<ThemeDocument>;
  if (document.format !== themeDocumentFormat || document.version !== 1) {
    throw new Error("Unsupported theme format.");
  }
  const imported = safeCustomTheme(
    { ...document.theme, builtin: false, id: customId() },
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
    fontWeights.find((item) => item.id === id)?.value ?? fontWeights[0].value
  );
}

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
    "--appearance-font-code-weight": `${fontWeight(profile.codeFontWeight)}`,
    "--appearance-font-ui": fontStack(uiFonts, profile.uiFont),
    "--appearance-font-ui-weight": `${uiWeight}`,
    "--ds-font-mono": fontStack(codeFonts, profile.codeFont),
    "--ds-font-ui": fontStack(uiFonts, profile.uiFont),
    "--font-mono": fontStack(codeFonts, profile.codeFont),
    ...resolveTypographyProperties(settings),
    "--appearance-macos-panel-tint-opacity": `${Math.round(profile.sidebarOpacity * 0.45)}%`,
    "--appearance-sidebar-opacity": `${profile.sidebarOpacity}%`,
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
