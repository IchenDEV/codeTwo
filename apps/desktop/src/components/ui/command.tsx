import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "@/components/ui/icons";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const Command = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) => {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "rounded-module bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden",
        className
      )}
      {...props}
    />
  );
}

const CommandDialog = ({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  readonly children: React.ReactNode;
  readonly title?: string;
  readonly description?: string;
  readonly className?: string;
  readonly showCloseButton?: boolean;
}) => {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command
          label={title}
          className="**:data-[slot=command-input-wrapper]:h-control-field [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]_svg]:size-icon-control [&_[cmdk-input]]:h-control-field [&_[cmdk-item]_svg]:size-icon-control bg-transparent [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

const CommandInput = ({
  className,
  autoFocus = true,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) => {
  return (
    <div
      data-slot="command-input-wrapper"
      className="h-control-field flex items-center gap-2 px-3"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-control-field rounded-control text-body placeholder:text-muted-foreground flex w-full bg-transparent py-3 outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        autoFocus={autoFocus}
        {...props}
      />
    </div>
  );
}

const CommandList = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) => {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-96 scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  );
}

const CommandEmpty = ({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) => {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="text-body py-6 text-center"
      {...props}
    />
  );
}

const CommandGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) => {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-metadata [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  );
}

const CommandSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) => {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  );
}

const CommandItem = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) => {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "rounded-menu-item text-body data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 px-2 py-1.5 outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

const CommandShortcut = ({
  className,
  ...props
}: React.ComponentProps<"span">) => {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-callout text-muted-foreground ml-auto max-w-2/5 truncate",
        className
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
