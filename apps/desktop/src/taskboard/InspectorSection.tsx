import type { ReactNode } from "react";

interface InspectorSectionProps {
  title: string;
  children: ReactNode;
}

export function InspectorSection({ title, children }: InspectorSectionProps) {
  return (
    <section className="grid gap-2">
      <h2 className="text-body font-semibold">{title}</h2>
      {children}
    </section>
  );
}
