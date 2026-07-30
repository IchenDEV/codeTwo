import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* The type roles from styles.css (`--text-cap` … `--text-heading`) are font sizes, but tailwind-merge
   only knows Tailwind's own scale: anything else after `text-` falls through to its *colour* group.
   That mis-grouping is silent and lossy in both directions — `cn("text-hint", "text-foreground")`
   dropped the size, `cn("text-muted-foreground", "text-fine")` dropped the colour, and shadcn's own
   `text-base` survived a `text-hint` meant to replace it. Teaching the merger the six role names is
   the whole fix; add one here whenever one is added there. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["cap", "fine", "hint", "ui", "title", "heading"] }],
    },
  },
});

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
