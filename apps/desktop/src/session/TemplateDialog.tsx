import { Loader2, Plus, Trash2 } from "@/components/ui/icons";
import { useEffect, useState } from "react";

import type { SceneSlotDef } from "./scene";
import {
  proposeMacroSlots as bridgePropose,
  saveSkill as bridgeSave,
  type Skill,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

export const SLOT_KINDS = ["text", "multiline", "select", "file", "artifact"] as const;

/** One editable slot row. Options ride as a raw comma list so typing stays free-form. */
export interface SlotRow {
  id: string;
  label: string;
  kind: SceneSlotDef["kind"];
  options: string;
  required: boolean;
  default: string;
}

const TOKEN_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

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
/** Localizable validation message: a `templateFrom.err*` key plus its interpolation vars. */
type DraftError = { key: string; vars: Record<string, string | number> };

const DRAFT_ERROR_EN: Record<string, string> = {
  "templateFrom.errSlug": 'Slot {index}: id "{id}" is not a slug (lowercase letters, digits, - or _).',
  "templateFrom.errDuplicate": 'Slot {index}: duplicate id "{id}".',
  "templateFrom.errNoToken": 'Slot "{id}" never appears in the template as {token}.',
  "templateFrom.errNoOptions": 'Slot "{id}" is a select but lists no options.',
  "templateFrom.errNoRow": "Template token {token} has no slot row.",
};

/** English fallback so the pure validator stays testable without an i18n provider. */
function formatDraftError(error: DraftError): string {
  let out = DRAFT_ERROR_EN[error.key] ?? error.key;
  for (const [name, value] of Object.entries(error.vars)) {
    out = out.replaceAll(`{${name}}`, String(value));
  }
  return out;
}

export function validateMacroDraft(
  template: string,
  slots: readonly Pick<SlotRow, "id" | "kind" | "options">[],
  translate?: (key: string, vars: Record<string, string | number>) => string,
): string[] {
  const errors: DraftError[] = [];
  const tokens = new Set<string>();
  for (const match of template.matchAll(TOKEN_PATTERN)) tokens.add(match[1]);
  const ids = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    const id = slot.id.trim();
    if (!ID_PATTERN.test(id)) {
      errors.push({ key: "templateFrom.errSlug", vars: { index: index + 1, id } });
    } else if (ids.has(id)) {
      errors.push({ key: "templateFrom.errDuplicate", vars: { index: index + 1, id } });
    } else if (!tokens.has(id)) {
      errors.push({ key: "templateFrom.errNoToken", vars: { id, token: `{{${id}}}` } });
    }
    ids.add(id);
    if (slot.kind === "select" && splitOptions(slot.options).length === 0) {
      errors.push({ key: "templateFrom.errNoOptions", vars: { id } });
    }
  }
  for (const token of tokens) {
    if (!ids.has(token)) {
      errors.push({ key: "templateFrom.errNoRow", vars: { token: `{{${token}}}` } });
    }
  }
  return errors.map((error) =>
    translate ? translate(error.key, error.vars) : formatDraftError(error),
  );
}

/** Same id derivation the App's skill-draft flow uses. */
function slugName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toRow(slot: SceneSlotDef): SlotRow {
  return {
    id: slot.id,
    label: slot.label || slot.id,
    kind: slot.kind ?? "text",
    options: (slot.options ?? []).join(", "),
    required: slot.required ?? false,
    default: slot.default ?? "",
  };
}

const FIELD_CLASSES =
  "canvas-ui-control w-full bg-fill-rest px-2 py-1 text-ui outline-none transition-[color,box-shadow,background-color] focus-visible:focus-ring";

export function TemplateDialog({
  source,
  onClose,
  onSaved,
  propose = bridgePropose,
  save = bridgeSave,
}: {
  source: string;
  onClose: () => void;
  onSaved: () => void;
  /** Test seams; both default to the bridge functions. */
  propose?: typeof bridgePropose;
  save?: (skill: Skill) => Promise<void>;
}) {
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
    let alive = true;
    setProposing(true);
    void propose(source)
      .catch(() => null)
      .then((proposed) => {
        if (!alive) return;
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
      alive = false;
    };
  }, [propose, source]);

  const errors = validateMacroDraft(template, slots, (key, vars) => t(key as never, vars));

  // Committing on the native `input` event (slotCard idiom) keeps one write per edit in browsers
  // and in happy-dom, whose own-instance `value` property defeats React's change tracker. The
  // noop onChange only satisfies React's controlled-input contract.
  const noopChange = () => {};

  const updateSlot = (index: number, patch: Partial<SlotRow>) => {
    setSlots((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  };

  const addSlot = () => {
    setSlots((current) => [
      ...current,
      { id: `slot-${current.length + 1}`, label: "", kind: "text", options: "", required: false, default: "" },
    ]);
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      await save({
        id: slugName(name),
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || null,
        payload: {
          kind: "macro",
          template,
          slots: slots.map((row) => ({
            id: row.id.trim(),
            label: row.label.trim(),
            kind: row.kind,
            ...(row.kind === "select" ? { options: splitOptions(row.options) } : {}),
            ...(row.required ? { required: true } : {}),
            ...(row.default.trim() ? { default: row.default } : {}),
          })),
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
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-control border bg-fill-quiet px-3 py-2 text-fine text-muted-foreground">
              {source}
            </pre>
            <span
              role="status"
              className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-ui text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("templateFrom.proposing")}
            </span>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            {manual && (
              <p className="text-fine text-muted-foreground">{t("templateFrom.manualHint")}</p>
            )}

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
              <span className="text-cap font-medium uppercase text-muted-foreground">
                {t("templateFrom.template")}
              </span>
              <Textarea
                aria-label={t("templateFrom.template")}
                className="font-mono"
                value={template}
                onChange={noopChange}
                onInput={(e) => setTemplate(e.currentTarget.value)}
              />
            </label>

            <div className="flex items-center justify-between">
              <span className="text-cap font-medium uppercase text-muted-foreground">
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
                      onInput={(e) => updateSlot(index, { id: e.currentTarget.value })}
                    />
                    <Input
                      aria-label={t("templateFrom.label")}
                      placeholder={t("templateFrom.label")}
                      value={row.label}
                      onChange={noopChange}
                      onInput={(e) => updateSlot(index, { label: e.currentTarget.value })}
                    />
                    <select
                      aria-label={t("templateFrom.kind")}
                      className={FIELD_CLASSES}
                      value={row.kind}
                      onChange={noopChange}
                      onInput={(e) =>
                        updateSlot(index, { kind: e.currentTarget.value as SlotRow["kind"] })
                      }
                    >
                      {SLOT_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label={t("templateFrom.options")}
                      placeholder={t("templateFrom.options")}
                      disabled={row.kind !== "select"}
                      value={row.options}
                      onChange={noopChange}
                      onInput={(e) => updateSlot(index, { options: e.currentTarget.value })}
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
                      onInput={(e) => updateSlot(index, { default: e.currentTarget.value })}
                    />
                    <button
                      type="button"
                      aria-label={t("templateFrom.removeSlot")}
                      className="rounded-control p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:focus-ring"
                      onClick={() =>
                        setSlots((current) => current.filter((_, at) => at !== index))
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {errors.length > 0 && (
              <ul className="flex flex-col gap-0.5 text-fine text-destructive">
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
            disabled={proposing || saving || errors.length > 0 || name.trim().length === 0}
            onClick={() => void saveDraft()}
          >
            {t("templateFrom.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
