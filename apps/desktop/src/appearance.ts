import { useSyncExternalStore } from "react";

import {
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  resolveTypographyProperties,
} from "./design/typography";
import {
  resolveThemeColorProperties,
  type ColorScheme,
  type ThemePalette,
} from "./design/theme";

export type { ColorScheme, ThemePalette } from "./design/theme";
export type ThemePreference = ColorScheme | "system";
export type AppearanceColorKey = "accent" | "background" | "foreground";
export type PetSize = "small" | "medium" | "large";
export type PetSource = "builtin" | "petshare";

export interface AppearanceTheme {
  id: string;
  name: string;
  builtin: boolean;
  light: ThemePalette;
  dark: ThemePalette;
}

export interface AppearanceSettings {
  version: 2;
  preference: ThemePreference;
  activeThemeId: string;
  customThemes: AppearanceTheme[];
  petEnabled: boolean;
  petActivityEnabled: boolean;
  petSize: PetSize;
  petSource: PetSource;
  petId: string;
  petName: string;
  uiFont: UiFontId;
  codeFont: CodeFontId;
  uiFontSize: number;
  codeFontSize: number;
  sidebarOpacity: number;
  contrast: number;
}

export const UI_FONTS = [
  { id: "system", label: "System", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "inter", label: "Inter", stack: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "avenir", label: "Avenir Next", stack: '"Avenir Next", -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: "helvetica", label: "Helvetica Neue", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
] as const;

export const CODE_FONTS = [
  { id: "system-mono", label: "System Mono", stack: 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace' },
  { id: "sf-mono", label: "SF Mono", stack: '"SF Mono", ui-monospace, Menlo, monospace' },
  { id: "menlo", label: "Menlo", stack: 'Menlo, Monaco, ui-monospace, monospace' },
  { id: "monaco", label: "Monaco", stack: 'Monaco, Menlo, ui-monospace, monospace' },
] as const;

export type UiFontId = (typeof UI_FONTS)[number]["id"];
export type CodeFontId = (typeof CODE_FONTS)[number]["id"];

const STORAGE_KEY = "codetwo.appearance.v1";
const LEGACY_THEME_KEY = "codetwo.theme";
const THEME_DOCUMENT_FORMAT = "codetwo-theme";
const MAX_CUSTOM_THEMES = 24;

function palette(accent: string, background: string, foreground: string): ThemePalette {
  return { accent, background, foreground };
}

function themeToken(theme: string, scheme: ColorScheme, role: AppearanceColorKey): string {
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
      themeToken(id, "light", "foreground"),
    ),
    dark: palette(
      themeToken(id, "dark", "accent"),
      themeToken(id, "dark", "background"),
      themeToken(id, "dark", "foreground"),
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

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  version: 2,
  preference: "system",
  activeThemeId: "code2",
  customThemes: [],
  petEnabled: true,
  petActivityEnabled: true,
  petSize: "medium",
  petSource: "builtin",
  petId: "naiwa",
  petName: "Naiwa",
  uiFont: "system",
  codeFont: "system-mono",
  uiFontSize: DEFAULT_UI_FONT_SIZE,
  codeFontSize: DEFAULT_CODE_FONT_SIZE,
  sidebarOpacity: 80,
  contrast: 45,
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
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

function safePetId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value)
    ? value
    : null;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const name = value.trim().replace(/\s+/g, " ").slice(0, 40);
  return name || fallback;
}

function safePalette(value: unknown): ThemePalette | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ThemePalette>;
  if (!isHexColor(candidate.accent) || !isHexColor(candidate.background) || !isHexColor(candidate.foreground)) {
    return null;
  }
  return {
    accent: candidate.accent.toLowerCase(),
    background: candidate.background.toLowerCase(),
    foreground: candidate.foreground.toLowerCase(),
  };
}

function safeCustomTheme(value: unknown, fallbackId: string): AppearanceTheme | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AppearanceTheme>;
  const light = safePalette(candidate.light);
  const dark = safePalette(candidate.dark);
  if (!light || !dark) return null;
  return {
    id: typeof candidate.id === "string" && /^custom-[\w-]{1,80}$/.test(candidate.id) ? candidate.id : fallbackId,
    name: safeName(candidate.name, "Imported theme"),
    builtin: false,
    light,
    dark,
  };
}

