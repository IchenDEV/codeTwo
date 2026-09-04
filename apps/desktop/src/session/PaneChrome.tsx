import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PanelBottom, PanelRight, X } from "@/components/ui/icons";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { TurnCard } from "./TurnCard";
import type { Turn } from "./turns";

interface PaneToolbarProps {
  readonly onSplitRight: () => void;
  readonly onSplitDown: () => void;
  readonly onClose: () => void;
  readonly canClose: boolean;
  readonly labels: { splitRight: string; splitDown: string; close: string };
}

export function PaneToolbar({
  onSplitRight,
  onSplitDown,
  onClose,
  canClose,
  labels,
}: PaneToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <TooltipButton
        label={labels.splitRight}
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-muted-foreground size-7"
        onClick={onSplitRight}
      >
        <PanelRight className="size-4" aria-hidden />
      </TooltipButton>
      <TooltipButton
        label={labels.splitDown}
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-muted-foreground size-7"
        onClick={onSplitDown}
      >
        <PanelBottom className="size-4" aria-hidden />
      </TooltipButton>
      {canClose ? (
        <TooltipButton
          label={labels.close}
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-muted-foreground size-7"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </TooltipButton>
      ) : null}
    </div>
  );
}

interface PaneLayoutToolbarProps extends PaneToolbarProps {
  readonly panelActive: boolean;
  readonly onTogglePanel: () => void;
  readonly panelLabel: string;
  readonly groupLabel: string;
  readonly viewLabel: string;
}

export function PaneLayoutToolbar({
  panelActive,
  onTogglePanel,
  panelLabel,
  groupLabel,
  viewLabel,
  onSplitRight,
  onSplitDown,
  onClose,
  canClose,
  labels,
}: PaneLayoutToolbarProps) {
  return (
    <div
      className="session-header-layout-actions flex shrink-0 items-center"
      role="group"
      aria-label={groupLabel}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className={cn(
                "session-header-layout-main text-foreground hover:text-foreground",
                panelActive && "bg-fill-rest"
              )}
              title={viewLabel}
              aria-label={viewLabel}
            >
              <PanelRight
                className="session-header-layout-icon text-muted-foreground size-4"
                aria-hidden
              />
              <span className="session-header-layout-label">{viewLabel}</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onSplitRight}>
              <PanelRight aria-hidden />
              {labels.splitRight}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSplitDown}>
              <PanelBottom aria-hidden />
              {labels.splitDown}
            </DropdownMenuItem>
            {canClose ? (
              <DropdownMenuItem onClick={onClose}>
                <X aria-hidden />
                {labels.close}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={panelActive}
              onCheckedChange={() => onTogglePanel()}
            >
              <PanelRight aria-hidden />
              {panelLabel}
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface PanePreviewProps {
  readonly title: string;
  readonly running: boolean;
  readonly turns: readonly Turn[];
  readonly emptyLabel: string;
  readonly toolbar: PaneToolbarProps;
}

export function PanePreview({
  title,
  running,
  turns,
  emptyLabel,
  toolbar,
}: PanePreviewProps) {
  return (
    <div className="bg-background flex size-full flex-col">
      <header className="bg-fill-quiet flex shrink-0 items-center gap-2 px-3 py-2">
        {running ? (
          <span
            className="bg-primary size-1.5 shrink-0 animate-pulse rounded-full"
            aria-hidden
          />
        ) : null}
        <span className="text-callout min-w-0 flex-1 truncate font-medium">
          {title}
        </span>
        <PaneToolbar {...toolbar} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {turns.length === 0 ? (
          <p className="text-callout text-muted-foreground px-3 py-6 text-center">
            {emptyLabel}
          </p>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-6">
            <ol className="m-0 list-none p-0">
              {turns.map((turn) => (
                <li
                  key={turn.transcriptStartSeq ?? turn.id}
                  className="transcript-turn"
                >
                  <TurnCard turn={turn} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

export { PaneDivider } from "./PaneDivider";
