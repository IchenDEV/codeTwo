import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, LoaderCircle, RefreshCw } from "lucide-react";

import { setAppearanceSettings, useAppearanceSettings, type PetSize } from "../appearance";
import { CodeTwoPetSprite } from "../pet/CodeTwoPet";
import type { CodeTwoPetAnimation } from "../pet/state";
import {
  BUILTIN_PET,
  fetchPetShareCatalog,
  petSpritesheetUrl,
  type PetCatalogItem,
} from "../pet/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n";
import type { StringKey } from "@/i18n/strings";

import "./pet-settings.css";

const MOODS: CodeTwoPetAnimation[] = ["idle", "running", "waiting", "review", "failed"];
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
  const [previewAnimation, setPreviewAnimation] = useState<CodeTwoPetAnimation>("idle");
  const [catalog, setCatalog] = useState<PetCatalogItem[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const selectedSize = SIZES.find(({ size }) => size === settings.petSize) ?? SIZES[1];

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
      },
    );
    return () => {
      active = false;
    };
  }, [catalogAttempt, loadCatalog]);

  const pets = useMemo(() => {
    const items = [BUILTIN_PET, ...catalog];
    if (settings.petSource === "petshare" && !items.some((item) => item.id === settings.petId)) {
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
      const leftSelected = left.source === settings.petSource && left.id === settings.petId;
      const rightSelected = right.source === settings.petSource && right.id === settings.petId;
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
    <div className="pet-settings">
      <section aria-labelledby="pet-picker-heading">
        <header className="pet-picker-header">
          <div className="pet-picker-copy">
            <h2 id="pet-picker-heading" className="pet-settings-heading">{t("settings.petPicker")}</h2>
            <p>{t("settings.petPickerHint")}</p>
          </div>
          <div className="pet-picker-actions">
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("settings.petCycleMood")}
              title={t("settings.petCycleMood")}
              onClick={previewNextMood}
            >
              <RefreshCw className="size-4" />
              {t("settings.petPreviewAction")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAppearanceSettings({ petEnabled: !settings.petEnabled })}
            >
              {settings.petEnabled ? t("settings.petTuckAway") : t("settings.petShow")}
            </Button>
          </div>
        </header>

        <div className="pet-catalog" role="list" aria-label={t("settings.petPicker")}>
          {pets.map((pet) => {
            const selected = pet.source === settings.petSource && pet.id === settings.petId;
            const description = pet.source === "builtin" ? t("settings.petDescription") : pet.description;
            return (
              <div className="pet-catalog-row" role="listitem" key={`${pet.source}:${pet.id}`}>
                <div className="pet-catalog-avatar" aria-label={t("settings.petPreviewLabel", { name: pet.displayName })}>
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
                <div className="pet-catalog-copy">
                  <h3>{pet.source === "builtin" ? t("settings.petName") : pet.displayName}</h3>
                  <p>{description}</p>
                </div>
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
                    aria-label={t("settings.petSelectNamed", { name: pet.displayName })}
                    onClick={() => selectPet(pet)}
                  >
                    {t("settings.petSelect")}
                  </Button>
                )}
              </div>
            );
          })}

          {catalogState === "loading" ? (
            <div className="pet-catalog-state" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              {t("settings.petStoreLoading")}
            </div>
          ) : null}
          {catalogState === "error" ? (
            <div className="pet-catalog-state pet-catalog-error" role="alert">
              <AlertCircle className="size-4" aria-hidden="true" />
              <span>{t("settings.petStoreError")}</span>
              <Button variant="ghost" size="sm" onClick={() => setCatalogAttempt((value) => value + 1)}>
                {t("settings.petRetry")}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="pet-behavior-heading">
        <h2 id="pet-behavior-heading" className="pet-settings-heading">{t("settings.petBehavior")}</h2>
        <div className="pet-setting-list">
          <div className="pet-setting-row">
            <span className="pet-setting-copy">
              <strong>{t("settings.petActivity")}</strong>
              <span>{t("settings.petActivityHint")}</span>
            </span>
            <Checkbox
              aria-label={t("settings.petActivity")}
              checked={settings.petActivityEnabled}
              onCheckedChange={(checked) => setAppearanceSettings({ petActivityEnabled: checked === true })}
            />
          </div>
          <div className="pet-setting-row">
            <span className="pet-setting-copy">
              <strong>{t("settings.petSize")}</strong>
              <span>{t("settings.petSizeHint")}</span>
            </span>
            <Select
              value={settings.petSize}
              onValueChange={(value) => setAppearanceSettings({ petSize: value as PetSize })}
            >
              <SelectTrigger size="sm" className="pet-size-select" aria-label={t("settings.petSize")}>
                <SelectValue>{t(selectedSize.labelKey)}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {SIZES.map(({ size, labelKey }) => (
                  <SelectItem key={size} value={size}>
                    {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  );
}
