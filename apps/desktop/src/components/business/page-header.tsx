import type { ReactNode } from "react";

interface PageHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}

function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className="gap-section flex flex-col items-start justify-between sm:flex-row"
    >
      <div className="min-w-0 flex-1">
        <h1
          data-slot="page-header-title"
          className="text-page font-semibold tracking-tight"
        >
          {title}
        </h1>
        {description == null ? null : (
          <p
            data-slot="page-header-description"
            className="mt-module-inset text-body text-content-muted max-w-2xl"
          >
            {description}
          </p>
        )}
      </div>
      {actions == null ? null : (
        <div
          data-slot="page-header-actions"
          className="gap-module-inset flex w-full shrink-0 flex-wrap items-center sm:w-auto"
        >
          {actions}
        </div>
      )}
    </header>
  );
}

export { PageHeader, type PageHeaderProps };
