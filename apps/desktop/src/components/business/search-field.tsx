import { useId, useRef, type ChangeEventHandler } from "react"
import { Search, X } from "@/components/ui/icons"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
interface SearchFieldBaseProps {
  label: string
  value: string
  placeholder?: string
  autoFocus?: boolean
  onChange: ChangeEventHandler<HTMLInputElement>
}

type SearchFieldProps = SearchFieldBaseProps &
  (
    | { clearLabel: string; onClear: () => void }
    | { clearLabel?: undefined; onClear?: undefined }
  )

function SearchField({
  label,
  clearLabel,
  onClear,
  value,
  placeholder,
  autoFocus,
  onChange,
}: SearchFieldProps) {
  const generatedId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const id = generatedId
  const clearable = onClear !== undefined && value.length > 0

  return (
    <div
      data-slot="search-field"
      data-custom-clear={onClear ? "true" : undefined}
      className="relative"
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-surface-inset top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        id={id}
        type="search"
        size="compact"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={onChange}
        className={clearable ? "ps-page-section pe-page-section" : "ps-page-section"}
      />
      {clearable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute end-control-group top-1/2 -translate-y-1/2"
          aria-label={clearLabel}
          onClick={() => {
            onClear?.()
            inputRef.current?.focus()
          }}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}

export { SearchField, type SearchFieldProps }