function includesId<T extends readonly { id: string }[]>(items: T, value: unknown): value is T[number]["id"] {
  return typeof value === "string" && items.some((item) => item.id === value);
}

export function normalizeAppearanceSettings(value: unknown): AppearanceSettings {
  const candidate = value && typeof value === "object"
    ? value as Omit<Partial<AppearanceSettings>, "version"> & { version?: number }
    : {};
  const uiFontSize = candidate.version !== 2 && candidate.uiFontSize === 13
    ? DEFAULT_UI_FONT_SIZE
    : candidate.uiFontSize;
  const requestedPetSource = isPetSource(candidate.petSource)
    ? candidate.petSource
    : DEFAULT_APPEARANCE_SETTINGS.petSource;
  const petId = safePetId(candidate.petId);
  const petSource = requestedPetSource === "petshare" && petId
    ? requestedPetSource
    : DEFAULT_APPEARANCE_SETTINGS.petSource;
  const customThemes: AppearanceTheme[] = [];
  const seenThemeIds = new Set<string>();
  if (Array.isArray(candidate.customThemes)) {
    for (const [index, value] of candidate.customThemes.entries()) {
      if (customThemes.length >= MAX_CUSTOM_THEMES) break;
      const theme = safeCustomTheme(value, `custom-imported-${index}`);
      if (!theme || seenThemeIds.has(theme.id)) continue;
      seenThemeIds.add(theme.id);
      customThemes.push(theme);
    }
  }
  const availableIds = new Set([...BUILT_IN_THEMES.map((theme) => theme.id), ...customThemes.map((theme) => theme.id)]);
  return {
    version: 2,
    preference: isPreference(candidate.preference) ? candidate.preference : DEFAULT_APPEARANCE_SETTINGS.preference,
    activeThemeId: typeof candidate.activeThemeId === "string" && availableIds.has(candidate.activeThemeId)
      ? candidate.activeThemeId
      : DEFAULT_APPEARANCE_SETTINGS.activeThemeId,
    customThemes,
    petEnabled: typeof candidate.petEnabled === "boolean"
      ? candidate.petEnabled
      : DEFAULT_APPEARANCE_SETTINGS.petEnabled,
    petActivityEnabled: typeof candidate.petActivityEnabled === "boolean"
      ? candidate.petActivityEnabled
      : DEFAULT_APPEARANCE_SETTINGS.petActivityEnabled,
    petSize: isPetSize(candidate.petSize) ? candidate.petSize : DEFAULT_APPEARANCE_SETTINGS.petSize,
    petSource,
    petId: petSource === "petshare" && petId ? petId : DEFAULT_APPEARANCE_SETTINGS.petId,
    petName: petSource === "petshare"
      ? safeName(candidate.petName, petId ?? DEFAULT_APPEARANCE_SETTINGS.petName)
      : DEFAULT_APPEARANCE_SETTINGS.petName,
    uiFont: includesId(UI_FONTS, candidate.uiFont) ? candidate.uiFont : DEFAULT_APPEARANCE_SETTINGS.uiFont,
    codeFont: includesId(CODE_FONTS, candidate.codeFont) ? candidate.codeFont : DEFAULT_APPEARANCE_SETTINGS.codeFont,
    uiFontSize: clamp(uiFontSize, 12, 16, DEFAULT_APPEARANCE_SETTINGS.uiFontSize),
    codeFontSize: clamp(candidate.codeFontSize, 11, 18, DEFAULT_APPEARANCE_SETTINGS.codeFontSize),
    sidebarOpacity: clamp(candidate.sidebarOpacity, 40, 100, DEFAULT_APPEARANCE_SETTINGS.sidebarOpacity),
    contrast: clamp(candidate.contrast, 0, 100, DEFAULT_APPEARANCE_SETTINGS.contrast),
  };
}

function read(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeAppearanceSettings(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    return normalizeAppearanceSettings({ ...DEFAULT_APPEARANCE_SETTINGS, preference: isPreference(legacy) ? legacy : "system" });
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
    /* private mode — settings stay live for this process */
  }
}

