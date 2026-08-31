"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

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
  "group/tabs-list relative isolate inline-flex w-fit items-center justify-center rounded-control p-optical text-muted-foreground group-data-[orientation=horizontal]/tabs:h-control-field group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
        toolbar: "gap-1 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:data-[variant=toolbar]:h-control",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
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
        "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-control px-2 py-1 text-body font-medium whitespace-nowrap text-foreground/60 transition-[color,background-color,box-shadow] group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=default]/tabs-list:data-active:bg-background group-data-[variant=default]/tabs-list:data-active:text-foreground dark:group-data-[variant=default]/tabs-list:data-active:text-foreground",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:after:pointer-events-none group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-1 group-data-[variant=line]/tabs-list:after:bottom-0 group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:after:origin-center group-data-[variant=line]/tabs-list:after:scale-x-0 group-data-[variant=line]/tabs-list:after:rounded-full group-data-[variant=line]/tabs-list:after:bg-foreground group-data-[variant=line]/tabs-list:after:opacity-0 group-data-[variant=line]/tabs-list:after:transition-[transform,opacity] group-data-[variant=line]/tabs-list:after:content-[''] group-data-[variant=line]/tabs-list:data-active:text-foreground group-data-[variant=line]/tabs-list:data-active:after:scale-x-100 group-data-[variant=line]/tabs-list:data-active:after:opacity-100 motion-reduce:after:transition-none dark:group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "group-data-[variant=toolbar]/tabs-list:h-full group-data-[variant=toolbar]/tabs-list:flex-none group-data-[variant=toolbar]/tabs-list:rounded-control group-data-[variant=toolbar]/tabs-list:px-module-inset group-data-[variant=toolbar]/tabs-list:py-0 group-data-[variant=toolbar]/tabs-list:text-muted-foreground group-data-[variant=toolbar]/tabs-list:hover:bg-accent group-data-[variant=toolbar]/tabs-list:data-active:bg-secondary group-data-[variant=toolbar]/tabs-list:data-active:text-primary group-data-[variant=toolbar]/tabs-list:data-active:shadow-none group-data-[variant=toolbar]/tabs-list:data-active:hover:bg-secondary dark:group-data-[variant=toolbar]/tabs-list:data-active:bg-secondary",
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

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
