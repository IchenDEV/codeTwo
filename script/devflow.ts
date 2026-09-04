#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArtifact } from "./verify/artifact-parse";
import { CHANGE_ID_RE, STAGE_FILES } from "./verify/stage-bundle";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SDLC_ROOT = join(REPO_ROOT, "docs", "sdlc");
const CHANGES_DIR = join(SDLC_ROOT, "changes");
const INCIDENTS_DIR = join(SDLC_ROOT, "incidents");
const EVALS_DIR = join(SDLC_ROOT, "evals");
const TEMPLATE_DIR = join(SDLC_ROOT, "templates");

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const CHANGE_SOURCES = new Set(["user", "issue", "incident", "monitor", "feedback"]);
const INCIDENT_SOURCES = new Set(["user", "issue", "monitor"]);
const APPROVAL_STAGES = new Set(["intent", "spec", "plan"]);

function today(): string {
  return process.env.DEVFLOW_DATE ?? new Date().toISOString().slice(0, 10);
}

function fail(message: string): never {
  console.error(`devflow: ${message}`);
  process.exit(1);
}

function usage(): void {
  console.log(`Usage:
  ./script/devflow new <slug> [source] [risk]
  ./script/devflow approve <change-id> <intent|spec|plan> <approver>
  ./script/devflow design <change-id>
  ./script/devflow plan <change-id>
  ./script/devflow verify <change-id>
  ./script/devflow status [change-id]
  ./script/devflow incident <slug> [source]
  ./script/devflow add-eval <slug> [source]
  ./script/devflow validate [--worktree]
  ./script/devflow check-pr

Approval is a human decision. After explicit confirmation, an agent may use approve to record it.`);
}

function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) fail("slug must use lowercase letters, numbers, and single hyphens");
}

function titleFromSlug(slug: string): string {
  return slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function changeDir(changeId: string): string {
  if (!CHANGE_ID_RE.test(changeId)) fail(`invalid change id ${JSON.stringify(changeId)}`);
  return join(CHANGES_DIR, changeId);
}

function stagePath(changeId: string, stage: string): string {
  return join(changeDir(changeId), `${stage}.md`);
}

function renderTemplate(templateName: string, id: string, title: string, source: string, risk: string): string {
  return readFileSync(join(TEMPLATE_DIR, templateName), "utf8")
    .replaceAll("{{ID}}", id)
    .replaceAll("{{DATE}}", today())
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{SOURCE}}", source)
    .replaceAll("{{RISK}}", risk);
}

function updateFrontmatter(path: string, updates: Record<string, string>): void {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const closing = lines.slice(1).findIndex((line) => line.trim() === "---") + 1;
  const seen = new Set<string>();
  for (let index = 1; index < closing; index += 1) {
    const match = /^([a-z_]+):\s*(.*)$/.exec(lines[index] ?? "");
    if (!match) continue;
    const key = match[1];
    if (key in updates) {
      lines[index] = `${key}: ${updates[key]}`;
      seen.add(key);
    }
  }
  lines.splice(
    closing,
    0,
    ...Object.entries(updates)
      .filter(([key]) => !seen.has(key))
      .map(([key, value]) => `${key}: ${value}`),
  );
  writeFileSync(path, lines.join("\n"));
}

function requireStage(changeId: string, stage: string): string {
  const path = stagePath(changeId, stage);
  if (!existsSync(path)) fail(`${path} does not exist`);
  return path;
}

function validateApprover(path: string, approver: string): void {
  const metadata = parseArtifact(path).artifact?.metadata ?? {};
  const risk = metadata.risk ?? "medium";
  const owner = metadata.owner ?? "";
  if (!approver.trim()) fail("human approver must not be empty");
  if (
    (risk === "high" || risk === "critical") &&
    approver.trim().toLowerCase() === owner.trim().toLowerCase()
  ) {
    fail(`${path}: high and critical risk require an approver other than the owner`);
  }
}

