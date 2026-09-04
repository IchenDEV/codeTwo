import type { ReactNode } from "react";

import { SettingRow } from "@/components/business/setting-row";
import { SettingsPanel } from "@/components/business/settings-panel";
import { cn } from "@/lib/utils";

interface RowProps {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly hint?: ReactNode;
  readonly compact?: boolean;
  readonly className?: string;
  readonly controlClassName?: string;
  readonly children: ReactNode;
}

export function Row({
  icon,
  label,
  hint,
  compact,
  className,
  controlClassName,
  children,
}: RowProps) {
  return (
    <SettingRow
      label={label}
      description={hint}
      leading={icon}
      density={compact === true ? "compact" : "default"}
      className={cn("settings-row", className)}
      controlClassName={cn("settings-row-control", controlClassName)}
    >
      {children}
    </SettingRow>
  );
}

export function ProjectRow(props: RowProps) {
  return (
    <SettingRow
      label={props.label}
      description={props.hint}
      leading={props.icon}
      density={props.compact === true ? "compact" : "default"}
      controlSize="wide"
      className={cn("project-settings-row", props.className)}
      controlClassName={cn("project-settings-control", props.controlClassName)}
    >
      {props.children}
    </SettingRow>
  );
}

export function GroupHeading({ children }: { readonly children: ReactNode }) {
  return (
    <h3 className="pt-section text-metadata text-muted-foreground font-semibold tracking-wider uppercase">
      {children}
    </h3>
  );
}

export function Page({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <SettingsPanel title={title} description={description}>
      {children}
    </SettingsPanel>
  );
}
