import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export const RULES = [
  "raw-color",
  "fixed-color-class",
  "arbitrary-tailwind",
  "off-scale-type",
  "hardcoded-type-metric",
  "hardcoded-spacing",
  "hardcoded-radius",
  "hardcoded-shadow",
  "hardcoded-motion",
  "control-height-class",
  "static-border",
  "foundation-use",
  "visual-important",
] as const;

export type Rule = (typeof RULES)[number];

export interface Violation {
  rule: Rule;
  path: string;
  line: number;
  value: string;
  replacement: string;
}

interface AllowlistEntry {
  path: string;
  rules: Rule[];
  reason: string;
}

interface Allowlist {
  entries: AllowlistEntry[];
}

interface Baseline {
  version: 1;
  baseCommit: string;
  counts: Record<string, number>;
}

export interface ContrastResult {
  foreground: string;
  background: string;
  minimum: number;
  ratio: number;
  scheme: "light" | "dark";
}

const replacements: Record<Rule, string> = {
  "raw-color": "move the value to tokens.css and consume a semantic --ds-color-* token",
  "fixed-color-class": "replace the fixed Tailwind color with a semantic color role",
  "arbitrary-tailwind": "replace the arbitrary utility with a named semantic token or variant",
  "off-scale-type": "use one of the eight C2 type roles",
  "hardcoded-type-metric": "use a --ds-type-*-size or --ds-type-*-leading role",
  "hardcoded-spacing": "use the 2/4/6/8/12/16/24/32 semantic spacing roles",
  "hardcoded-radius": "use --ds-radius-micro/control/module/modal",
  "hardcoded-shadow": "use --ds-elevation-surface/raised/modal",
  "hardcoded-motion": "use a semantic motion duration and easing token",
  "control-height-class": "use the 24/28/32 shared control-height contract",
  "static-border": "remove the line or express a whitelisted focus/status/content structure state",
  "foundation-use": "consume a semantic or shared-component alias, never a foundation token",
  "visual-important": "remove !important and fix the component or selector contract",
};

const tokenFile = "src/design/tokens.css";
const supportedExtensions = new Set([".css", ".ts", ".tsx"]);

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (supportedExtensions.has(extension(path))) files.push(path);
  }
  return files;
}

function lineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function collect(
  source: string,
  path: string,
  rule: Rule,
  pattern: RegExp,
  violations: Violation[],
  accept: (value: string) => boolean = () => true,
) {
  for (const match of source.matchAll(pattern)) {
    const value = match[0];
    if (!accept(value)) continue;
    violations.push({
      rule,
      path,
      line: lineNumber(source, match.index ?? 0),
      value: value.trim().replace(/\s+/g, " "),
      replacement: replacements[rule],
    });
  }
}

function isAllowed(path: string, rule: Rule, allowlist: Allowlist): boolean {
  return allowlist.entries.some((entry) => entry.path === path && entry.rules.includes(rule));
}

export function validateAllowlist(root: string, allowlist: Allowlist): string[] {
  const errors: string[] = [];
  for (const entry of allowlist.entries) {
    if (!existsSync(resolve(root, entry.path))) errors.push(`allowlist path does not exist: ${entry.path}`);
    if (entry.reason.trim().length < 12) errors.push(`allowlist reason is too short: ${entry.path}`);
    for (const rule of entry.rules) {
      if (!RULES.includes(rule)) errors.push(`allowlist has unknown rule ${rule}: ${entry.path}`);
    }
  }
  return errors;
}

