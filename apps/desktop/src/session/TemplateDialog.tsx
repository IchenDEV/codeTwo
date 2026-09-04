import { Plus, Trash2 } from "@/components/ui/icons";
import { useEffect, useState } from "react";

import type { SceneSlotDefinition } from "./scene";
import {
  proposeMacroSlots as bridgePropose,
  saveSkill as bridgeSave,
} from "../bridge";
import type { Skill } from "../bridge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "../i18n";

/**
 * R2 "Save as template…" dialog: a past prompt becomes a Macro skill. The heuristic proposal is
 * an accelerator, not a dependency — a null proposal (browser preview, older core) opens the same
 * dialog as a manual template editor over the raw text.
 *
 * The template edits as a plain textarea (the spec's optional token-pill overlay is skipped in
 * v1: raw edit keeps the {{token}} ↔ slot-row contract obvious and testable).
 */

export const slotKinds = [
  "text",
  "multiline",
  "select",
  "file",
  "artifact",
] as const;

/**
One editable slot row. Options ride as a raw comma list so typing stays free-form.
*/
export interface SlotRow {
  id: string;
  label: string;
  kind: SceneSlotDefinition["kind"];
  options: string;
  required: boolean;
  default: string;
}

const tokenPattern = /\{\{\s*([^{}\s]+)\s*\}\}/gu;
const idPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;

export function splitOptions(raw: string): string[] {
  return raw
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

/**
 * Pure draft validation: every `{{token}}` needs a slot row and vice versa, ids must be slugs,
 * and a select must list options. Non-empty result disables Save.
 */
/**
Localizable validation message: a `templateFrom.err*` key plus its interpolation vars.
*/
type DraftError = { key: string; vars: Record<string, string | number> };

const draftErrorEn: Record<string, string> = {
  "templateFrom.errDuplicate": 'Slot {index}: duplicate id "{id}".',
  "templateFrom.errNoOptions": 'Slot "{id}" is a select but lists no options.',
  "templateFrom.errNoRow": "Template token {token} has no slot row.",
  "templateFrom.errNoToken":
    'Slot "{id}" never appears in the template as {token}.',
  "templateFrom.errSlug":
    'Slot {index}: id "{id}" is not a slug (lowercase letters, digits, - or _).',
};

function formatDraftError(error: DraftError): string {
  let out = draftErrorEn[error.key] ?? error.key;
  for (const [name, value] of Object.entries(error.vars)) {
    out = out.replaceAll(`{${name}}`, String(value));
  }
  return out;
}

export function validateMacroDraft(
  template: string,
  slots: readonly Pick<SlotRow, "id" | "kind" | "options">[],
  translate?: (key: string, vars: Record<string, string | number>) => string
): string[] {
  const errors: DraftError[] = [];
  const tokens = new Set<string>();
  for (const match of template.matchAll(tokenPattern)) {
    tokens.add(match[1]);
  }
  const ids = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    const id = slot.id.trim();
    if (!idPattern.test(id)) {
      errors.push({
        key: "templateFrom.errSlug",
        vars: { id, index: index + 1 },
      });
    } else if (ids.has(id)) {
      errors.push({
        key: "templateFrom.errDuplicate",
        vars: { id, index: index + 1 },
      });
    } else if (!tokens.has(id)) {
      errors.push({
        key: "templateFrom.errNoToken",
        vars: { id, token: `{{${id}}}` },
      });
    }
    ids.add(id);
    if (slot.kind === "select" && splitOptions(slot.options).length === 0) {
      errors.push({ key: "templateFrom.errNoOptions", vars: { id } });
    }
  }
  for (const token of tokens) {
    if (!ids.has(token)) {
      errors.push({
        key: "templateFrom.errNoRow",
        vars: { token: `{{${token}}}` },
      });
    }
  }
  return errors.map((error) =>
    translate ? translate(error.key, error.vars) : formatDraftError(error)
  );
}

function slugName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function toRow(slot: SceneSlotDefinition): SlotRow {
  return {
    default: slot.default ?? "",
    id: slot.id,
    kind: slot.kind ?? "text",
    label: slot.label || slot.id,
    options: (slot.options ?? []).join(", "),
    required: slot.required ?? false,
  };
}

