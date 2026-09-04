import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* styles.css adds semantic values beyond Tailwind's built-in scale, so the merger must know their
   namespaces too. Type roles need special care: an unknown `text-*` name falls through to the
   colour group, which silently drops either the size or the colour. Keep these names aligned with
   the @theme bridge whenever its public utility contract changes. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
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
      duration: [{ duration: ["feedback", "layer", "dialog", "page"] }],
    },
    theme: {
      ease: ["enter", "exit"],
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
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
