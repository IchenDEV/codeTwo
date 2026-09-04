import * as React from "react";

import { cn } from "@/lib/utils";

type TextareaProps = React.ComponentProps<"textarea"> & {
  readonly focusRing?: boolean;
  readonly size?: "default" | "compact";
};

function Textarea({
  className,
  focusRing = true,
  size = "default",
  ...props
}: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      data-size={size}
      className={cn(
        "rounded-control bg-fill-rest text-prose placeholder:text-muted-foreground read-only:bg-fill-quiet data-[size=compact]:min-h-control-field w-full min-w-0 resize-y px-3 py-2 transition-[color,box-shadow,background-color] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:min-h-24",
        focusRing && "focus-visible:focus-ring",
        "aria-invalid:ring-destructive/30 aria-invalid:ring-2",
        className
      )}
      {...props}
    />
  );
}

export { Textarea, type TextareaProps };