export const TemplateDialog = ({
  source,
  onClose,
  onSaved,
  propose = bridgePropose,
  save = bridgeSave,
}: {
  readonly source: string;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  /**
  Test seams; both default to the bridge functions.
  */
  readonly propose?: typeof bridgePropose;
  readonly save?: (skill: Skill) => Promise<void>;
}) => {
  const t = useT();
  const [proposing, setProposing] = useState(true);
  const [manual, setManual] = useState(false);
  const [template, setTemplate] = useState(source);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isAlive = true;
    setProposing(true);
    void propose(source)
      .catch(() => null)
      .then((proposed) => {
        if (!isAlive) {
          return;
        }
        setProposing(false);
        if (!proposed) {
          // Manual editor mode: the raw text is the template, the slot table starts blank.
          setManual(true);
          return;
        }
        setTemplate(proposed.template);
        setSlots(proposed.slots.map(toRow));
      });
    return () => {
      isAlive = false;
    };
  }, [propose, source]);

  const errors = validateMacroDraft(template, slots, (key, vars) =>
    t(key as never, vars)
  );

  // Committing on the native `input` event (slotCard idiom) keeps one write per edit in browsers
  // and in happy-dom, whose own-instance `value` property defeats React's change tracker. The
  // noop onChange only satisfies React's controlled-input contract.
  const noopChange = () => {};

  const updateSlot = (index: number, patch: Partial<SlotRow>) => {
    setSlots((current) =>
      current.map((row, at) => (at === index ? { ...row, ...patch } : row))
    );
  };

  const addSlot = () => {
    setSlots((current) => [
      ...current,
      {
        default: "",
        id: `slot-${current.length + 1}`,
        kind: "text",
        label: "",
        options: "",
        required: false,
      },
    ]);
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      await save({
        description: description.trim(),
        icon: icon.trim() || null,
        id: slugName(name),
        name: name.trim(),
        payload: {
          kind: "macro",
          slots: slots.map((row) => ({
            id: row.id.trim(),
            kind: row.kind,
            label: row.label.trim(),
            ...(row.kind === "select"
              ? { options: splitOptions(row.options) }
              : {}),
            ...(row.required ? { required: true } : {}),
            ...(row.default.trim() ? { default: row.default } : {}),
          })),
          template,
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("templateFrom.title")}</DialogTitle>
        </DialogHeader>

        {proposing ? (
          <div className="relative">
            <pre className="rounded-control bg-fill-quiet text-callout text-muted-foreground max-h-64 overflow-y-auto border px-3 py-2 whitespace-pre-wrap">
              {source}
            </pre>
            <output className="bg-background/60 text-body text-muted-foreground absolute inset-0 flex items-center justify-center gap-2">
              <Spinner className="size-4" />
              {t("templateFrom.proposing")}
            </output>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            {manual ? (
              <p className="text-callout text-muted-foreground">
                {t("templateFrom.manualHint")}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Input
                aria-label={t("templateFrom.name")}
                placeholder={t("templateFrom.namePlaceholder")}
                value={name}
                onChange={noopChange}
                onInput={(e) => setName(e.currentTarget.value)}
              />
              <Input
                aria-label={t("templateFrom.icon")}
                placeholder={t("templateFrom.icon")}
                className="w-16 flex-none text-center"
                value={icon}
                onChange={noopChange}
                onInput={(e) => setIcon(e.currentTarget.value)}
              />
            </div>
            <Input
              aria-label={t("templateFrom.description")}
              placeholder={t("templateFrom.description")}
              value={description}
              onChange={noopChange}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />

            <label className="flex flex-col gap-1">
              <span className="text-metadata text-muted-foreground font-medium uppercase">
                {t("templateFrom.template")}
              </span>
              <Textarea
                aria-label={t("templateFrom.template")}
                className="min-h-24 font-mono"
                value={template}
                onChange={noopChange}
                onInput={(e) => setTemplate(e.currentTarget.value)}
              />
            </label>

            <div className="flex items-center justify-between">
              <span className="text-metadata text-muted-foreground font-medium uppercase">
                {t("templateFrom.slots")}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={addSlot}>
                <Plus data-icon="inline-start" aria-hidden />
                {t("templateFrom.addSlot")}
              </Button>
            </div>
            {slots.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {slots.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[6rem_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1.5"
                  >
                    <Input
                      aria-label={t("templateFrom.id")}
                      placeholder={t("templateFrom.id")}
                      className="font-mono"
                      value={row.id}
                      onChange={noopChange}
                      onInput={(e) =>
                        updateSlot(index, { id: e.currentTarget.value })
                      }
                    />
                    <Input
                      aria-label={t("templateFrom.label")}
                      placeholder={t("templateFrom.label")}
                      value={row.label}
                      onChange={noopChange}
                      onInput={(e) =>
                        updateSlot(index, { label: e.currentTarget.value })
                      }
                    />
                    <Select
                      items={slotKinds.map((kind) => ({
                        label: kind,
                        value: kind,
                      }))}
                      value={row.kind}
                      onValueChange={(next) =>
                        next &&
                        updateSlot(index, { kind: next as SlotRow["kind"] })
                      }
                    >
                      <SelectTrigger
                        aria-label={t("templateFrom.kind")}
                        className="min-w-0"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {slotKinds.map((kind) => (
                            <SelectItem key={kind} value={kind}>
                              {kind}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label={t("templateFrom.options")}
                      placeholder={t("templateFrom.options")}
                      disabled={row.kind !== "select"}
                      value={row.options}
                      onChange={noopChange}
                      onInput={(e) =>
                        updateSlot(index, { options: e.currentTarget.value })
                      }
                    />
                    <Checkbox
                      aria-label={t("templateFrom.required")}
                      checked={row.required}
                      onCheckedChange={(checked) =>
                        updateSlot(index, { required: checked === true })
                      }
                    />
                    <Input
                      aria-label={t("templateFrom.default")}
                      placeholder={t("templateFrom.default")}
                      value={row.default}
                      onChange={noopChange}
                      onInput={(e) =>
                        updateSlot(index, { default: e.currentTarget.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("templateFrom.removeSlot")}
                      className="text-muted-foreground"
                      onClick={() =>
                        setSlots((current) =>
                          current.filter((_, at) => at !== index)
                        )
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {errors.length > 0 && (
              <ul className="text-callout text-destructive flex flex-col gap-0.5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("templateFrom.cancel")}
          </Button>
          <Button
            disabled={
              proposing ||
              saving ||
              errors.length > 0 ||
              name.trim().length === 0
            }
            onClick={() => void saveDraft()}
          >
            {t("templateFrom.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
