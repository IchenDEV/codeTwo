import { describe, expect, test } from "bun:test";

import type { ElicitationForm } from "../src/bridge";
import {
  acceptAnswer,
  answerContent,
  canSubmit,
  customFieldFor,
  fieldAnswered,
  questionFields,
  selectOption,
  setValue,
  toggleOption,
} from "../src/session/elicitation";

/** The form the Claude adapter builds for a one-question AskUserQuestion call. */
const ASK: ElicitationForm = {
  message: "Which auth method?",
  tool_call_id: "tool-1",
  fields: [
    {
      key: "question_0",
      kind: "select",
      title: "Auth method",
      required: false,
      options: [
        { value: "OAuth", label: "OAuth", description: "Redirect flow" },
        { value: "API key", label: "API key" },
      ],
    },
    {
      key: "question_0_custom",
      kind: "text",
      title: "Other",
      required: false,
      custom_answer_for: "question_0",
    },
  ],
};

const MULTI: ElicitationForm = {
  message: "Please answer the following questions.",
  fields: [
    {
      key: "features",
      kind: "multi_select",
      description: "Which features?",
      required: true,
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    },
    {
      key: "notes",
      kind: "text",
      description: "Anything else?",
      required: false,
    },
  ],
};

describe("elicitation answers", () => {
  test("the Other box is attached to its question, not listed as one", () => {
    expect(questionFields(ASK).map((field) => field.key)).toEqual([
      "question_0",
    ]);
    expect(customFieldFor(ASK, "question_0")?.key).toBe("question_0_custom");
    expect(customFieldFor(MULTI, "features")).toBeUndefined();
  });

  test("a typed answer and a picked option replace each other", () => {
    const picked = selectOption({}, ASK, "question_0", "OAuth");
    expect(answerContent(ASK, picked)).toEqual({ question_0: "OAuth" });

    const typed = setValue(picked, ASK.fields[1], "mTLS");
    expect(answerContent(ASK, typed)).toEqual({ question_0_custom: "mTLS" });

    const repicked = selectOption(typed, ASK, "question_0", "API key");
    expect(answerContent(ASK, repicked)).toEqual({ question_0: "API key" });
  });

  test("clearing the Other box leaves the question unanswered rather than restoring a choice", () => {
    const typed = setValue(
      selectOption({}, ASK, "question_0", "OAuth"),
      ASK.fields[1],
      "mTLS"
    );
    const cleared = setValue(typed, ASK.fields[1], "");
    expect(answerContent(ASK, cleared)).toEqual({});
    expect(canSubmit(ASK, cleared)).toBe(false);
  });

  test("multi-select toggles members and blank answers are never submitted", () => {
    let values = toggleOption({}, MULTI, "features", "a");
    values = toggleOption(values, MULTI, "features", "b");
    expect(answerContent(MULTI, values)).toEqual({ features: ["a", "b"] });

    values = toggleOption(values, MULTI, "features", "a");
    expect(answerContent(MULTI, values)).toEqual({ features: ["b"] });

    // Emptied entirely: the field is dropped, so the required question is unanswered again.
    values = toggleOption(values, MULTI, "features", "b");
    expect(answerContent(MULTI, values)).toEqual({});
    expect(fieldAnswered(values, MULTI, MULTI.fields[0])).toBe(false);
  });

  test("submit waits for every required question", () => {
    expect(canSubmit(MULTI, {})).toBe(false);
    // An optional answer alone is not enough while `features` is still required.
    const notesOnly = setValue({}, MULTI.fields[1], "later");
    expect(canSubmit(MULTI, notesOnly)).toBe(false);

    const answered = toggleOption(notesOnly, MULTI, "features", "a");
    expect(canSubmit(MULTI, answered)).toBe(true);
    expect(acceptAnswer(MULTI, answered)).toEqual({
      action: "accept",
      content: { features: ["a"], notes: "later" },
    });
  });

  test("an all-blank form cannot be accepted — that is what Skip is for", () => {
    expect(canSubmit(ASK, {})).toBe(false);
    expect(canSubmit(ASK, { question_0_custom: "   " })).toBe(false);
    expect(canSubmit(ASK, selectOption({}, ASK, "question_0", "OAuth"))).toBe(
      true
    );
  });
});
