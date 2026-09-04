import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { ChevronRight } from "@/components/ui/icons";

import { cn } from "@/lib/utils";

const contextMenuItemStyles =
  "relative flex min-h-menu-item cursor-default select-none items-center gap-module-inset rounded-menu-item px-2 py-1.5 text-body outline-none transition-colors duration-feedback ease-enter focus:bg-fill-hover focus:text-content data-highlighted:bg-fill-hover data-highlighted:text-content data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon-list [&_svg:not([class*='text-'])]:text-muted-foreground";

const ContextMenu = (props: ContextMenuPrimitive.Root.Props) => {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

const ContextMenuTrigger = ({
  className,
  ...props
}: ContextMenuPrimitive.Trigger.Props) => {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn(
        "duration-feedback ease-enter data-[popup-open]:bg-fill-hover transition-colors",
        className
      )}
      {...props}
    />
  );
}

const ContextMenuContent = ({
  className,
  align = "start",
  alignOffset = 4,
  side = "right",
  sideOffset = 0,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) => {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            "pop-layer raised-material rounded-menu p-menu text-content shadow-menu z-50 max-h-(--available-height) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto outline-none",
            className
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

const ContextMenuGroup = (props: ContextMenuPrimitive.Group.Props) => {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  );
}

const ContextMenuSub = (props: ContextMenuPrimitive.SubmenuRoot.Props) => {
  return (
    <ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />
  );
}

const ContextMenuItem = ({
  className,
  variant,
  ...props
}: ContextMenuPrimitive.Item.Props & { readonly variant?: "default" | "destructive" }) => {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-variant={variant ?? "default"}
      className={cn(
        contextMenuItemStyles,
        "data-[variant=destructive]:text-status-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:data-highlighted:bg-destructive/10",
        className
      )}
      {...props}
    />
  );
}

const ContextMenuSubTrigger = ({
  className,
  children,
  ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props) => {
  return (
    <ContextMenuPrimitive.SubmenuTrigger
      data-slot="context-menu-sub-trigger"
      className={cn(
        contextMenuItemStyles,
        "data-[popup-open]:bg-fill-hover data-[popup-open]:text-content",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight
        className="text-muted-foreground ml-auto size-3.5"
        aria-hidden="true"
      />
    </ContextMenuPrimitive.SubmenuTrigger>
  );
}

const ContextMenuSubContent = ({
  className,
  align = "start",
  alignOffset = -4,
  side = "right",
  sideOffset = 2,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) => {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-sub-content"
          className={cn(
            "pop-layer raised-material rounded-menu p-menu text-content shadow-menu z-50 max-h-(--available-height) min-w-44 origin-(--transform-origin) overflow-x-hidden overflow-y-auto outline-none",
            className
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

const ContextMenuSeparator = ({
  className,
  ...props
}: ContextMenuPrimitive.Separator.Props) => {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("bg-border -mx-1 my-1.5 h-px", className)}
      {...props}
    />
  );
}

const ContextMenuShortcut = ({
  className,
  ...props
}: React.ComponentProps<"span">) => {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "text-caption text-muted-foreground ml-auto font-mono tracking-widest",
        className
      )}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuSeparator,
  ContextMenuShortcut,
};
