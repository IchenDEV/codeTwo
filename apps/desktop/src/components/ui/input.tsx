import * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "default" | "compact";
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        // Keep one unconditional type role so call sites can override it consistently.
        "rounded-control bg-fill-rest text-body selection:bg-primary selection:text-primary-foreground data-[size=default]:h-control-field data-[size=compact]:h-control file:h-control file:text-callout file:text-foreground placeholder:text-muted-foreground w-full min-w-0 px-3 py-1 transition-[color,box-shadow,background-color] outline-none file:inline-flex file:border-0 file:bg-transparent file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:focus-ring",
        "aria-invalid:ring-destructive/30 aria-invalid:ring-2",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
