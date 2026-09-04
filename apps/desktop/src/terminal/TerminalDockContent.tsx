import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CornerUpLeft, Plus, X } from "@/components/ui/icons";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { onPtyTitle, ptyDump, ptyKill } from "../bridge";
import { useT } from "../i18n";
import { TerminalPanel } from "./Terminal";

function terminalId(sessionKey: string, slot: number, tmux: boolean): string {
  return `${sessionKey}-${slot}${tmux ? "-tmux" : ""}`;
}

function terminalLabel(title: string | undefined, slot: number): string {
  if (!title) return String(slot);
  return title.split("/").filter(Boolean).pop() ?? title;
}

type TerminalDockContentProps = {
  cwd: string | null;
  projectPath: string | null;
  sessionKey: string;
  onSendText: (text: string) => void;
};

/** Terminal-specific tabs and lifecycle, rendered inside the generic Dock container. */
export function TerminalDockContent({
  cwd,
  projectPath,
  sessionKey,
  onSendText,
}: TerminalDockContentProps) {
  const t = useT();
  const [slots, setSlots] = useState<number[]>([1]);
  const [activeSlot, setActiveSlot] = useState(1);
  const [nextSlot, setNextSlot] = useState(2);
  const [tmux, setTmux] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    let stop: (() => void) | null = null;
    setTitles({});
    void (async () => {
      stop = await onPtyTitle(({ id, title, project_path }) => {
        if (project_path !== projectPath) return;
        setTitles((current) => ({ ...current, [id]: title }));
      });
    })();
    return () => stop?.();
  }, [projectPath]);

  const activeId = terminalId(sessionKey, activeSlot, tmux);
  const sendToAgent = useCallback(async () => {
    const text = (await ptyDump(activeId, true)).trimEnd();
    if (text) onSendText(text);
  }, [activeId, onSendText]);

  function closeSlot(slot: number) {
    const remaining = slots.filter((candidate) => candidate !== slot);
    setSlots(remaining);
    if (activeSlot === slot && remaining[0]) setActiveSlot(remaining[0]);
    void ptyKill(terminalId(sessionKey, slot, false));
    void ptyKill(terminalId(sessionKey, slot, true));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="dock-content-tabbar flex shrink-0 items-center gap-0.5 overflow-x-auto px-2">
        {slots.map((slot) => (
          <Button
            key={slot}
            type="button"
            variant="selectable"
            size="row"
            focusStyle="inset"
            data-selected={slot === activeSlot ? "true" : "false"}
            title={titles[terminalId(sessionKey, slot, tmux)] || undefined}
            onClick={() => {
              setActiveSlot(slot);
              setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
            }}
            className={cn(
              "group px-module-inset text-metadata relative h-full max-w-40 shrink-0 gap-1.5",
              slot === activeSlot
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="truncate">
              {terminalLabel(titles[terminalId(sessionKey, slot, tmux)], slot)}
            </span>
            {slots.length > 1 && (
              <X
                className="hover:text-destructive size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  closeSlot(slot);
                }}
              />
            )}
            {slot === activeSlot && (
              <span className="bg-primary absolute inset-x-1.5 -bottom-px h-0.5 rounded-none" />
            )}
          </Button>
        ))}
        <TooltipButton
          label={t("dock.newTerminal")}
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={() => {
            setSlots((current) => [...current, nextSlot]);
            setActiveSlot(nextSlot);
            setNextSlot((current) => current + 1);
          }}
        >
          <Plus className="size-3" />
        </TooltipButton>
        <div className="min-w-0 flex-1" />
        <TooltipButton
          label={t("dock.sendTerminal")}
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={() => void sendToAgent()}
        >
          <CornerUpLeft className="size-3" />
        </TooltipButton>
        <label className="text-callout text-muted-foreground flex shrink-0 cursor-pointer items-center gap-1.5 px-1">
          <Checkbox
            checked={tmux}
            onCheckedChange={(checked) => setTmux(checked === true)}
            className="size-3.5"
          />
          {t("dock.tmux")}
        </label>
      </div>
      {slots.map((slot) => (
        <div
          key={slot}
          className="min-h-0 flex-1"
          style={{ display: slot === activeSlot ? "flex" : "none" }}
        >
          <TerminalPanel
            id={terminalId(sessionKey, slot, tmux)}
            cwd={cwd}
            projectPath={projectPath}
            tmux={tmux}
          />
        </div>
      ))}
    </div>
  );
}
