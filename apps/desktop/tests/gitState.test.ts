import { describe, expect, test } from "bun:test";

import type { GitFile, SourceControlInfo } from "../src/bridge";
import {
  changeRequestPresentation,
  diffLinePresentation,
  diffPreviewLines,
  gitFileDisplayState,
  gitFilePathspecs,
  gitFileSections,
  gitPhaseLabel,
  sourceControlStateForCwd,
  uniquePathspecs,
  workspaceStateForCwd,
} from "../src/git/state";

const file = (overrides: Partial<GitFile>): GitFile => ({
  path: "src/app.ts",
  original_path: null,
  staged: false,
  unstaged: true,
  state: "modified",
  staged_state: null,
  unstaged_state: "modified",
  ...overrides,
});

const sourceControl = (
  overrides: Partial<SourceControlInfo> = {}
): SourceControlInfo => ({
  remote_name: "origin",
  provider: "github",
  provider_name: "GitHub",
  host: "github.com",
  web_url: "https://github.com/acme/code-two",
  change_request_label: "PR",
  create_change_request_supported: true,
  required_cli: "gh",
  required_cli_available: true,
  ...overrides,
});

describe("source-control projection", () => {
  test("shows a partially staged file in both truthful sections", () => {
    const partial = file({ staged: true, unstaged: true });
    const sections = gitFileSections([partial]);
    expect(sections.staged).toEqual([partial]);
    expect(sections.unstaged).toEqual([partial]);
  });

  test("keeps both literal sides of a rename in one index operation", () => {
    const renamed = file({
      path: "new name.ts",
      original_path: "old name.ts",
      state: "renamed",
      staged_state: "renamed",
    });
    expect(gitFilePathspecs(renamed)).toEqual(["old name.ts", "new name.ts"]);
    expect(uniquePathspecs([renamed, file({ path: "new name.ts" })])).toEqual([
      "old name.ts",
      "new name.ts",
    ]);
  });

  test("labels each side of a partially staged file with its own truthful state", () => {
    const partialRename = file({
      staged: true,
      staged_state: "renamed",
      unstaged_state: "modified",
      state: "renamed",
    });
    expect(gitFileDisplayState(partialRename, "staged")).toBe("renamed");
    expect(gitFileDisplayState(partialRename, "unstaged")).toBe("modified");
  });

  test("exposes honest coarse phases without inventing hook progress", () => {
    expect(gitPhaseLabel("committing")).toBe("Committing…");
    expect(gitPhaseLabel("creating_pr")).toBe("Creating PR…");
    expect(gitPhaseLabel("creating_pr", "MR")).toBe("Creating MR…");
    expect(gitPhaseLabel("idle")).toBe("");
  });

  test("bounds diff DOM rows independently of the core byte limit", () => {
    const preview = diffPreviewLines("one\ntwo\nthree", 2);
    expect(preview).toEqual({ lines: ["one", "two"], truncated: true });
  });

  test("separates diff semantics from their color or symbol presentation", () => {
    expect(diffLinePresentation("+added")).toEqual({
      kind: "add",
      marker: "+",
      content: "added",
    });
    expect(diffLinePresentation("-removed")).toEqual({
      kind: "del",
      marker: "-",
      content: "removed",
    });
    expect(diffLinePresentation("+++ b/file")).toEqual({
      kind: "context",
      marker: "",
      content: "+++ b/file",
    });
    expect(diffLinePresentation("@@ -1 +1 @@")).toEqual({
      kind: "hunk",
      marker: "",
      content: "@@ -1 +1 @@",
    });
  });

  test("enables an advertised adapter only when its required CLI is available", () => {
    expect(
      changeRequestPresentation(sourceControl(), false, null)
    ).toMatchObject({
      createLabel: "Create PR",
      creatingLabel: "Creating PR…",
      createdLabel: "PR created.",
      canCreate: true,
      statusKind: "available",
    });

    const missingGh = changeRequestPresentation(
      sourceControl({ required_cli_available: false }),
      false,
      null
    );
    expect(missingGh.canCreate).toBe(false);
    expect(missingGh.status).toContain("requires the gh CLI on PATH");
    expect(missingGh.status).toContain("Push remains available");

    expect(
      changeRequestPresentation(
        sourceControl({ required_cli: null }),
        false,
        null
      ).canCreate
    ).toBe(true);

    const futureAdapter = changeRequestPresentation(
      sourceControl({
        provider: "gitlab",
        provider_name: "GitLab",
        change_request_label: "MR",
        required_cli: "glab",
        required_cli_available: true,
      }),
      false,
      null
    );
    expect(futureAdapter).toMatchObject({
      canCreate: true,
      createLabel: "Create MR",
    });
    expect(futureAdapter.status).toContain("through glab");
  });

  test("uses provider-native MR and change-request wording without claiming an adapter", () => {
    const gitlab = changeRequestPresentation(
      sourceControl({
        provider: "gitlab",
        provider_name: "GitLab",
        host: "gitlab.com",
        change_request_label: "MR",
        create_change_request_supported: false,
        required_cli: null,
        required_cli_available: false,
      }),
      false,
      null
    );
    expect(gitlab).toMatchObject({
      createLabel: "Create MR",
      creatingLabel: "Creating MR…",
      createdLabel: "MR created.",
      canCreate: false,
      statusKind: "unavailable",
    });
    expect(gitlab.status).toContain("GitLab MR creation is not supported");
    expect(gitlab.status).not.toContain("gh CLI");

    const unknown = changeRequestPresentation(
      sourceControl({
        provider: "unknown",
        provider_name: "git.example.test",
        host: "git.example.test",
        change_request_label: "change request",
        create_change_request_supported: false,
        required_cli: null,
        required_cli_available: false,
      }),
      false,
      null
    );
    expect(unknown.createLabel).toBe("Create change request");
    expect(unknown.createdLabel).toBe("Change request created.");
    expect(unknown.status).toContain(
      "git.example.test change request creation"
    );
  });

  test("makes loading, inspection failure, and no-remote states explicit", () => {
    expect(changeRequestPresentation(null, true, null)).toMatchObject({
      canCreate: false,
      statusKind: "loading",
      status: "Checking the Git remote and provider tools…",
    });

    const failed = changeRequestPresentation(null, false, "ambiguous remotes");
    expect(failed.statusKind).toBe("error");
    expect(failed.status).toContain("ambiguous remotes");
    expect(failed.status).toContain("Push remains available");

    const noRemote = changeRequestPresentation(null, false, null);
    expect(noRemote.statusKind).toBe("unavailable");
    expect(noRemote.status).toContain("No Git remote is configured");
    expect(noRemote.status).toContain("Push remains available");

    const noRepository = changeRequestPresentation(null, false, null, false);
    expect(noRepository).toMatchObject({
      canCreate: false,
      statusKind: "unavailable",
    });
    expect(noRepository.status).toContain("not a Git repository");
    expect(noRepository.status).toContain("Push");
    expect(noRepository.status).toContain("unavailable");
  });

  test("never projects provider metadata fetched for a previous cwd", () => {
    const github = sourceControl();
    const state = { cwd: "/repo/a", loading: false, info: github, error: null };
    expect(sourceControlStateForCwd(state, "/repo/a")).toBe(state);
    expect(sourceControlStateForCwd(state, "/repo/b")).toEqual({
      cwd: "/repo/b",
      loading: true,
      info: null,
      error: null,
    });
  });

  test("never projects Git rows or checkpoints from a previous cwd", () => {
    const status = {
      cwd: "/repo/a",
      loading: false,
      value: { status: "repo-a", checkpoints: ["checkpoint-a"] },
    };

    expect(
      workspaceStateForCwd(status, "/repo/a", { status: null, checkpoints: [] })
    ).toBe(status);
    expect(
      workspaceStateForCwd(status, "/repo/b", { status: null, checkpoints: [] })
    ).toEqual({
      cwd: "/repo/b",
      loading: true,
      value: { status: null, checkpoints: [] },
    });
  });
});
