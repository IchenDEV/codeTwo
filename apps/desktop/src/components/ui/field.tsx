import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & {
  readonly variant?: "legend" | "label";
}) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "data-[variant=label]:text-body data-[variant=legend]:text-dialog mb-1.5 font-medium",
        className
      )}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group gap-section @container/field-group flex w-full flex-col",
        className
      )}
      {...props}
    />
  );
}

const fieldVariants = cva(
  "group/field data-[invalid=true]:text-destructive flex w-full gap-2",
  {
    defaultVariants: { orientation: "vertical" },
    variants: {
      orientation: {
        horizontal:
          "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto",
        responsive:
          "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:*:data-[slot=field-label]:flex-auto",
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      },
    },
  }
);

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "group/field-content flex flex-1 flex-col gap-0.5",
        className
      )}
      {...props}
    />
  );
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "text-body flex w-fit items-center gap-2 font-medium",
        className
      )}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-callout text-muted-foreground text-start", className)}
      {...props}
    />
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  readonly errors?: ({ message?: string } | undefined)[];
}) {
  const content = (() => {
    if (children != null) {
      return children;
    }
    const unique = [
      ...new Map(
        (errors ?? []).map((error) => [error?.message, error])
      ).values(),
    ]
      .map((error) => error?.message)
      .filter(Boolean);
    if (unique.length === 0) {
      return null;
    }
    if (unique.length === 1) {
      return unique[0];
    }
    return (
      <ul className="ms-4 flex list-disc flex-col gap-1">
        {unique.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    );
  })();

  if (content == null) {
    return null;
  }
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-callout text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
};
