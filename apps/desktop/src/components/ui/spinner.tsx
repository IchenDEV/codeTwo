import { Loader2, type IconProps } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type SpinnerProps = Omit<IconProps, "aria-hidden" | "aria-label" | "role"> & {
  readonly label?: string;
};

const Spinner = ({ className, label, ...props }: SpinnerProps) => {
  return (
    <Loader2
      data-slot="spinner"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner, type SpinnerProps };
