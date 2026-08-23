import {
  Bug,
  CodeXml,
  Hammer,
  SearchCode,
  type LucideIcon,
} from "lucide-react";

import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { cn } from "@/lib/utils";

const STARTERS: Array<{
  icon: LucideIcon;
  title: StringKey;
  description: StringKey;
  prompt: StringKey;
  tone: string;
}> = [
  {
    icon: SearchCode,
    title: "transcript.starter.explore.title",
    description: "transcript.starter.explore.description",
    prompt: "transcript.starter.explore.prompt",
    tone: "text-primary",
  },
  {
    icon: Hammer,
    title: "transcript.starter.build.title",
    description: "transcript.starter.build.description",
    prompt: "transcript.starter.build.prompt",
    tone: "text-warning",
  },
  {
    icon: CodeXml,
    title: "transcript.starter.review.title",
    description: "transcript.starter.review.description",
    prompt: "transcript.starter.review.prompt",
    tone: "text-success",
  },
  {
    icon: Bug,
    title: "transcript.starter.fix.title",
    description: "transcript.starter.fix.description",
    prompt: "transcript.starter.fix.prompt",
    tone: "text-destructive",
  },
];

export function EmptySessionStarters({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  const t = useT();

  return (
    <div
      data-empty-session-starters
      className="grid w-full grid-cols-2 gap-2 lg:grid-cols-4"
      aria-label={t("transcript.starters")}
    >
      {STARTERS.map(({ icon: Icon, title, description, prompt, tone }) => (
        <button
          key={title}
          type="button"
          className="group flex min-h-20 flex-col items-start rounded-(--ds-radius-module) bg-fill-quiet p-4 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => onSelect(t(prompt))}
        >
          <Icon className={cn("mb-4 size-4 shrink-0", tone)} aria-hidden="true" />
          <span className="text-ui font-medium text-foreground">{t(title)}</span>
          <span className="empty-session-starter-description mt-1 text-fine leading-relaxed text-muted-foreground">
            {t(description)}
          </span>
        </button>
      ))}
    </div>
  );
}
