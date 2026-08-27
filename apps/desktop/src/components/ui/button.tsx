import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-module-inset rounded-control text-ui font-medium whitespace-nowrap outline-none transition-colors duration-feedback focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon-control",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive/60",
        outline:
          "bg-fill-rest hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        selectable:
          "bg-transparent text-foreground hover:bg-fill-hover data-[selected=true]:bg-fill-rest data-[selected=true]:hover:bg-fill-hover disabled:data-[selected=true]:opacity-100",
      },
      size: {
        default: "h-control-field px-4 py-2 has-[>svg]:px-3",
        compact: "h-control gap-inline px-surface-inset has-[>svg]:px-module-inset",
        field: "h-control-field gap-inline px-surface-inset has-[>svg]:px-module-inset",
        xs: "h-control-mini gap-1 rounded-control px-2 text-hint has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-control gap-1.5 rounded-control px-3 has-[>svg]:px-module-inset",
        lg: "h-control-field rounded-control px-6 has-[>svg]:px-4",
        icon: "size-control-field",
        "icon-xs": "size-control-mini rounded-control [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-control",
        "icon-lg": "size-control-field",
        row:
          "min-h-control w-full justify-start gap-module-inset px-module-inset py-control-group text-start font-normal whitespace-normal [&_[data-slot=navigation-row-leading]]:text-muted-foreground [&_[data-slot=navigation-row-meta]]:text-fine [&_[data-slot=navigation-row-meta]]:text-muted-foreground [&_[data-slot=selectable-row-description]]:text-fine [&_[data-slot=selectable-row-description]]:leading-relaxed [&_[data-slot=selectable-row-description]]:text-muted-foreground [&_[data-slot=selectable-row-meta]]:text-fine [&_[data-slot=selectable-row-meta]]:text-muted-foreground",
      },
      focusStyle: {
        default: "focus-visible:focus-ring",
        inset: "focus-visible:focus-ring-inset",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      focusStyle: "default",
    },
  }
)

const Button = React.forwardRef<
  HTMLButtonElement,
  ButtonPrimitive.Props & VariantProps<typeof buttonVariants>
>(({ className, variant = "default", size = "default", focusStyle = "default", ...props }, ref) => {
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, focusStyle, className }))}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
