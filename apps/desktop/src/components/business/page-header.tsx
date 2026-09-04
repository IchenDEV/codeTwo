import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  titleAccessory?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

function PageHeader({
  title,
  titleAccessory,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className="gap-section flex flex-col items-start justify-between sm:flex-row"
    >
      <div className="min-w-0 flex-1">
        <div className="gap-module-inset flex items-center">
          <h1
            data-slot="page-header-title"
            className="text-page font-semibold tracking-tight"
          >
            {title}
          </h1>
          {titleAccessory}
        </div>
        {description ? (
          <p
            data-slot="page-header-description"
            className="mt-module-inset text-body text-content-muted max-w-2xl"
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          data-slot="page-header-actions"
          className="gap-module-inset flex w-full shrink-0 flex-wrap items-center sm:w-auto"
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export { PageHeader, type PageHeaderProps };
