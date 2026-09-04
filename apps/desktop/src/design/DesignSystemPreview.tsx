import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { applyAppearanceSettings, useAppearanceSettings } from "@/appearance";
import { ChoiceRow } from "@/components/business/choice-row";
import { LoadFeedback } from "@/components/business/load-feedback";
import { QuotaProgress } from "@/components/business/quota-progress";
import { SelectableRow } from "@/components/business/selectable-row";
import { SettingRow } from "@/components/business/setting-row";
import { SettingToggle } from "@/components/business/setting-toggle";
import { StatusBadge } from "@/components/business/status-badge";
import { StatusIndicator } from "@/components/business/status-indicator";
import { ViewSwitcher } from "@/components/business/view-switcher";
import { ActivityOrb } from "@/components/ui/activity-orb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemDescription,
  DropdownMenuItemText,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  AlertTriangle,
  Check,
  CircleHelp,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Sun,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipButton,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/ui/toast";

import "./preview.css";

type ThemeMode = "system" | "light" | "dark";

const colorTokens = [
  ["Canvas", "--ds-color-canvas"],
  ["Sidebar", "--ds-color-sidebar"],
  ["Surface", "--ds-color-surface"],
  ["Raised", "--ds-color-raised"],
  ["Modal", "--ds-color-modal"],
  ["Primary", "--ds-color-primary"],
  ["Success", "--ds-color-success"],
  ["Warning", "--ds-color-warning"],
  ["Destructive", "--ds-color-destructive"],
] as const;

const typeRoles = [
  ["Large title", "28 / 34", "ds-type-large-title"],
  ["Page title", "20 / 28", "ds-type-page-title"],
  ["Section", "18 / 24", "ds-type-section"],
  ["Dialog", "16 / 22", "ds-type-dialog"],
  ["Body / control", "14 / 20", "ds-type-body"],
  ["Prose", "14 / 23", "ds-type-prose"],
  ["Callout", "13 / 18", "ds-type-callout"],
  ["Metadata", "12 / 16", "ds-type-metadata"],
  ["Caption / keycap", "11 / 14", "ds-type-caption"],
] as const;

const spacingRoles = [
  ["Optical", "2"],
  ["Inline", "4"],
  ["Control group", "6"],
  ["Module inset", "8"],
  ["Surface inset", "12"],
  ["Section", "16"],
  ["Page", "24"],
  ["Page section", "32"],
] as const;

const motionRoles = [
  ["Feedback", "120 ms", "color · opacity · press"],
  ["Layer", "160 ms", "menu · popover · tooltip"],
  ["Dialog", "220 ms", "dialog · dock · tree"],
  ["Page", "280 ms", "full-page transition"],
] as const;

function useSystemDark(): boolean {
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return dark;
}

function ThemeChoice({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      variant="ghost"
      size="icon-sm"
      focusStyle="inset"
      className="ds-theme-choice"
      onClick={onClick}
      type="button"
    >
      {children}
    </Button>
  );
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="ds-section-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </header>
  );
}