export function scanSource(root: string, allowlist: Allowlist): Violation[] {
  const sourceRoot = resolve(root, "src");
  const violations: Violation[] = [];

  for (const absolutePath of walk(sourceRoot)) {
    const path = relative(root, absolutePath).replaceAll("\\", "/");
    if (path === tokenFile) continue;
    const source = readFileSync(absolutePath, "utf8");
    const css = path.endsWith(".css");

    if (!isAllowed(path, "raw-color", allowlist)) {
      collect(source, path, "raw-color", /#[\da-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklab|oklch)\([^)]*\)/g, violations);
    }
    if (!isAllowed(path, "fixed-color-class", allowlist)) {
      collect(source, path, "fixed-color-class", /\b(?:bg|text|fill|stroke)-(?:white|black|red|blue|green|yellow|orange|purple|pink|gray|grey|slate|zinc|neutral|stone)(?:-\d+)?(?:\/\d+)?\b/g, violations);
    }
    if (!isAllowed(path, "arbitrary-tailwind", allowlist)) {
      collect(source, path, "arbitrary-tailwind", /\b(?:text|bg|p[trblxy]?|m[trblxy]?|gap|rounded|shadow|duration|ease|size|h|min-h|max-h|w|min-w|max-w)-\[[^\]]+\]/g, violations);
    }
    if (!isAllowed(path, "off-scale-type", allowlist)) {
      collect(source, path, "off-scale-type", /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl)\b/g, violations);
    }
    if (!isAllowed(path, "hardcoded-type-metric", allowlist) && css) {
      collect(source, path, "hardcoded-type-metric", /\b(?:font-size|line-height)\s*:\s*(?:\d*\.)?\d+px\b/g, violations);
    }
    if (!isAllowed(path, "hardcoded-spacing", allowlist) && css) {
      collect(
        source,
        path,
        "hardcoded-spacing",
        /\b(?:margin|margin-(?:inline|block|top|right|bottom|left)|padding|padding-(?:inline|block|top|right|bottom|left)|gap|row-gap|column-gap)\s*:[^;]+;/g,
        violations,
        (value) => /\d+px/.test(value),
      );
    }
    if (!isAllowed(path, "hardcoded-radius", allowlist)) {
      if (css) {
        collect(
          source,
          path,
          "hardcoded-radius",
          /\bborder-radius\s*:\s*[^;]+;/g,
          violations,
          (value) => !/var\(|inherit|50%/.test(value),
        );
      } else {
        collect(source, path, "hardcoded-radius", /\brounded-(?:none|sm|md|lg|xl|2xl|3xl)\b/g, violations);
      }
    }
    if (!isAllowed(path, "hardcoded-shadow", allowlist)) {
      if (css) {
        collect(source, path, "hardcoded-shadow", /\bbox-shadow\s*:\s*[^;]+;/g, violations, (value) => !/var\(|none/.test(value));
      } else {
        collect(source, path, "hardcoded-shadow", /\bshadow(?:-(?:sm|md|lg|xl|2xl|inner)|-\[[^\]]+\])\b/g, violations);
      }
    }
    if (!isAllowed(path, "hardcoded-motion", allowlist)) {
      if (css) {
        collect(
          source,
          path,
          "hardcoded-motion",
          /\b(?:transition-duration|animation-duration|transition-timing-function|animation-timing-function)\s*:\s*[^;]+;/g,
          violations,
          (value) => !/var\(|0ms|ease-in\b/.test(value),
        );
      } else {
        collect(source, path, "hardcoded-motion", /\bduration-(?:\d+|\[[^\]]+\])\b|\bease-(?:linear|out|in-out|\[[^\]]+\])\b/g, violations);
      }
    }
    if (!isAllowed(path, "control-height-class", allowlist) && !css) {
      collect(source, path, "control-height-class", /\b(?:h|min-h|max-h)-(?:5|6|7|8|9|10|11|12|\[[^\]]+\])\b/g, violations);
    }
    if (!isAllowed(path, "static-border", allowlist)) {
      if (css) {
        collect(source, path, "static-border", /\bborder(?:-(?:top|right|bottom|left|inline|block))?\s*:\s*[^;]+;/g, violations, (value) => !/:\s*(?:0|none)\s*;/.test(value));
      } else {
        collect(source, path, "static-border", /\bborder-(?:[trblxy](?:-\d+)?(?:-[\w./\[\]-]+)?|\d+(?:-[\w./\[\]-]+)?|(?:border|input|destructive|warning|foreground|background|primary|secondary|muted|accent|transparent)(?:\/\d+)?)\b/g, violations);
      }
    }
    if (!isAllowed(path, "foundation-use", allowlist)) {
      collect(source, path, "foundation-use", /var\(--ds-foundation-[\w-]+\)/g, violations);
    }
    if (!isAllowed(path, "visual-important", allowlist)) {
      collect(source, path, "visual-important", /!important\b/g, violations);
    }
  }

  return violations.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule.localeCompare(b.rule));
}

export function fingerprint(violation: Pick<Violation, "path" | "rule" | "value">): string {
  return `${violation.rule}::${violation.path}::${violation.value}`;
}

