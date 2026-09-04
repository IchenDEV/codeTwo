import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon } from "@/components/ui/icons";

import { cn } from "@/lib/utils";

const menuItemStyles =
  "group/dropdown-menu-item relative flex min-h-menu-item cursor-default select-none items-center gap-module-inset rounded-menu-item px-2 py-1.5 text-body outline-none transition-colors duration-feedback ease-enter focus:bg-fill-hover focus:text-content data-highlighted:bg-fill-hover data-highlighted:text-content data-disabled:pointer-events-none data-disabled:opacity-50 data-[variant=destructive]:text-status-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:data-highlighted:bg-destructive/10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon-list [&_svg:not([class*='text-'])]:text-muted-foreground";

const DropdownMenu = ({ ...props }: MenuPrimitive.Root.Props) => (
  <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
);

const DropdownMenuTrigger = ({
  className,
  ...props
}: MenuPrimitive.Trigger.Props) => (
  <MenuPrimitive.Trigger
    data-slot="dropdown-menu-trigger"
    className={cn(
      "duration-feedback ease-enter data-[popup-open]:bg-fill-hover data-[popup-open]:text-content transition-colors",
      className
    )}
    {...props}
  />
);

const DropdownMenuContent = ({
  className,
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Positioner
      className="isolate z-50 outline-none"
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
    >
      <MenuPrimitive.Popup
        data-slot="dropdown-menu-content"
        className={cn(
          "pop-layer raised-material rounded-menu p-menu text-content shadow-menu z-50 max-h-(--available-height) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto outline-none",
          className
        )}
        {...props}
      />
    </MenuPrimitive.Positioner>
  </MenuPrimitive.Portal>
);

const DropdownMenuGroup = ({ ...props }: MenuPrimitive.Group.Props) => (
  <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
);

const DropdownMenuRadioGroup = ({
  ...props
}: MenuPrimitive.RadioGroup.Props) => (
  <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
);

const DropdownMenuItem = ({
  className,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  readonly variant?: "default" | "destructive";
}) => (
  <MenuPrimitive.Item
    data-slot="dropdown-menu-item"
    data-variant={variant}
    className={cn(menuItemStyles, className)}
    {...props}
  />
);

const DropdownMenuRadioItem = ({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItem.Props) => (
  <MenuPrimitive.RadioItem
    data-slot="dropdown-menu-radio-item"
    className={cn(menuItemStyles, className)}
    {...props}
  >
    {children}
    <MenuPrimitive.RadioItemIndicator
      data-slot="dropdown-menu-radio-item-indicator"
      className="size-icon-list text-content ml-auto flex shrink-0 items-center justify-center"
    >
      <CheckIcon />
    </MenuPrimitive.RadioItemIndicator>
  </MenuPrimitive.RadioItem>
);

const DropdownMenuCheckboxItem = ({
  className,
  children,
  ...props
}: MenuPrimitive.CheckboxItem.Props) => (
  <MenuPrimitive.CheckboxItem
    data-slot="dropdown-menu-checkbox-item"
    className={cn(menuItemStyles, className)}
    {...props}
  >
    {children}
    <MenuPrimitive.CheckboxItemIndicator
      data-slot="dropdown-menu-checkbox-item-indicator"
      className="size-icon-list text-content ml-auto flex shrink-0 items-center justify-center"
    >
      <CheckIcon />
    </MenuPrimitive.CheckboxItemIndicator>
  </MenuPrimitive.CheckboxItem>
);

const DropdownMenuItemText = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    data-slot="dropdown-menu-item-text"
    className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
    {...props}
  />
);

const DropdownMenuItemDescription = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    data-slot="dropdown-menu-item-description"
    className={cn("text-callout text-muted-foreground truncate", className)}
    {...props}
  />
);

const DropdownMenuSeparator = ({
  className,
  ...props
}: MenuPrimitive.Separator.Props) => (
  <MenuPrimitive.Separator
    data-slot="dropdown-menu-separator"
    className={cn("bg-border -mx-1 my-1.5 h-px", className)}
    {...props}
  />
);

/**
Right-aligned shortcut hint on a menu row.
*/
const DropdownMenuShortcut = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    className={cn(
      "text-caption text-muted-foreground ml-auto shrink-0 font-mono",
      className
    )}
    {...props}
  />
);

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemDescription,
  DropdownMenuItemText,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
};
