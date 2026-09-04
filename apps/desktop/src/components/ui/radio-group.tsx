import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

function RadioGroup<Value>({
  className,
  ...props
}: RadioGroupPrimitive.Props<Value>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("gap-control-group flex flex-col", className)}
      {...props}
    />
  );
}

function Radio<Value>({
  className,
  ...props
}: RadioPrimitive.Root.Props<Value>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio"
      className={cn(
        "peer bg-fill-hover focus-visible:focus-ring data-checked:bg-primary aria-invalid:ring-destructive/30 relative flex size-4 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow] outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-indicator"
        className="bg-primary-foreground size-1.5 rounded-full"
      />
    </RadioPrimitive.Root>
  );
}

export { Radio, RadioGroup };
