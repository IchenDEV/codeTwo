import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Copy, Download, Plus, Trash2, Upload } from "@/components/ui/icons";

import {
  CODE_FONTS,
  UI_FONTS,
  duplicateTheme,
  importAppearanceTheme,
  isHexColor,
  removeCustomTheme,
  resolveThemeColor,
  serializeAppearanceTheme,
  setAppearanceSettings,
  themeCatalog,
  updateCustomTheme,
  useAppearanceSettings,
  type AppearanceColorKey,
  type AppearanceTheme,
  type CodeFontId,
  type ColorScheme,
  type ThemePalette,
  type ThemePreference,
  type UiFontId,
} from "../appearance";
import { pickAppearanceThemeDocument, saveAppearanceThemeDocument } from "../bridge";
import { useT } from "../i18n";
import { SettingRow } from "@/components/business/setting-row";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import "./appearance-settings.css";

const SCHEMES: { value: ThemePreference; label: "settings.themeSystem" | "settings.themeLight" | "settings.themeDark" }[] = [
  { value: "system", label: "settings.themeSystem" },
  { value: "light", label: "settings.themeLight" },
  { value: "dark", label: "settings.themeDark" },
];

function paletteVariables(palette: ThemePalette): CSSProperties {
  return {
    "--appearance-preview-accent": palette.accent,
    "--appearance-preview-background": palette.background,
    "--appearance-preview-foreground": palette.foreground,
  } as CSSProperties;
}

function MiniApp({ palette }: { palette: ThemePalette }) {
  return (
    <div className="appearance-mini-app" style={paletteVariables(palette)}>
      <div className="appearance-mini-titlebar">
        <span className="appearance-mini-mark" />
        <span className="appearance-mini-title" />
        <span className="appearance-mini-window-actions" />
      </div>
      <div className="appearance-mini-sidebar">
        <span className="appearance-mini-line appearance-mini-line-short" />
        <span className="appearance-mini-line appearance-mini-line-selected" />
        <span className="appearance-mini-line" />
        <span className="appearance-mini-line appearance-mini-line-medium" />
      </div>
      <div className="appearance-mini-content">
        <div className="appearance-mini-message">
          <span className="appearance-mini-line appearance-mini-line-medium" />
          <span className="appearance-mini-line" />
          <span className="appearance-mini-line appearance-mini-line-short" />
        </div>
        <div className="appearance-mini-composer">
          <span className="appearance-mini-line appearance-mini-line-medium" />
          <span className="appearance-mini-send" />
        </div>
      </div>
      <div className="appearance-mini-dock">
        <span className="appearance-mini-tool appearance-mini-tool-active" />
        <span className="appearance-mini-tool" />
        <span className="appearance-mini-tool" />
      </div>
    </div>
  );
}

function SchemePreview({ scheme, theme }: { scheme: ThemePreference; theme: AppearanceTheme }) {
  if (scheme !== "system") {
    return (
      <div className="appearance-scheme-preview" aria-hidden="true">
        <MiniApp palette={theme[scheme]} />
      </div>
    );
  }

  return (
    <div className="appearance-scheme-preview appearance-system-preview" aria-hidden="true">
      <div className="appearance-system-half appearance-system-half-light">
        <MiniApp palette={theme.light} />
      </div>
      <div className="appearance-system-half appearance-system-half-dark">
        <MiniApp palette={theme.dark} />
      </div>
    </div>
  );
}

function ThemeSwatch({ palette, scheme }: { palette: ThemePalette; scheme: ColorScheme }) {
  return (
    <span
      className="appearance-theme-swatch"
      data-scheme={scheme}
      style={paletteVariables(palette)}
      aria-hidden="true"
    />
  );
}

