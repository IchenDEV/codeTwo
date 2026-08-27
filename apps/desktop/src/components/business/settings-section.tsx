import { useId, type ReactNode } from "react"

interface SettingsSectionProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  headingId?: string
}

function SettingsSection({
  title,
  description,
  actions,
  children,
  headingId,
}: SettingsSectionProps) {
  const generatedHeadingId = useId()
  const accessibleHeadingId = headingId ?? generatedHeadingId

  return (
    <section
      data-slot="settings-section"
      className="min-w-0"
      aria-labelledby={accessibleHeadingId}
    >
      <header
        data-slot="settings-section-header"
        className="flex min-w-0 flex-wrap items-start justify-between gap-section"
      >
        <div className="min-w-48 flex-1">
          <h2
            id={accessibleHeadingId}
            data-slot="settings-section-title"
            className="text-body font-medium text-content"
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
            className="flex max-w-full shrink-0 flex-wrap items-center gap-inline"
          >
            {actions}
          </div>
        ) : null}
      </header>
      <div data-slot="settings-section-content" className="mt-surface-inset min-w-0">
        {children}
      </div>
    </section>
  )
}

export { SettingsSection, type SettingsSectionProps }
