import { CircleAlert } from "@/components/ui/icons"

import { ActivityOrb } from "@/components/ui/activity-orb"
import { Button } from "@/components/ui/button"

type LoadFeedbackProps =
  | { state: "loading"; message: string }
  | { state: "error"; message: string; retryLabel: string; onRetry: () => void }

function LoadFeedback(props: LoadFeedbackProps) {
  if (props.state === "loading") {
    return (
      <div
        data-slot="load-feedback"
        data-state="loading"
        role="status"
        className="flex min-h-0 w-full flex-1 items-center justify-center gap-control-group py-page text-center text-body text-content-muted"
      >
        <ActivityOrb state="searching" visualSize={14} aria-hidden="true" />
        <span data-slot="load-feedback-message">{props.message}</span>
      </div>
    )
  }

  return (
    <div
      data-slot="load-feedback"
      data-state="error"
      role="alert"
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-surface-inset px-page-section py-page text-center text-body text-content-muted"
    >
      <CircleAlert
        data-slot="load-feedback-icon"
        className="size-icon-list text-status-destructive"
        aria-hidden="true"
      />
      <p data-slot="load-feedback-message">{props.message}</p>
      <Button type="button" variant="secondary" onClick={props.onRetry}>
        {props.retryLabel}
      </Button>
    </div>
  )
}

export { LoadFeedback, type LoadFeedbackProps }
