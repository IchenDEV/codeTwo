import { Check, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";

import {
  acceptAnswer,
  canSubmit,
  customFieldFor,
  questionFields,
  selectOption,
  setValue,
  toggleOption,
  type ElicitationValues,
} from "./elicitation";
import type { ElicitationAnswer, ElicitationField, ElicitationForm } from "../bridge";
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
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

/** happy-dom and React disagree about controlled inputs; the repo's fields drive them via onInput. */
function noopChange() {}

function OptionButton({
  option,
  selected,
  multi,
  onPick,
}: {
  option: { value: string; label: string; description?: string | null; preview?: string | null };
  selected: boolean;
  multi: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onPick}
      className={cn(
        "flex w-full items-start gap-2 rounded-(--ds-radius-control) border px-3 py-2 text-left transition-colors",
        // Selection is carried by fill and a check mark rather than a border colour: the design
        // system reserves static borders, and a tick reads at a glance in either theme.
        selected ? "bg-primary/10" : "hover:bg-accent/50",
      )}
    >
      <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
        {selected && <Check className="size-3.5 text-primary" aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-ui font-medium text-foreground">{option.label}</span>
        {option.description && (
          <span className="text-fine text-muted-foreground">{option.description}</span>
        )}
        {option.preview && selected && (
          <pre className="mt-1 max-h-40 w-full overflow-auto whitespace-pre-wrap rounded-(--ds-radius-micro) bg-fill-quiet px-2 py-1.5 font-mono text-cap text-muted-foreground">
            {option.preview}
          </pre>
        )}
      </span>
    </button>
  );
}

function Question({
  form,
  field,
  values,
  onChange,
}: {
  form: ElicitationForm;
  field: ElicitationField;
  values: ElicitationValues;
  onChange: (next: ElicitationValues) => void;
}) {
  const t = useT();
  const custom = customFieldFor(form, field.key);
  const value = values[field.key];
  const selected = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const multi = field.kind === "multi_select";
  const numeric = field.kind === "number" || field.kind === "integer";

  return (
    <section className="flex min-w-0 flex-col gap-2">
      {field.title && (
        <h3 className="text-cap font-medium uppercase text-muted-foreground">{field.title}</h3>
      )}
      {field.description && (
        <p className="text-ui text-foreground/90">{field.description}</p>
      )}

      {(field.options?.length ?? 0) > 0 ? (
        <div
          role={multi ? "group" : "radiogroup"}
          aria-label={field.title ?? field.description ?? field.key}
          className="flex flex-col gap-1.5"
        >
          {field.options?.map((option) => (
            <OptionButton
              key={option.value}
              option={option}
              multi={multi}
              selected={selected.includes(option.value)}
              onPick={() =>
                onChange(
                  multi
                    ? toggleOption(values, form, field.key, option.value)
                    : selectOption(values, form, field.key, option.value),
                )
              }
            />
          ))}
        </div>
      ) : field.kind === "boolean" ? (
        <label className="flex items-center gap-2 text-ui">
          <Checkbox
            aria-label={field.title ?? field.description ?? field.key}
            checked={value === true}
            onCheckedChange={(checked) =>
              onChange(setValue(values, field, checked === true))
            }
          />
          {field.title ?? field.key}
        </label>
      ) : (
        <Input
          aria-label={field.title ?? field.description ?? field.key}
          type={numeric ? "number" : "text"}
          value={value === undefined ? "" : String(value)}
          onChange={noopChange}
          onInput={(event) => {
            const text = event.currentTarget.value;
            if (!numeric) {
              onChange(setValue(values, field, text));
              return;
            }
            // A half-typed number ("-", "1.") parses to NaN; keep the draft as text and let the
            // core drop it if the user leaves it that way, rather than fighting their typing.
            const parsed = field.kind === "integer" ? parseInt(text, 10) : parseFloat(text);
            onChange(setValue(values, field, Number.isNaN(parsed) ? text : parsed));
          }}
        />
      )}

      {custom && (
        <label className="flex flex-col gap-1">
          <span className="text-cap uppercase text-muted-foreground">
            {custom.title || t("question.other")}
          </span>
          <Input
            aria-label={custom.title || t("question.other")}
            placeholder={t("question.otherPlaceholder")}
            value={typeof values[custom.key] === "string" ? (values[custom.key] as string) : ""}
            onChange={noopChange}
            onInput={(event) => onChange(setValue(values, custom, event.currentTarget.value))}
          />
        </label>
      )}
    </section>
  );
}

/**
 * The agent asking the user something (ACP `elicitation/create`): Claude Code's `AskUserQuestion`,
 * or an MCP form elicitation. Distinct from the permission dialog on purpose — this is a question,
 * not an approval, so it offers the agent's own options rather than allow/deny, and "Skip" answers
 * honestly (the agent is told nothing was chosen) instead of pretending the user rejected a tool.
 *
 * Mount with `key={requestId}` so a second question never inherits the first one's draft answers.
 */
export function QuestionDialog({
  form,
  onAnswer,
}: {
  form: ElicitationForm;
  onAnswer: (answer: ElicitationAnswer) => void;
}) {
  const t = useT();
  const [values, setValues] = useState<ElicitationValues>({});
  const questions = questionFields(form);
  // With one question the message *is* the question, so repeating it above the options would just
  // read as the same sentence twice.
  const single = questions.length === 1;

  return (
    <Dialog open onOpenChange={(open) => !open && onAnswer({ action: "cancel" })}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2">
            <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 whitespace-pre-wrap break-words">{form.message}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {questions.map((field) => (
            <Question
              key={field.key}
              form={form}
              field={single ? { ...field, description: null } : field}
              values={values}
              onChange={setValues}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onAnswer({ action: "cancel" })}>
            {t("question.cancel")}
          </Button>
          <Button variant="outline" onClick={() => onAnswer({ action: "decline" })}>
            {t("question.skip")}
          </Button>
          <Button
            disabled={!canSubmit(form, values)}
            onClick={() => onAnswer(acceptAnswer(form, values))}
          >
            {t("question.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
