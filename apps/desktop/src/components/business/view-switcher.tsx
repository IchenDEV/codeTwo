import { Button } from "@/components/ui/button";

interface ViewSwitcherOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly count?: number;
  readonly disabled?: boolean;
}

interface ViewSwitcherProps<Value extends string> {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly ViewSwitcherOption<Value>[];
  readonly onValueChange: (value: Value) => void;
}

const ViewSwitcher = <Value extends string>({
  label,
  value,
  options,
  onValueChange,
}: ViewSwitcherProps<Value>) => (
  <div
    data-slot="view-switcher"
    role="group"
    aria-label={label}
    className="gap-control-group flex max-w-full min-w-0 items-center overflow-x-auto overscroll-x-contain"
  >
    {options.map((option) => {
      const isSelected = option.value === value;

      return (
        <Button
          key={option.value}
          type="button"
          variant="selectable"
          focusStyle="inset"
          data-selected={isSelected ? "true" : "false"}
          aria-pressed={isSelected}
          disabled={option.disabled}
          onClick={() => onValueChange(option.value)}
        >
          <span>{option.label}</span>
          {option.count !== undefined ? (
            <span className="tabular-nums">{option.count}</span>
          ) : null}
        </Button>
      );
    })}
  </div>
);

export { ViewSwitcher, type ViewSwitcherOption, type ViewSwitcherProps };
