import type { ReactNode } from "react";
import type { ProviderInfo, Sandbox } from "../bridge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "../i18n";

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
  /** Whether a session exists yet — some controls have nothing to act on before that. */
  hasSession: boolean;
}

/**
 * Per-session setup (provider, working dir, permissions, isolation). It hangs off whatever trigger
 * the caller supplies so the same panel can be reached from the composer's status chips — the place
 * you actually look before firing a turn.
 */
export function ConfigPopover({ config, trigger }: { config: SessionConfig; trigger: ReactNode }) {
  const t = useT();
  const current = config.providers.find((p) => p.id === config.provider);

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>

      <PopoverContent align="start" side="top" className="w-80 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("config.provider")}</Label>
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
            <p className="text-fine text-warning">
              {t("config.providerMissing", {
                name: current.display_name,
                node: current.needs_node ? t("config.needsNode") : "",
              })}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("config.cwd")}</Label>
          <Input
            className="h-8 font-mono text-xs"
            value={config.cwd}
            onChange={(e) => config.onCwd(e.target.value)}
            placeholder="."
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("config.approvals")}</Label>
            <Select value={config.mode} onValueChange={config.onMode}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask">{t("config.ask")}</SelectItem>
                <SelectItem value="accept_edits">{t("config.acceptEdits")}</SelectItem>
                <SelectItem value="yolo">{t("config.yolo")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("config.sandbox")}</Label>
            <Select value={config.sandbox} onValueChange={(v) => config.onSandbox(v as Sandbox)}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read_only">{t("config.readOnly")}</SelectItem>
                <SelectItem value="workspace_write">{t("config.workspace")}</SelectItem>
                <SelectItem value="danger_full_access">{t("config.fullAccess")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {config.sandbox === "read_only" && (
          <p className="text-fine text-muted-foreground">
            {t("config.readOnlyHint")}
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox
            checked={config.useWorktree}
            onCheckedChange={(v) => config.onWorktree(v === true)}
            className="mt-0.5"
          />
          <span className="text-xs">
            {t("config.worktree")}
            <span className="block text-fine text-muted-foreground">{t("config.worktreeHint")}</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox checked={config.planMode} onCheckedChange={(v) => config.onPlan(v === true)} className="mt-0.5" />
          <span className="text-xs">
            {t("config.planFirst")}
            <span className="block text-fine text-muted-foreground">{t("config.planFirstHint")}</span>
          </span>
        </label>
      </PopoverContent>
    </Popover>
  );
}
