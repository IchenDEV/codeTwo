import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, BrainCircuit, Keyboard, Package, RotateCcw, SlidersHorizontal } from "lucide-react";

import type { KeymapEntry, ProviderInfo } from "../bridge";
import { formatCombo, MOD_LABEL } from "../keys";
import { useLanguage, useT, type LanguagePreference } from "../i18n";
import { en as EN_STRINGS, LOCALES, type StringKey } from "../i18n/strings";
import { useTheme, type ThemePreference } from "../theme";
import { setTerminalSettings, useTerminalSettings } from "../terminal/settings";
import { ProviderIcon } from "../providers/ProviderIcon";
import { MemorySettingsPage } from "./MemorySettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SettingsTab = "general" | "memory" | "keybindings" | "providers";

const NAV: { id: SettingsTab; icon: typeof Keyboard; labelKey: StringKey }[] = [
  { id: "general", icon: SlidersHorizontal, labelKey: "settings.general" },
  { id: "memory", icon: BrainCircuit, labelKey: "memory.title" },
  { id: "keybindings", icon: Keyboard, labelKey: "settings.keybindings" },
  { id: "providers", icon: Package, labelKey: "settings.providers" },
];

// Actions grouped by what they touch — a flat list of twenty-two is hard to scan. Anything not
// listed still shows under "Other", so a new binding is never hidden.
const GROUPS: { title: string; labelKey: StringKey; actions: string[] }[] = [
  {
    title: "Prompt",
    labelKey: "settings.groupPrompt",
    actions: ["run", "cancel", "open_skill_picker", "focus_editor", "toggle_doc_mode"],
  },
  { title: "Sessions", labelKey: "settings.groupSessions", actions: ["new_session", "prev_session", "next_session"] },
  {
    title: "Panels",
    labelKey: "settings.groupPanels",
    actions: ["toggle_terminal", "toggle_browser", "toggle_git", "close_panel"],
  },
  { title: "Git", labelKey: "settings.groupGit", actions: ["refresh_git", "open_source_control"] },
  {
    title: "Open",
    labelKey: "settings.groupOpen",
    actions: ["open_command_palette", "open_market", "open_files", "search_workspace", "open_issues", "open_usage", "open_settings"],
  },
  { title: "Modes", labelKey: "settings.groupModes", actions: ["cycle_permission_mode"] },
];

/**
 * One setting, on any tab: optional leading icon, name + explanation on the left, the control (or
 * status) on the right. Every settings page is built out of these — a page that hand-rolls its own
 * rows drifts a few pixels from the others, which is exactly the bug this shape retired.
 */