function ThemeCard({
  theme,
  selected,
  onSelect,
  onDuplicate,
}: {
  theme: AppearanceTheme;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
}) {
  const t = useT();
  return (
    <div className="appearance-theme-card" data-selected={selected || undefined}>
      <Button
        className="appearance-theme-select"
        type="button"
        variant="selectable"
        size="row"
        focusStyle="inset"
        data-selected={selected ? "true" : "false"}
        onClick={onSelect}
        aria-pressed={selected}
      >
        <span className="appearance-theme-swatches">
          <ThemeSwatch palette={theme.light} scheme="light" />
          <ThemeSwatch palette={theme.dark} scheme="dark" />
        </span>
        <span className="appearance-theme-name">{theme.name}</span>
      </Button>
      <TooltipButton
        label={t("settings.copyThemeNamed", { name: theme.name })}
        tooltip={t("settings.copyTheme")}
        variant="ghost"
        size="icon-xs"
        className="appearance-theme-copy"
        onClick={onDuplicate}
      >
        <Copy />
      </TooltipButton>
    </div>
  );
}

function ColorField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const t = useT();
  const resolved = resolveThemeColor(value).toLowerCase();
  const [draft, setDraft] = useState(resolved);
  useEffect(() => setDraft(resolved), [resolved]);

  const commit = (next: string) => {
    const normalized = next.toLowerCase();
    if (!isHexColor(normalized)) return;
    setDraft(normalized);
    onCommit(normalized);
  };

  return (
    <SettingRow label={label} density="compact">
      <span className="appearance-color-control">
        <input
          type="color"
          value={isHexColor(resolved) ? resolved : draft}
          onChange={(event) => commit(event.target.value)}
          aria-label={`${label} ${t("settings.colorPicker")}`}
        />
        <Input
          value={draft.toUpperCase()}
          aria-label={`${label} ${t("settings.hexValue")}`}
          aria-invalid={!isHexColor(draft) || undefined}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (isHexColor(next)) commit(next);
          }}
          onBlur={() => {
            if (!isHexColor(draft)) setDraft(resolved);
          }}
          spellCheck={false}
          className="w-28 font-mono text-metadata"
        />
      </span>
    </SettingRow>
  );
}

function PaletteEditor({
  scheme,
  palette,
  onChange,
}: {
  scheme: ColorScheme;
  palette: ThemePalette;
  onChange: (key: AppearanceColorKey, value: string) => void;
}) {
  const t = useT();
  return (
    <section className="appearance-palette-editor" aria-label={scheme === "light" ? t("settings.lightTheme") : t("settings.darkTheme")}>
      <div className="appearance-palette-heading">
        <ThemeSwatch palette={palette} scheme={scheme} />
        <h3>{scheme === "light" ? t("settings.lightTheme") : t("settings.darkTheme")}</h3>
      </div>
      <ColorField label={t("settings.accentColor")} value={palette.accent} onCommit={(value) => onChange("accent", value)} />
      <ColorField label={t("settings.backgroundColor")} value={palette.background} onCommit={(value) => onChange("background", value)} />
      <ColorField label={t("settings.foregroundColor")} value={palette.foreground} onCommit={(value) => onChange("foreground", value)} />
    </section>
  );
}

function RangeSetting({
  label,
  hint,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow label={label} description={hint}>
      <span className="flex max-w-full shrink-0 items-center gap-module-inset">
        <output className="min-w-14 text-right font-mono text-metadata tabular-nums text-content-muted">
          {value}{suffix}
        </output>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
          className="w-32 max-w-full accent-primary"
        />
      </span>
    </SettingRow>
  );
}

