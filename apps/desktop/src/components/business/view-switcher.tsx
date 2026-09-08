import { Button } from "@/components/ui/button";

interface ViewSwitcherOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly count?: number;
  readonly disabled?: boolean;
}

interface ViewSwitcherProps<Value extends string> {
  label: string;
  value: Value;
  options: readonly ViewSwitcherOption<Value>[];
  onValueChange: (value: Value) => void;
}

function ViewSwitcher<Value extends string>({
  label,
  value,
  options,
  onValueChange,
}: ViewSwitcherProps<Value>) {
  return (
    <div
      data-slot="view-switcher"
      role="group"
      aria-label={label}
      className="gap-control-group flex max-w-full min-w-0 items-center overflow-x-auto overscroll-x-contain"
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Button
            key={option.value}
            type="button"
            variant="selectable"
            focusStyle="inset"
            data-selected={selected ? "true" : "false"}
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
          >
            <span>{option.label}</span>
            {option.count === undefined ? null : (
              <span className="tabular-nums">{option.count}</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export { ViewSwitcher, type ViewSwitcherOption, type ViewSwitcherProps };
