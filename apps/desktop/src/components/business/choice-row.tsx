import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Radio } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type ChoiceRowProps = {
  readonly kind: "radio" | "checkbox";
  readonly label: string;
  readonly description?: string | null;
  readonly details?: ReactNode;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly value?: string;
  readonly onCheckedChange?: (isChecked: boolean) => void;
};

const ChoiceRow = ({
  kind,
  label,
  description,
  details,
  selected,
  disabled = false,
  value,
  onCheckedChange,
}: ChoiceRowProps) => (
  <label
    data-slot="choice-row"
    data-selected={selected ? "true" : "false"}
    className={cn(
      "min-h-navigation-row gap-module-inset rounded-control px-module-inset py-control-group text-body hover:bg-fill-hover data-[selected=true]:bg-fill-rest flex w-full cursor-pointer items-start text-start transition-colors",
      disabled && "cursor-not-allowed opacity-50"
    )}
  >
    {kind === "radio" ? (
      <Radio value={value ?? label} disabled={disabled} className="mt-0.5" />
    ) : (
      <Checkbox
        checked={selected}
        disabled={disabled}
        onCheckedChange={(checked) => onCheckedChange?.(checked === true)}
        className="mt-0.5"
      />
    )}
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-foreground font-medium">{label}</span>
      {description ? (
        <span className="text-callout text-muted-foreground">
          {description}
        </span>
      ) : null}
      {details}
    </span>
  </label>
);

export { ChoiceRow, type ChoiceRowProps };