export function AppearanceSettings({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (preference: ThemePreference) => void;
}) {
  const t = useT();
  const settings = useAppearanceSettings();
  const catalog = useMemo(() => themeCatalog(settings), [settings]);
  const activeTheme = catalog.find((theme) => theme.id === settings.activeThemeId) ?? catalog[0];
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  const duplicate = (theme: AppearanceTheme, explicitName?: string) => {
    try {
      const copy = duplicateTheme(theme.id, explicitName);
      setStatus(t("settings.themeCopied", { name: copy.name }));
      return copy;
    } catch (error) {
      setStatus(String(error));
      return null;
    }
  };

  const editColor = (scheme: ColorScheme, key: AppearanceColorKey, color: string) => {
    let editable = activeTheme;
    if (editable.builtin) {
      const copy = duplicate(activeTheme);
      if (!copy) return;
      editable = copy;
    }
    updateCustomTheme(editable.id, {
      [scheme]: { ...editable[scheme], [key]: color },
    });
  };

  const exportTheme = async () => {
    try {
      const json = serializeAppearanceTheme(activeTheme.id);
      const filename = `${activeTheme.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "codetwo-theme"}.json`;
      const nativeResult = await saveAppearanceThemeDocument(filename, json);
      if (nativeResult === "cancelled") return;
      if (nativeResult === "saved") {
        setStatus(t("settings.themeExported", { name: activeTheme.name }));
        return;
      }
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus(t("settings.themeExported", { name: activeTheme.name }));
    } catch (error) {
      setStatus(String(error));
    }
  };

  const importSource = (source: string) => {
    try {
      const imported = importAppearanceTheme(source);
      setStatus(t("settings.themeImported", { name: imported.name }));
    } catch {
      setStatus(t("settings.themeImportFailed"));
    }
  };

  const importThemeFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      importSource(await file.text());
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const chooseThemeFile = async () => {
    try {
      const source = await pickAppearanceThemeDocument();
      if (source === undefined) fileInput.current?.click();
      else if (source !== null) importSource(source);
    } catch {
      setStatus(t("settings.themeImportFailed"));
    }
  };

  return (
    <div className="appearance-settings">
      <section className="appearance-section" aria-labelledby="appearance-color-scheme">
        <h2 id="appearance-color-scheme" className="appearance-settings-heading">{t("settings.colorScheme")}</h2>
        <div className="appearance-scheme-grid" role="radiogroup" aria-labelledby="appearance-color-scheme">
          {SCHEMES.map((scheme) => (
            <label key={scheme.value} className="appearance-scheme-option">
              <input
                className="appearance-scheme-input"
                type="radio"
                name="appearance-color-scheme"
                value={scheme.value}
                checked={value === scheme.value}
                onChange={() => onChange(scheme.value)}
              />
              <SchemePreview scheme={scheme.value} theme={activeTheme} />
              <span className="appearance-scheme-label">{t(scheme.label)}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="appearance-section" aria-labelledby="appearance-themes">
        <div className="appearance-section-header">
          <h2 id="appearance-themes" className="appearance-settings-heading">{t("settings.themes")}</h2>
          <div className="appearance-section-actions">
            <Button
              variant="secondary"
              size="sm"
              data-appearance-action="create-theme"
              onClick={() => duplicate(activeTheme, t("settings.untitledTheme"))}
            >
              <Plus />
              {t("settings.createTheme")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void chooseThemeFile()}>
              <Upload />
              {t("settings.importTheme")}
            </Button>
            <input
              ref={fileInput}
              className="appearance-file-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importThemeFile(event.target.files?.[0])}
              tabIndex={-1}
            />
          </div>
        </div>
        <div className="appearance-theme-grid">
          {catalog.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              selected={theme.id === settings.activeThemeId}
              onSelect={() => setAppearanceSettings({ activeThemeId: theme.id })}
              onDuplicate={() => duplicate(theme)}
            />
          ))}
        </div>
      </section>

      <section className="appearance-section appearance-editor-section" aria-labelledby="appearance-theme-editor">
        <div className="appearance-section-header">
          <div>
            <h2 id="appearance-theme-editor" className="appearance-settings-heading">{t("settings.themeEditor")}</h2>
            <p className="appearance-section-hint">
              {activeTheme.builtin ? t("settings.builtinThemeHint") : t("settings.customThemeHint")}
            </p>
          </div>
          <div className="appearance-section-actions">
            <Button variant="ghost" size="sm" onClick={() => void exportTheme()}>
              <Download />
              {t("settings.exportTheme")}
            </Button>
            {!activeTheme.builtin && (
              <TooltipButton
                label={t("settings.deleteTheme")}
                variant="ghost"
                size="icon-sm"
                className="text-status-destructive"
                onClick={() => removeCustomTheme(activeTheme.id)}
              >
                <Trash2 />
              </TooltipButton>
            )}
          </div>
        </div>
        <div className="appearance-editor-surface">
          {!activeTheme.builtin && (
            <SettingRow
              label={t("settings.themeName")}
              density="compact"
              controlSize="wide"
              className="appearance-theme-name-row"
            >
              <Input
                aria-label={t("settings.themeName")}
                value={activeTheme.name}
                maxLength={40}
                onChange={(event) => updateCustomTheme(activeTheme.id, { name: event.target.value })}
                className="w-full"
              />
            </SettingRow>
          )}
          <div className="appearance-palette-grid">
            <PaletteEditor scheme="light" palette={activeTheme.light} onChange={(key, color) => editColor("light", key, color)} />
            <PaletteEditor scheme="dark" palette={activeTheme.dark} onChange={(key, color) => editColor("dark", key, color)} />
          </div>
        </div>
      </section>

      <section className="appearance-section" aria-labelledby="appearance-typography">
        <h2 id="appearance-typography" className="appearance-settings-heading">{t("settings.typography")}</h2>
        <div className="appearance-setting-group">
          <SettingRow
            label={t("settings.interfaceFont")}
            description={t("settings.interfaceFontHint")}
          >
            <Select value={settings.uiFont} onValueChange={(font) => setAppearanceSettings({ uiFont: font as UiFontId })}>
              <SelectTrigger
                size="sm"
                className="w-44 max-w-full"
                aria-label={t("settings.interfaceFont")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  {UI_FONTS.map((font) => <SelectItem key={font.id} value={font.id}>{font.label}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingRow>
          <RangeSetting
            label={t("settings.interfaceFontSize")}
            hint={t("settings.interfaceFontSizeHint")}
            value={settings.uiFontSize}
            min={12}
            max={16}
            suffix=" px"
            onChange={(uiFontSize) => setAppearanceSettings({ uiFontSize })}
          />
          <SettingRow
            label={t("settings.codeFont")}
            description={t("settings.codeFontHint")}
          >
            <Select value={settings.codeFont} onValueChange={(font) => setAppearanceSettings({ codeFont: font as CodeFontId })}>
              <SelectTrigger
                size="sm"
                className="w-44 max-w-full"
                aria-label={t("settings.codeFont")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  {CODE_FONTS.map((font) => <SelectItem key={font.id} value={font.id}>{font.label}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingRow>
          <RangeSetting
            label={t("settings.codeFontSize")}
            hint={t("settings.codeFontSizeHint")}
            value={settings.codeFontSize}
            min={11}
            max={18}
            suffix=" px"
            onChange={(codeFontSize) => setAppearanceSettings({ codeFontSize })}
          />
        </div>
      </section>

      <section className="appearance-section" aria-labelledby="appearance-surfaces">
        <h2 id="appearance-surfaces" className="appearance-settings-heading">{t("settings.surfaces")}</h2>
        <div className="appearance-setting-group">
          <RangeSetting
            label={t("settings.sidebarOpacity")}
            hint={t("settings.sidebarOpacityHint")}
            value={settings.sidebarOpacity}
            min={40}
            max={100}
            suffix="%"
            onChange={(sidebarOpacity) => setAppearanceSettings({ sidebarOpacity })}
          />
          <RangeSetting
            label={t("settings.contrast")}
            hint={t("settings.contrastHint")}
            value={settings.contrast}
            min={0}
            max={100}
            suffix=""
            onChange={(contrast) => setAppearanceSettings({ contrast })}
          />
        </div>
      </section>

      {status && <p className="appearance-status" role="status">{status}</p>}
    </div>
  );
}
