import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-micro px-2 py-0.5 font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:focus-ring aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "text-metadata",
        status: "text-caption",
      },
      tone: {
        destructive: "bg-canvas text-status-destructive",
        neutral: "bg-canvas text-content-muted",
        success: "bg-canvas text-status-success",
        warning: "bg-canvas text-status-warning",
      },
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground [a&]:hover:bg-destructive-hover",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        outline:
          "bg-fill-quiet text-foreground [a&]:hover:bg-fill-hover [a&]:hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
      },
    },
  }
);

export function Badge({
  className,
  variant = "default",
  size = "default",
  tone,
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ size, tone, variant }), className) },
      props
    ),
    render,
    state: { size, slot: "badge", tone, variant },
  });
}

export { badgeVariants };
