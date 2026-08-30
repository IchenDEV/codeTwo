import { useEffect, useMemo, useState } from "react";
import { Download, RotateCcw } from "@/components/ui/icons";

import {
  checkForAppUpdates,
  getAppUpdateStatus,
  importSessionFiles,
  type AppUpdateStatus,
  type KeymapEntry,
  type SessionImportResult,
} from "../bridge";
import { formatCombo, MOD_LABEL } from "../keys";
import { useLanguage, useT, type LanguagePreference } from "../i18n";
import { en as EN_STRINGS, LOCALES, type StringKey } from "../i18n/strings";
import { setTerminalSettings, useTerminalSettings } from "../terminal/settings";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { GroupHeading, Page, Row } from "./SettingsPrimitives";

const GROUPS: { labelKey: StringKey; actions: string[] }[] = [
  {
    labelKey: "settings.groupPrompt",
    actions: ["run", "cancel", "open_skill_picker", "focus_editor", "toggle_doc_mode"],
  },
  {
    labelKey: "settings.groupSessions",
    actions: ["new_session", "prev_session", "next_session"],
  },
  {
    labelKey: "settings.groupPanels",
    actions: ["toggle_terminal", "toggle_browser", "toggle_git", "close_panel"],
  },
  { labelKey: "settings.groupGit", actions: ["refresh_git", "open_source_control"] },
  {
    labelKey: "settings.groupOpen",
    actions: [
      "open_command_palette",
      "open_market",
      "open_files",
      "search_workspace",
      "open_issues",
      "open_usage",
      "open_settings",
    ],
  },
  { labelKey: "settings.groupModes", actions: ["cycle_permission_mode"] },
];

