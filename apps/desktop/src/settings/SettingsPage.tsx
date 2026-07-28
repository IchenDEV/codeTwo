import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Keyboard, Package, RotateCcw, SlidersHorizontal } from "lucide-react";

import type { KeymapEntry, ProviderInfo } from "../bridge";
import { formatCombo, MOD_LABEL } from "../keys";
import { useLanguage, useT, type LanguagePreference } from "../i18n";
import { en as EN_STRINGS, LOCALES, type StringKey } from "../i18n/strings";
import { useTheme, type ThemePreference } from "../theme";
import { ProviderIcon } from "../providers/ProviderIcon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SettingsTab = "general" | "keybindings" | "providers";

const NAV: { id: SettingsTab; icon: typeof Keyboard; labelKey: StringKey }[] = [
  { id: "general", icon: SlidersHorizontal, labelKey: "settings.general" },
  { id: "keybindings", icon: Keyboard, labelKey: "settings.keybindings" },
  { id: "providers", icon: Package, labelKey: "settings.providers" },
];

// Actions grouped by what they touch — a flat list of twenty-one is hard to scan. Anything not
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
    actions: ["open_command_palette", "open_market", "open_files", "open_issues", "open_usage", "open_settings"],
  },
  { title: "Modes", labelKey: "settings.groupModes", actions: ["cycle_permission_mode"] },
];

/** One setting: name and explanation on the left, its control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 py-4">
      <div className="min-w-0 max-w-[420px]">
        <div className="text-[13.5px] font-medium">{label}</div>
        {hint && <div className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * Settings as a full-window page: its own nav rail on the left (General, Keybindings, Providers)
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
  onClose,
}: {
  bindings: KeymapEntry[];
  capturing: string | null;
  onCapture: (action: string) => void;
  onReset?: (action: string) => void;
  /** Restore every shortcut to the shipped default — the header's "Restore defaults" on that tab. */
  onResetAll?: () => void;
  providers: ProviderInfo[];
  onClose: () => void;
}) {
  const t = useT();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const { preference: language, setPreference: setLanguage } = useLanguage();
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
      <div key={action} className="flex items-center justify-between gap-4 py-2">
        <span className="min-w-0 truncate text-[13px]">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          {conflicts.has(key) && capturing !== action && (
            <span className="text-[10px] text-warning" title={t("settings.conflictHint")}>
              {t("settings.conflict")}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "min-w-24 justify-center font-mono text-[11.5px]",
              capturing === action && "border-primary text-primary",
              conflicts.has(key) && capturing !== action && "border-warning/60",
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
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* ---- nav rail — same material as the app's rail, so settings still feels like this app */}
      <aside className="glass-rail flex w-56 shrink-0 flex-col border-r">
        {/* Clears the traffic lights and gives the window something to drag by. */}
        <div data-tauri-drag-region className="h-12 shrink-0" />
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                id === tab
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {t(labelKey)}
            </button>
          ))}
        </nav>
        <button
          onClick={onClose}
          className="m-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" />
          {t("settings.back")}
        </button>
      </aside>

      {/* ---- the page ---- */}
      <main className="content-surface flex min-w-0 flex-1 flex-col">
        <header data-tauri-drag-region className="flex items-center px-6 pb-2 pt-7">
          <span data-tauri-drag-region className="text-[13px] font-medium text-muted-foreground">
            {t("settings.title")}
          </span>
          <div data-tauri-drag-region className="flex-1" />
          {tab !== "providers" && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              onClick={restore}
            >
              <RotateCcw className="size-3.5" />
              {t("settings.restoreDefaults")}
            </Button>
          )}
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-[680px] px-8 pb-20 pt-8">
            <h1 className="pb-3 text-[22px] font-semibold tracking-tight">
              {t(NAV.find((n) => n.id === tab)!.labelKey)}
            </h1>

            {tab === "general" && (
              <div>
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
              </div>
            )}

            {tab === "keybindings" && (
              <div>
                <p className="pb-2 text-[12px] leading-relaxed text-muted-foreground">
                  {t("settings.keysHint", { mod: MOD_LABEL })}
                </p>
                {groups.map((g) => (
                  <div key={g.title} className="pt-4">
                    <h3 className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.title}
                    </h3>
                    <div className="divide-y divide-border/60">{g.actions.map(keyRow)}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === "providers" && (
              <div>
                <p className="pb-2 text-[12px] leading-relaxed text-muted-foreground">
                  {t("settings.providersHint")}
                </p>
                <div className="divide-y divide-border/60">
                  {providers.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-3.5">
                      <ProviderIcon provider={p.id} className="size-5 shrink-0 opacity-80" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium">{p.display_name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {p.id}
                          {p.needs_node && ` · ${t("settings.needsNode")}`}
                        </div>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span
                          className={cn("size-1.5 rounded-full", p.available ? "bg-success" : "bg-border")}
                        />
                        {p.available ? t("settings.installed") : t("settings.notInstalled")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
