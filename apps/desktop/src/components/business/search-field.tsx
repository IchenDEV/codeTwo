import { useId, useRef } from "react";
import type { ChangeEventHandler, ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Search, X } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchFieldBaseProps extends Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "onChange" | "size" | "className"
> {
  label: string;
  value: string;
  className?: string;
  inputClassName?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

type SearchFieldProps = SearchFieldBaseProps &
  (
    | { clearLabel: string; onClear: () => void }
    | { clearLabel?: undefined; onClear?: undefined }
  );

function SearchField({
  label,
  clearLabel,
  onClear,
  value,
  className,
  inputClassName,
  onChange,
  ...inputProps
}: SearchFieldProps) {
  const generatedId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = generatedId;
  const clearable = onClear !== undefined && value.length > 0;

  return (
    <div
      data-slot="search-field"
      data-custom-clear={onClear ? "true" : undefined}
      className={cn("relative", className)}
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="start-surface-inset text-muted-foreground pointer-events-none absolute top-1/2 size-4 -translate-y-1/2"
      />
      <Input
        ref={inputRef}
        id={id}
        type="search"
        size="compact"
        aria-label={label}
        value={value}
        onChange={onChange}
        className={cn(
          clearable ? "ps-page-section pe-page-section" : "ps-page-section",
          inputClassName
        )}
        {...inputProps}
      />
      {clearable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="end-control-group absolute top-1/2 -translate-y-1/2"
          aria-label={clearLabel}
          onClick={() => {
            onClear?.();
            inputRef.current?.focus();
          }}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

export { SearchField, type SearchFieldProps };