function cmdNew(args: string[]): void {
  const slug = args[0];
  const source = args[1] ?? "user";
  const risk = args[2] ?? "medium";
  if (!slug) fail("new requires a slug");
  validateSlug(slug);
  if (!CHANGE_SOURCES.has(source)) fail("invalid source");
  if (!RISK_LEVELS.has(risk)) fail("invalid risk");
  const id = `${today()}-${slug}`;
  const destination = changeDir(id);
  if (existsSync(destination)) fail(`${destination} already exists`);
  mkdirSync(destination, { recursive: true });
  const path = stagePath(id, "intent");
  writeFileSync(path, renderTemplate("intent.md", id, titleFromSlug(slug), source, risk));
  console.log(relative(REPO_ROOT, path).split(sep).join("/"));
}

function cmdApprove(args: string[]): void {
  const changeId = args[0];
  const stage = args[1];
  const approver = args[2];
  if (!changeId || !stage || !approver) fail("approve requires <change-id> <intent|spec|plan> <approver>");
  if (!APPROVAL_STAGES.has(stage)) fail("approval stage must be intent, spec, or plan");
  const path = requireStage(changeId, stage);
  const metadata = parseArtifact(path).artifact?.metadata ?? {};
  if ((metadata.status ?? "") !== "draft") fail(`${path}: approve expects draft status`);
  validateApprover(path, approver);
  if (stage === "spec" && parseArtifact(requireStage(changeId, "intent")).artifact?.metadata.status !== "accepted") {
    fail("intent must be accepted before spec approval");
  }
  if (stage === "plan" && parseArtifact(requireStage(changeId, "spec")).artifact?.metadata.status !== "accepted") {
    fail("spec must be accepted before plan approval");
  }
  updateFrontmatter(path, {
    status: "accepted",
    approved_by: `"${approver}"`,
    approved_at: today(),
  });
  console.log(`devflow: recorded ${stage} approval by ${approver} on ${today()}`);
}

function addStage(stage: "spec" | "plan" | "verification", changeId: string): void {
  const dir = changeDir(changeId);
  if (!existsSync(dir)) fail(`${dir} does not exist`);
  const prerequisite = stage === "spec" ? "intent" : stage === "plan" ? "spec" : "plan";
  const prereqPath = requireStage(changeId, prerequisite);
  if (parseArtifact(prereqPath).artifact?.metadata.status !== "accepted") {
    fail(`${prereqPath} must be accepted before creating ${stage}.md`);
  }
  const destination = stagePath(changeId, stage);
  if (existsSync(destination)) fail(`${destination} already exists`);
  const risk = parseArtifact(requireStage(changeId, "intent")).artifact?.metadata.risk ?? "medium";
  const slug = changeId.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  writeFileSync(
    destination,
    renderTemplate(`${stage}.md`, changeId, titleFromSlug(slug), "user", risk),
  );
  console.log(relative(REPO_ROOT, destination).split(sep).join("/"));
}

function cmdStatus(args: string[]): void {
  const changeId = args[0];
  if (!changeId) {
    for (const entry of readdirSync(CHANGES_DIR).sort()) {
      const intentPath = join(CHANGES_DIR, entry, "intent.md");
      if (!existsSync(intentPath)) continue;
      const stages = STAGE_FILES.map((file) => {
        const path = join(CHANGES_DIR, entry, file);
        if (!existsSync(path)) return `${file}=missing`;
        return `${file.replace(".md", "")}=${parseArtifact(path).artifact?.metadata.status ?? "?"}`;
      });
      console.log(`${entry}\t${stages.join(" ")}`);
    }
    return;
  }
  for (const file of STAGE_FILES) {
    const path = join(changeDir(changeId), file);
    if (!existsSync(path)) {
      console.log(`${file}: missing`);
      continue;
    }
    console.log(`${file}: ${parseArtifact(path).artifact?.metadata.status ?? "?"}`);
  }
}

