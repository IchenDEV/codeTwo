import type { ReactNode } from "react";
import type { ProviderInfo, Sandbox } from "../bridge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "../i18n";
import { SESSION_MODES, sessionMode, type SessionMode } from "./mode";

/** Everything that is configured once per session rather than once per turn. */
export interface SessionConfig {
  providers: ProviderInfo[];
  provider: string;
  onProvider: (v: string) => void;
  cwd: string;
  onCwd: (v: string) => void;
  /** The engine's two permission axes. Read here, but set only as a pair — see `onSessionMode`. */
  mode: string;
  sandbox: Sandbox;
  onSessionMode: (v: SessionMode) => void;
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
  const activeMode = sessionMode(config.mode, config.sandbox);

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

        {/* One control, not two. The approval mode and the sandbox are separate axes in the engine,
            but asking about them separately makes the caller resolve a nine-cell matrix to answer
            one question: how much rope does this session get? */}
        <div className="space-y-1.5">
          <Label className="text-xs">{t("config.mode")}</Label>
          <Select value={activeMode} onValueChange={(v) => config.onSessionMode(v as SessionMode)}>
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SESSION_MODES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {t(`mode.${m.id}` as "mode.ask")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-fine text-muted-foreground">
            {t(`mode.${activeMode}Hint` as "mode.askHint")}
          </p>
        </div>

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
