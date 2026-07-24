import type { KeymapEntry } from "./bridge";

const MAC = /mac/i.test(navigator.userAgent);

/** `Mod` resolves to Cmd on macOS, Ctrl elsewhere. */
export const MOD_LABEL = MAC ? "⌘" : "Ctrl";

const SYMBOLS: Record<string, string> = MAC
  ? {
      Mod: "⌘",
      Alt: "⌥",
      Shift: "⇧",
      Enter: "↩",
      Escape: "Esc",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      Space: "Space",
    }
  : {
      Mod: "Ctrl",
      Alt: "Alt",
      Shift: "Shift",
      Enter: "Enter",
      Escape: "Esc",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      Space: "Space",
    };

/** "Mod+Shift+G" → "⌘⇧G" on macOS, "Ctrl+Shift+G" elsewhere. */
export function formatCombo(combo: string): string {
  const parts = combo.split("+").map((p) => SYMBOLS[p] ?? p);
  return MAC ? parts.join("") : parts.join("+");
}

/**
 * The physical key for an event, as a stable name.
 *
 * macOS rewrites `event.key` when Option is held (⌥P yields "π"), and Shift rewrites digits and
 * punctuation ("1" → "!"), so fall back to `event.code` for those — otherwise a binding recorded as
 * `Mod+Alt+P` could never match again.
 */
function namedKey(e: KeyboardEvent): string {
  if ((e.altKey || e.shiftKey) && /^(Key|Digit)/.test(e.code)) {
    return e.code.replace(/^(Key|Digit)/, "");
  }
  if (e.key === " ") return "Space";
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** Canonical combo string for a keyboard event, matching the format stored in the keymap. */
export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(namedKey(e));
  return parts.join("+");
}

/** Modifier keys alone are never a binding — ignore them while capturing. */
export function isModifierOnly(e: KeyboardEvent): boolean {
  return ["Meta", "Control", "Shift", "Alt"].includes(e.key);
}

/** Is the user typing into the document, an input, or a dialog field? */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

/**
 * Resolve an event to a bound action, or null.
 *
 * Bindings without a modifier (e.g. `Escape`) are allowed, but only fire when the user isn't typing
 * — otherwise binding a bare letter would make the editor unusable.
 */
export function actionForEvent(e: KeyboardEvent, bindings: KeymapEntry[]): string | null {
  const combo = comboFromEvent(e);
  const hasModifier = combo.includes("Mod+") || combo.includes("Alt+");
  if (!hasModifier && isTypingTarget(e.target) && e.key !== "Escape") return null;
  return bindings.find(([, key]) => key === combo)?.[0] ?? null;
}

/** Look up the combo bound to an action, formatted for display. Empty string if unbound. */
export function keyHint(bindings: KeymapEntry[], action: string): string {
  const entry = bindings.find(([a]) => a === action);
  return entry ? formatCombo(entry[1]) : "";
}
