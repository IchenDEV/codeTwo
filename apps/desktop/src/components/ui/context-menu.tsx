import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";

import { cn } from "@/lib/utils";

function ContextMenu(props: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger({ className, ...props }: ContextMenuPrimitive.Trigger.Props) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn(
        "transition-colors duration-(--ds-motion-feedback) ease-(--ds-ease-enter) data-[popup-open]:bg-(--ds-color-fill-hover)",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuContent({
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
  >) {
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
            "pop-layer z-50 max-h-(--available-height) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-(--ds-menu-radius) bg-(--ds-color-raised) p-(--ds-menu-padding) text-(--ds-color-text) shadow-(--ds-menu-elevation) outline-none",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuGroup(props: ContextMenuPrimitive.Group.Props) {
  return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />;
}

function ContextMenuItem({
  className,
  variant,
  ...props
}: ContextMenuPrimitive.Item.Props & { variant?: "default" | "destructive" }) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-variant={variant ?? "default"}
      className={cn(
        "relative flex min-h-(--ds-menu-item-height) cursor-default select-none items-center gap-2.5 rounded-(--ds-menu-item-radius) px-2 py-1.5 text-ui leading-4 outline-none transition-colors duration-(--ds-motion-feedback) ease-(--ds-ease-enter)",
        "focus:bg-(--ds-color-fill-hover) focus:text-(--ds-color-text) data-highlighted:bg-(--ds-color-fill-hover) data-highlighted:text-(--ds-color-text) data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--ds-icon-list) [&_svg:not([class*='text-'])]:text-muted-foreground",
        "data-[variant=destructive]:text-(--ds-color-destructive) data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:data-highlighted:bg-destructive/10",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: ContextMenuPrimitive.Separator.Props) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1.5 h-px bg-border", className)}
      {...props}
    />
  );
}

function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn("ml-auto font-mono text-cap tracking-widest text-muted-foreground", className)}
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
  ContextMenuSeparator,
  ContextMenuShortcut,
};
