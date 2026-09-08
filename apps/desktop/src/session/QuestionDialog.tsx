import { useState } from "react";

import { ChoiceRow } from "@/components/business/choice-row";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageCircleQuestion } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";

import type {
  ElicitationAnswer,
  ElicitationField,
  ElicitationForm,
} from "../bridge";
import { useT } from "../i18n";
import {
  acceptAnswer,
  canSubmit,
  customFieldFor,
  questionFields,
  selectOption,
  setValue,
  toggleOption,
} from "./elicitation";
import type { ElicitationValues } from "./elicitation";

/** happy-dom and React disagree about controlled inputs; the repo's fields drive them via onInput. */
function noopChange() {
  /* empty */
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
  const selected = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const multi = field.kind === "multi_select";
  const numeric = field.kind === "number" || field.kind === "integer";

  return (
    <section className="flex min-w-0 flex-col gap-2">
      {field.title != null && field.title !== "" && (
        <h3 className="text-metadata text-muted-foreground font-medium uppercase">
          {field.title}
        </h3>
      )}
      {field.description != null && field.description !== "" && (
        <p className="text-body text-foreground/90">{field.description}</p>
      )}

      {(field.options?.length ?? 0) > 0 ? (
        multi ? (
          <div
            role="group"
            aria-label={field.title ?? field.description ?? field.key}
            className="gap-control-group flex flex-col"
          >
            {field.options?.map((option) => {
              const optionSelected = selected.includes(option.value);
              return (
                <ChoiceRow
                  key={option.value}
                  kind="checkbox"
                  label={option.label}
                  description={option.description}
                  selected={optionSelected}
                  onCheckedChange={(checked) => {
                    if (checked !== optionSelected) {
                      onChange(
                        toggleOption(values, form, field.key, option.value)
                      );
                    }
                  }}
                  details={
                    option.preview != null &&
                    option.preview !== "" &&
                    optionSelected ? (
                      <pre className="mt-inline rounded-micro bg-fill-quiet px-module-inset py-control-group text-metadata text-muted-foreground max-h-40 w-full overflow-auto font-mono whitespace-pre-wrap">
                        {option.preview}
                      </pre>
                    ) : null
                  }
                />
              );
            })}
          </div>
        ) : (
          <RadioGroup
            value={selected[0] ?? ""}
            onValueChange={(optionValue) =>
              onChange(selectOption(values, form, field.key, optionValue))
            }
            aria-label={field.title ?? field.description ?? field.key}
          >
            {field.options?.map((option) => {
              const optionSelected = selected.includes(option.value);
              return (
                <ChoiceRow
                  key={option.value}
                  kind="radio"
                  value={option.value}
                  label={option.label}
                  description={option.description}
                  selected={optionSelected}
                  details={
                    option.preview != null &&
                    option.preview !== "" &&
                    optionSelected ? (
                      <pre className="mt-inline rounded-micro bg-fill-quiet px-module-inset py-control-group text-metadata text-muted-foreground max-h-40 w-full overflow-auto font-mono whitespace-pre-wrap">
                        {option.preview}
                      </pre>
                    ) : null
                  }
                />
              );
            })}
          </RadioGroup>
        )
      ) : field.kind === "boolean" ? (
        <ChoiceRow
          kind="checkbox"
          label={field.title ?? field.key}
          description={field.description}
          selected={value === true}
          onCheckedChange={(checked) =>
            onChange(setValue(values, field, checked))
          }
        />
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
            const parsed =
              field.kind === "integer"
                ? Math.trunc(Number(text))
                : Number(text);
            onChange(
              setValue(values, field, Number.isNaN(parsed) ? text : parsed)
            );
          }}
        />
      )}

      {custom && (
        <label className="flex flex-col gap-1">
          <span className="text-metadata text-muted-foreground uppercase">
            {custom.title ?? t("question.other")}
          </span>
          <Input
            aria-label={custom.title ?? t("question.other")}
            placeholder={t("question.otherPlaceholder")}
            value={
              typeof values[custom.key] === "string"
                ? (values[custom.key] as string)
                : ""
            }
            onChange={noopChange}
            onInput={(event) =>
              onChange(setValue(values, custom, event.currentTarget.value))
            }
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
    <Dialog
      open
      onOpenChange={(open) => !open && onAnswer({ action: "cancel" })}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2">
            <MessageCircleQuestion
              className="text-primary mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <span className="min-w-0 break-words whitespace-pre-wrap">
              {form.message}
            </span>
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
          <Button
            variant="ghost"
            onClick={() => onAnswer({ action: "cancel" })}
          >
            {t("question.cancel")}
          </Button>
          <Button
            variant="outline"
            onClick={() => onAnswer({ action: "decline" })}
          >
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
