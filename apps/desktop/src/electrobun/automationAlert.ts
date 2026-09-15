import type { AutomationAlert } from "../bridge";

export interface AutomationNotification {
  title: string;
  body: string;
  silent: boolean;
}

/**
 * The user-facing content for an automation alert. Kept apart from the Electrobun call so the
 * mapping is unit-testable without a native notification center, while the delivery itself stays a
 * one-line `Utils.showNotification` in the main process.
 */
export function automationAlertNotification(
  alert: Partial<AutomationAlert> | null | undefined,
  appName: string
): AutomationNotification {
  const title =
    typeof alert?.automation_name === "string" && alert.automation_name !== ""
      ? alert.automation_name
      : `${appName} automation`;
  const reason =
    typeof alert?.error === "string" && alert.error !== ""
      ? `: ${alert.error}`
      : "";
  return {
    title,
    body:
      alert?.status === "needs_attention"
        ? "Automation needs attention"
        : `Automation failed${reason}`,
    silent: false,
  };
}
