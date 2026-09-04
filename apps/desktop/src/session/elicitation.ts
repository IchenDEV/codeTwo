import type {
  ElicitationAnswer,
  ElicitationContent,
  ElicitationField,
  ElicitationForm,
} from "../bridge";

/**
 * Answer state for a structured question (ACP `elicitation/create` — Claude Code's
 * `AskUserQuestion`, or an MCP form). The reducer half lives here, apart from the dialog, so the
 * rules that matter — a typed "Other" replaces the picked option, an unanswered required question
 * blocks submit — are testable without a DOM.
 *
 * The core sanitizes whatever we send against the form the agent supplied, so these functions are
 * about being honest with the user, not about being trusted: nothing here is a security boundary.
 */

export type ElicitationValue = string | string[] | number | boolean;
export type ElicitationValues = Record<string, ElicitationValue>;

/**
The fields a user answers. The free-text "Other" boxes hang off these, and aren't questions.
*/
export function questionFields(form: ElicitationForm): ElicitationField[] {
  return form.fields.filter((field) => !field.custom_answer_for);
}

/**
The "Other" box belonging to a question, when the agent offered one.
*/
export function customFieldFor(
  form: ElicitationForm,
  key: string
): ElicitationField | undefined {
  return form.fields.find((field) => field.custom_answer_for === key);
}

function isAnswered(value: ElicitationValue | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

/**
Pick one option, dropping any free-text answer the user had typed for the same question.
*/
export function selectOption(
  values: ElicitationValues,
  form: ElicitationForm,
  key: string,
  value: string
): ElicitationValues {
  const next = { ...values, [key]: value };
  const custom = customFieldFor(form, key);
  if (custom) {
    delete next[custom.key];
  }
  return next;
}

/**
Add or remove one member of a multi-select answer.
*/
export function toggleOption(
  values: ElicitationValues,
  form: ElicitationForm,
  key: string,
  value: string
): ElicitationValues {
  const current = values[key];
  const selected = Array.isArray(current) ? current : [];
  const next = {
    ...values,
    [key]: selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value],
  };
  const custom = customFieldFor(form, key);
  if (custom) {
    delete next[custom.key];
  }
  return next;
}

/**
 * Type a free-text answer. A non-empty one clears that question's selection: the agent's own
 * bridge treats a typed answer as replacing the choice, and showing both as active would promise
 * something the tool won't honor.
 */
export function setValue(
  values: ElicitationValues,
  field: ElicitationField,
  value: ElicitationValue
): ElicitationValues {
  const next = { ...values, [field.key]: value };
  const owner = field.custom_answer_for;
  if (owner && isAnswered(value)) {
    delete next[owner];
  }
  return next;
}

/**
Has this question been answered — by an option, or by its own "Other" box?
*/
export function fieldAnswered(
  values: ElicitationValues,
  form: ElicitationForm,
  field: ElicitationField
): boolean {
  if (isAnswered(values[field.key])) {
    return true;
  }
  const custom = customFieldFor(form, field.key);
  return custom ? isAnswered(values[custom.key]) : false;
}

/**
Only what the user actually filled in; blank fields are omitted rather than sent as empty.
*/
export function answerContent(
  form: ElicitationForm,
  values: ElicitationValues
): ElicitationContent {
  const content: ElicitationContent = {};
  for (const field of form.fields) {
    const value = values[field.key];
    if (isAnswered(value)) {
      content[field.key] = value;
    }
  }
  return content;
}

/**
 * Submit is offered once every required question is answered and the form says *something*. An
 * all-blank accept is indistinguishable from a skip, and Skip already says that more clearly.
 */
export function canSubmit(
  form: ElicitationForm,
  values: ElicitationValues
): boolean {
  const questions = questionFields(form);
  if (
    questions.some(
      (field) => field.required && !fieldAnswered(values, form, field)
    )
  ) {
    return false;
  }
  return Object.keys(answerContent(form, values)).length > 0;
}

export function acceptAnswer(
  form: ElicitationForm,
  values: ElicitationValues
): ElicitationAnswer {
  return { action: "accept", content: answerContent(form, values) };
}
