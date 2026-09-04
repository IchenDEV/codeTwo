import type { ReactNode } from "react";

import { SettingRow } from "@/components/business/setting-row";
import { SettingsPanel } from "@/components/business/settings-panel";
import { cn } from "@/lib/utils";

type RowProps = {
  icon?: ReactNode;
  label: string;
  hint?: ReactNode;
  compact?: boolean;
  className?: string;
  controlClassName?: string;
  children: ReactNode;
};

/** Shared anatomy for every setting: description on the left, control on the right. */
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
      density={compact ? "compact" : "default"}
      className={cn("settings-row", className)}
      controlClassName={cn("settings-row-control", controlClassName)}
    >
      {children}
    </SettingRow>
  );
}

/** Project settings share one trailing control lane so fields and actions stay on the same grid. */
export function ProjectRow(props: RowProps) {
  return (
    <SettingRow
      label={props.label}
      description={props.hint}
      leading={props.icon}
      density={props.compact ? "compact" : "default"}
      controlSize="wide"
      className={cn("project-settings-row", props.className)}
      controlClassName={cn("project-settings-control", props.controlClassName)}
    >
      {props.children}
    </SettingRow>
  );
}

export function GroupHeading({ children }: { children: ReactNode }) {
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
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <SettingsPanel title={title} description={description}>
      {children}
    </SettingsPanel>
  );
}
