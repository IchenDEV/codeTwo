import type { ReactNode } from "react";

import { PageHeader } from "@/components/business/page-header";

interface SettingsPanelProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

const SettingsPanel = ({
  title,
  description,
  actions,
  children,
}: SettingsPanelProps) => {
  return (
    <div
      data-slot="settings-panel"
      className="gap-section flex min-w-0 flex-col"
    >
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}

export { SettingsPanel, type SettingsPanelProps };
