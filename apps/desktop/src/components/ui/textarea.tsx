import * as React from "react"

import { cn } from "@/lib/utils"

type TextareaProps = React.ComponentProps<"textarea"> & {
  size?: "default" | "compact"
  focusRing?: boolean
}

function Textarea({ className, size = "default", focusRing = true, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      data-size={size}
      className={cn(
        "w-full min-w-0 resize-y rounded-control bg-fill-rest px-3 py-2 text-ui leading-relaxed transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-fill-quiet data-[size=compact]:min-h-control-field data-[size=default]:min-h-24",
        focusRing && "focus-visible:focus-ring",
        "aria-invalid:ring-2 aria-invalid:ring-destructive/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea, type TextareaProps }
