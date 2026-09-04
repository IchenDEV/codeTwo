import { useId, type ReactNode } from "react";

interface SettingsSectionProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly headingId?: string;
}

const SettingsSection = ({
  title,
  description,
  actions,
  children,
  headingId,
}: SettingsSectionProps) => {
  const generatedHeadingId = useId();
  const accessibleHeadingId = headingId ?? generatedHeadingId;

  return (
    <section
      data-slot="settings-section"
      className="min-w-0"
      aria-labelledby={accessibleHeadingId}
    >
      <header
        data-slot="settings-section-header"
        className="gap-section flex min-w-0 flex-wrap items-start justify-between"
      >
        <div className="min-w-48 flex-1">
          <h2
            id={accessibleHeadingId}
            data-slot="settings-section-title"
            className="text-body text-content font-medium"
          >
            {title}
          </h2>
          {description ? (
            <p
              data-slot="settings-section-description"
              className="mt-inline text-metadata text-content-muted"
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            data-slot="settings-section-actions"
            className="gap-inline flex max-w-full shrink-0 flex-wrap items-center"
          >
            {actions}
          </div>
        ) : null}
      </header>
      <div
        data-slot="settings-section-content"
        className="mt-surface-inset min-w-0"
      >
        {children}
      </div>
    </section>
  );
}

export { SettingsSection, type SettingsSectionProps };
