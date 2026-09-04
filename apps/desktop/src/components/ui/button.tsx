import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "gap-module-inset rounded-control text-body duration-feedback focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-icon-control inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      focusStyle: "default",
      size: "default",
      variant: "default",
    },
    variants: {
      focusStyle: {
        default: "focus-visible:focus-ring",
        inset: "focus-visible:focus-ring-inset",
      },
      size: {
        "icon-lg": "size-control-field",
        "icon-sm": "size-control",
        "icon-xs":
          "size-control-mini rounded-control [&_svg:not([class*='size-'])]:size-3",
        compact:
          "h-control-mini gap-inline px-surface-inset has-[>svg]:px-module-inset",
        default: "h-control px-4 py-2 has-[>svg]:px-3",
        field:
          "h-control-field gap-inline px-surface-inset has-[>svg]:px-module-inset",
        icon: "size-control",
        lg: "h-control-field rounded-control px-6 has-[>svg]:px-4",
        row: "min-h-navigation-row gap-module-inset px-module-inset py-control-group [&_[data-slot=navigation-row-meta]]:text-callout [&_[data-slot=navigation-row-meta]]:text-muted-foreground [&_[data-slot=selectable-row-description]]:text-callout [&_[data-slot=selectable-row-description]]:text-muted-foreground [&_[data-slot=selectable-row-meta]]:text-callout [&_[data-slot=selectable-row-meta]]:text-muted-foreground w-full justify-start text-start font-normal whitespace-normal",
        sm: "h-control-mini rounded-control has-[>svg]:px-module-inset gap-1.5 px-3",
        xs: "h-control-mini rounded-control text-metadata gap-1 px-2 has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
      },
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        outline: "bg-fill-rest hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        selectable:
          "text-foreground hover:bg-fill-hover data-[selected=true]:bg-fill-rest data-[selected=true]:hover:bg-fill-hover bg-transparent disabled:data-[selected=true]:opacity-100",
      },
    },
  }
);

const Button = React.forwardRef<
  HTMLButtonElement,
  ButtonPrimitive.Props & VariantProps<typeof buttonVariants>
>(
  (
    {
      className,
      variant = "default",
      size = "default",
      focusStyle = "default",
      ...props
    },
    ref
  ) => (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ className, focusStyle, size, variant }))}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
