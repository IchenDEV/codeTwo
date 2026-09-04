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

export function gitFilePathspecs(file: GitFile): string[] {
  return file.original_path != null &&
    file.original_path !== "" &&
    file.original_path !== file.path
    ? [file.original_path, file.path]
    : [file.path];
}

export function gitFileDisplayState(
  file: GitFile,
  scope: "staged" | "unstaged"
): string {
  return (
    (scope === "staged" ? file.staged_state : file.unstaged_state) ?? file.state
  );
}

export function uniquePathspecs(files: readonly GitFile[]): string[] {
  return [...new Set(files.flatMap(gitFilePathspecs))];
}

export function gitPhaseLabel(
  phase: GitPhase,
  changeRequestLabel = "PR"
): string {
  switch (phase) {
    case "staging": {
      return "Staging…";
    }
    case "unstaging": {
      return "Unstaging…";
    }
    case "checkpointing": {
      return "Creating checkpoint…";
    }
    case "reverting": {
      return "Reverting…";
    }
    case "committing": {
      return "Committing…";
    }
    case "pushing": {
      return "Pushing…";
    }
    case "creating_pr": {
      return `Creating ${changeRequestLabel}…`;
    }
    case "idle": {
      return "";
    }
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

/**
A backend value whose identity is the workspace it was loaded from.
*/
export interface WorkspaceLoadState<T> {
  cwd: string;
  loading: boolean;
  value: T;
}

export function workspaceStateForCwd<T>(
  state: WorkspaceLoadState<T>,
  cwd: string,
  emptyValue: T
): WorkspaceLoadState<T> {
  if (state.cwd === cwd) {
    return state;
  }
  return { cwd, loading: true, value: emptyValue };
}

export function sourceControlStateForCwd(
  state: SourceControlLoadState,
  cwd: string
): SourceControlLoadState {
  if (state.cwd === cwd) {
    return state;
  }
  return { cwd, error: null, info: null, loading: true };
}

export function changeRequestPresentation(
  info: SourceControlInfo | null,
  isLoading: boolean,
  error: string | null,
  repoAvailable: boolean | null = true
): ChangeRequestPresentation {
  const label = info?.change_request_label ?? "change request";
  const base = {
    createLabel: `Create ${label}`,
    createdLabel: `${label === "change request" ? "Change request" : label} created.`,
    creatingLabel: `Creating ${label}…`,
    label,
  } as const;

  if (repoAvailable === null || isLoading) {
    return {
      ...base,
      canCreate: false,
      status: "Checking the Git remote and provider tools…",
      statusKind: "loading",
    };
  }
  if (!repoAvailable) {
    return {
      ...base,
      canCreate: false,
      status:
        "This workspace is not a Git repository, so Push and change-request creation are unavailable.",
      statusKind: "unavailable",
    };
  }
  if (error != null && error !== "") {
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
  if (
    info.required_cli != null &&
    info.required_cli !== "" &&
    !info.required_cli_available
  ) {
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
    status:
      info.required_cli != null && info.required_cli !== ""
        ? `${info.provider_name} ${label} creation is available through ${info.required_cli}.`
        : `${info.provider_name} ${label} creation is available.`,
    statusKind: "available",
  };
}

const maxRenderedDiffLines = 4000;

export function diffPreviewLines(
  text: string,
  limit = maxRenderedDiffLines
): { lines: string[]; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= limit) {
    return { lines, truncated: false };
  }
  return { lines: lines.slice(0, limit), truncated: true };
}

export type DiffLineKind = "add" | "del" | "hunk" | "meta" | "context";

export function diffLinePresentation(line: string): {
  kind: DiffLineKind;
  marker: "+" | "-" | "";
  content: string;
} {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return { content: line.slice(1) || " ", kind: "add", marker: "+" };
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return { content: line.slice(1) || " ", kind: "del", marker: "-" };
  }
  if (line.startsWith("@@")) {
    return { content: line, kind: "hunk", marker: "" };
  }
  if (line.startsWith("diff ") || line.startsWith("index ")) {
    return { content: line, kind: "meta", marker: "" };
  }
  return { content: line || " ", kind: "context", marker: "" };
}
