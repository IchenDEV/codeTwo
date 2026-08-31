import type { GitFile, SourceControlInfo } from "../bridge";

export type GitPhase =
  | "idle"
  | "staging"
  | "unstaging"
  | "checkpointing"
  | "reverting"
  | "committing"
  | "pushing"
  | "creating_pr";

export function gitFileSections(files: readonly GitFile[]): {
  staged: GitFile[];
  unstaged: GitFile[];
} {
  return {
    staged: files.filter((file) => file.staged),
    unstaged: files.filter((file) => file.unstaged),
  };
}

/** A rename is one index operation even though Git needs both literal paths. */
export function gitFilePathspecs(file: GitFile): string[] {
  return file.original_path && file.original_path !== file.path
    ? [file.original_path, file.path]
    : [file.path];
}

export function gitFileDisplayState(file: GitFile, scope: "staged" | "unstaged"): string {
  return (scope === "staged" ? file.staged_state : file.unstaged_state) ?? file.state;
}

export function uniquePathspecs(files: readonly GitFile[]): string[] {
  return [...new Set(files.flatMap(gitFilePathspecs))];
}

export function gitPhaseLabel(phase: GitPhase, changeRequestLabel = "PR"): string {
  switch (phase) {
    case "staging":
      return "Staging…";
    case "unstaging":
      return "Unstaging…";
    case "checkpointing":
      return "Creating checkpoint…";
    case "reverting":
      return "Reverting…";
    case "committing":
      return "Committing…";
    case "pushing":
      return "Pushing…";
    case "creating_pr":
      return `Creating ${changeRequestLabel}…`;
    case "idle":
      return "";
  }
}

export interface ChangeRequestPresentation {
  label: SourceControlInfo["change_request_label"] | "change request";
  createLabel: string;
  creatingLabel: string;
  createdLabel: string;
  canCreate: boolean;
  status: string;
  statusKind: "loading" | "error" | "unavailable" | "available";
}

export interface SourceControlLoadState {
  cwd: string;
  loading: boolean;
  info: SourceControlInfo | null;
  error: string | null;
}

/** A backend value whose identity is the workspace it was loaded from. */
export interface WorkspaceLoadState<T> {
  cwd: string;
  loading: boolean;
  value: T;
}

/**
 * Project a workspace-owned value without ever borrowing the previous workspace's payload.
 *
 * React effects run after paint. Returning an immediate loading projection here closes the render
 * where `cwd` has changed but the new request has not started yet.
 */
export function workspaceStateForCwd<T>(
  state: WorkspaceLoadState<T>,
  cwd: string,
  emptyValue: T,
): WorkspaceLoadState<T> {
  if (state.cwd === cwd) return state;
  return { cwd, loading: true, value: emptyValue };
}

/** Never paint provider metadata fetched for the previous workspace during a cwd switch. */
export function sourceControlStateForCwd(
  state: SourceControlLoadState,
  cwd: string,
): SourceControlLoadState {
  if (state.cwd === cwd) return state;
  return { cwd, loading: true, info: null, error: null };
}

/**
 * Project the provider adapter contract into honest UI copy and one enablement decision.
 *
 * Push is deliberately absent: it remains a plain Git operation and must not inherit hosted
 * provider/CLI restrictions from change-request creation.
 */
export function changeRequestPresentation(
  info: SourceControlInfo | null,
  loading: boolean,
  error: string | null,
  repositoryAvailable: boolean | null = true,
): ChangeRequestPresentation {
  const label = info?.change_request_label ?? "change request";
  const base = {
    label,
    createLabel: `Create ${label}`,
    creatingLabel: `Creating ${label}…`,
    createdLabel: `${label === "change request" ? "Change request" : label} created.`,
  } as const;

  if (repositoryAvailable === null || loading) {
    return {
      ...base,
      canCreate: false,
      status: "Checking the Git remote and provider tools…",
      statusKind: "loading",
    };
  }
  if (!repositoryAvailable) {
    return {
      ...base,
      canCreate: false,
      status:
        "This workspace is not a Git repository, so Push and change-request creation are unavailable.",
      statusKind: "unavailable",
    };
  }
  if (error) {
    return {
      ...base,
      canCreate: false,
      status: `Could not inspect the Git remote: ${error}. Push remains available.`,
      statusKind: "error",
    };
  }
  if (!info) {
    return {
      ...base,
      canCreate: false,
      status:
        "No Git remote is configured, so C2 cannot create a change request. Push remains available.",
      statusKind: "unavailable",
    };
  }
  if (!info.create_change_request_supported) {
    return {
      ...base,
      canCreate: false,
      status: `${info.provider_name} ${label} creation is not supported in this build. Push remains available.`,
      statusKind: "unavailable",
    };
  }
  if (info.required_cli && !info.required_cli_available) {
    return {
      ...base,
      canCreate: false,
      status: `${info.provider_name} ${label} creation requires the ${info.required_cli} CLI on PATH. Push remains available.`,
      statusKind: "unavailable",
    };
  }
  return {
    ...base,
    canCreate: true,
    status: info.required_cli
      ? `${info.provider_name} ${label} creation is available through ${info.required_cli}.`
      : `${info.provider_name} ${label} creation is available.`,
    statusKind: "available",
  };
}

const MAX_RENDERED_DIFF_LINES = 4_000;

/** Keep the DOM bounded even when the core's byte-bounded preview contains many tiny lines. */
export function diffPreviewLines(
  text: string,
  limit = MAX_RENDERED_DIFF_LINES,
): { lines: string[]; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= limit) return { lines, truncated: false };
  return { lines: lines.slice(0, limit), truncated: true };
}

export type DiffLineKind = "add" | "del" | "hunk" | "meta" | "context";

export function diffLinePresentation(line: string): {
  kind: DiffLineKind;
  marker: "+" | "-" | "";
  content: string;
} {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return { kind: "add", marker: "+", content: line.slice(1) || " " };
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return { kind: "del", marker: "-", content: line.slice(1) || " " };
  }
  if (line.startsWith("@@")) return { kind: "hunk", marker: "", content: line };
  if (line.startsWith("diff ") || line.startsWith("index ")) {
    return { kind: "meta", marker: "", content: line };
  }
  return { kind: "context", marker: "", content: line || " " };
}
