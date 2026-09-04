import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import type { ClassValue } from "clsx";

/* styles.css adds semantic values beyond Tailwind's built-in scale, so the merger must know their
   namespaces too. Type roles need special care: an unknown `text-*` name falls through to the
   colour group, which silently drops either the size or the colour. Keep these names aligned with
   the @theme bridge whenever its public utility contract changes. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        "optical",
        "inline",
        "control-group",
        "module-inset",
        "surface-inset",
        "section",
        "page",
        "page-section",
        "control-mini",
        "control",
        "control-field",
        "icon-inline",
        "icon-list",
        "icon-control",
        "menu",
        "menu-item",
      ],
      radius: [
        "micro",
        "control",
        "module",
        "modal",
        "card",
        "composer",
        "menu",
        "menu-item",
      ],
      shadow: ["surface", "raised", "modal", "menu"],
      ease: ["enter", "exit"],
    },
    classGroups: {
      duration: [{ duration: ["feedback", "layer", "dialog", "page"] }],
      "font-size": [
        {
          text: [
            "cap",
            "fine",
            "hint",
            "ui",
            "title",
            "heading",
            "display",
            "large-title",
            "page",
            "section",
            "dialog",
            "body",
            "callout",
            "metadata",
            "caption",
            "code",
          ],
        },
      ],
    },
  },
});

/**
Merge conditional class names, with later Tailwind utilities winning.
*/
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
