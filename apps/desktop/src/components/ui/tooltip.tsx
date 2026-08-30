import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const TOOLTIP_FIRST_OPEN_DELAY = 600
const TOOLTIP_INSTANT_PHASE_TIMEOUT = 400

function TooltipProvider({
  delay = TOOLTIP_FIRST_OPEN_DELAY,
  timeout = TOOLTIP_INSTANT_PHASE_TIMEOUT,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      timeout={timeout}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipPrimitive.Trigger.Props>(
  (props, ref) => (
    <TooltipPrimitive.Trigger ref={ref} data-slot="tooltip-trigger" {...props} />
  ),
)
TooltipTrigger.displayName = "TooltipTrigger"

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "pop-layer z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-control bg-raised px-2 py-1 text-metadata text-balance text-content shadow-raised",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 bg-raised fill-raised data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

interface TooltipButtonProps extends React.ComponentProps<typeof Button> {
  label: string
  tooltip?: React.ReactNode
  tooltipSide?: TooltipPrimitive.Positioner.Props["side"]
}

/** One accessible name and one themed tooltip for icon-only product actions. */
const TooltipButton = React.forwardRef<HTMLButtonElement, TooltipButtonProps>(
  ({ label, tooltip = label, tooltipSide = "top", ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger
        render={<Button ref={ref} type="button" aria-label={label} {...props} />}
      />
      <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
    </Tooltip>
  ),
)
TooltipButton.displayName = "TooltipButton"

export {
  TOOLTIP_FIRST_OPEN_DELAY,
  TOOLTIP_INSTANT_PHASE_TIMEOUT,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipButton,
  TooltipProvider,
}
