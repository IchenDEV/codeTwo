import { Settings2 } from "lucide-react";
import type { ProviderInfo, Sandbox } from "../bridge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

/**
 * Per-session setup (provider, working dir, permissions, isolation) lives here rather than in the
 * toolbar — it's configured once per session, not per action.
 */
export function ConfigPopover(props: {
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
}) {
  const current = props.providers.find((p) => p.id === props.provider);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="size-3.5" />
          {/* A dot only when the picked provider is missing — a green "all good" dot would be noise. */}
          {current && !current.available && (
            <span className="size-1.5 shrink-0 rounded-full bg-warning" title="Provider CLI not found" />
          )}
          <span className="max-w-32 truncate">{current?.display_name ?? props.provider}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-[11px] text-muted-foreground">{props.mode}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Provider</Label>
          <Select value={props.provider} onValueChange={props.onProvider}>
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className={`size-1.5 rounded-full ${p.available ? "bg-success" : "bg-border"}`}
                    />
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
            value={props.cwd}
            onChange={(e) => props.onCwd(e.target.value)}
            placeholder="."
          />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Approvals</Label>
            <Select value={props.mode} onValueChange={props.onMode}>
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
            <Select value={props.sandbox} onValueChange={(v) => props.onSandbox(v as Sandbox)}>
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

        {props.sandbox === "read_only" && (
          <p className="text-[11px] text-muted-foreground">
            Read-only denies all edits and commands — even in YOLO.
          </p>
        )}

        <Separator />

        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox
            checked={props.useWorktree}
            onCheckedChange={(v) => props.onWorktree(v === true)}
            className="mt-0.5"
          />
          <span className="text-xs">
            Isolate in a git worktree
            <span className="block text-[11px] text-muted-foreground">
              Runs on a fresh branch + checkout.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox checked={props.planMode} onCheckedChange={(v) => props.onPlan(v === true)} className="mt-0.5" />
          <span className="text-xs">
            Plan first
            <span className="block text-[11px] text-muted-foreground">
              Propose a plan and wait before editing.
            </span>
          </span>
        </label>
      </PopoverContent>
    </Popover>
  );
}
