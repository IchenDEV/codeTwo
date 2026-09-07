#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateRepository } from "./verify/sdlc";
import { parseArtifact } from "./verify/artifact-parse";
import { CHANGE_ID_RE, STAGE_FILES, validateStageBundle } from "./verify/stage-bundle";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SDLC_ROOT = join(REPO_ROOT, "docs", "sdlc");
const CHANGES_DIR = join(SDLC_ROOT, "changes");
const INCIDENTS_DIR = join(SDLC_ROOT, "incidents");
const EVALS_DIR = join(SDLC_ROOT, "evals");
const TEMPLATE_DIR = join(REPO_ROOT, ".agents/skills/codetwo-develop/templates");
const INCIDENT_TEMPLATE = join(REPO_ROOT, ".agents/skills/codetwo-operations/templates/incident.md");

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const CHANGE_SOURCES = new Set(["user", "issue", "incident", "monitor", "feedback"]);
const INCIDENT_SOURCES = new Set(["user", "issue", "monitor"]);

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
  ./script/devflow status [change-id]
  ./script/devflow incident <slug> [source]
  ./script/devflow add-eval <slug> [source]
  ./script/devflow validate [--worktree]
  ./script/devflow check-pr

new creates one draft change.md. Record existing authorization and evidence in that file; no command grants approval.`);
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
  const path = stagePath(id, "change");
  writeFileSync(path, renderTemplate("change.md", id, titleFromSlug(slug), source, risk));
  console.log(relative(REPO_ROOT, path).split(sep).join("/"));
}

function cmdStatus(args: string[]): void {
  const ids = args[0] ? [args[0]] : readdirSync(CHANGES_DIR).sort();
  for (const id of ids) {
    const dir = changeDir(id);
    const files = existsSync(join(dir, "change.md")) ? ["change.md"] : STAGE_FILES;
    const statuses = files.filter(file => existsSync(join(dir, file))).map(file =>
      `${file}=${parseArtifact(join(dir, file)).artifact?.metadata.status ?? "?"}`);
    console.log(`${id}\t${statuses.join(" ") || "missing"}`);
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
    readFileSync(INCIDENT_TEMPLATE, "utf8")
      .replaceAll("incident-YYYY-MM-DD-short-slug", `incident-${id}`)
      .replaceAll("YYYY-MM-DD", today())
      .replaceAll("Incident title", `${titleFromSlug(slug)} incident`)
      .replaceAll("<deterministic alert, user report, or operational observation>", source)
      .replace("Link at least one owned change Intent when remediation is needed.\n\nBlocked: pending.\n\nReplace the placeholder with a concrete obstacle only when a follow-up change cannot be created.", `Follow-up: [${id}](../changes/${id}/change.md).`),
  );
  writeFileSync(stagePath(id, "change"), renderTemplate("change.md", id, titleFromSlug(slug), "incident", "high"));
  console.log(relative(REPO_ROOT, incidentPath).split(sep).join("/"));
  console.log(relative(REPO_ROOT, stagePath(id, "change")).split(sep).join("/"));
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
  const event = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const body = process.env.PR_BODY ?? event.pull_request?.body ?? "";
  const isDraft = process.env.PR_IS_DRAFT ?? String(event.pull_request?.draft);
  const base = process.env.PR_BASE_SHA ?? event.pull_request?.base?.sha;
  if (event.pull_request && !base) fail("PR event requires a base SHA for the branch Gate");
  if (isDraft !== "true" && isDraft !== "false") fail("PR_IS_DRAFT must be true or false");
  if (!body.trim()) fail("PR_BODY is empty");
  const ids = [...new Set(Array.from(
    body.matchAll(/docs\/sdlc\/changes\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)/g),
    match => match[1],
  ))];
  if (ids.length === 0) fail("PR body must link docs/sdlc/changes/<change-id>");
  for (const changeId of ids) {
    const { bundle, errors } = validateStageBundle(REPO_ROOT, changeDir(changeId));
    if (errors.length > 0 || !bundle) fail(errors.join("\n") || "invalid change bundle");
    if (isDraft === "false") {
      for (const stage of ["intent", "spec", "plan"] as const) {
        if (bundle[stage]?.metadata.status !== "accepted") fail(`${changeId}: ${stage} must be accepted before Ready PR`);
      }
      if (bundle.verification?.metadata.status !== "passed") fail(`${changeId}: Ready PR requires verification passed`);
    }
  }
  if (base) {
    const errors = validateRepository(REPO_ROOT, base, undefined, false, isDraft === "false");
    if (errors.length) fail(errors.join("\n"));
    const changed = spawnSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: REPO_ROOT, encoding: "utf8" });
    if (changed.status !== 0) fail("cannot inspect PR change records");
    const changedIds = new Set(Array.from(changed.stdout.matchAll(/^docs\/sdlc\/changes\/([^/]+)\/(?:change|intent|spec|plan|verification)\.md$/gm), match => match[1]));
    for (const id of changedIds) {
      if (existsSync(changeDir(id)) && !ids.includes(id)) fail(`PR body must link changed record ${id}`);
    }
  }
  console.log(`devflow: ${isDraft === "true" ? "Draft" : "Ready"} PR records valid; branch Gate checks changed scope`);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "new":
    cmdNew(rest);
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
