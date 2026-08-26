import { useState } from "react";
import { Loader2, Puzzle } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { PluginUiSlotId } from "../bridge";
import type { ActivePluginUiContribution } from "./contributions";

export function PluginUiSlot({
  slot,
  contributions,
  onInvoke,
}: {
  slot: PluginUiSlotId;
  contributions: ActivePluginUiContribution[];
  onInvoke: (contribution: ActivePluginUiContribution) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (contributions.length === 0) return null;

  const invoke = async (contribution: ActivePluginUiContribution) => {
    const key = `${contribution.pluginId}:${contribution.id}`;
    if (busy) return;
    setBusy(key);
    try {
      await onInvoke(contribution);
    } finally {
      setBusy(null);
    }
  };

  if (slot === "rail.features") {
    return (
      <div data-plugin-ui-slot={slot} role="group" aria-label="Plugin actions" className="flex flex-col gap-0.5">
        {contributions.map((contribution) => {
          const key = `${contribution.pluginId}:${contribution.id}`;
          return (
            <button
              key={key}
              type="button"
              className="flex h-(--ds-control-normal) w-full items-center gap-2 rounded-(--ds-radius-control) px-2 text-left text-ui text-foreground/75 transition-colors hover:bg-accent/50 hover:text-foreground"
              title={contribution.description || `${contribution.pluginName}: ${contribution.label}`}
              aria-label={`${contribution.pluginName}: ${contribution.label}`}
              disabled={busy !== null}
              onClick={() => void invoke(contribution)}
            >
              {busy === key ? (
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <Puzzle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">{contribution.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (slot === "session.header") {
    return (
      <div data-plugin-ui-slot={slot} className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {contributions.map((contribution) => {
          const key = `${contribution.pluginId}:${contribution.id}`;
          return (
            <Button
              key={key}
              type="button"
              variant="ghost"
              size="compact"
              className="max-w-44 shrink-0"
              title={contribution.description || `${contribution.pluginName}: ${contribution.label}`}
              aria-label={`${contribution.pluginName}: ${contribution.label}`}
              disabled={busy !== null}
              onClick={() => void invoke(contribution)}
            >
              {busy === key ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Puzzle data-icon="inline-start" />}
              <span className="truncate">{contribution.label}</span>
            </Button>
          );
        })}
      </div>
    );
  }

  if (slot === "transcript.before") {
    return (
      <section data-plugin-ui-slot={slot} aria-label="Plugin actions" className="pb-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-(--ds-radius-module) bg-card/70 p-2 ring-1 ring-foreground/[0.07]">
          {contributions.map((contribution) => {
            const key = `${contribution.pluginId}:${contribution.id}`;
            return (
              <Button
                key={key}
                type="button"
                variant="ghost"
                size="compact"
                title={contribution.description || `${contribution.pluginName}: ${contribution.label}`}
                aria-label={`${contribution.pluginName}: ${contribution.label}`}
                disabled={busy !== null}
                onClick={() => void invoke(contribution)}
              >
                {busy === key ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Puzzle data-icon="inline-start" />
                )}
                {contribution.label}
              </Button>
            );
          })}
        </div>
      </section>
    );
  }

  if (slot === "composer.toolbar") {
    return (
      <div data-plugin-ui-slot={slot} role="group" aria-label="Plugin actions" className="flex items-center gap-0.5">
        {contributions.map((contribution) => {
          const key = `${contribution.pluginId}:${contribution.id}`;
          const label = `${contribution.pluginName}: ${contribution.label}`;
          return (
            <Tooltip key={key}>
              <TooltipTrigger
                render={(
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground"
                    aria-label={label}
                    disabled={busy !== null}
                    onClick={() => void invoke(contribution)}
                  >
                    {busy === key ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Puzzle className="size-3.5" />
                    )}
                  </Button>
                )}
              />
              <TooltipContent>{contribution.description || label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  if (slot === "composer.above") {
    return (
      <section data-plugin-ui-slot={slot} aria-label="Plugin actions" className="shrink-0 px-6 pb-2 pt-3">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {contributions.map((contribution) => {
            const key = `${contribution.pluginId}:${contribution.id}`;
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-3 rounded-(--ds-radius-module) bg-card px-4 py-3 ring-1 ring-foreground/[0.07]"
              >
                <Puzzle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-medium">{contribution.label}</p>
                  {contribution.description ? (
                    <p className="mt-0.5 text-fine leading-relaxed text-muted-foreground">{contribution.description}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="compact"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void invoke(contribution)}
                >
                  {busy === key ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                  Run
                </Button>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const unhandledSlot: never = slot;
  return unhandledSlot;
}
