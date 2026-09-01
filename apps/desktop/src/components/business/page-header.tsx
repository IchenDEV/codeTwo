import type { ReactNode } from "react"

interface PageHeaderProps {
  title: ReactNode
  titleAccessory?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

function PageHeader({ title, titleAccessory, description, actions }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className="flex flex-col items-start justify-between gap-section sm:flex-row"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-module-inset">
          <h1 data-slot="page-header-title" className="text-page font-semibold tracking-tight">
            {title}
          </h1>
          {titleAccessory}
        </div>
        {description ? (
          <p
            data-slot="page-header-description"
            className="mt-module-inset max-w-2xl text-body text-content-muted"
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          data-slot="page-header-actions"
          className="flex w-full shrink-0 flex-wrap items-center gap-module-inset sm:w-auto"
        >
          {actions}
        </div>
      ) : null}
    </header>
  )
}

export { PageHeader, type PageHeaderProps }
