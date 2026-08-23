import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

function SelectGroup(props: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-(--ds-radius-control) bg-fill-rest px-3 py-2 text-ui whitespace-nowrap transition-[color,box-shadow,background-color] duration-(--ds-motion-feedback) ease-(--ds-ease-enter) outline-none hover:bg-fill-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/30 data-placeholder:text-muted-foreground data-[popup-open]:bg-(--ds-color-fill-hover) data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--ds-icon-control) [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 opacity-50" />} />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  side = "bottom",
  sideOffset = 4,
  ...props
}: SelectPrimitive.Popup.Props & {
  position?: "item-aligned" | "popper"
} & Pick<SelectPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  const alignItemWithTrigger = position === "item-aligned"
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "pop-layer relative z-50 max-h-(--available-height) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-(--ds-menu-radius) bg-(--ds-color-raised) text-(--ds-color-text) shadow-(--ds-menu-elevation) outline-none",
            !alignItemWithTrigger && "w-(--anchor-width)",
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="p-(--ds-menu-padding)">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-hint text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-(--ds-menu-item-height) w-full cursor-default items-center gap-2 rounded-(--ds-menu-item-radius) py-1.5 pr-8 pl-2 text-ui leading-4 outline-hidden transition-colors duration-(--ds-motion-feedback) ease-(--ds-ease-enter) select-none data-highlighted:bg-(--ds-color-fill-hover) data-highlighted:text-(--ds-color-text) data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--ds-icon-control) [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center">
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return <SelectPrimitive.Separator data-slot="select-separator" className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)} {...props} />
}

function SelectScrollUpButton({ className, ...props }: SelectPrimitive.ScrollUpArrow.Props) {
  return <SelectPrimitive.ScrollUpArrow data-slot="select-scroll-up-button" className={cn("flex w-full cursor-default items-center justify-center py-1", className)} {...props}><ChevronUpIcon className="size-4" /></SelectPrimitive.ScrollUpArrow>
}

function SelectScrollDownButton({ className, ...props }: SelectPrimitive.ScrollDownArrow.Props) {
  return <SelectPrimitive.ScrollDownArrow data-slot="select-scroll-down-button" className={cn("flex w-full cursor-default items-center justify-center py-1", className)} {...props}><ChevronDownIcon className="size-4" /></SelectPrimitive.ScrollDownArrow>
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
