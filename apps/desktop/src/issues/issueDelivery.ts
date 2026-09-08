import type { Translate } from "../i18n";
import { call, isDesktop } from "../bridge";

export interface IssueConnector { plugin_id: string; connector_id: string; name: string }
export interface TrackedIssue {
  workspace_id: string; id: string; identifier: string; title: string; url: string;
  description: string; updated_at: string; team_id: string; team_name: string;
  state?: { id: string; name: string; type: string };
  assignee?: { id: string; name: string } | null;
  comments: Array<{ id: string; body: string; updatedAt: string; user?: { name: string } }>;
  attachments: Array<{ id: string; title: string; url: string }>;
}
export interface TrackerConnection {
  account: { id: string; name: string }; workspace: { id: string; name: string };
  teams: Array<{ id: string; key: string; name: string; states: { nodes: Array<{ id: string; name: string; type: string }> } }>;
}
export interface IssueDelivery {
  id: string; plugin_id: string; connector_id: string; repository: string; repository_identity: string;
  task_id: string; session_id: string | null; issue: TrackedIssue;
  stage: string; error: string | null; acceptance: string;
  pending_issue: TrackedIssue | null;
  permissions: { push: boolean; create_pr: boolean; writeback: boolean };
  validation_commands: string[];
  verification: { head: string; passed: boolean; results: Array<{ command: string; exit_code: number | null; output: string }> } | null;
  pull_request: { url: string; number: number; state: string; headRefOid: string } | null;
  sync_pending: boolean; sync_error: string | null;
}
export type IssueDeliveryApi = <T>(method: string, args?: unknown) => Promise<T>;
export const issueDeliveryApi: IssueDeliveryApi = async <T>(method: string, args?: unknown) => {
  if (!isDesktop) {
    if (method === "list") return [] as T;
    throw new Error("Open CodeTwo desktop to connect an issue tracker.");
  }
  return call<T>(`issue_delivery.${method}`, args ?? {}, null);
};
export function connectorIdentity(connector: IssueConnector) {
  return { plugin_id: connector.plugin_id, connector_id: connector.connector_id };
}
export function safeIssueLink(value: string): string | undefined {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

const stageKeys = {
  creating: "issueFlow.creating", developing: "issueFlow.developing", verifying: "issueFlow.verifying",
  verified: "issueFlow.verified", review: "issueFlow.review", blocked: "issueFlow.blocked",
  merged: "issueFlow.merged", closed: "issueFlow.closed", cancelled: "issueFlow.cancelled",
} as const;
export function issueStageLabel(stage: string, t: Translate) { return t(stageKeys[stage as keyof typeof stageKeys] ?? "issueFlow.blocked"); }

