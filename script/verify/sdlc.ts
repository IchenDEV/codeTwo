#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hasBlocker,
  hasLinkTo,
  isConcrete,
  isValidDate,
  labelValue,
  linkTargets,
  parseArtifact,
  type Artifact,
} from "./artifact-parse";
import {
  bundleIsImplementationReady,
  discoverStageBundles,
  isCanonicalStagePath,
  planCoversPath,
  validateLocalLinks,
  validateStageBundle,
  type StageBundle,
} from "./stage-bundle";

export const REQUIRED_FILES = [
  "docs/sdlc/workflow.md",
  "docs/sdlc/templates/intent.md",
  "docs/sdlc/templates/spec.md",
  "docs/sdlc/templates/plan.md",
  "docs/sdlc/templates/verification.md",
  "docs/sdlc/templates/incident.md",
  "docs/sdlc/templates/eval.md",
] as const;

const LEGACY_PATHS = [
  "docs/superpowers",
  "docs/sdlc/specs",
  "docs/sdlc/plans",
  "docs/sdlc/templates/change.md",
  "docs/sdlc/changes/2026-08-29-sdlc-bootstrap.md",
  "docs/sdlc/evals/legacy-workflow-single-source.md",
] as const;

const ALLOWED_EVAL_STATUSES = new Set(["draft", "active", "blocked", "failed", "retired"]);
const ALLOWED_INCIDENT_STATUSES = new Set([
  "draft",
  "investigating",
  "mitigated",
  "blocked",
  "resolved",
  "closed",
  "superseded",
]);

function repoPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function markdownFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...markdownFiles(path));
    else if (entry.endsWith(".md")) files.push(path);
  }
  return files.sort();
}

function validateEval(artifact: Artifact, path: string): string[] {
  const errors: string[] = [];
  const status = artifact.metadata.status ?? "";
  if (!ALLOWED_EVAL_STATUSES.has(status)) {
    errors.push(`${path}: invalid eval status ${JSON.stringify(status)}`);
  }
  if (new Set(["active", "failed", "retired"]).has(status)) {
    if (linkTargets(artifact.sections.provenance ?? "").length === 0) {
      errors.push(`${path}: status ${status} requires linked provenance`);
    }
    const result = (labelValue(artifact.sections["last result"] ?? "", "Result") ?? "")
      .toLowerCase()
      .replace(/\.$/, "");
    if (!new Set(["pass", "fail", "blocked"]).has(result)) {
      errors.push(`${path}: status ${status} requires Result pass, fail, or blocked`);
    }
    if (!isConcrete(labelValue(artifact.sections["last result"] ?? "", "Revision"))) {
      errors.push(`${path}: status ${status} requires Revision`);
    }
  }
  return errors;
}

function validateIncident(artifact: Artifact, path: string): string[] {
  const errors: string[] = [];
  const status = artifact.metadata.status ?? "";
  if (!ALLOWED_INCIDENT_STATUSES.has(status)) {
    errors.push(`${path}: invalid incident status ${JSON.stringify(status)}`);
  }
  if (status !== "resolved" && status !== "closed") return errors;
  const recovery = artifact.sections["mitigation and recovery"] ?? "";
  if ((labelValue(recovery, "Recovery verdict") ?? "").toLowerCase().replace(/\.$/, "") !== "recovered") {
    errors.push(`${path}: status ${status} requires Recovery verdict: recovered`);
  }
  const followUps = artifact.sections["follow-ups"] ?? "";
  if (!hasLinkTo(followUps, "/changes/") && !hasBlocker(followUps)) {
    errors.push(`${path}: status ${status} requires linked follow-up change or Blocked reason`);
  }
  const regression = artifact.sections["regression eval"] ?? "";
  if (!hasLinkTo(regression, "/evals/") && !hasBlocker(regression)) {
    errors.push(`${path}: status ${status} requires linked regression Eval or Blocked reason`);
  }
  return errors;
}

interface ChangedPath {
  status: string;
  paths: string[];
}

function parseChangedPaths(output: string): ChangedPath[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { status, paths };
    })
    .filter((change) => change.paths.length > 0);
}

