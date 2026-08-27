import { useId, type ReactNode } from "react"
import { Check } from "@/components/ui/icons"

import { Button } from "@/components/ui/button"

interface SelectableRowProps {
  label: string
  accessibilityContext?: string
  description?: string | null
  leading?: ReactNode
  meta?: ReactNode
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}

function SelectableRow({
  label,
  accessibilityContext,
  description,
  leading,
  meta,
  selected,
  disabled = false,
  onSelect,
}: SelectableRowProps) {
  const descriptionId = useId()
  const leadingId = useId()
  const metaId = useId()
  const describedBy = [
    leading ? leadingId : null,
    description ? descriptionId : null,
    meta ? metaId : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined
  const accessibleName = accessibilityContext && accessibilityContext !== label
    ? `${label}, ${accessibilityContext}`
    : label

  return (
    <Button
      type="button"
      variant="selectable"
      size="row"
      data-slot="selectable-row"
      data-selected={selected ? "true" : "false"}
      aria-label={accessibleName}
      aria-describedby={describedBy}
      aria-pressed={selected}
      title={description ?? undefined}
      disabled={disabled}
      onClick={onSelect}
      className={description ? "items-start" : "items-center"}
    >
      <span
        data-slot="selectable-row-indicator"
        className="flex size-4 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      {leading ? (
        <span id={leadingId} data-slot="selectable-row-leading" className="flex shrink-0 items-center">
          {leading}
        </span>
      ) : null}
      <span data-slot="selectable-row-content" className="min-w-0 flex-1">
        <span data-slot="selectable-row-label" className="block truncate">
          {label}
        </span>
        {description ? (
          <span
            id={descriptionId}
            data-slot="selectable-row-description"
            className="line-clamp-2 whitespace-normal break-words"
          >
            {description}
          </span>
        ) : null}
      </span>
      {meta ? (
        <span
          id={metaId}
          data-slot="selectable-row-meta"
          className="flex shrink-0 items-center"
        >
          {meta}
        </span>
      ) : null}
    </Button>
  )
}

export { SelectableRow, type SelectableRowProps }