export function GeneralSettingsPage({
  statusLoader = getAppUpdateStatus,
  checkStarter = checkForAppUpdates,
}: {
  statusLoader?: () => Promise<AppUpdateStatus>;
  checkStarter?: () => Promise<AppUpdateStatus>;
}) {
  const t = useT();
  const { preference: language, setPreference: setLanguage } = useLanguage();
  const terminal = useTerminalSettings();
  const [update, setUpdate] = useState<AppUpdateStatus | null>(null);

  useEffect(() => {
    let active = true;
    void statusLoader()
      .then((status) => {
        if (active) setUpdate(status);
      })
      .catch((error) => {
        if (active) setUpdate({ state: "unavailable", message: String(error) });
      });
    return () => {
      active = false;
    };
  }, [statusLoader]);

  useEffect(() => {
    if (update?.state !== "checking") return;
    let active = true;
    const timer = window.setInterval(() => {
      void statusLoader()
        .then((status) => {
          if (active) setUpdate(status);
        })
        .catch((error) => {
          if (active) setUpdate({ state: "unavailable", message: String(error) });
        });
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [statusLoader, update?.state]);

  const updateHint = (() => {
    switch (update?.state) {
      case "ready":
        return t("settings.updateReady", {
          version: update.currentVersion ?? t("settings.updateUnknownVersion"),
        });
      case "checking":
        return t("settings.updateChecking");
      case "not-configured":
        return t("settings.updateNotConfigured");
      case "unsupported":
        return t("settings.updateUnsupported");
      case "unavailable":
        return t("settings.updateUnavailable");
      default:
        return t("settings.updateLoading");
    }
  })();

  async function startUpdateCheck() {
    setUpdate({ state: "checking", currentVersion: update?.currentVersion });
    try {
      setUpdate(await checkStarter());
    } catch (error) {
      setUpdate({ state: "unavailable", message: String(error) });
    }
  }

  return (
    <Page title={t("settings.general")} description={t("settings.generalHint")}>
      <Row label={t("settings.language")} hint={t("settings.languageHint")}>
        <Select value={language} onValueChange={(value) => setLanguage(value as LanguagePreference)}>
          <SelectTrigger size="sm" className="w-44 justify-between">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectGroup>
              <SelectItem value="system">{t("settings.languageSystem")}</SelectItem>
              {(Object.keys(LOCALES) as (keyof typeof LOCALES)[]).map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {LOCALES[locale].label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Row>

      <GroupHeading>{t("settings.softwareUpdate")}</GroupHeading>
      <Row label={t("settings.checkForUpdates")} hint={updateHint}>
        <Button
          variant="outline"
          size="sm"
          disabled={update?.state !== "ready"}
          onClick={() => void startUpdateCheck()}
        >
          {update?.state === "checking" ? t("settings.updateCheckingButton") : t("settings.checkNow")}
        </Button>
      </Row>

      <GroupHeading>{t("settings.terminal")}</GroupHeading>
      <Row label={t("settings.termFont")} hint={t("settings.termFontHint")}>
        <Input
          size="compact"
          value={terminal.fontFamily}
          placeholder={t("settings.termFontDefault")}
          onChange={(event) => setTerminalSettings({ fontFamily: event.target.value })}
          className="w-44 text-metadata"
        />
      </Row>
      <Row label={t("settings.termFontSize")}>
        <Input
          size="compact"
          type="number"
          min={8}
          max={32}
          value={terminal.fontSize}
          onChange={(event) => setTerminalSettings({ fontSize: Number(event.target.value) })}
          className="w-44 text-metadata"
        />
      </Row>
      <Row label={t("settings.termScrollback")} hint={t("settings.termScrollbackHint")}>
        <Input
          size="compact"
          type="number"
          min={100}
          max={200000}
          step={1000}
          value={terminal.scrollback}
          onChange={(event) => setTerminalSettings({ scrollback: Number(event.target.value) })}
          className="w-44 text-metadata"
        />
      </Row>
    </Page>
  );
}

export function ImportSettingsPage({
  projectPath,
  importer = importSessionFiles,
  onImported = async () => {},
  onOpenSession = () => {},
}: {
  projectPath: string;
  importer?: (fallbackCwd: string) => Promise<SessionImportResult | null>;
  onImported?: () => void | Promise<unknown>;
  onOpenSession?: (sessionId: string) => void;
}) {
  const t = useT();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<SessionImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startImport() {
    setImporting(true);
    setError(null);
    try {
      const next = await importer(projectPath);
      if (!next) return;
      setResult(next);
      if (next.imported > 0) await onImported();
    } catch (cause) {
      setError(t("settings.importFailed", { error: String(cause) }));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Page title={t("settings.import")} description={t("settings.importHint")}>
      <GroupHeading>{t("settings.importFromFiles")}</GroupHeading>
      <Row
        icon={<Download className="size-4 text-muted-foreground" />}
        label={t("settings.importSessions")}
        hint={t("settings.importSessionsHint")}
      >
        <Button variant="outline" size="sm" disabled={importing} onClick={() => void startImport()}>
          {importing
            ? <Spinner data-icon="inline-start" />
            : <Download data-icon="inline-start" />}
          {importing ? t("settings.importing") : t("settings.chooseSessionFiles")}
        </Button>
      </Row>
      {error && <p role="alert" className="mt-3 text-metadata text-destructive">{error}</p>}
      {result && (
        <div
          data-session-import-result
          role={result.failed > 0 ? "alert" : "status"}
          aria-live="polite"
          className="session-import-result"
        >
          <div className="min-w-0">
            <p className="text-body font-medium">
              {t("settings.importResult", {
                imported: result.imported,
                skipped: result.skipped,
                failed: result.failed,
              })}
            </p>
            <p className="mt-0.5 text-metadata text-muted-foreground">
              {t("settings.importedMessages", { count: result.messages })}
            </p>
            {result.errors.slice(0, 3).map((item) => (
              <p key={`${item.path}:${item.message}`} className="mt-1 break-words text-metadata text-destructive">
                {item.path}: {item.message}
              </p>
            ))}
          </div>
          {result.sessions[0] && (
            <Button variant="secondary" size="sm" className="shrink-0" onClick={() => onOpenSession(result.sessions[0].id)}>
              {t("settings.openImportedSession")}
            </Button>
          )}
        </div>
      )}
    </Page>
  );
}

export function KeybindingsSettingsPage({
  bindings,
  capturing,
  onCapture,
  onReset,
}: {
  bindings: KeymapEntry[];
  capturing: string | null;
  onCapture: (action: string) => void;
  onReset?: (action: string) => void;
}) {
  const t = useT();
  const byAction = useMemo(() => new Map(bindings.map((binding) => [binding[0], binding])), [bindings]);
  const conflicts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const [, key] of bindings) seen.set(key, (seen.get(key) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }, [bindings]);
  const known = new Set(GROUPS.flatMap((group) => group.actions));
  const groups = [
    ...GROUPS.map((group) => ({ title: t(group.labelKey), actions: group.actions })),
    {
      title: t("settings.groupOther"),
      actions: bindings.map((binding) => binding[0]).filter((action) => !known.has(action)),
    },
  ].filter((group) => group.actions.length > 0);

  function renderRow(action: string) {
    const entry = byAction.get(action);
    if (!entry) return null;
    const [, key, coreLabel] = entry;
    const labelKey = `action.${action}` as StringKey;
    const label = labelKey in EN_STRINGS ? t(labelKey) : coreLabel;
    return (
      <Row key={action} compact label={label}>
        {conflicts.has(key) && capturing !== action && (
          <span className="text-metadata text-warning" title={t("settings.conflictHint")}>
            {t("settings.conflict")}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "min-w-24 justify-center font-mono text-callout",
            capturing === action && "text-primary",
            conflicts.has(key) && capturing !== action && "text-warning",
          )}
          onClick={() => onCapture(action)}
        >
          {capturing === action ? t("settings.capturing") : formatCombo(key)}
        </Button>
        {onReset && (
          <TooltipButton
            label={t("settings.reset")}
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={() => onReset(action)}
          >
            <RotateCcw className="size-3.5" />
          </TooltipButton>
        )}
      </Row>
    );
  }

  return (
    <Page title={t("settings.keybindings")} description={t("settings.keysHint", { mod: MOD_LABEL })}>
      {groups.map((group) => (
        <div key={group.title}>
          <GroupHeading>{group.title}</GroupHeading>
          <div className="space-y-0.5">{group.actions.map(renderRow)}</div>
        </div>
      ))}
    </Page>
  );
}