function changedPaths(
  root: string,
  base: string | undefined,
  worktree: boolean,
): { changes: ChangedPath[]; errors: string[] } {
  const comparison = worktree ? "HEAD" : `${base}...HEAD`;
  const result = spawnSync("git", ["diff", "--name-status", "--find-renames", comparison], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "git diff failed";
    return { changes: [], errors: [`cannot compare changes: ${detail}`] };
  }
  const changes = parseChangedPaths(result.stdout);
  if (worktree) {
    const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    });
    if (untracked.status !== 0) {
      return { changes: [], errors: ["cannot list untracked worktree files"] };
    }
    for (const path of untracked.stdout.split(/\r?\n/).filter(Boolean)) {
      changes.push({ status: "A", paths: [path] });
    }
  }
  return { changes, errors: [] };
}

function bundleForStagePath(bundles: Map<string, StageBundle>, path: string): StageBundle | undefined {
  const match = path.match(/^docs\/sdlc\/changes\/([^/]+)\//);
  if (!match) return undefined;
  return bundles.get(match[1]);
}

function validateChangedArtifactGate(
  root: string,
  base: string | undefined,
  worktree: boolean,
  bundles: Map<string, StageBundle>,
): string[] {
  const { changes, errors } = changedPaths(root, base, worktree);
  if (errors.length > 0 || changes.length === 0) return errors;

  const legacyChangePaths = changes
    .filter((change) => change.status !== "D")
    .flatMap((change) => change.paths)
    .filter((path) => /docs\/sdlc\/changes\/[^/]+\/change\.md$/.test(path));
  if (legacyChangePaths.length > 0) {
    return [`${legacyChangePaths[0]}: schema 3 forbids legacy change.md`];
  }

  const changed = new Set(changes.flatMap((change) => change.paths));
  const changedBundleIds = new Set(
    Array.from(changed)
      .filter(isCanonicalStagePath)
      .map((path) => path.match(/^docs\/sdlc\/changes\/([^/]+)\//)?.[1])
      .filter(Boolean) as string[],
  );

  const readyBundles = Array.from(bundles.values()).filter(bundleIsImplementationReady);
  const nonStageChanges = Array.from(changed).filter(
    (path) => !isCanonicalStagePath(path) && !path.match(/docs\/sdlc\/changes\/[^/]+\/evidence\//),
  );

  if (nonStageChanges.length > 0 && readyBundles.length === 0) {
    return [
      "repository implementation changes require intent, spec, and plan accepted in a schema-3 bundle",
    ];
  }

  for (const path of nonStageChanges) {
    if (readyBundles.some((bundle) => planCoversPath(bundle, path))) continue;
    return [`${path}: changed path is not covered by an accepted plan scope`];
  }

  for (const bundleId of changedBundleIds) {
    const bundle = bundles.get(bundleId);
    if (!bundle) continue;
    if (bundle.intent.metadata.status !== "accepted") {
      return [`docs/sdlc/changes/${bundleId}/intent.md: intent must be accepted before bundle changes merge`];
    }
    if (bundle.spec.metadata.status !== "accepted") {
      return [`docs/sdlc/changes/${bundleId}/spec.md: spec must be accepted before bundle changes merge`];
    }
    if (bundle.plan.metadata.status !== "accepted") {
      return [`docs/sdlc/changes/${bundleId}/plan.md: plan must be accepted before bundle changes merge`];
    }
  }

  return [];
}

function validateReleaseGate(bundles: Map<string, StageBundle>, changeId: string): string[] {
  const normalized = changeId.startsWith("change-") ? changeId.slice("change-".length) : changeId;
  const bundle = bundles.get(normalized);
  if (!bundle) return [`release change bundle not found: ${changeId}`];
  if (bundle.verification.metadata.status !== "passed") {
    return [`release change ${changeId} requires verification passed`];
  }
  const target = bundle.verification.metadata.release_target ?? "";
  if (!isConcrete(target) || target.toLowerCase().replace(/\.$/, "") === "none") {
    return [`release change ${changeId} requires a concrete release_target`];
  }
  const review = bundle.verification.sections["review and release"] ?? "";
  if (!isConcrete(labelValue(review, "Approval"))) {
    return [`release change ${changeId} requires release Approval`];
  }
  if (!isConcrete(labelValue(review, "Rollback"))) {
    return [`release change ${changeId} requires Rollback`];
  }
  return [];
}

export function validateRepository(
  repositoryRoot: string,
  base?: string,
  releaseChange?: string,
  worktree = false,
): string[] {
  const root = resolve(repositoryRoot);
  const errors: string[] = [];

  for (const path of REQUIRED_FILES) {
    if (!existsSync(join(root, path))) errors.push(`missing required SDLC file: ${path}`);
  }
  for (const path of LEGACY_PATHS) {
    if (existsSync(join(root, path))) errors.push(`legacy or superseded lifecycle path is forbidden: ${path}`);
  }

  const bundles = new Map<string, StageBundle>();
  for (const bundleDir of discoverStageBundles(root)) {
    const { bundle, errors: bundleErrors } = validateStageBundle(root, bundleDir);
    errors.push(...bundleErrors);
    if (bundle) bundles.set(bundle.id, bundle);
  }

  for (const path of markdownFiles(join(root, "docs", "sdlc", "changes"))) {
    if (basename(path) === "change.md") {
      errors.push(`${repoPath(root, path)}: schema 3 forbids legacy change.md`);
    }
  }

  if (bundles.size === 0) errors.push("at least one schema-3 stage bundle is required");

  for (const path of markdownFiles(join(root, "docs", "sdlc", "incidents"))) {
    const parsed = parseArtifact(path);
    errors.push(...parsed.errors);
    if (!parsed.artifact) continue;
    const rel = repoPath(root, path);
    errors.push(...validateIncident(parsed.artifact, rel));
    errors.push(...validateLocalLinks(root, path));
  }

  for (const path of markdownFiles(join(root, "docs", "sdlc", "evals"))) {
    const parsed = parseArtifact(path);
    errors.push(...parsed.errors);
    if (!parsed.artifact) continue;
    const rel = repoPath(root, path);
    if (parsed.artifact.metadata.id !== `eval-${basename(path, ".md")}`) {
      errors.push(`${rel}: eval id must match eval-<slug>`);
    }
    errors.push(...validateEval(parsed.artifact, rel));
    errors.push(...validateLocalLinks(root, path));
  }

  const workflow = join(root, "docs", "sdlc", "workflow.md");
  if (existsSync(workflow)) errors.push(...validateLocalLinks(root, workflow));

  if (base && worktree) errors.push("--base and --worktree are mutually exclusive");
  else if (base || worktree) errors.push(...validateChangedArtifactGate(root, base, worktree, bundles));
  if (releaseChange) errors.push(...validateReleaseGate(bundles, releaseChange));

  return errors;
}

function parseArguments(argv: string[]): {
  root: string;
  base?: string;
  releaseChange?: string;
  worktree: boolean;
} {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  let base: string | undefined;
  let releaseChange: string | undefined;
  let worktree = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--worktree") {
      worktree = true;
      continue;
    }
    const value = argv[index + 1];
    if (!["--root", "--base", "--release-change"].includes(argument) || !value) {
      throw new Error(
        "usage: bun script/verify/sdlc.ts [--root PATH] [--base SHA | --worktree] [--release-change ID]",
      );
    }
    if (argument === "--root") root = value;
    if (argument === "--base") base = value;
    if (argument === "--release-change") releaseChange = value;
    index += 1;
  }
  return { root, base, releaseChange, worktree };
}

if (import.meta.main) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const errors = validateRepository(args.root, args.base, args.releaseChange, args.worktree);
    if (errors.length > 0) {
      for (const error of errors) console.error(`[sdlc] error: ${error}`);
      console.error(`[sdlc] failed with ${errors.length} error(s)`);
      process.exit(1);
    }
    console.log("[sdlc] contract valid");
  } catch (error) {
    console.error(`[sdlc] error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}
