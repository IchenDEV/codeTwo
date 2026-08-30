import { type ReactNode } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Radio } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

type ChoiceRowProps = {
  kind: "radio" | "checkbox"
  label: string
  description?: string | null
  details?: ReactNode
  selected: boolean
  disabled?: boolean
  value?: string
  onCheckedChange?: (checked: boolean) => void
}

function ChoiceRow({
  kind,
  label,
  description,
  details,
  selected,
  disabled = false,
  value,
  onCheckedChange,
}: ChoiceRowProps) {
  return (
    <label
      data-slot="choice-row"
      data-selected={selected ? "true" : "false"}
      className={cn(
        "flex min-h-navigation-row w-full cursor-pointer items-start gap-module-inset rounded-control px-module-inset py-control-group text-start text-body transition-colors hover:bg-fill-hover data-[selected=true]:bg-fill-rest",
        disabled && "cursor-not-allowed opacity-50",
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
        <span className="font-medium text-foreground">{label}</span>
        {description ? (
          <span className="text-callout text-muted-foreground">{description}</span>
        ) : null}
        {details}
      </span>
    </label>
  )
}

export { ChoiceRow, type ChoiceRowProps }
