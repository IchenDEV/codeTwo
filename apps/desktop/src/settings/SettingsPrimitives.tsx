import type { ReactNode } from "react";

import { SettingRow } from "@/components/business/setting-row";
import { SettingsPanel } from "@/components/business/settings-panel";
import { cn } from "@/lib/utils";

type RowProps = {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly hint?: ReactNode;
  readonly compact?: boolean;
  readonly className?: string;
  readonly controlClassName?: string;
  readonly children: ReactNode;
};

/**
Shared anatomy for every setting: description on the left, control on the right.
*/
export const Row = ({
  icon,
  label,
  hint,
  compact,
  className,
  controlClassName,
  children,
}: RowProps) => (
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

/**
Project settings share one trailing control lane so fields and actions stay on the same grid.
*/
export const ProjectRow = (props: RowProps) => (
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

export const GroupHeading = ({
  children,
}: {
  readonly children: ReactNode;
}) => (
  <h3 className="pt-section text-metadata text-muted-foreground font-semibold tracking-wider uppercase">
    {children}
  </h3>
);

export const Page = ({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) => (
  <SettingsPanel title={title} description={description}>
    {children}
  </SettingsPanel>
);