function Row({
  icon,
  label,
  hint,
  compact,
  children,
}: {
  icon?: ReactNode;
  label: string;
  hint?: ReactNode;
  /** Dense lists (keybindings) — same anatomy, tighter rhythm. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-8", compact ? "py-2" : "py-3.5")}>
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0 max-w-[420px]">
          <div className="truncate text-ui font-medium">{label}</div>
          {hint && <div className="mt-0.5 text-hint leading-relaxed text-muted-foreground">{hint}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

/** Muted uppercase divider between row groups on one page. */
function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-5 text-cap font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

/**
 * The frame every tab renders through: same title block, same description slot, same measure. The
 * description is a slot rather than an afterthought so the first row starts at the same height on
 * every page — General used to skip it and sat one line higher than the rest.
 */
function Page({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-display font-semibold tracking-tight">{title}</h1>
      <p className="pb-3 pt-1.5 text-hint leading-relaxed text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

/**
 * Settings as a full-window page: its own nav rail on the left (General, Memory, Keybindings,
 * Providers)
 * with a Back row at the bottom, and one scrolling column of rows per category. The window-wide
 * takeover is deliberate — a settings surface with its own sidebar reads as a *place* you went to,
 * which is what earns the explicit way back.
 */
export function SettingsPage({
  bindings,
  capturing,
  onCapture,
  onReset,
  onResetAll,
  providers,
  projectPath,
  onClose,
}: {
  bindings: KeymapEntry[];
  capturing: string | null;
  onCapture: (action: string) => void;
  onReset?: (action: string) => void;
  /** Restore every shortcut to the shipped default — the header's "Restore defaults" on that tab. */
  onResetAll?: () => void;
  providers: ProviderInfo[];
  projectPath: string;
  onClose: () => void;
}) {
  const t = useT();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const { preference: language, setPreference: setLanguage } = useLanguage();
  const term = useTerminalSettings();
  const [tab, setTab] = useState<SettingsTab>("general");

  const byAction = useMemo(() => new Map(bindings.map((b) => [b[0], b])), [bindings]);

  // Which combos are bound more than once — a rebind can silently shadow another action.
  const conflicts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const [, key] of bindings) seen.set(key, (seen.get(key) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [bindings]);

  const known = new Set(GROUPS.flatMap((g) => g.actions));
  const groups = [
    ...GROUPS.map((g) => ({ title: t(g.labelKey), actions: g.actions })),
    { title: t("settings.groupOther"), actions: bindings.map((b) => b[0]).filter((a) => !known.has(a)) },
  ].filter((g) => g.actions.length > 0);

  // What "Restore defaults" means depends on where you're standing.
  const restore = () => {
    if (tab === "general") {
      setTheme("system");
      setLanguage("system");
    } else if (tab === "keybindings") {
      onResetAll?.();
    }
  };

  const keyRow = (action: string) => {
    const entry = byAction.get(action);
    if (!entry) return null;
    const [, key, coreLabel] = entry;
    // The core ships English labels. Prefer a translation keyed by action id; fall back to what the
    // core said so an action this build doesn't know about still reads as something.
    const labelKey = `action.${action}` as StringKey;
    const label = labelKey in EN_STRINGS ? t(labelKey) : coreLabel;
    return (
      <Row key={action} compact label={label}>
        {conflicts.has(key) && capturing !== action && (
          <span className="text-cap text-warning" title={t("settings.conflictHint")}>
            {t("settings.conflict")}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "min-w-24 justify-center font-mono text-fine",
            capturing === action && "ring-1 ring-primary/60 text-primary",
            conflicts.has(key) && capturing !== action && "ring-1 ring-warning/60",
          )}
          onClick={() => onCapture(action)}
        >
          {capturing === action ? t("settings.capturing") : formatCombo(key)}
        </Button>
        {onReset && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            title={t("settings.reset")}
            onClick={() => onReset(action)}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        )}
      </Row>
    );
  };

  return (
    <div className="animate-page-in flex min-h-0 min-w-0 flex-1">
      {/* ---- nav rail — same material as the app's rail, so settings still feels like this app */}
      <aside className="glass-rail flex w-56 shrink-0 flex-col">
        {/* Same 40px title bar as the main shell — clears the traffic lights and drags the window. */}
        <div data-tauri-drag-region className="h-10 shrink-0" />
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ui transition-colors",
                id === tab
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {t(labelKey)}
            </button>
          ))}
        </nav>
        <button
          onClick={onClose}
          className="m-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ui text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" />
          {t("settings.back")}
        </button>
      </aside>

      {/* ---- the page ---- */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* The same 40px bar as the main shell's header, border and all. */}
        <header data-tauri-drag-region className="flex items-center gap-1.5 border-b pb-1.5 pl-6 pr-3 pt-1.5">
          <span data-tauri-drag-region className="text-ui font-medium text-muted-foreground">
            {t("settings.title")}
          </span>
          <div data-tauri-drag-region className="flex-1" />
          {(tab === "general" || tab === "keybindings") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-hint text-muted-foreground hover:text-foreground"
              onClick={restore}
            >
              <RotateCcw className="size-3.5" />
              {t("settings.restoreDefaults")}
            </Button>
          )}
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-[680px] px-8 pb-20 pt-8">
            {tab === "general" && (
              <Page title={t("settings.general")} description={t("settings.generalHint")}>
                <Row label={t("settings.theme")} hint={t("settings.themeHint")}>
                  <Select value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
                    <SelectTrigger size="sm" className="w-44 justify-between">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                      <SelectItem value="system">{t("settings.themeSystem")}</SelectItem>
                      <SelectItem value="light">{t("settings.themeLight")}</SelectItem>
                      <SelectItem value="dark">{t("settings.themeDark")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>

                <Row label={t("settings.language")} hint={t("settings.languageHint")}>
                  <Select value={language} onValueChange={(v) => setLanguage(v as LanguagePreference)}>
                    <SelectTrigger size="sm" className="w-44 justify-between">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                      <SelectItem value="system">{t("settings.languageSystem")}</SelectItem>
                      {(Object.keys(LOCALES) as (keyof typeof LOCALES)[]).map((l) => (
                        <SelectItem key={l} value={l}>
                          {LOCALES[l].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>

                <GroupHeading>{t("settings.terminal")}</GroupHeading>

                <Row label={t("settings.termFont")} hint={t("settings.termFontHint")}>
                  <Input
                    value={term.fontFamily}
                    placeholder={t("settings.termFontDefault")}
                    onChange={(e) => setTerminalSettings({ fontFamily: e.target.value })}
                    className="h-8 w-44 text-hint"
                  />
                </Row>

                <Row label={t("settings.termFontSize")}>
                  <Input
                    type="number"
                    min={8}
                    max={32}
                    value={term.fontSize}
                    onChange={(e) => setTerminalSettings({ fontSize: Number(e.target.value) })}
                    className="h-8 w-44 text-hint"
                  />
                </Row>

                <Row label={t("settings.termScrollback")} hint={t("settings.termScrollbackHint")}>
                  <Input
                    type="number"
                    min={100}
                    max={200000}
                    step={1000}
                    value={term.scrollback}
                    onChange={(e) => setTerminalSettings({ scrollback: Number(e.target.value) })}
                    className="h-8 w-44 text-hint"
                  />
                </Row>
              </Page>
            )}

            {tab === "keybindings" && (
              <Page title={t("settings.keybindings")} description={t("settings.keysHint", { mod: MOD_LABEL })}>
                {groups.map((g) => (
                  <div key={g.title}>
                    <GroupHeading>{g.title}</GroupHeading>
                    <div className="space-y-0.5">{g.actions.map(keyRow)}</div>
                  </div>
                ))}
              </Page>
            )}

            {tab === "memory" && <MemorySettingsPage projectPath={projectPath} />}

            {tab === "providers" && (
              <Page title={t("settings.providers")} description={t("settings.providersHint")}>
                {providers.map((p) => (
                  <Row
                    key={p.id}
                    icon={<ProviderIcon provider={p.id} className="size-5 shrink-0 opacity-80" />}
                    label={p.display_name}
                    hint={
                      <span className="font-mono">
                        {p.id}
                        {p.needs_node && ` · ${t("settings.needsNode")}`}
                      </span>
                    }
                  >
                    <span className="flex items-center gap-1.5 text-fine text-muted-foreground">
                      <span
                        className={cn("size-1.5 rounded-full", p.available ? "bg-success" : "bg-border")}
                      />
                      {p.available ? t("settings.installed") : t("settings.notInstalled")}
                    </span>
                  </Row>
                ))}
              </Page>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
