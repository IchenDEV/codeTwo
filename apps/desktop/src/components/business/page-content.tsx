import type { ReactNode } from "react"

interface PageContentProps {
  children: ReactNode
}

function PageContent({ children }: PageContentProps) {
  return (
    <div
      data-slot="page-content"
      className="mx-auto w-full max-w-4xl px-page pb-page-end pt-page-start sm:px-page-section sm:pt-page-start-wide"
    >
      {children}
    </div>
  )
}

export { PageContent, type PageContentProps }
