import type { ReactNode } from "react";

interface PageContentProps {
  children: ReactNode;
}

function PageContent({ children }: PageContentProps) {
  return (
    <div
      data-slot="page-content"
      className="px-page pb-page-end pt-page-start sm:px-page-section sm:pt-page-start-wide mx-auto w-full max-w-4xl"
    >
      {children}
    </div>
  );
}

export { PageContent, type PageContentProps };
