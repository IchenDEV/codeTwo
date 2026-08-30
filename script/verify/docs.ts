#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

interface CatalogRule {
  classification: string;
  authority: string;
  paths?: string[];
  pattern?: string;
}

interface Catalog {
  schema: number;
  rules: CatalogRule[];
}

function repoPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function filesBelow(path: string): string[] {
  if (!existsSync(path)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(path)) {
    const child = join(path, entry);
    if (statSync(child).isDirectory()) files.push(...filesBelow(child));
    else files.push(child);
  }
  return files;
}

function ruleMatches(rule: CatalogRule, path: string): boolean {
  if (rule.paths?.includes(path)) return true;
  return rule.pattern ? new RegExp(rule.pattern).test(path) : false;
}

function localTargets(root: string, markdownPath: string): string[] {
  const body = readFileSync(markdownPath, "utf8");
  const targets = [
    ...Array.from(body.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g), (match) => match[1]),
    ...Array.from(body.matchAll(/<(?:a|img)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi), (match) => match[1]),
  ];
  return targets.flatMap((rawTarget) => {
    let target = rawTarget.trim().replace(/^<|>$/g, "");
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("/") ||
      /^[a-z][a-z0-9+.-]*:/i.test(target)
    ) {
      return [];
    }
    target = target.split("#", 1)[0].split("?", 1)[0];
    if (!target) return [];
    try {
      return [repoPath(root, resolve(dirname(markdownPath), decodeURIComponent(target)))];
    } catch {
      return [`invalid:${target}`];
    }
  });
}

export function validateDocumentation(repositoryRoot: string): string[] {
  const root = resolve(repositoryRoot);
  const docsRoot = join(root, "docs");
  const catalogPath = join(docsRoot, "catalog.json");
  const errors: string[] = [];
  if (!existsSync(catalogPath)) return ["docs/catalog.json is required"];

  let catalog: Catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Catalog;
  } catch (error) {
    return [`docs/catalog.json is invalid JSON: ${String(error)}`];
  }
  if (catalog.schema !== 1 || !Array.isArray(catalog.rules)) {
    return ["docs/catalog.json must use schema 1 with a rules array"];
  }

  const docsFiles = filesBelow(docsRoot).map((path) => repoPath(root, path)).sort();
  const classification = new Map<string, CatalogRule>();
  for (const path of docsFiles) {
    let matches: CatalogRule[] = [];
    try {
      matches = catalog.rules.filter((rule) => ruleMatches(rule, path));
    } catch (error) {
      errors.push(`catalog rule cannot be evaluated for ${path}: ${String(error)}`);
      continue;
    }
    if (matches.length === 0) errors.push(`${path}: unclassified documentation file`);
    if (matches.length > 1) {
      errors.push(`${path}: ambiguous documentation classification (${matches.map((rule) => rule.classification).join(", ")})`);
    }
    if (matches.length === 1) classification.set(path, matches[0]);
  }

  for (const rule of catalog.rules) {
    for (const path of rule.paths ?? []) {
      if (!docsFiles.includes(path)) errors.push(`${path}: catalog entry does not exist`);
    }
  }

  const localReferences = new Set<string>();
  const markdownFiles = [
    ...["README.md", "AGENTS.md", "CONTEXT.md"].map((path) => join(root, path)).filter(existsSync),
    ...filesBelow(docsRoot).filter((path) => extname(path) === ".md"),
  ];
  for (const markdownPath of markdownFiles) {
    for (const target of localTargets(root, markdownPath)) {
      localReferences.add(target);
      if (target.startsWith("invalid:")) errors.push(`${repoPath(root, markdownPath)}: invalid local link ${target.slice(8)}`);
      else if (!existsSync(join(root, target))) errors.push(`${repoPath(root, markdownPath)}: broken local link ${target}`);
    }
  }

  for (const path of docsFiles) {
    const rule = classification.get(path);
    if (!rule) continue;
    if (
      /\d{4}-\d{2}-\d{2}/.test(path)
      && !new Set(["archive", "change-record", "change-evidence"]).has(rule.classification)
    ) {
      errors.push(`${path}: dated snapshots belong in docs/archive or canonical change bundles`);
    }
    if (rule.classification === "change-record") {
      const body = readFileSync(join(root, path), "utf8");
      if (!/^schema: 2$/m.test(body)) errors.push(`${path}: canonical change record must use schema 2`);
    }
    if (new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]).has(extname(path).toLowerCase())) {
      if (!localReferences.has(path)) errors.push(`${path}: unreferenced documentation image`);
    }
  }

  return errors;
}

function parseRoot(argv: string[]): string {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--root" || !argv[index + 1]) {
      throw new Error("usage: bun script/verify/docs.ts [--root PATH]");
    }
    root = argv[index + 1];
    index += 1;
  }
  return root;
}

if (import.meta.main) {
  try {
    const errors = validateDocumentation(parseRoot(process.argv.slice(2)));
    if (errors.length > 0) {
      for (const error of errors) console.error(`[docs] error: ${error}`);
      console.error(`[docs] failed with ${errors.length} error(s)`);
      process.exit(1);
    }
    console.log("[docs] catalog, links, schemas, and assets valid");
  } catch (error) {
    console.error(`[docs] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
