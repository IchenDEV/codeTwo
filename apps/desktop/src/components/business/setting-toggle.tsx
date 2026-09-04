import { useId } from "react";

import { SettingRow } from "@/components/business/setting-row";
import type { SettingRowSurface } from "@/components/business/setting-row";
import { Switch } from "@/components/ui/switch";

interface SettingToggleProps {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly surface?: SettingRowSurface;
  readonly onCheckedChange: (isChecked: boolean) => void;
}

const SettingToggle = ({
  label,
  description,
  checked,
  disabled = false,
  surface = "plain",
  onCheckedChange,
}: SettingToggleProps) => {
  const controlId = useId();
  const descriptionId = description ? `${controlId}-description` : undefined;

  return (
    <div
      data-slot="setting-toggle"
      data-surface={surface}
      data-disabled={disabled ? "true" : undefined}
      className="contents"
    >
      <SettingRow
        label={label}
        description={description}
        disabled={disabled}
        surface={surface}
        controlId={controlId}
      >
        <Switch
          id={controlId}
          checked={checked}
          disabled={disabled}
          aria-labelledby={`${controlId}-label`}
          aria-describedby={descriptionId}
          onCheckedChange={onCheckedChange}
        />
      </SettingRow>
    </div>
  );
};

export { SettingToggle, type SettingToggleProps };
