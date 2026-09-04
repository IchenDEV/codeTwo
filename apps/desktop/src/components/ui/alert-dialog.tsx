"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const AlertDialog = (props: AlertDialogPrimitive.Root.Props) => {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

const AlertDialogTrigger = (props: AlertDialogPrimitive.Trigger.Props) => {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

const AlertDialogPortal = (props: AlertDialogPrimitive.Portal.Props) => {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

const AlertDialogOverlay = ({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) => {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn("overlay-layer bg-overlay fixed inset-0 z-50", className)}
      {...props}
    />
  );
}

const AlertDialogContent = ({
  className,
  ...props
}: AlertDialogPrimitive.Popup.Props) => {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "dialog-layer rounded-modal bg-modal shadow-modal fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 p-6 outline-none",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

const AlertDialogHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

const AlertDialogFooter = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

const AlertDialogTitle = ({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props) => {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-dialog font-semibold", className)}
      {...props}
    />
  );
}

const AlertDialogDescription = ({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) => {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  );
}

const AlertDialogAction = ({
  className,
  ...props
}: React.ComponentProps<typeof Button>) => {
  return (
    <Button
      data-slot="alert-dialog-action"
      className={cn(className)}
      {...props}
    />
  );
}

const AlertDialogCancel = ({
  className,
  variant = "outline",
  size = "default",
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) => {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
