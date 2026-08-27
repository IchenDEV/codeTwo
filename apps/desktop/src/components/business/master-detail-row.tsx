import { useId, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

interface MasterDetailRowProps {
  label: string
  description?: ReactNode
  leading?: ReactNode
  meta?: ReactNode
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}

function MasterDetailRow({
  label,
  description,
  leading,
  meta,
  selected,
  disabled = false,
  onSelect,
}: MasterDetailRowProps) {
  const descriptionId = useId()
  const metaId = useId()
  const describedBy =
    [description ? descriptionId : null, meta ? metaId : null]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <Button
      type="button"
      variant="selectable"
      size="row"
      focusStyle="inset"
      data-slot="master-detail-row"
      data-selected={selected ? "true" : "false"}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onSelect}
      className={description ? "items-start" : "items-center"}
    >
      {leading ? (
        <span
          data-slot="master-detail-row-leading"
          className="flex shrink-0 items-center"
          aria-hidden="true"
        >
          {leading}
        </span>
      ) : null}
      <span data-slot="master-detail-row-content" className="min-w-0 flex-1">
        <span data-slot="master-detail-row-label" className="block truncate">
          {label}
        </span>
        {description ? (
          <span
            id={descriptionId}
            data-slot="master-detail-row-description"
            className="block truncate text-fine text-muted-foreground"
          >
            {description}
          </span>
        ) : null}
      </span>
      {meta ? (
        <span
          id={metaId}
          data-slot="master-detail-row-meta"
          className="flex shrink-0 items-center"
        >
          {meta}
        </span>
      ) : null}
    </Button>
  )
}

export { MasterDetailRow, type MasterDetailRowProps }
