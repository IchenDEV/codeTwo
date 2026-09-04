import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Download, RotateCcw } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  checkForAppUpdates,
  getAppUpdateStatus,
  importSessionFiles,
} from "../bridge";
import type {
  AppUpdateStatus,
  KeymapEntry,
  SessionImportResult,
} from "../bridge";
import { useLanguage, useT } from "../i18n";
import type { LanguagePreference } from "../i18n";
import { en as EN_STRINGS, LOCALES } from "../i18n/strings";
import type { StringKey } from "../i18n/strings";
import { formatCombo, modifierLabel } from "../keys";
import { setTerminalSettings, useTerminalSettings } from "../terminal/settings";
import { GroupHeading, Page, Row } from "./SettingsPrimitives";

const GROUPS: { labelKey: StringKey; actions: string[] }[] = [
  {
    actions: [
      "run",
      "cancel",
      "open_skill_picker",
      "focus_editor",
      "toggle_doc_mode",
    ],
    labelKey: "settings.groupPrompt",
  },
  {
    actions: ["new_session", "prev_session", "next_session"],
    labelKey: "settings.groupSessions",
  },
  {
    actions: ["toggle_terminal", "toggle_browser", "toggle_git", "close_panel"],
    labelKey: "settings.groupPanels",
  },
  {
    actions: ["refresh_git", "open_source_control"],
    labelKey: "settings.groupGit",
  },
  {
    actions: [
      "open_command_palette",
      "open_market",
      "open_files",
      "search_workspace",
      "open_issues",
      "open_usage",
      "open_settings",
    ],
    labelKey: "settings.groupOpen",
  },
  { actions: ["cycle_permission_mode"], labelKey: "settings.groupModes" },
];

export function GeneralSettingsPage({
  statusLoader = getAppUpdateStatus,
  checkStarter = checkForAppUpdates,
}: {
  readonly statusLoader?: () => Promise<AppUpdateStatus>;
  readonly checkStarter?: () => Promise<AppUpdateStatus>;
}) {
  const t = useT();
  const { preference: language, setPreference: setLanguage } = useLanguage();
  const terminal = useTerminalSettings();
  const [update, setUpdate] = useState<AppUpdateStatus | null>(null);

  useEffect(() => {
    let isActive = true;
    void statusLoader()
      .then((status) => {
        if (isActive) {
          setUpdate(status);
        }
      })
      .catch((error) => {
        if (isActive) {
          setUpdate({ message: String(error), state: "unavailable" });
        }
      });
    return () => {
      isActive = false;
    };
  }, [statusLoader]);

  useEffect(() => {
    if (update?.state !== "checking") {
      return;
    }
    let isActive = true;
    const timer = window.setInterval(() => {
      void statusLoader()
        .then((status) => {
          if (isActive) {
            setUpdate(status);
          }
        })
        .catch((error) => {
          if (isActive) {
            setUpdate({ message: String(error), state: "unavailable" });
          }
        });
    }, 1000);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [statusLoader, update?.state]);

  const updateHint = (() => {
    switch (update?.state) {
      case "ready": {
        return t("settings.updateReady", {
          version: update.currentVersion ?? t("settings.updateUnknownVersion"),
        });
      }
      case "checking": {
        return t("settings.updateChecking");
      }
      case "not-configured": {
        return t("settings.updateNotConfigured");
      }
      case "unsupported": {
        return t("settings.updateUnsupported");
      }
      case "unavailable": {
        return t("settings.updateUnavailable");
      }
      default: {
        return t("settings.updateLoading");
      }
    }
  })();

  async function startUpdateCheck() {
    setUpdate({ currentVersion: update?.currentVersion, state: "checking" });
    try {
      setUpdate(await checkStarter());
    } catch (error) {
      setUpdate({ message: String(error), state: "unavailable" });
    }
  }

  return (
    <Page title={t("settings.general")} description={t("settings.generalHint")}>
      <Row label={t("settings.language")} hint={t("settings.languageHint")}>
        <Select
          value={language}
          onValueChange={(value) => setLanguage(value as LanguagePreference)}
        >
          <SelectTrigger size="sm" className="w-44 justify-between">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectGroup>
              <SelectItem value="system">
                {t("settings.languageSystem")}
              </SelectItem>
              {(Object.keys(LOCALES) as (keyof typeof LOCALES)[]).map(
                (locale) => (
                  <SelectItem key={locale} value={locale}>
                    {LOCALES[locale].label}
                  </SelectItem>
                )
              )}
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
          {update?.state === "checking"
            ? t("settings.updateCheckingButton")
            : t("settings.checkNow")}
        </Button>
      </Row>

      <GroupHeading>{t("settings.terminal")}</GroupHeading>
      <Row label={t("settings.termFont")} hint={t("settings.termFontHint")}>
        <Input
          size="compact"
          value={terminal.fontFamily}
          placeholder={t("settings.termFontDefault")}
          onChange={(event) =>
            setTerminalSettings({ fontFamily: event.target.value })
          }
          className="text-metadata w-44"
        />
      </Row>
      <Row label={t("settings.termFontSize")}>
        <Input
          size="compact"
          type="number"
          min={8}
          max={32}
          value={terminal.fontSize}
          onChange={(event) =>
            setTerminalSettings({ fontSize: Number(event.target.value) })
          }
          className="text-metadata w-44"
        />
      </Row>
      <Row
        label={t("settings.termScrollback")}
        hint={t("settings.termScrollbackHint")}
      >
        <Input
          size="compact"
          type="number"
          min={100}
          max={200_000}
          step={1000}
          value={terminal.scrollback}
          onChange={(event) =>
            setTerminalSettings({ scrollback: Number(event.target.value) })
          }
          className="text-metadata w-44"
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
  readonly projectPath: string;
  readonly importer?: (
    fallbackCwd: string
  ) => Promise<SessionImportResult | null>;
  readonly onImported?: () => void | Promise<unknown>;
  readonly onOpenSession?: (sessionId: string) => void;
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
      if (!next) {
        return;
      }
      setResult(next);
      if (next.imported > 0) {
        await onImported();
      }
    } catch (error) {
      setError(t("settings.importFailed", { error: String(error) }));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Page title={t("settings.import")} description={t("settings.importHint")}>
      <GroupHeading>{t("settings.importFromFiles")}</GroupHeading>
      <Row
        icon={<Download className="text-muted-foreground size-4" />}
        label={t("settings.importSessions")}
        hint={t("settings.importSessionsHint")}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={importing}
          onClick={() => void startImport()}
        >
          {importing ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Download data-icon="inline-start" />
          )}
          {importing
            ? t("settings.importing")
            : t("settings.chooseSessionFiles")}
        </Button>
      </Row>
      {error != null && error !== "" ? (
        <p role="alert" className="text-metadata text-destructive mt-3">
          {error}
        </p>
      ) : null}
      {result ? (
        <div
          data-session-import-result
          role={result.failed > 0 ? "alert" : "status"}
          aria-live="polite"
          className="session-import-result"
        >
          <div className="min-w-0">
            <p className="text-body font-medium">
              {t("settings.importResult", {
                failed: result.failed,
                imported: result.imported,
                skipped: result.skipped,
              })}
            </p>
            <p className="text-metadata text-muted-foreground mt-0.5">
              {t("settings.importedMessages", { count: result.messages })}
            </p>
            {result.errors.slice(0, 3).map((item) => (
              <p
                key={`${item.path}:${item.message}`}
                className="text-metadata text-destructive mt-1 break-words"
              >
                {item.path}: {item.message}
              </p>
            ))}
          </div>
          {result.sessions[0] == null ? null : (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => onOpenSession(result.sessions[0].id)}
            >
              {t("settings.openImportedSession")}
            </Button>
          )}
        </div>
      ) : null}
    </Page>
  );
}

