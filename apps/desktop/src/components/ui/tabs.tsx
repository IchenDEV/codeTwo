"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { Liquid } from "liquid-gooey"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type RefObject,
} from "react"

import { cn } from "@/lib/utils"

type IndicatorKind = "pill" | "line"

interface IndicatorBox {
  height: number
  radius: string
  visible: boolean
  width: number
  x: number
  y: number
}

const EMPTY_INDICATOR: IndicatorBox = {
  height: 0,
  radius: "0px",
  visible: false,
  width: 0,
  x: 0,
  y: 0,
}
const LIQUID_AVAILABLE = typeof ResizeObserver !== "undefined"

function rounded(value: number) {
  return Math.round(value * 2) / 2
}

function useLiquidIndicator(
  containerRef: RefObject<HTMLDivElement | null>,
  activeSelector: string,
  kind: IndicatorKind,
) {
  const [box, setBox] = useState<IndicatorBox>(EMPTY_INDICATOR)

  const measure = useCallback(() => {
    const container = containerRef.current
    const active = container?.querySelector<HTMLElement>(activeSelector)
    if (!container || !active || active.getClientRects().length === 0) {
      setBox((current) => current.visible ? EMPTY_INDICATOR : current)
      return
    }

    const containerRect = container.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const vertical = container.closest('[data-orientation="vertical"]') !== null
    const next = kind === "line"
      ? vertical
        ? {
            height: rounded(activeRect.height),
            radius: "999px",
            visible: true,
            width: 2,
            x: rounded(containerRect.width - 2),
            y: rounded(activeRect.top - containerRect.top),
          }
        : {
            height: 2,
            radius: "999px",
            visible: true,
            width: rounded(activeRect.width),
            x: rounded(activeRect.left - containerRect.left),
            y: rounded(containerRect.height - 2),
          }
      : {
          height: rounded(activeRect.height),
          radius: getComputedStyle(active).borderRadius || "6px",
          visible: true,
          width: rounded(activeRect.width),
          x: rounded(activeRect.left - containerRect.left),
          y: rounded(activeRect.top - containerRect.top),
        }

    setBox((current) =>
      current.height === next.height &&
      current.radius === next.radius &&
      current.visible === next.visible &&
      current.width === next.width &&
      current.x === next.x &&
      current.y === next.y
        ? current
        : next,
    )
  }, [activeSelector, containerRef, kind])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    let frame = 0
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const mutationObserver = new MutationObserver(scheduleMeasure)
    mutationObserver.observe(container, {
      attributes: true,
      attributeFilter: ["aria-current", "aria-selected", "class", "data-active"],
      characterData: true,
      childList: true,
      subtree: true,
    })
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleMeasure)
    resizeObserver?.observe(container)
    container.querySelectorAll<HTMLElement>("button, [role=tab]").forEach((item) =>
      resizeObserver?.observe(item),
    )
    measure()

    return () => {
      cancelAnimationFrame(frame)
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
    }
  }, [containerRef, measure])

  return box
}

function LiquidIndicator({
  box,
}: {
  box: IndicatorBox
}) {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  if (!box.visible) return null
  if (reducedMotion) {
    return (
      <Liquid.Item
        className="pointer-events-none absolute left-0 top-0"
        x={box.x}
        y={box.y}
        transition={{ duration: 0, ease: "linear" }}
      >
        <span
          aria-hidden="true"
          className="block"
          style={{
            borderRadius: box.radius,
            height: box.height,
            width: box.width,
          }}
        />
      </Liquid.Item>
    )
  }

  return (
    <Liquid.Item
      effect="move"
      move={{ springiness: 0.68, wobble: 0.22, stretch: 0.38, trail: 0.42 }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 block"
        style={{
          borderRadius: box.radius,
          height: box.height,
          transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
          width: box.width,
        }}
      />
    </Liquid.Item>
  )
}

interface LiquidSelectionGroupProps extends HTMLAttributes<HTMLDivElement> {
  activeSelector?: string
  fill?: string
  indicator?: IndicatorKind
  shadow?: string
}

function LiquidSelectionGroup({
  activeSelector = '[aria-selected="true"]',
  children,
  className,
  fill = "var(--secondary)",
  indicator = "pill",
  shadow,
  ...props
}: LiquidSelectionGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const box = useLiquidIndicator(containerRef, activeSelector, indicator)

  if (!LIQUID_AVAILABLE) {
    return (
      <div {...props} ref={containerRef} className={cn("relative", className)}>
        {children}
      </div>
    )
  }

  return (
    <Liquid
      {...props}
      ref={containerRef}
      blur={indicator === "line" ? 2.5 : 3.5}
      contrast={20}
      fill={fill}
      filterPadding={12}
      shadow={shadow}
      className={cn("relative", className)}
    >
      <LiquidIndicator box={box} />
      {children}
    </Liquid>
  )
}

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative isolate inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
        toolbar: "gap-1 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:data-[variant=toolbar]:h-(--ds-control-normal)",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  children,
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props &
  VariantProps<typeof tabsListVariants>) {
  const listRef = useRef<HTMLDivElement>(null)
  const indicator = variant === "line" ? "line" : "pill"
  const box = useLiquidIndicator(listRef, "[data-active]", indicator)
  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {LIQUID_AVAILABLE && (
        <Liquid
          aria-hidden="true"
          blur={indicator === "line" ? 2.5 : 3.5}
          contrast={20}
          fill={variant === "line" ? "var(--foreground)" : variant === "toolbar" ? "var(--secondary)" : "var(--background)"}
          filterPadding={12}
          className="pointer-events-none absolute inset-0"
        >
          <LiquidIndicator box={box} />
        </Liquid>
      )}
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-ui font-medium whitespace-nowrap text-foreground/60 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=default]/tabs-list:data-active:text-foreground dark:group-data-[variant=default]/tabs-list:data-active:text-foreground",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:text-foreground dark:group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "group-data-[variant=toolbar]/tabs-list:h-full group-data-[variant=toolbar]/tabs-list:flex-none group-data-[variant=toolbar]/tabs-list:rounded-(--ds-radius-control) group-data-[variant=toolbar]/tabs-list:px-2.5 group-data-[variant=toolbar]/tabs-list:py-0 group-data-[variant=toolbar]/tabs-list:text-muted-foreground group-data-[variant=toolbar]/tabs-list:hover:bg-accent group-data-[variant=toolbar]/tabs-list:data-active:bg-transparent group-data-[variant=toolbar]/tabs-list:data-active:text-primary group-data-[variant=toolbar]/tabs-list:data-active:shadow-none group-data-[variant=toolbar]/tabs-list:data-active:hover:bg-transparent dark:group-data-[variant=toolbar]/tabs-list:data-active:bg-transparent",
        !LIQUID_AVAILABLE && "group-data-[variant=default]/tabs-list:data-active:bg-background group-data-[variant=toolbar]/tabs-list:data-active:bg-secondary dark:group-data-[variant=toolbar]/tabs-list:data-active:bg-secondary",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { LiquidSelectionGroup, Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
