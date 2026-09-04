import type { ModelChoice } from "../bridge";

/**
 * Grouping the flat ACP model list into families.
 *
 * ACP reports models as a flat list, but adapters that expose reasoning effort do it by minting one
 * entry per effort — Codex lists "gpt-5.1-codex low / medium / high" as three models. Rendered
 * as-is that's a wall of near-duplicates; what the user actually chooses is a model *and* an
 * effort. So the picker parses effort suffixes back out of the names and shows two controls, and
 * this module is that parse. It only ever regroups what the adapter sent — selecting a family +
 * effort maps back to one of the adapter's own ids, never an invented one.
 */

/**
Effort levels adapters encode into variant names, lowest to highest.
*/
export const EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;
export type Effort = (typeof EFFORTS)[number];

// A trailing effort token, split from the base name. Separators are display-style only (space,
// paren, "·", ":") — deliberately not "-" or "_", because hyphens join real model names
// ("gpt-5.1-codex-max" is a model, not "gpt-5.1-codex" at max effort). Longer alternatives come
// first so "extra high" isn't eaten as "high".
const effortRe =
  /^(.*?)[\s(·:]+(extra[\s-]?high|x[\s-]?high|minimal|medium|low|high|max|ultra)\s*\)?\s*$/iu;

function isEffort(value: string): value is Effort {
  return EFFORTS.some((effort) => effort === value);
}

function normalizeEffort(token: string): Effort {
  const t = token
    .toLowerCase()
    .replaceAll(/[\s-]+/gu, " ")
    .trim();
  if (t === "extra high" || t === "x high" || t === "xhigh") {
    return "xhigh";
  }
  return isEffort(t) ? t : "medium";
}

export function splitEffort(name: string): {
  base: string;
  effort: Effort | null;
} {
  const m = effortRe.exec(name);
  if (!m) {
    return { base: name.trim(), effort: null };
  }
  return { base: m[1].trim(), effort: normalizeEffort(m[2]) };
}

/**
One selectable effort level of a family. `effort: null` is the adapter's unsuffixed entry.
*/
export interface ModelVariant {
  effort: Effort | null;
  choice: ModelChoice;
}

/**
 * One row of the model menu: a base model plus the effort variants the adapter offers for it.
 * Ungrouped models are single-variant families, so the menu renders one shape.
 */
export interface ModelFamily {
  key: string;
  label: string;
  variants: ModelVariant[];
}

const rank = (e: Effort | null) => (e === null ? -1 : EFFORTS.indexOf(e));

export function groupModels(models: ModelChoice[]): ModelFamily[] {
  const buckets = new Map<string, { label: string; members: ModelVariant[] }>();
  for (const choice of models) {
    const { base, effort } = splitEffort(choice.name);
    const key = base.toLowerCase();
    const bucket = buckets.get(key) ?? { label: base, members: [] };
    bucket.members.push({ choice, effort });
    buckets.set(key, bucket);
  }

  const families: ModelFamily[] = [];
  for (const [key, bucket] of buckets) {
    const distinct = new Set(
      bucket.members.filter((v) => v.effort !== null).map((v) => v.effort)
    );
    if (bucket.members.length >= 2 && distinct.size >= 2) {
      families.push({
        key,
        label: bucket.label,
        variants: [...bucket.members].sort(
          (a, b) => rank(a.effort) - rank(b.effort)
        ),
      });
    } else {
      for (const v of bucket.members) {
        families.push({
          key: v.choice.id,
          label: v.choice.name,
          variants: [{ choice: v.choice, effort: null }],
        });
      }
    }
  }
  return families;
}

export function familyOf(
  families: ModelFamily[],
  id: string | null
): ModelFamily | null {
  if (id == null || id === "") {
    return null;
  }
  return (
    families.find((f) => f.variants.some((v) => v.choice.id === id)) ?? null
  );
}

export function variantOf(
  families: ModelFamily[],
  id: string | null
): ModelVariant | null {
  if (id == null || id === "") {
    return null;
  }
  for (const f of families) {
    const v = f.variants.find((x) => x.choice.id === id);
    if (v) {
      return v;
    }
  }
  return null;
}

export function pickVariant(
  family: ModelFamily,
  effort: Effort | null,
  defaultId: string | null
): ModelChoice {
  const same = family.variants.find((v) => v.effort === effort);
  if (same) {
    return same.choice;
  }
  const dflt = family.variants.find((v) => v.choice.id === defaultId);
  if (dflt) {
    return dflt.choice;
  }
  const medium = family.variants.find((v) => v.effort === "medium");
  return (medium ?? family.variants[0]).choice;
}
