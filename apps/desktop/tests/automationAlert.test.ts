import { describe, expect, test } from "bun:test";

import { automationAlertNotification } from "../src/electrobun/automationAlert";

describe("automationAlertNotification", () => {
  test("names the automation and reports a failure with its reason", () => {
    expect(
      automationAlertNotification(
        {
          automation_id: "a1",
          run_id: "r1",
          automation_name: "Nightly triage",
          status: "failed",
          error: "provider exited 1",
        },
        "C2"
      )
    ).toEqual({
      title: "Nightly triage",
      body: "Automation failed: provider exited 1",
      silent: false,
    });
  });

  test("distinguishes a needs-attention state and falls back when unnamed", () => {
    expect(
      automationAlertNotification(
        {
          automation_id: "a1",
          run_id: "r1",
          automation_name: "",
          status: "needs_attention",
          error: null,
        },
        "C2"
      )
    ).toEqual({
      title: "C2 automation",
      body: "Automation needs attention",
      silent: false,
    });
  });

  test("tolerates a payload without a name or error", () => {
    expect(automationAlertNotification(null, "C2")).toEqual({
      title: "C2 automation",
      body: "Automation failed",
      silent: false,
    });
  });
});
