import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MessageSquareText, Play } from "lucide-react";

import type { KeymapEntry, ProjectScript } from "../bridge";
import { comboFromEvent, formatCombo, isModifierOnly } from "../keys";
import { useT } from "../i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  projectActionId,
  projectActionIssue,
  type ProjectActionDraft,
} from "./projectActions";

const EMPTY_ACTION: ProjectActionDraft = {
  name: "",
  kind: "command",
  command: "",
  prompt: "",
  keybinding: "",
  preview_url: "",
  run_on_worktree_create: false,
  open_preview: false,
};

function SwitchRow({
  label,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-(--ds-radius-control) bg-fill-quiet px-3 py-2.5">
      <span className={disabled ? "text-ui text-muted-foreground" : "text-ui"}>{label}</span>
      <Switch
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function ProjectActionDialog({
  open,
  actions,
  bindings,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  actions: ProjectScript[];
  bindings: KeymapEntry[];
  onOpenChange: (open: boolean) => void;
  onSave: (action: ProjectScript) => Promise<void>;
}) {
  const t = useT();
  const [draft, setDraft] = useState<ProjectActionDraft>(EMPTY_ACTION);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(EMPTY_ACTION);
    setSubmitted(false);
    setSaving(false);
    setSaveError(null);
  }, [open]);

  const validation = useMemo(
    () => projectActionIssue(draft, bindings, actions),
    [actions, bindings, draft],
  );
  let validationMessage: string | null = null;
  switch (validation?.issue) {
    case "name_required":
      validationMessage = t("actionDialog.nameRequired");
      break;
    case "command_required":
      validationMessage = t("actionDialog.commandRequired");
      break;
    case "prompt_required":
      validationMessage = t("actionDialog.promptRequired");
      break;
    case "preview_invalid":
      validationMessage = t("actionDialog.previewInvalid");
      break;
    case "keybinding_conflict":
      validationMessage = t("actionDialog.keybindingConflict", {
        name: validation.conflict ?? "",
      });
      break;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (validation) return;
    setSaving(true);
    try {
      await onSave({
        id: projectActionId(draft.name, actions),
        name: draft.name.trim(),
        kind: draft.kind,
        command: draft.command.trim(),
        prompt: draft.prompt.trim(),
        keybinding: draft.keybinding,
        preview_url: draft.preview_url.trim(),
        run_on_worktree_create: draft.run_on_worktree_create,
        open_preview: Boolean(draft.preview_url.trim()) && draft.open_preview,
      });
      onOpenChange(false);
    } catch (error) {
      setSaveError(t("actionDialog.saveFailed", { error: String(error) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-lg">
        <form className="flex min-h-0 flex-col gap-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("actionDialog.title")}</DialogTitle>
            <DialogDescription>{t("actionDialog.description")}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel>{t("actionDialog.kind")}</FieldLabel>
              <Tabs
                value={draft.kind}
                onValueChange={(kind) =>
                  setDraft((current) => ({
                    ...current,
                    kind: kind as ProjectActionDraft["kind"],
                    run_on_worktree_create:
                      kind === "command" && current.run_on_worktree_create,
                    open_preview: kind === "command" && current.open_preview,
                  }))}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="command">
                    <Play aria-hidden />
                    {t("actionDialog.kindCommand")}
                  </TabsTrigger>
                  <TabsTrigger value="prompt">
                    <MessageSquareText aria-hidden />
                    {t("actionDialog.kindPrompt")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <FieldDescription>
                {t(
                  draft.kind === "prompt"
                    ? "actionDialog.kindPromptHint"
                    : "actionDialog.kindCommandHint",
                )}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="action-name">{t("actionDialog.name")}</FieldLabel>
              <div className="flex gap-2">
                <div className="grid size-9 shrink-0 place-items-center rounded-(--ds-radius-control) bg-fill-quiet text-muted-foreground">
                  {draft.kind === "prompt" ? (
                    <MessageSquareText className="size-4" aria-hidden />
                  ) : (
                    <Play className="size-4" aria-hidden />
                  )}
                </div>
                <Input
                  id="action-name"
                  autoFocus
                  value={draft.name}
                  placeholder={t("actionDialog.namePlaceholder")}
                  aria-invalid={submitted && validation?.issue === "name_required"}
                  onInput={(event) => {
                    const name = event.currentTarget.value;
                    setDraft((current) => ({ ...current, name }));
                  }}
                />
              </div>
            </Field>

            <Field>
              <FieldLabel>{t("actionDialog.keybinding")}</FieldLabel>
              <Button
                type="button"
                variant="outline"
                size="field"
                className="w-full justify-start font-normal"
                aria-label={t("actionDialog.keybinding")}
                onKeyDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isModifierOnly(event.nativeEvent)) return;
                  if (event.key === "Backspace" || event.key === "Delete") {
                    setDraft((current) => ({ ...current, keybinding: "" }));
                    return;
                  }
                  const keybinding = comboFromEvent(event.nativeEvent);
                  setDraft((current) => ({ ...current, keybinding }));
                }}
              >
                {draft.keybinding
                  ? formatCombo(draft.keybinding)
                  : <span className="text-muted-foreground">{t("actionDialog.keybindingPlaceholder")}</span>}
              </Button>
              <FieldDescription>{t("actionDialog.keybindingHint")}</FieldDescription>
            </Field>

            {draft.kind === "prompt" ? (
              <Field>
                <FieldLabel htmlFor="action-prompt">{t("actionDialog.prompt")}</FieldLabel>
                <Textarea
                  id="action-prompt"
                  className="min-h-32"
                  value={draft.prompt}
                  placeholder={t("actionDialog.promptPlaceholder")}
                  aria-invalid={submitted && validation?.issue === "prompt_required"}
                  onInput={(event) => {
                    const prompt = event.currentTarget.value;
                    setDraft((current) => ({ ...current, prompt }));
                  }}
                />
                <FieldDescription>{t("actionDialog.promptHint")}</FieldDescription>
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="action-command">{t("actionDialog.command")}</FieldLabel>
                  <Textarea
                    id="action-command"
                    className="min-h-20 font-mono"
                    value={draft.command}
                    placeholder={t("actionDialog.commandPlaceholder")}
                    aria-invalid={submitted && validation?.issue === "command_required"}
                    onInput={(event) => {
                      const command = event.currentTarget.value;
                      setDraft((current) => ({ ...current, command }));
                    }}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="action-preview-url">{t("actionDialog.previewUrl")}</FieldLabel>
                  <Input
                    id="action-preview-url"
                    type="url"
                    value={draft.preview_url}
                    placeholder={t("actionDialog.previewPlaceholder")}
                    aria-invalid={submitted && validation?.issue === "preview_invalid"}
                    onInput={(event) => {
                      const preview_url = event.currentTarget.value;
                      setDraft((current) => ({
                        ...current,
                        preview_url,
                        open_preview: preview_url ? current.open_preview : false,
                      }));
                    }}
                  />
                  <FieldDescription>{t("actionDialog.previewHint")}</FieldDescription>
                </Field>

                <div className="flex flex-col gap-2">
                  <SwitchRow
                    label={t("actionDialog.runOnWorktree")}
                    checked={draft.run_on_worktree_create}
                    onCheckedChange={(run_on_worktree_create) =>
                      setDraft((current) => ({ ...current, run_on_worktree_create }))}
                  />
                  <SwitchRow
                    label={t("actionDialog.openPreview")}
                    checked={draft.open_preview}
                    disabled={!draft.preview_url.trim()}
                    onCheckedChange={(open_preview) =>
                      setDraft((current) => ({ ...current, open_preview }))}
                  />
                </div>
              </>
            )}
          </FieldGroup>

          {(saveError || (submitted && validationMessage)) && (
            <FieldError>{saveError ?? validationMessage}</FieldError>
          )}

          <DialogFooter className="-mx-6 -mb-6 bg-fill-quiet px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("actionDialog.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("actionDialog.saving") : t("actionDialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
