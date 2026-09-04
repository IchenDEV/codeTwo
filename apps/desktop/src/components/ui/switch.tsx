import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

const Switch = ({ className, ...props }: SwitchPrimitive.Root.Props) => (
  <SwitchPrimitive.Root
    data-slot="switch"
    className={cn(
      "h-control-mini bg-fill-hover focus-visible:focus-ring data-checked:bg-primary relative inline-flex w-10 shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className="bg-background shadow-surface block size-4 rounded-full transition-transform data-checked:translate-x-4"
    />
  </SwitchPrimitive.Root>
);

export { Switch };
