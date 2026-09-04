import { Loader2 } from "@/components/ui/icons";
import type { IconProps } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type SpinnerProps = Omit<IconProps, "aria-hidden" | "aria-label" | "role"> & {
  label?: string;
};

function Spinner({ className, label, ...props }: SpinnerProps) {
  return (
    <Loader2
      data-slot="spinner"
      role={label != null && label !== "" ? "status" : undefined}
      aria-label={label}
      aria-hidden={label != null && label !== "" ? undefined : "true"}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner, type SpinnerProps };
