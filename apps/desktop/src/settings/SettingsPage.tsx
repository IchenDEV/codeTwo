import { useMemo, type ReactNode } from "react";
import { Check, RotateCcw, X } from "lucide-react";

import type { KeymapEntry } from "../bridge";
import { formatCombo, MOD_LABEL } from "../keys";
import { LOCALES, useLanguage, useT, type LanguagePreference } from "../i18n";
import { en as EN_STRINGS, type StringKey } from "../i18n/strings";
import { useTheme, type ThemePreference } from "../theme";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Actions grouped by what they touch — a flat list of twenty-one is hard to scan. Anything not
// listed still shows under "Other", so a new binding is never hidden.
const GROUPS: { title: string; labelKey: Parameters<ReturnType<typeof useT>>[0]; actions: string[] }[] = [
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

/** A labelled row with its control on the right, the way a system settings pane reads. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A segmented control. Native settings use these for small, mutually exclusive sets. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 text-[12px] transition-colors",
            o.value === value ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pb-2">
      <h2 className="pb-1 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y rounded-lg border px-3">{children}</div>
    </section>
  );
}

/**
 * Settings as a page rather than a dialog.
 *
 * It outgrew a modal the moment it held more than keybindings: appearance, language and twenty-one
 * shortcuts don't fit in a box you're meant to dismiss quickly, and a settings surface you can
 * scroll and read at leisure is what a desktop app is expected to have.
 */
export function SettingsPage({
  bindings,
  capturing,
  onCapture,
  onReset,
  onClose,
}: {
  bindings: KeymapEntry[];
  capturing: string | null;
  onCapture: (action: string) => void;
  onReset?: (action: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const { preference: language, setPreference: setLanguage } = useLanguage();

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
    <main className="content-surface flex min-w-0 flex-1 flex-col">
      <header data-tauri-drag-region className="flex items-center gap-2 px-4 pb-2 pt-7">
        <span data-tauri-drag-region className="flex-1 text-[13px] font-semibold">
          {t("settings.title")}
        </span>
        <Button variant="ghost" size="icon" className="size-8" aria-label={t("settings.close")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[720px] px-6 pb-16">
          <Section title={t("settings.appearance")}>
            <Row label={t("settings.theme")} hint={t("settings.themeHint")}>
              <Segmented<ThemePreference>
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: t("settings.themeLight") },
                  { value: "dark", label: t("settings.themeDark") },
                  { value: "system", label: t("settings.themeSystem") },
                ]}
              />
            </Row>

            <Row label={t("settings.language")} hint={t("settings.languageHint")}>
              <div className="flex flex-col items-stretch gap-0.5">
                {(["system", ...(Object.keys(LOCALES) as (keyof typeof LOCALES)[])] as LanguagePreference[]).map(
                  (opt) => (
                    <button
                      key={opt}
                      onClick={() => setLanguage(opt)}
                      className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors hover:bg-accent"
                    >
                      <Check
                        className={cn("size-3.5 shrink-0", opt === language ? "text-primary" : "opacity-0")}
                      />
                      {opt === "system" ? t("settings.languageSystem") : LOCALES[opt].label}
                    </button>
                  ),
                )}
              </div>
            </Row>
          </Section>

          <Section title={t("settings.keybindings")}>
            <div className="py-3 text-[11px] leading-relaxed text-muted-foreground">
              {t("settings.keysHint", { mod: MOD_LABEL })}
            </div>
            {groups.map((g) => (
              <div key={g.title} className="py-2">
                <h3 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.title}
                </h3>
                <div className="divide-y">{g.actions.map(keyRow)}</div>
              </div>
            ))}
          </Section>
        </div>
      </ScrollArea>
    </main>
  );
}
