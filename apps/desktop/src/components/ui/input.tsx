import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // `text-ui`, not shadcn's `text-base md:text-sm`: a responsive default can't be overridden
        // by the plain `text-hint`/`text-fine` the call sites pass, so every input in the app was
        // silently 14px. One unconditional role size, overridable like every other component's.
        "h-9 w-full min-w-0 rounded-md bg-fill-rest px-3 py-1 text-ui transition-[color,box-shadow,background-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-fine file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:ring-2 aria-invalid:ring-destructive/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
