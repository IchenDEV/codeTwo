import { useId } from "react";

import {
  SettingRow,
  type SettingRowSurface,
} from "@/components/business/setting-row";
import { Switch } from "@/components/ui/switch";

interface SettingToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  surface?: SettingRowSurface;
  onCheckedChange: (checked: boolean) => void;
}

function SettingToggle({
  label,
  description,
  checked,
  disabled = false,
  surface = "plain",
  onCheckedChange,
}: SettingToggleProps) {
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
}

export { SettingToggle, type SettingToggleProps };