function cmdIncident(args: string[]): void {
  const slug = args[0];
  const source = args[1] ?? "monitor";
  if (!slug) fail("incident requires a slug");
  validateSlug(slug);
  if (!INCIDENT_SOURCES.has(source)) fail("invalid incident source");
  const id = `${today()}-${slug}`;
  const incidentPath = join(INCIDENTS_DIR, `${id}.md`);
  const bundleDir = changeDir(id);
  if (existsSync(incidentPath) || existsSync(bundleDir)) fail(`${id} already exists`);
  mkdirSync(INCIDENTS_DIR, { recursive: true });
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(
    incidentPath,
    readFileSync(join(TEMPLATE_DIR, "incident.md"), "utf8")
      .replaceAll("incident-YYYY-MM-DD-short-slug", `incident-${id}`)
      .replaceAll("YYYY-MM-DD", today())
      .replaceAll("Incident title", `${titleFromSlug(slug)} incident`)
      .replaceAll("<deterministic alert, user report, or operational observation>", source),
  );
  writeFileSync(stagePath(id, "intent"), renderTemplate("intent.md", id, titleFromSlug(slug), "incident", "high"));
  console.log(relative(REPO_ROOT, incidentPath).split(sep).join("/"));
  console.log(relative(REPO_ROOT, stagePath(id, "intent")).split(sep).join("/"));
}

function cmdAddEval(args: string[]): void {
  const slug = args[0];
  const source = args[1] ?? "real-task";
  if (!slug) fail("add-eval requires a slug");
  validateSlug(slug);
  const destination = join(EVALS_DIR, `${slug}.md`);
  if (existsSync(destination)) fail(`${destination} already exists`);
  mkdirSync(EVALS_DIR, { recursive: true });
  writeFileSync(
    destination,
    readFileSync(join(TEMPLATE_DIR, "eval.md"), "utf8")
      .replaceAll("eval-short-slug", `eval-${slug}`)
      .replaceAll("YYYY-MM-DD", today())
      .replaceAll("Eval title", titleFromSlug(slug))
      .replaceAll("<linked real task, defect, change, or Incident>", source),
  );
  console.log(relative(REPO_ROOT, destination).split(sep).join("/"));
}

function cmdValidate(args: string[]): void {
  const worktree = args.includes("--worktree");
  const result = spawnSync("bun", ["script/verify/sdlc.ts", ...(worktree ? ["--worktree"] : [])], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

function cmdCheckPr(): void {
  const body = process.env.PR_BODY ?? "";
  const isDraft = process.env.PR_IS_DRAFT;
  if (isDraft !== "true" && isDraft !== "false") fail("PR_IS_DRAFT must be true or false");
  if (!body.trim()) fail("PR_BODY is empty");
  const match = body.match(/docs\/sdlc\/changes\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)/);
  if (!match) fail("PR body must link docs/sdlc/changes/<change-id>");
  const changeId = match[1];
  for (const stage of ["intent", "spec", "plan"]) {
    const path = requireStage(changeId, stage);
    if (parseArtifact(path).artifact?.metadata.status !== "accepted") {
      fail(`${path}: ${stage} must be accepted before PR gate`);
    }
  }
  const verificationPath = requireStage(changeId, "verification");
  const verificationStatus = parseArtifact(verificationPath).artifact?.metadata.status ?? "";
  if (isDraft === "true") {
    if (!["pending", "passed"].includes(verificationStatus)) {
      fail(`${verificationPath}: failed verification blocks Draft PRs`);
    }
    console.log(`devflow: Draft PR gate passed for ${changeId}`);
    return;
  }
  if (verificationStatus !== "passed") fail(`${verificationPath}: Ready PR requires verification passed`);
  console.log(`devflow: Ready PR gate passed for ${changeId}`);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "new":
    cmdNew(rest);
    break;
  case "approve":
    cmdApprove(rest);
    break;
  case "design":
    if (!rest[0]) fail("design requires change-id");
    addStage("spec", rest[0]);
    break;
  case "plan":
    if (!rest[0]) fail("plan requires change-id");
    addStage("plan", rest[0]);
    break;
  case "verify":
    if (!rest[0]) fail("verify requires change-id");
    addStage("verification", rest[0]);
    break;
  case "status":
    cmdStatus(rest);
    break;
  case "incident":
    cmdIncident(rest);
    break;
  case "add-eval":
    cmdAddEval(rest);
    break;
  case "validate":
    cmdValidate(rest);
    break;
  case "check-pr":
    cmdCheckPr();
    break;
  case "-h":
  case "--help":
  case "help":
    usage();
    break;
  default:
    usage();
    process.exit(command ? 1 : 0);
}