function emit(next: AppearanceSettings): void {
  snapshot = normalizeAppearanceSettings(next);
  persist();
  for (const listener of listeners) listener();
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
  patch: Partial<AppearanceSettings> | ((current: AppearanceSettings) => AppearanceSettings),
): void {
  const next = typeof patch === "function" ? patch(snapshot) : { ...snapshot, ...patch };
  emit(next);
}

export function resetAppearanceSettings(): void {
  emit(DEFAULT_APPEARANCE_SETTINGS);
}

/** Restore visual appearance without changing the companion configured on its own settings page. */
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

/** Restore only settings owned by the Pets page. */
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
  return themeCatalog(settings).find((theme) => theme.id === id) ?? BUILT_IN_THEMES[0];
}

function cssVariableName(value: string): string | null {
  return value.match(/^var\((--[\w-]+)\)$/)?.[1] ?? null;
}

export function resolveThemeColor(value: string): string {
  const variable = cssVariableName(value);
  if (!variable || typeof document === "undefined") return value;
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
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
  if (snapshot.customThemes.length >= MAX_CUSTOM_THEMES) throw new Error("Theme limit reached.");
  const source = materializeTheme(themeById(id));
  const copy: AppearanceTheme = {
    ...source,
    id: customId(),
    name: safeName(name, `${source.name} Copy`),
    builtin: false,
  };
  emit({ ...snapshot, activeThemeId: copy.id, customThemes: [...snapshot.customThemes, copy] });
  return copy;
}

export function updateCustomTheme(id: string, patch: Partial<Omit<AppearanceTheme, "id" | "builtin">>): void {
  const customThemes = snapshot.customThemes.map((theme) => {
    if (theme.id !== id) return theme;
    return safeCustomTheme({ ...theme, ...patch, id, builtin: false }, id) ?? theme;
  });
  emit({ ...snapshot, customThemes });
}

export function removeCustomTheme(id: string): void {
  const customThemes = snapshot.customThemes.filter((theme) => theme.id !== id);
  emit({
    ...snapshot,
    customThemes,
    activeThemeId: snapshot.activeThemeId === id ? DEFAULT_APPEARANCE_SETTINGS.activeThemeId : snapshot.activeThemeId,
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
  if (snapshot.customThemes.length >= MAX_CUSTOM_THEMES) throw new Error("Theme limit reached.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Invalid theme JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid theme document.");
  const document = parsed as Partial<ThemeDocument>;
  if (document.format !== THEME_DOCUMENT_FORMAT || document.version !== 1) {
    throw new Error("Unsupported theme format.");
  }
  const imported = safeCustomTheme({ ...(document.theme ?? {}), id: customId(), builtin: false }, customId());
  if (!imported) throw new Error("Theme colors must use six-digit hex values.");
  emit({ ...snapshot, activeThemeId: imported.id, customThemes: [...snapshot.customThemes, imported] });
  return imported;
}

function fontStack<T extends readonly { id: string; stack: string }[]>(items: T, id: string): string {
  return items.find((item) => item.id === id)?.stack ?? items[0].stack;
}

/** Applies validated appearance settings to both the legacy and new semantic token layers. */
export function applyAppearanceSettings(
  root: HTMLElement,
  settings: AppearanceSettings,
  scheme: ColorScheme,
): void {
  const selected = themeById(settings.activeThemeId, settings);
  const source = selected[scheme];
  const properties: Record<string, string> = {
    ...resolveThemeColorProperties(source, scheme, settings.contrast),
    "--appearance-font-ui": fontStack(UI_FONTS, settings.uiFont),
    "--font-mono": fontStack(CODE_FONTS, settings.codeFont),
    "--ds-font-ui": fontStack(UI_FONTS, settings.uiFont),
    "--ds-font-mono": fontStack(CODE_FONTS, settings.codeFont),
    ...resolveTypographyProperties(settings),
    "--appearance-sidebar-opacity": `${settings.sidebarOpacity}%`,
    "--appearance-macos-panel-tint-opacity": `${Math.round(settings.sidebarOpacity * 0.45)}%`,
  };
  for (const [name, value] of Object.entries(properties)) root.style.setProperty(name, value);
}
