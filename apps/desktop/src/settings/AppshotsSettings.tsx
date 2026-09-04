import { useEffect, useState } from "react";

import { SettingRow } from "@/components/business/setting-row";
import { SettingToggle } from "@/components/business/setting-toggle";
import { Button } from "@/components/ui/button";
import { ScanText } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  getAppshotSettings,
  openAppshotPrivacySettings,
  requestAppshotPermissions,
  takeAppshot,
  updateAppshotSettings,
  type AppshotSettings,
} from "../bridge";
import { useT } from "../i18n";
import { GroupHeading, Page, Row } from "./SettingsPrimitives";

export function AppshotsSettingsPage({
  loader = getAppshotSettings,
  saver = updateAppshotSettings,
  permissionRequester = requestAppshotPermissions,
  privacyOpener = openAppshotPrivacySettings,
  capturer = takeAppshot,
}: {
  loader?: () => Promise<AppshotSettings>;
  saver?: (
    patch: Partial<
      Pick<AppshotSettings, "hotkey" | "destination" | "play_sound">
    >
  ) => Promise<AppshotSettings>;
  permissionRequester?: (
    kind: "screen-recording" | "accessibility"
  ) => Promise<AppshotSettings>;
  privacyOpener?: (
    kind: "screen-recording" | "accessibility"
  ) => Promise<boolean>;
  capturer?: () => Promise<unknown>;
}) {
  const t = useT();
  const [appshotSettings, setAppshotSettings] =
    useState<AppshotSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    void loader()
      .then((next) => {
        if (active) setAppshotSettings(next);
      })
      .catch((cause) => {
        if (active)
          setError(t("settings.appshotsLoadFailed", { error: String(cause) }));
      });
    return () => {
      active = false;
    };
  }, [loader, t]);

  useEffect(() => {
    if (
      !appshotSettings?.available ||
      (appshotSettings.screen_recording && appshotSettings.accessibility)
    )
      return;
    let active = true;
    const timer = window.setInterval(() => {
      void loader()
        .then((next) => {
          if (active) setAppshotSettings(next);
        })
        .catch(() => {});
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    loader,
    appshotSettings?.accessibility,
    appshotSettings?.available,
    appshotSettings?.screen_recording,
  ]);

  async function save(
    patch: Partial<
      Pick<AppshotSettings, "hotkey" | "destination" | "play_sound">
    >
  ) {
    setSaving(true);
    setError(null);
    try {
      setAppshotSettings(await saver(patch));
    } catch (cause) {
      setError(t("settings.appshotsSaveFailed", { error: String(cause) }));
    } finally {
      setSaving(false);
    }
  }

  async function grant(kind: "screen-recording" | "accessibility") {
    setSaving(true);
    setError(null);
    try {
      setAppshotSettings(await permissionRequester(kind));
    } catch (cause) {
      setError(
        t("settings.appshotsPermissionFailed", { error: String(cause) })
      );
    } finally {
      setSaving(false);
    }
  }

  async function capture() {
    setCapturing(true);
    setError(null);
    try {
      await capturer();
    } catch (cause) {
      setError(t("settings.appshotsCaptureFailed", { error: String(cause) }));
    } finally {
      setCapturing(false);
    }
  }

  const hotkeyLabel =
    appshotSettings?.hotkey === "both-command"
      ? t("settings.appshotsHotkeyBothCommand")
      : appshotSettings?.hotkey === "command-shift-2"
        ? t("settings.appshotsHotkeyCommandShift2")
        : t("settings.appshotsHotkeyCommandOption2");
  const destinationLabel =
    appshotSettings?.destination === "automatic"
      ? t("settings.appshotsDestinationAutomatic")
      : appshotSettings?.destination === "current"
        ? t("settings.appshotsDestinationCurrent")
        : t("settings.appshotsDestinationNew");

  return (
    <Page
      title={t("settings.appshots")}
      description={t("settings.appshotsHint")}
    >
      <div className="mb-surface-inset">
        <SettingRow
          label={t("settings.appshotsFrontmost")}
          description={t("settings.appshotsFrontmostHint")}
          leading={<ScanText className="text-primary size-5" />}
          surface="card"
        >
          <Button
            variant="secondary"
            disabled={!appshotSettings?.available || capturing}
            onClick={() => void capture()}
          >
            {capturing
              ? t("settings.appshotsCapturing")
              : t("settings.appshotsTakeNow")}
          </Button>
        </SettingRow>
      </div>

      {error && (
        <p data-appshots-error className="text-metadata text-destructive pb-2">
          {error}
        </p>
      )}
      {!appshotSettings ? (
        <p className="py-section text-body text-muted-foreground">
          {t("settings.appshotsLoading")}
        </p>
      ) : !appshotSettings.available ? (
        <p className="py-section text-body text-muted-foreground">
          {appshotSettings.unavailable_reason ??
            t("settings.appshotsUnavailable")}
        </p>
      ) : (
        <>
          <Row
            label={t("settings.appshotsHotkey")}
            hint={t("settings.appshotsHotkeyHint")}
          >
            <Select
              value={appshotSettings.hotkey}
              disabled={saving}
              onValueChange={(hotkey) => {
                if (hotkey)
                  void save({ hotkey: hotkey as AppshotSettings["hotkey"] });
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-48 justify-between"
                aria-label={t("settings.appshotsHotkey")}
              >
                <SelectValue>{hotkeyLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  <SelectItem value="both-command">
                    {t("settings.appshotsHotkeyBothCommand")}
                  </SelectItem>
                  <SelectItem value="command-shift-2">
                    {t("settings.appshotsHotkeyCommandShift2")}
                  </SelectItem>
                  <SelectItem value="command-option-2">
                    {t("settings.appshotsHotkeyCommandOption2")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Row>
          <Row
            label={t("settings.appshotsDestination")}
            hint={t("settings.appshotsDestinationHint")}
          >
            <Select
              value={appshotSettings.destination}
              disabled={saving}
              onValueChange={(destination) => {
                if (destination)
                  void save({
                    destination: destination as AppshotSettings["destination"],
                  });
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-48 justify-between"
                aria-label={t("settings.appshotsDestination")}
              >
                <SelectValue>{destinationLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  <SelectItem value="automatic">
                    {t("settings.appshotsDestinationAutomatic")}
                  </SelectItem>
                  <SelectItem value="current">
                    {t("settings.appshotsDestinationCurrent")}
                  </SelectItem>
                  <SelectItem value="new">
                    {t("settings.appshotsDestinationNew")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Row>
          <SettingToggle
            label={t("settings.appshotsSound")}
            checked={appshotSettings.play_sound}
            disabled={saving}
            onCheckedChange={(play_sound) => void save({ play_sound })}
          />

          <GroupHeading>{t("settings.appshotsPermissions")}</GroupHeading>
          <PermissionRow
            label={t("settings.appshotsScreenRecording")}
            hint={t("settings.appshotsScreenRecordingHint")}
            allowed={appshotSettings.screen_recording}
            onAllow={() => void grant("screen-recording")}
            onOpen={() => void privacyOpener("screen-recording")}
          />
          <PermissionRow
            label={t("settings.appshotsAccessibility")}
            hint={t("settings.appshotsAccessibilityHint")}
            allowed={appshotSettings.accessibility}
            onAllow={() => void grant("accessibility")}
            onOpen={() => void privacyOpener("accessibility")}
          />
        </>
      )}
    </Page>
  );
}

function PermissionRow({
  label,
  hint,
  allowed,
  onAllow,
  onOpen,
}: {
  label: string;
  hint: string;
  allowed: boolean;
  onAllow: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <Row compact label={label} hint={hint}>
      {allowed ? (
        <span className="text-callout text-success">
          {t("settings.appshotsAllowed")}
        </span>
      ) : (
        <Button variant="outline" size="sm" onClick={onAllow}>
          {t("settings.appshotsAllow")}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={onOpen}
      >
        {t("settings.appshotsOpenSettings")}
      </Button>
    </Row>
  );
}
