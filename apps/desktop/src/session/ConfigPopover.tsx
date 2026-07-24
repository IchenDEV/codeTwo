import type { ReactNode } from "react";
import type { ProviderInfo, Sandbox } from "../bridge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

/** Everything that is configured once per session rather than once per turn. */
export interface SessionConfig {
  providers: ProviderInfo[];
  provider: string;
  onProvider: (v: string) => void;
  cwd: string;
  onCwd: (v: string) => void;
  mode: string;
  onMode: (v: string) => void;
  sandbox: Sandbox;
  onSandbox: (v: Sandbox) => void;
  useWorktree: boolean;
  onWorktree: (v: boolean) => void;
  planMode: boolean;
  onPlan: (v: boolean) => void;
}

export const SANDBOX_LABEL: Record<Sandbox, string> = {
  read_only: "Read-only",
  workspace_write: "Workspace write",
  danger_full_access: "Full access",
};

export const MODE_LABEL: Record<string, string> = {
  ask: "Ask first",
  accept_edits: "Auto-accept edits",
  yolo: "YOLO",
};

/**
 * Per-session setup (provider, working dir, permissions, isolation). It hangs off whatever trigger
 * the caller supplies so the same panel can be reached from the composer's status chips — the place
 * you actually look before firing a turn.
 */
export function ConfigPopover({ config, trigger }: { config: SessionConfig; trigger: ReactNode }) {
  const current = config.providers.find((p) => p.id === config.provider);

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>

      <PopoverContent align="start" side="top" className="w-80 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Provider</Label>
          <Select value={config.provider} onValueChange={config.onProvider}>
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span className={`size-1.5 rounded-full ${p.available ? "bg-success" : "bg-border"}`} />
                    {p.display_name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {current && !current.available && (
            <p className="text-[11px] text-warning">
              {current.display_name}'s CLI isn't on your PATH{current.needs_node ? " (needs Node)" : ""}. A
              new session will fail until it's installed — pick a provider with a green dot instead.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Working directory</Label>
          <Input
            className="h-8 font-mono text-xs"
            value={config.cwd}
            onChange={(e) => config.onCwd(e.target.value)}
            placeholder="."
          />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Approvals</Label>
            <Select value={config.mode} onValueChange={config.onMode}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask">Ask</SelectItem>
                <SelectItem value="accept_edits">Accept edits</SelectItem>
                <SelectItem value="yolo">YOLO ⚠</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sandbox</Label>
            <Select value={config.sandbox} onValueChange={(v) => config.onSandbox(v as Sandbox)}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read_only">Read-only</SelectItem>
                <SelectItem value="workspace_write">Workspace</SelectItem>
                <SelectItem value="danger_full_access">Full access ⚠</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {config.sandbox === "read_only" && (
          <p className="text-[11px] text-muted-foreground">
            Read-only denies all edits and commands — even in YOLO.
          </p>
        )}

        <Separator />

        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox
            checked={config.useWorktree}
            onCheckedChange={(v) => config.onWorktree(v === true)}
            className="mt-0.5"
          />
          <span className="text-xs">
            Isolate in a git worktree
            <span className="block text-[11px] text-muted-foreground">Runs on a fresh branch + checkout.</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox checked={config.planMode} onCheckedChange={(v) => config.onPlan(v === true)} className="mt-0.5" />
          <span className="text-xs">
            Plan first
            <span className="block text-[11px] text-muted-foreground">Propose a plan and wait before editing.</span>
          </span>
        </label>
      </PopoverContent>
    </Popover>
  );
}
