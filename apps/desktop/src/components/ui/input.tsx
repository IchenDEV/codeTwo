import * as React from "react"

import { cn } from "@/lib/utils"

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "default" | "compact"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        // Keep one unconditional type role so call sites can override it consistently.
        "w-full min-w-0 rounded-control bg-fill-rest px-3 py-1 text-ui transition-[color,box-shadow,background-color] outline-none selection:bg-primary selection:text-primary-foreground data-[size=default]:h-control-field data-[size=compact]:h-control file:inline-flex file:h-control file:border-0 file:bg-transparent file:text-fine file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:focus-ring",
        "aria-invalid:ring-2 aria-invalid:ring-destructive/30",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