export function countViolations(violations: Violation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const violation of violations) {
    const key = fingerprint(violation);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function increases(violations: Violation[], baseline: Baseline): Violation[] {
  const current = countViolations(violations);
  const seen = new Map<string, number>();
  return violations.filter((violation) => {
    const key = fingerprint(violation);
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return occurrence > (baseline.counts[key] ?? 0) && occurrence <= (current[key] ?? 0);
  });
}

export function parseDeclarations(source: string, selector: ":root" | "dark"): Map<string, string> {
  const pattern = selector === ":root"
    ? /:root\s*\{([\s\S]*?)\n\}/
    : /\.dark,\s*\n\[data-ds-theme="dark"\]\s*\{([\s\S]*?)\n\}/;
  const block = source.match(pattern)?.[1];
  if (!block) throw new Error(`Could not find ${selector} token block`);
  const declarations = new Map<string, string>();
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    declarations.set(match[1], match[2].trim().replace(/\s+/g, " "));
  }
  return declarations;
}

function resolveValue(name: string, declarations: Map<string, string>, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`Circular token reference: ${name}`);
  const value = declarations.get(name);
  if (!value) throw new Error(`Missing token: ${name}`);
  const reference = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (!reference) return value;
  seen.add(name);
  return resolveValue(reference, declarations, seen);
}

function parseOklch(value: string): [number, number, number] {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!match) throw new Error(`Contrast token is not opaque oklch: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function oklchToLinearRgb([lightness, chroma, hue]: [number, number, number]): [number, number, number] {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const luminance = (color: [number, number, number]) => {
    const [red, green, blue] = oklchToLinearRgb(color);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function checkContrastContracts(source: string): ContrastResult[] {
  const root = parseDeclarations(source, ":root");
  const darkOverrides = parseDeclarations(source, "dark");
  const dark = new Map([...root, ...darkOverrides]);
  const contracts = [...source.matchAll(/@contrast\s+(--[\w-]+)\s+(--[\w-]+)\s+([\d.]+)/g)];
  const results: ContrastResult[] = [];

  for (const contract of contracts) {
    const [, foreground, background, minimumText] = contract;
    const minimum = Number(minimumText);
    for (const [scheme, declarations] of [["light", root], ["dark", dark]] as const) {
      const foregroundColor = parseOklch(resolveValue(foreground, declarations));
      const backgroundColor = parseOklch(resolveValue(background, declarations));
      results.push({
        foreground,
        background,
        minimum,
        ratio: contrastRatio(foregroundColor, backgroundColor),
        scheme,
      });
    }
  }
  return results;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function run() {
  const root = process.cwd();
  const allowlistPath = resolve(root, "scripts/design-system-allowlist.json");
  const baselinePath = resolve(root, "scripts/design-system-baseline.json");
  const tokenPath = resolve(root, tokenFile);
  const allowlist = loadJson<Allowlist>(allowlistPath);
  const allowlistErrors = validateAllowlist(root, allowlist);
  if (allowlistErrors.length) {
    for (const error of allowlistErrors) console.error(`design-system allowlist: ${error}`);
    process.exitCode = 1;
    return;
  }

  const violations = scanSource(root, allowlist);
  if (process.argv.includes("--write-baseline")) {
    const baseCommit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: resolve(root, "../..") })
      .stdout.toString().trim();
    const baseline: Baseline = { version: 1, baseCommit, counts: countViolations(violations) };
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote ${Object.keys(baseline.counts).length} design-debt fingerprints to ${relative(root, baselinePath)}.`);
    return;
  }

  const baseline = loadJson<Baseline>(baselinePath);
  const newViolations = increases(violations, baseline);
  for (const violation of newViolations) {
    console.error(`${violation.path}:${violation.line} [${violation.rule}] ${violation.value}`);
    console.error(`  replace: ${violation.replacement}`);
  }

  const contrast = checkContrastContracts(readFileSync(tokenPath, "utf8"));
  const contrastFailures = contrast.filter((result) => result.ratio + Number.EPSILON < result.minimum);
  for (const result of contrastFailures) {
    console.error(
      `${tokenFile} [contrast/${result.scheme}] ${result.foreground} on ${result.background}: ${result.ratio.toFixed(2)} < ${result.minimum}`,
    );
  }

  if (newViolations.length || contrastFailures.length) {
    process.exitCode = 1;
    return;
  }

  const debt = violations.length;
  const contrastSummary = contrast.map((result) => result.ratio.toFixed(2));
  console.log(`Design system OK: 0 new violations; legacy debt ${debt}; contrast ${contrastSummary.join(", ")}.`);
}

if (import.meta.main) run();
