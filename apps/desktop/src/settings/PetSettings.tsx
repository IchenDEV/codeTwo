import { useEffect, useMemo, useState } from "react";

import { SettingRow } from "@/components/business/setting-row";
import { SettingToggle } from "@/components/business/setting-toggle";
import { SettingsSection } from "@/components/business/settings-section";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, RefreshCw } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import type { StringKey } from "@/i18n/strings";

import {
  setAppearanceSettings,
  useAppearanceSettings,
  type PetSize,
} from "../appearance";
import { CodeTwoPetSprite } from "../pet/CodeTwoPet";
import type { CodeTwoPetAnimation } from "../pet/state";
import {
  BUILTIN_PET,
  fetchPetShareCatalog,
  petSpritesheetUrl,
  type PetCatalogItem,
} from "../pet/store";

import "./pet-settings.css";

const MOODS: CodeTwoPetAnimation[] = [
  "idle",
  "running",
  "waiting",
  "review",
  "failed",
];
const PREVIEW_SIZE = 46;

const SIZES: { size: PetSize; labelKey: StringKey }[] = [
  { size: "small", labelKey: "settings.petSizeSmall" },
  { size: "medium", labelKey: "settings.petSizeMedium" },
  { size: "large", labelKey: "settings.petSizeLarge" },
];

export function PetSettings({
  loadCatalog = fetchPetShareCatalog,
}: {
  loadCatalog?: () => Promise<PetCatalogItem[]>;
} = {}) {
  const t = useT();
  const settings = useAppearanceSettings();
  const [previewAnimation, setPreviewAnimation] =
    useState<CodeTwoPetAnimation>("idle");
  const [catalog, setCatalog] = useState<PetCatalogItem[]>([]);
  const [catalogState, setCatalogState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const selectedSize =
    SIZES.find(({ size }) => size === settings.petSize) ?? SIZES[1];

  useEffect(() => {
    let active = true;
    setCatalogState("loading");
    loadCatalog().then(
      (items) => {
        if (!active) return;
        setCatalog(items);
        setCatalogState("ready");
      },
      () => {
        if (!active) return;
        setCatalogState("error");
      }
    );
    return () => {
      active = false;
    };
  }, [catalogAttempt, loadCatalog]);

  const pets = useMemo(() => {
    const items = [BUILTIN_PET, ...catalog];
    if (
      settings.petSource === "petshare" &&
      !items.some((item) => item.id === settings.petId)
    ) {
      items.push({
        id: settings.petId,
        displayName: settings.petName,
        description: t("settings.petSavedDescription"),
        source: "petshare",
        spritesheetUrl: petSpritesheetUrl("petshare", settings.petId),
        spriteVersionNumber: 2,
      });
    }
    return items.sort((left, right) => {
      const leftSelected =
        left.source === settings.petSource && left.id === settings.petId;
      const rightSelected =
        right.source === settings.petSource && right.id === settings.petId;
      return Number(rightSelected) - Number(leftSelected);
    });
  }, [catalog, settings.petId, settings.petName, settings.petSource, t]);

  const previewNextMood = () => {
    setPreviewAnimation((current) => {
      const index = MOODS.indexOf(current);
      return MOODS[(index + 1) % MOODS.length];
    });
  };

  const selectPet = (pet: PetCatalogItem) => {
    setAppearanceSettings({
      petSource: pet.source,
      petId: pet.id,
      petName: pet.displayName,
    });
  };

  return (
    <div className="pet-settings gap-page-section flex min-w-0 flex-col">
      <SettingsSection
        headingId="pet-picker-heading"
        title={t("settings.petPicker")}
        description={t("settings.petPickerHint")}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("settings.petCycleMood")}
              title={t("settings.petCycleMood")}
              onClick={previewNextMood}
            >
              <RefreshCw data-icon="inline-start" />
              {t("settings.petPreviewAction")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAppearanceSettings({ petEnabled: !settings.petEnabled })
              }
            >
              {settings.petEnabled
                ? t("settings.petTuckAway")
                : t("settings.petShow")}
            </Button>
          </>
        }
      >
        <ul className="pet-catalog" aria-label={t("settings.petPicker")}>
          {pets.map((pet) => {
            const selected =
              pet.source === settings.petSource && pet.id === settings.petId;
            const description =
              pet.source === "builtin"
                ? t("settings.petDescription")
                : pet.description;
            return (
              <li className="pet-catalog-item" key={`${pet.source}:${pet.id}`}>
                <SettingRow
                  className="pet-catalog-row"
                  label={
                    pet.source === "builtin"
                      ? t("settings.petName")
                      : pet.displayName
                  }
                  description={description}
                  leading={
                    <div
                      className="pet-catalog-avatar"
                      aria-label={t("settings.petPreviewLabel", {
                        name: pet.displayName,
                      })}
                    >
                      <CodeTwoPetSprite
                        key={`${pet.source}-${pet.id}-${previewAnimation}`}
                        animation={previewAnimation}
                        size={PREVIEW_SIZE}
                        src={pet.spritesheetUrl}
                        spriteVersionNumber={pet.spriteVersionNumber}
                        playing={false}
                        frame={0}
                        title={pet.displayName}
                      />
                    </div>
                  }
                >
                  {selected ? (
                    <span className="pet-selected-status">
                      <Check className="size-3.5" aria-hidden="true" />
                      {t("settings.petSelected")}
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="pet-select-button"
                      aria-label={t("settings.petSelectNamed", {
                        name: pet.displayName,
                      })}
                      onClick={() => selectPet(pet)}
                    >
                      {t("settings.petSelect")}
                    </Button>
                  )}
                </SettingRow>
              </li>
            );
          })}

          {catalogState === "loading" ? (
            <li className="pet-catalog-state" role="status">
              <Spinner />
              {t("settings.petStoreLoading")}
            </li>
          ) : null}
          {catalogState === "error" ? (
            <li className="pet-catalog-state pet-catalog-error" role="alert">
              <AlertCircle className="size-4" aria-hidden="true" />
              <span>{t("settings.petStoreError")}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCatalogAttempt((value) => value + 1)}
              >
                {t("settings.petRetry")}
              </Button>
            </li>
          ) : null}
        </ul>
      </SettingsSection>

      <SettingsSection
        headingId="pet-behavior-heading"
        title={t("settings.petBehavior")}
      >
        <div className="pet-setting-group">
          <SettingToggle
            label={t("settings.petActivity")}
            description={t("settings.petActivityHint")}
            checked={settings.petActivityEnabled}
            onCheckedChange={(petActivityEnabled) =>
              setAppearanceSettings({ petActivityEnabled })
            }
          />
          <SettingRow
            label={t("settings.petSize")}
            description={t("settings.petSizeHint")}
          >
            <Select
              value={settings.petSize}
              onValueChange={(value) =>
                setAppearanceSettings({ petSize: value as PetSize })
              }
            >
              <SelectTrigger
                size="sm"
                className="w-32"
                aria-label={t("settings.petSize")}
              >
                <SelectValue>{t(selectedSize.labelKey)}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectGroup>
                  {SIZES.map(({ size, labelKey }) => (
                    <SelectItem key={size} value={size}>
                      {t(labelKey)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      </SettingsSection>
    </div>
  );
}
