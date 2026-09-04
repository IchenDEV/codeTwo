import { useId } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MasterDetailRowProps {
  readonly label: string;
  readonly description?: ReactNode;
  readonly leading?: ReactNode;
  readonly meta?: ReactNode;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly descriptionClassName?: string;
  readonly onSelect: () => void;
}

function MasterDetailRow({
  label,
  description,
  leading,
  meta,
  selected,
  disabled = false,
  className,
  descriptionClassName,
  onSelect,
}: MasterDetailRowProps) {
  const descriptionId = useId();
  const metaId = useId();
  const describedBy =
    [description == null ? null : descriptionId, meta == null ? null : metaId]
      .filter(Boolean)
      .join(" ") || undefined;

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
      className={cn(
        description == null ? "items-center" : "items-start",
        className
      )}
    >
      {leading == null ? null : (
        <span
          data-slot="master-detail-row-leading"
          className="flex shrink-0 items-center"
          aria-hidden="true"
        >
          {leading}
        </span>
      )}
      <span data-slot="master-detail-row-content" className="min-w-0 flex-1">
        <span data-slot="master-detail-row-label" className="block truncate">
          {label}
        </span>
        {description == null ? null : (
          <span
            id={descriptionId}
            data-slot="master-detail-row-description"
            className={cn(
              "text-callout text-muted-foreground mt-1 block truncate",
              descriptionClassName
            )}
          >
            {description}
          </span>
        )}
      </span>
      {meta == null ? null : (
        <span
          id={metaId}
          data-slot="master-detail-row-meta"
          className="flex shrink-0 items-center"
        >
          {meta}
        </span>
      )}
    </Button>
  );
}

export { MasterDetailRow, type MasterDetailRowProps };