export function KeybindingsSettingsPage({
  bindings,
  capturing,
  onCapture,
  onReset,
}: {
  readonly bindings: KeymapEntry[];
  readonly capturing: string | null;
  readonly onCapture: (action: string) => void;
  readonly onReset?: (action: string) => void;
}) {
  const t = useT();
  const byAction = new Map(bindings.map((binding) => [binding[0], binding]));
  const conflicts = (() => {
    const seen = new Map<string, number>();
    for (const [, key] of bindings) {
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set(
      [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key)
    );
  })();
  const known = new Set(GROUPS.flatMap((group) => group.actions));
  const groups = [
    ...GROUPS.map((group) => ({
      actions: group.actions,
      title: t(group.labelKey),
    })),
    {
      actions: bindings
        .map((binding) => binding[0])
        .filter((action) => !known.has(action)),
      title: t("settings.groupOther"),
    },
  ].filter((group) => group.actions.length > 0);

  function renderRow(action: string) {
    const entry = byAction.get(action);
    if (!entry) {
      return null;
    }
    const [, key, coreLabel] = entry;
    const labelKey = `action.${action}` as StringKey;
    const label = labelKey in EN_STRINGS ? t(labelKey) : coreLabel;
    return (
      <Row key={action} compact label={label}>
        {conflicts.has(key) && capturing !== action && (
          <span
            className="text-metadata text-warning"
            title={t("settings.conflictHint")}
          >
            {t("settings.conflict")}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "text-callout min-w-24 justify-center font-mono",
            capturing === action && "text-primary",
            conflicts.has(key) && capturing !== action && "text-warning"
          )}
          onClick={() => onCapture(action)}
        >
          {capturing === action ? t("settings.capturing") : formatCombo(key)}
        </Button>
        {onReset ? (
          <TooltipButton
            label={t("settings.reset")}
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-7"
            onClick={() => onReset(action)}
          >
            <RotateCcw className="size-3.5" />
          </TooltipButton>
        ) : null}
      </Row>
    );
  }

  return (
    <Page
      title={t("settings.keybindings")}
      description={t("settings.keysHint", { mod: modifierLabel })}
    >
      {groups.map((group) => (
        <div key={group.title}>
          <GroupHeading>{group.title}</GroupHeading>
          <div className="space-y-0.5">{group.actions.map(renderRow)}</div>
        </div>
      ))}
    </Page>
  );
}
