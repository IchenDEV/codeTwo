import * as React from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const cardVariants = cva("flex flex-col rounded-card text-card-foreground", {
  defaultVariants: {
    density: "default",
    variant: "surface",
  },
  variants: {
    density: {
      compact: "gap-2 py-3",
      default: "gap-6 py-6",
    },
    variant: {
      flat: "bg-fill-quiet shadow-none",
      raised: "bg-raised shadow-raised",
      surface: "bg-card shadow-surface",
    },
  },
});

const Card = ({
  className,
  variant,
  density,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) => (
  <div
    data-slot="card"
    data-variant={variant ?? "surface"}
    data-density={density ?? "default"}
    className={cn(cardVariants({ density, variant }), className)}
    {...props}
  />
);

const CardHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="card-header"
    className={cn(
      "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
      className
    )}
    {...props}
  />
);

const CardTitle = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="card-title"
    className={cn("text-dialog font-semibold", className)}
    {...props}
  />
);

const CardDescription = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    data-slot="card-description"
    className={cn("text-callout text-muted-foreground", className)}
    {...props}
  />
);

const CardAction = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="card-action"
    className={cn(
      "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
      className
    )}
    {...props}
  />
);

const CardContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div data-slot="card-content" className={cn("px-6", className)} {...props} />
);

const CardFooter = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="card-footer"
    className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
    {...props}
  />
);

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
};
