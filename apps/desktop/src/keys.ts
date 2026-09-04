import type { KeymapEntry } from "./bridge";

const isMac = /mac/iu.test(navigator.userAgent);

/**
`Mod` resolves to Cmd on macOS, Ctrl elsewhere.
*/
export const modifierLabel = isMac ? "⌘" : "Ctrl";

const SYMBOLS: Record<string, string> = isMac
  ? {
      Alt: "⌥",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      ArrowUp: "↑",
      Enter: "↩",
      Escape: "Esc",
      Mod: "⌘",
      Shift: "⇧",
      Space: "Space",
    }
  : {
      Alt: "Alt",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      ArrowUp: "↑",
      Enter: "Enter",
      Escape: "Esc",
      Mod: "Ctrl",
      Shift: "Shift",
      Space: "Space",
    };

export function formatCombo(combo: string): string {
  const parts = combo.split("+").map((p) => SYMBOLS[p] ?? p);
  return isMac ? parts.join("") : parts.join("+");
}

function namedKey(e: KeyboardEvent): string {
  if ((e.altKey || e.shiftKey) && /^(Key|Digit)/u.test(e.code)) {
    return e.code.replace(/^(Key|Digit)/u, "");
  }
  if (e.key === " ") {
    return "Space";
  }
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) {
    parts.push("Mod");
  }
  if (e.altKey) {
    parts.push("Alt");
  }
  if (e.shiftKey) {
    parts.push("Shift");
  }
  parts.push(namedKey(e));
  return parts.join("+");
}

export function isModifierOnly(e: KeyboardEvent): boolean {
  return ["Meta", "Control", "Shift", "Alt"].includes(e.key);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (element?.tagName == null || element?.tagName === "") {
    return false;
  }
  return (
    element.isContentEditable ||
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT"
  );
}

export function actionForEvent(
  e: KeyboardEvent,
  bindings: KeymapEntry[]
): string | null {
  const combo = comboFromEvent(e);
  const hasModifier = combo.includes("Mod+") || combo.includes("Alt+");
  if (!hasModifier && isTypingTarget(e.target) && e.key !== "Escape") {
    return null;
  }
  return bindings.find(([, key]) => key === combo)?.[0] ?? null;
}

export function keyHint(bindings: KeymapEntry[], action: string): string {
  const entry = bindings.find(([a]) => a === action);
  return entry ? formatCombo(entry[1]) : "";
}