export function DesignSystemPreview({
  catalogHref = "?ui-lab=home",
  initialThemeMode = "system",
}: {
  catalogHref?: string;
  initialThemeMode?: ThemeMode;
}) {
  const toast = useToast();
  const systemDark = useSystemDark();
  const appearance = useAppearanceSettings();
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialThemeMode);
  const [boldText, setBoldText] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("codex");
  const [selectedChoice, setSelectedChoice] = useState("automatic");
  const [selectedBusinessView, setSelectedBusinessView] = useState("all");
  const [memoryCapture, setMemoryCapture] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invalidValue, setInvalidValue] = useState("Missing token");
  const resolvedTheme =
    themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;

  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-ds-theme");
    const wasDark = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;
    const previewStyle = document.createElement("div");

    applyAppearanceSettings(previewStyle, appearance, resolvedTheme);
    const previousAppearance = new Map(
      Array.from(previewStyle.style).map((name) => [
        name,
        {
          priority: root.style.getPropertyPriority(name),
          value: root.style.getPropertyValue(name),
        },
      ])
    );

    root.setAttribute("data-ds-theme", resolvedTheme);
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    for (const name of previewStyle.style) {
      root.style.setProperty(
        name,
        previewStyle.style.getPropertyValue(name),
        previewStyle.style.getPropertyPriority(name)
      );
    }

    return () => {
      for (const [name, previous] of previousAppearance) {
        if (previous.value)
          root.style.setProperty(name, previous.value, previous.priority);
        else root.style.removeProperty(name);
      }
      root.style.colorScheme = previousColorScheme;
      if (previousTheme === null) root.removeAttribute("data-ds-theme");
      else root.setAttribute("data-ds-theme", previousTheme);
      root.classList.toggle("dark", wasDark);
    };
  }, [appearance, resolvedTheme]);

  const swatches = useMemo(
    () =>
      colorTokens.map(([label, token]) => ({
        label,
        token,
        style: { "--ds-preview-swatch": `var(${token})` } as CSSProperties,
      })),
    []
  );

  return (
    <div
      className="ds-preview"
      data-ds-bold-text={boldText ? "true" : "false"}
      data-ds-theme={resolvedTheme}
    >
      <aside className="ds-preview-sidebar">
        <a className="ds-lab-link" href={catalogHref}>
          ← UI Lab
        </a>
        <div className="ds-brand-lockup">
          <span className="ds-brand-mark">C2</span>
          <div>
            <strong>C2</strong>
            <span>Design system</span>
          </div>
        </div>
        <nav aria-label="Design system sections" className="ds-preview-nav">
          <a href="#foundation">Foundation</a>
          <a href="#surfaces">Surfaces</a>
          <a href="#components">Components</a>
          <a href="#accessibility">Accessibility</a>
        </nav>
        <div className="ds-version-card">
          <span className="ds-status-dot" />
          <div>
            <strong>0.9.0 candidate</strong>
            <span>Windows validation pending</span>
          </div>
        </div>
      </aside>

      <main className="ds-preview-main">
        <header className="ds-preview-toolbar">
          <div>
            <strong>Foundation preview</strong>
            <span className="ds-toolbar-label">
              Codex desktop density · 4px grid
            </span>
          </div>
          <div className="ds-toolbar-actions">
            <div
              aria-label="Preview theme"
              className="ds-theme-switcher"
              role="group"
            >
              <ThemeChoice
                active={themeMode === "system"}
                label="Use system theme"
                onClick={() => setThemeMode("system")}
              >
                <Monitor className="ds-icon-list" />
              </ThemeChoice>
              <ThemeChoice
                active={themeMode === "light"}
                label="Use light theme"
                onClick={() => setThemeMode("light")}
              >
                <Sun className="ds-icon-list" />
              </ThemeChoice>
              <ThemeChoice
                active={themeMode === "dark"}
                label="Use dark theme"
                onClick={() => setThemeMode("dark")}
              >
                <Moon className="ds-icon-list" />
              </ThemeChoice>
            </div>
          </div>
        </header>

        <div className="ds-preview-scroll">
          <section className="ds-intro" id="foundation">
            <div>
              <span className="ds-eyebrow">C2 DESIGN SYSTEM 0.9</span>
              <h1>
                Quiet structure.
                <br />
                Precise density.
              </h1>
              <p>
                A calm desktop system with the same readable density as Codex.
                Quiet neutral planes, fixed blue action, one managed raised
                material, and platform-native typography.
              </p>
            </div>
            <div className="ds-principle-stack" aria-label="Core principles">
              <div>
                <span>01</span>
                <strong>One density</strong>
                <small>Codex desktop rhythm</small>
              </div>
              <div>
                <span>02</span>
                <strong>One grid</strong>
                <small>4px with a 2px optical step</small>
              </div>
              <div>
                <span>03</span>
                <strong>One language</strong>
                <small>Semantic tokens, no visual overrides</small>
              </div>
            </div>
          </section>

          <section className="ds-preview-section">
            <SectionHeading
              eyebrow="01 · Color"
              title="Five neutral planes, one C2 blue"
            />
            <div className="ds-color-grid">
              {swatches.map(({ label, token, style }) => (
                <div className="ds-swatch-card" key={token}>
                  <div className="ds-swatch" style={style} />
                  <strong>{label}</strong>
                  <code>{token.replace("--ds-color-", "")}</code>
                </div>
              ))}
            </div>
            <div className="ds-contrast-note">
              <Check className="ds-icon-list" />
              <span>
                Text pairs are machine-checked in light and dark at AA or
                better.
              </span>
            </div>
          </section>

          <section className="ds-preview-section" id="typography">
            <SectionHeading
              eyebrow="02 · Typography"
              title="Platform system faces, Mac rhythm"
            />
            <Card className="ds-type-specimen">
              {typeRoles.map(([role, metric, className]) => (
                <div className="ds-type-row" key={role}>
                  <span className="ds-type-meta">
                    <strong>{role}</strong>
                    <code>{metric}</code>
                  </span>
                  <span className={className}>
                    C2 stays calm, readable, and coherent.
                  </span>
                </div>
              ))}
            </Card>
            <div className="ds-inline-facts">
              <span>
                <strong>macOS</strong> SF Pro · SF Mono
              </span>
              <span>
                <strong>Windows</strong> Segoe UI · Cascadia / Consolas
              </span>
              <span>
                <strong>Content</strong> 14 / 23 · code 12 / 18
              </span>
            </div>
          </section>

          <section className="ds-preview-section ds-two-column">
            <div>
              <SectionHeading
                eyebrow="03 · Spacing"
                title="A finite 2–32 scale"
              />
              <Card className="ds-spacing-list">
                {spacingRoles.map(([role, value]) => (
                  <div className="ds-spacing-row" key={role}>
                    <span>{role}</span>
                    <div className={`ds-space-sample ds-space-${value}`} />
                    <code>{value}px</code>
                  </div>
                ))}
              </Card>
            </div>
            <div>
              <SectionHeading
                eyebrow="04 · Geometry"
                title="12px floor, 16px modules"
              />
              <Card className="ds-geometry-grid">
                <div className="ds-radius-sample ds-radius-micro">
                  <span>12</span>
                  <small>micro</small>
                </div>
                <div className="ds-radius-sample ds-radius-control">
                  <span>12</span>
                  <small>control</small>
                </div>
                <div className="ds-radius-sample ds-radius-module">
                  <span>16</span>
                  <small>module</small>
                </div>
                <div className="ds-radius-sample ds-radius-modal">
                  <span>16</span>
                  <small>modal</small>
                </div>
                <div className="ds-icon-scale">
                  <Search className="ds-icon-inline" />
                  <Search className="ds-icon-list" />
                  <Search className="ds-icon-control" />
                  <span>12 · 14 · 16</span>
                </div>
              </Card>
            </div>
          </section>

          <section className="ds-preview-section" id="surfaces">
            <SectionHeading
              eyebrow="05 · Elevation"
              title="Transient layers use one material"
            />
            <div className="ds-elevation-grid">
              <div className="ds-elevation-sample ds-elevation-surface">
                <strong>Surface</strong>
                <span>flat · cards · inputs · panels</span>
              </div>
              <div className="ds-elevation-sample ds-elevation-raised raised-material">
                <strong>Raised</strong>
                <span>frosted · menus · popovers · selects</span>
              </div>
              <div className="ds-elevation-sample ds-elevation-modal">
                <strong>Modal</strong>
                <span>restrained · dialogs · blocking overlays</span>
              </div>
            </div>
            <p className="ds-rule-note">
              Persistent planes stay flat. Menu-like layers share one subtle
              translucent material.
            </p>
          </section>

          <section className="ds-preview-section" id="components">
            <SectionHeading
              eyebrow="06 · Components"
              title="Shared controls carry every state"
            />
            <div className="ds-component-grid">
              <Card className="ds-control-specimen">
                <span className="ds-specimen-label">Buttons</span>
                <div className="ds-control-row">
                  <Button type="button">Continue</Button>
                  <Button variant="secondary" type="button">
                    Save draft
                  </Button>
                  <Button variant="ghost" type="button">
                    Cancel
                  </Button>
                  <Button variant="destructive" type="button">
                    Delete
                  </Button>
                  <Button variant="secondary" disabled type="button">
                    Disabled
                  </Button>
                  <Button disabled>
                    <Spinner data-icon="inline-start" />
                    Saving
                  </Button>
                  <TooltipButton label="Refresh" variant="ghost" size="icon-sm">
                    <RefreshCw />
                  </TooltipButton>
                </div>
                <p>One primary action per area. Outline is not a variant.</p>
              </Card>

              <Card className="ds-control-specimen">
                <span className="ds-specimen-label">Inputs</span>
                <Field>
                  <FieldLabel htmlFor="preview-project">Project</FieldLabel>
                  <Input id="preview-project" defaultValue="C2" />
                </Field>
                <Input
                  aria-label="Compact filter example"
                  defaultValue="Filter providers"
                  size="compact"
                />
                <Field data-invalid>
                  <FieldLabel htmlFor="preview-invalid-token">Token</FieldLabel>
                  <Input
                    aria-describedby="preview-error"
                    aria-invalid="true"
                    id="preview-invalid-token"
                    onChange={(event) => setInvalidValue(event.target.value)}
                    value={invalidValue}
                  />
                  <FieldError id="preview-error">
                    Use a semantic token.
                  </FieldError>
                </Field>
                <Textarea
                  aria-label="Compact multiline example"
                  size="compact"
                  rows={2}
                  defaultValue="Add a concise implementation note."
                />
              </Card>

              <Card className="ds-control-specimen">
                <span className="ds-specimen-label">Rows & status</span>
                <Select
                  value={selectedProvider}
                  onValueChange={(value) => value && setSelectedProvider(value)}
                >
                  <SelectTrigger
                    aria-label="Current provider"
                    className="w-full"
                  >
                    <SelectValue>
                      {selectedProvider === "claude" ? "Claude Code" : "Codex"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="codex">Codex</SelectItem>
                      <SelectItem value="claude">Claude Code</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Field orientation="horizontal">
                  <Checkbox defaultChecked id="preview-keep-panel" />
                  <FieldLabel htmlFor="preview-keep-panel">
                    Keep the panel visible
                  </FieldLabel>
                </Field>
                <RadioGroup
                  aria-label="Run mode"
                  value={selectedChoice}
                  onValueChange={setSelectedChoice}
                  className="gap-control-group"
                >
                  <ChoiceRow
                    kind="radio"
                    value="automatic"
                    label="Automatic"
                    description="Choose the right mode for this task."
                    selected={selectedChoice === "automatic"}
                  />
                  <ChoiceRow
                    kind="radio"
                    value="manual"
                    label="Manual"
                    description="Keep the current mode until changed."
                    selected={selectedChoice === "manual"}
                  />
                </RadioGroup>
                <div className="ds-status-row">
                  <ActivityOrb
                    state="searching"
                    visualSize={14}
                    aria-hidden="true"
                  />{" "}
                  Refreshing provider quota
                </div>
                <div className="ds-status-row">
                  <ActivityOrb
                    state="working"
                    visualSize={14}
                    aria-hidden="true"
                  />{" "}
                  Agent working
                </div>
                <div className="ds-status-row">
                  <ActivityOrb
                    state="listening"
                    visualSize={14}
                    aria-hidden="true"
                  />{" "}
                  Listening to voice input
                </div>
                <div className="ds-status-row">
                  <ActivityOrb
                    state="shaping"
                    visualSize={14}
                    aria-hidden="true"
                  />{" "}
                  Structuring transcript
                </div>
                <div className="ds-status-row ds-status-warning">
                  <AlertTriangle className="ds-icon-list" /> Quota unavailable
                </div>
              </Card>

              <Card className="ds-control-specimen">
                <span className="ds-specimen-label">Business patterns</span>
                <ViewSwitcher
                  label="Provider view"
                  value={selectedBusinessView}
                  options={[
                    { value: "all", label: "All", count: 4 },
                    { value: "ready", label: "Ready", count: 2 },
                    {
                      value: "blocked",
                      label: "Blocked",
                      count: 1,
                      disabled: true,
                    },
                  ]}
                  onValueChange={setSelectedBusinessView}
                />
                <div className="text-metadata text-content-muted flex items-center gap-2">
                  <span>Active providers</span>
                  <Separator className="flex-1" />
                  <span>2</span>
                </div>
                <div className="flex flex-col gap-1">
                  <SelectableRow
                    selected={selectedProvider === "codex"}
                    label="Codex"
                    description="Default provider for this project"
                    leading={<span className="ds-provider-icon">C</span>}
                    meta={<StatusBadge tone="success">Active</StatusBadge>}
                    onSelect={() => setSelectedProvider("codex")}
                  />
                  <SelectableRow
                    selected={selectedProvider === "claude"}
                    label="Claude Code"
                    description="Available through the desktop host"
                    leading={<span className="ds-provider-icon">A</span>}
                    onSelect={() => setSelectedProvider("claude")}
                  />
                  <SelectableRow
                    selected={false}
                    disabled
                    label="Unavailable provider"
                    description="This deliberately long description checks wrapping without widening a compact picker or hiding the reason the provider is unavailable."
                    onSelect={() => {}}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="neutral">Paused</StatusBadge>
                  <StatusBadge tone="success">Active</StatusBadge>
                  <StatusBadge tone="warning">Pending</StatusBadge>
                  <StatusBadge tone="destructive">Failed</StatusBadge>
                </div>
                <div className="flex flex-wrap gap-3">
                  <StatusIndicator tone="neutral" label="Unavailable" />
                  <StatusIndicator tone="success" label="Ready" />
                  <StatusIndicator tone="warning" label="Unverified" />
                  <StatusIndicator tone="destructive" label="Failed" />
                </div>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
                  <span className="text-metadata text-content-muted">72%</span>
                  <QuotaProgress
                    label="Healthy quota remaining"
                    remainingPercent={72}
                  />
                  <span className="text-metadata text-content-muted">18%</span>
                  <QuotaProgress
                    label="Low quota remaining"
                    remainingPercent={18}
                  />
                  <span className="text-metadata text-content-muted">4%</span>
                  <QuotaProgress
                    label="Critical quota remaining"
                    remainingPercent={4}
                  />
                  <span className="text-metadata text-content-muted">Rail</span>
                  <QuotaProgress
                    label="Rail quota remaining"
                    remainingPercent={72}
                    density="rail"
                  />
                </div>
                <SettingRow
                  label="Project model"
                  description="Inherited by new sessions in this project."
                  surface="card"
                  controlSize="wide"
                >
                  <StatusBadge tone="neutral">Provider default</StatusBadge>
                </SettingRow>
                <SettingToggle
                  label="Capture useful context"
                  description="Save durable context after a completed task."
                  checked={memoryCapture}
                  onCheckedChange={setMemoryCapture}
                />
                <SettingToggle
                  label="Unavailable setting"
                  description="Disabled labels and controls share one state."
                  checked={false}
                  disabled
                  onCheckedChange={() => {}}
                />
                <LoadFeedback
                  state="error"
                  message="Provider catalog is unavailable."
                  retryLabel="Retry"
                  onRetry={() => {}}
                />
                <p>Domain states map to semantic tones inside each feature.</p>
              </Card>

              <Card className="ds-control-specimen">
                <span className="ds-specimen-label">Navigation & layers</span>
                <Tabs defaultValue="quota">
                  <TabsList>
                    <TabsTrigger value="quota">Quota</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>
                  <TabsContent
                    className="text-metadata text-content-muted"
                    value="quota"
                  >
                    72% remaining · resets in 1h 42m
                  </TabsContent>
                  <TabsContent
                    className="text-metadata text-content-muted"
                    value="history"
                  >
                    Seven-day provider usage
                  </TabsContent>
                </Tabs>
                <div className="flex flex-wrap gap-2">
                  <Popover>
                    <PopoverTrigger
                      render={<Button variant="secondary" type="button" />}
                    >
                      Provider summary
                    </PopoverTrigger>
                    <PopoverContent align="start">
                      <PopoverHeader>
                        <PopoverTitle>Codex</PopoverTitle>
                        <PopoverDescription>
                          Ready for project tasks.
                        </PopoverDescription>
                      </PopoverHeader>
                    </PopoverContent>
                  </Popover>
                  <Tooltip>
                    <TooltipTrigger
                      render={<Button variant="ghost" type="button" />}
                    >
                      Usage reset
                    </TooltipTrigger>
                    <TooltipContent>
                      Available after the current limit resets
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="secondary" type="button" />}
                    >
                      Project actions
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuGroup>
                        <DropdownMenuItem>
                          <DropdownMenuItemText>
                            New task
                            <DropdownMenuItemDescription>
                              Start in the current project
                            </DropdownMenuItemDescription>
                          </DropdownMenuItemText>
                          <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem>Rename project</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive">
                          Remove project
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ContextMenu>
                    <ContextMenuTrigger
                      render={<Button variant="secondary" type="button" />}
                    >
                      Context actions
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuGroup>
                        <ContextMenuItem>
                          Open in new task
                          <ContextMenuShortcut>↵</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem>
                          Copy path<ContextMenuShortcut>⌘C</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem variant="destructive">
                          Remove
                        </ContextMenuItem>
                      </ContextMenuGroup>
                    </ContextMenuContent>
                  </ContextMenu>
                  <Button
                    onClick={() => {
                      const previousTheme = themeMode;
                      setThemeMode("dark");
                      toast("Dark theme enabled", "success", {
                        label: "Undo",
                        run: () => setThemeMode(previousTheme),
                      });
                    }}
                    variant="secondary"
                    type="button"
                  >
                    Use dark theme
                  </Button>
                  <Button onClick={() => setDialogOpen(true)} type="button">
                    Open quota details
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={<Button variant="destructive" type="button" />}
                    >
                      Remove project
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Remove this project?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          The project is removed from C2. Files on disk are not
                          deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive">
                          Remove project
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="gap-module-inset flex items-center">
                        <CircleHelp /> Provider quota
                      </DialogTitle>
                      <DialogDescription>
                        Current provider: Codex
                      </DialogDescription>
                    </DialogHeader>
                    <div className="gap-module-inset flex flex-col">
                      <QuotaProgress
                        label="Provider quota remaining"
                        remainingPercent={72}
                      />
                      <strong className="text-body">5-hour limit</strong>
                      <span className="text-metadata text-content-muted">
                        72% remaining · resets in 1h 42m
                      </span>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" type="button">
                        Refresh
                      </Button>
                      <Button
                        onClick={() => setDialogOpen(false)}
                        variant="secondary"
                        type="button"
                      >
                        Done
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </Card>
            </div>
          </section>

          <section className="ds-preview-section ds-two-column">
            <div>
              <SectionHeading
                eyebrow="07 · Motion"
                title="Four durations, no theatre"
              />
              <Card className="ds-motion-list">
                {motionRoles.map(([role, duration, use]) => (
                  <div className="ds-motion-row" key={role}>
                    <span
                      className={`ds-motion-dot ds-motion-${role.toLowerCase()}`}
                    />
                    <strong>{role}</strong>
                    <code>{duration}</code>
                    <span>{use}</span>
                  </div>
                ))}
              </Card>
            </div>
            <div id="accessibility">
              <SectionHeading
                eyebrow="08 · Accessibility"
                title="OS preferences stay in control"
              />
              <Card className="ds-access-list">
                <div>
                  <Check className="ds-icon-list" />
                  <span>
                    <strong>Reduced motion</strong>
                    <small>All four semantic durations collapse.</small>
                  </span>
                </div>
                <div>
                  <Check className="ds-icon-list" />
                  <span>
                    <strong>Increased contrast</strong>
                    <small>Muted text and control fills strengthen.</small>
                  </span>
                </div>
                <div>
                  <Check className="ds-icon-list" />
                  <span>
                    <strong>Reduced transparency</strong>
                    <small>
                      Sidebar and raised material fall back to solid planes.
                    </small>
                  </span>
                </div>
                <Field orientation="horizontal">
                  <Checkbox
                    checked={boldText}
                    id="preview-bold-text"
                    onCheckedChange={(checked) => setBoldText(checked === true)}
                  />
                  <FieldLabel htmlFor="preview-bold-text">
                    Simulate bold text
                  </FieldLabel>
                </Field>
              </Card>
            </div>
          </section>

          <footer className="ds-preview-footer">
            <span>800–999 narrow · 1000–1399 standard · 1400+ wide</span>
            <span>Local container queries · no mobile layout</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
