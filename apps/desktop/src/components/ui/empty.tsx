import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const Empty = ({ className, ...props }: ComponentProps<"div">) => {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-6 text-center text-balance",
        className
      )}
      {...props}
    />
  );
}

const EmptyHeader = ({ className, ...props }: ComponentProps<"div">) => {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-2", className)}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "size-8 rounded-control bg-fill-quiet [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const EmptyMedia = ({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) => {
  return (
    <div
      data-slot="empty-media"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

const EmptyTitle = ({ className, ...props }: ComponentProps<"h2">) => {
  return (
    <h2
      data-slot="empty-title"
      className={cn("text-section font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

const EmptyDescription = ({ className, ...props }: ComponentProps<"p">) => {
  return (
    <p
      data-slot="empty-description"
      className={cn(
        "text-body text-muted-foreground [&>a:hover]:text-primary max-w-md [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  );
}

const EmptyContent = ({ className, ...props }: ComponentProps<"div">) => {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-3 text-balance",
        className
      )}
      {...props}
    />
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
};
