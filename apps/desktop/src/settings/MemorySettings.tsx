import { useDeferredValue, useEffect, useState } from "react";

import { PageHeader } from "@/components/business/page-header";
import { SearchField } from "@/components/business/search-field";
import { SettingRow } from "@/components/business/setting-row";
import { SettingToggle } from "@/components/business/setting-toggle";
import { ViewSwitcher } from "@/components/business/view-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArchiveRestore,
  ArrowUpRight,
  BrainCircuit,
  ChevronDown,
  Clock3,
  Eraser,
  Eye,
  EyeOff,
  FileClock,
  Pin,
  PinOff,
  Plus,
  ShieldCheck,
  Trash2,
} from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  addMemory,
  confirmNative,
  correctMemory,
  deleteMemory,
  getMemoryEvidence,
  getMemoryProjectPolicy,
  getMemorySettings,
  getMemoryStats,
  getMemoryUsages,
  listManagedMemories,
  saveMemoryProjectPolicy,
  saveMemorySettings,
  setMemoryActive,
  setMemoryCategory,
  setMemoryPinned,
  updateMemory,
} from "../bridge";
import type {
  MemoryEvidence,
  MemoryPolicyValue,
  MemoryProjectPolicy,
  MemoryRecord,
  MemorySettings,
  MemoryStats,
  MemoryUsage,
  Project,
} from "../bridge";
import { useLanguage, useT } from "../i18n";
import { td } from "../i18n/dynamic";
import type { StringKey } from "../i18n/strings";
import { useToast } from "../ui/toast";
import {
  filterMemories,
  memoryActivityAt,
  memoryProfile,
  MEMORY_CATEGORIES,
  originLabelKey,
} from "./memory-model";
import type { MemoryFilter, MemoryView } from "./memory-model";

import "./memory-settings.css";

const DEFAULT_SETTINGS: MemorySettings = {
  enabled: true,
  capture: true,
  inject: true,
  include_external_context: true,
};
const EMPTY_STATS: MemoryStats = {
  l0: 0,
  l1: 0,
  l2: 0,
  l3: 0,
  pending: 0,
  active: 0,
  pinned: 0,
  recent: 0,
  forgotten: 0,
  conflicts: 0,
};
const DEFAULT_POLICY = (projectPath: string): MemoryProjectPolicy => ({
  project_path: projectPath,
  capture: "inherit",
  inject: "inherit",
  include_external_context: "inherit",
});
const DEFAULT_FILTER: MemoryFilter = {
  query: "",
  view: "all",
  category: "all",
  origin: "all",
  sort: "activity",
};

const VIEWS: { value: MemoryView; key: StringKey }[] = [
  { value: "all", key: "memory.view.all" },
  { value: "pinned", key: "memory.view.pinned" },
  { value: "constraints", key: "memory.view.constraints" },
  { value: "facts", key: "memory.view.facts" },
  { value: "episodes", key: "memory.view.episodes" },
  { value: "recent", key: "memory.view.recent" },
  { value: "forgotten", key: "memory.view.forgotten" },
  { value: "conflicts", key: "memory.view.conflicts" },
];

function translatedDynamic(
  t: ReturnType<typeof useT>,
  prefix: string,
  value: string
): string {
  return td(t, `${prefix}.${value}`);
}

function useNarrowMemoryLayout(): boolean {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width: 1024px)").matches
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px)");
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

function effectivePolicy(
  globalValue: boolean,
  projectValue: MemoryPolicyValue,
  masterEnabled: boolean
): boolean {
  if (!masterEnabled) return false;
  return projectValue === "inherit" ? globalValue : projectValue === "allow";
}

function formatDate(
  locale: string,
  value: number | null,
  withTime = false
): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat(
    locale,
    withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }
  ).format(new Date(value));
}

function PolicySelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: MemoryPolicyValue;
  disabled: boolean;
  onChange: (value: MemoryPolicyValue) => void;
}) {
  const t = useT();
  return (
    <SettingRow label={label} density="compact" disabled={disabled}>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label={label}
          className="w-32 justify-between"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="inherit">
              {t("memory.policy.inherit")}
            </SelectItem>
            <SelectItem value="allow">{t("memory.policy.allow")}</SelectItem>
            <SelectItem value="deny">{t("memory.policy.deny")}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </SettingRow>
  );
}

function StatButton({
  value,
  label,
  active,
  warning,
  onClick,
}: {
  value: number;
  label: string;
  active: boolean;
  warning?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="selectable"
      size="row"
      focusStyle="inset"
      data-selected={active ? "true" : "false"}
      className={cn(
        "memory-stat",
        active && "is-active",
        warning === true && value > 0 && "is-warning"
      )}
      onClick={onClick}
    >
      <strong className="text-body font-mono tabular-nums">{value}</strong>
      <span>{label}</span>
    </Button>
  );
}

function MemoryRow({
  memory,
  selected,
  checked,
  onCheck,
  onOpen,
  onPin,
}: {
  memory: MemoryRecord;
  selected: boolean;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onOpen: () => void;
  onPin: () => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  return (
    <article
      className={cn(
        "memory-row",
        selected && "is-selected",
        !memory.active && "is-inactive"
      )}
    >
      <Checkbox
        aria-label={t("memory.selectRecord")}
        checked={checked}
        onCheckedChange={(value) => onCheck(value)}
        onClick={(event) => event.stopPropagation()}
      />
      <Button
        type="button"
        variant="ghost"
        size="row"
        focusStyle="inset"
        className="memory-row-main"
        onClick={onOpen}
      >
        <span dir="auto" className="memory-row-content">
          {memory.content}
        </span>
        <span className="memory-row-meta">
          <span>
            {translatedDynamic(t, "memory.category", memory.category)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{t(originLabelKey(memory.origin))}</span>
          <span aria-hidden="true">·</span>
          <span>
            {t("memory.sourceCount", { count: memory.sources.length })}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(memoryActivityAt(memory)).toISOString()}>
            {formatDate(locale, memoryActivityAt(memory))}
          </time>
        </span>
      </Button>
      <div className="memory-row-signals">
        {memory.conflict_with_id != null && memory.conflict_with_id !== "" && (
          <AlertTriangle
            aria-label={t("memory.needsAttention")}
            className="text-warning size-3.5"
          />
        )}
        <TooltipButton
          label={memory.pinned ? t("memory.unpin") : t("memory.pin")}
          variant="ghost"
          size="icon-xs"
          className={memory.pinned ? "text-primary" : "text-muted-foreground"}
          onClick={(event) => {
            event.stopPropagation();
            onPin();
          }}
        >
          {memory.pinned ? (
            <Pin className="size-3" />
          ) : (
            <PinOff className="size-3" />
          )}
        </TooltipButton>
      </div>
    </article>
  );
}

type EditorMode = "new" | "edit" | "correct";

function MemoryEditor({
  open,
  mode,
  record,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  mode: EditorMode;
  record: MemoryRecord | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (category: string, content: string, pinned: boolean) => void;
}) {
  const t = useT();
  const [category, setCategory] = useState("fact");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (!open) return;
    setCategory(record?.category ?? "fact");
    setContent(record?.content ?? "");
    setPinned(record?.pinned ?? true);
  }, [open, record]);

  const title =
    mode === "new"
      ? t("memory.editor.newTitle")
      : mode === "edit"
        ? t("memory.editor.editTitle")
        : t("memory.editor.correctTitle");
  const description =
    mode === "correct"
      ? t("memory.editor.correctHint")
      : t("memory.editor.editHint");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="text-metadata block space-y-1.5 font-medium">
            <span>{t("memory.category")}</span>
            <Select
              value={category}
              onValueChange={(value) => {
                if (value != null && value !== "") setCategory(value);
              }}
            >
              <SelectTrigger className="w-full justify-between">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {MEMORY_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {translatedDynamic(t, "memory.category", value)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className="text-metadata block space-y-1.5 font-medium">
            <span>{t("memory.content")}</span>
            <Textarea
              autoFocus
              dir="auto"
              value={content}
              placeholder={t("memory.contentPlaceholder")}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          {mode === "new" && (
            <label className="text-metadata flex items-center gap-2">
              <Checkbox
                checked={pinned}
                onCheckedChange={(value) => setPinned(value)}
              />
              {t("memory.keepPinned")}
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("memory.cancel")}
          </Button>
          <Button
            disabled={saving || !content.trim()}
            onClick={() => onSave(category, content.trim(), pinned)}
          >
            {saving ? t("memory.saving") : t("memory.saveAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailPanel({
  memory,
  evidence,
  usages,
  loading,
  reveal,
  onReveal,
  onPin,
  onForget,
  onRestore,
  onEdit,
  onDelete,
  onCategory,
  onOpenSession,
}: {
  memory: MemoryRecord | null;
  evidence: MemoryEvidence[];
  usages: MemoryUsage[];
  loading: boolean;
  reveal: boolean;
  onReveal: () => void;
  onPin: () => void;
  onForget: () => void;
  onRestore: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCategory: (category: string) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  if (!memory)
    return (
      <div className="memory-detail-empty">
        <BrainCircuit className="size-5" />
        <p>{t("memory.selectHint")}</p>
      </div>
    );
  const conflictReason =
    memory.conflict_reason === "automatic_conflicts_with_user_correction"
      ? t("memory.conflict.autoVsCorrection")
      : memory.conflict_reason;

  return (
    <div className="memory-detail-content">
      <header className="memory-detail-header">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge
            variant={
              memory.conflict_with_id != null && memory.conflict_with_id !== ""
                ? "destructive"
                : "outline"
            }
          >
            {memory.conflict_with_id != null && memory.conflict_with_id !== ""
              ? t("memory.needsAttention")
              : t(originLabelKey(memory.origin))}
          </Badge>
          {!memory.active && (
            <Badge variant="secondary">{t("memory.status.forgotten")}</Badge>
          )}
          {memory.pinned && (
            <Badge variant="secondary">
              <Pin className="size-3" />
              {t("memory.pinned")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {memory.active ? (
            <>
              <TooltipButton
                label={memory.pinned ? t("memory.unpin") : t("memory.pin")}
                variant="ghost"
                size="icon-xs"
                onClick={onPin}
              >
                {memory.pinned ? <PinOff /> : <Pin />}
              </TooltipButton>
              <TooltipButton
                label={t("memory.forget")}
                variant="ghost"
                size="icon-xs"
                onClick={onForget}
              >
                <Eraser />
              </TooltipButton>
            </>
          ) : (
            memory.conflict_with_id == null ||
            (memory.conflict_with_id === "" && (
              <Button variant="ghost" size="xs" onClick={onRestore}>
                <ArchiveRestore />
                {t("memory.restore")}
              </Button>
            ))
          )}
        </div>
      </header>
      <p dir="auto" className="memory-detail-text">
        {memory.content}
      </p>
      <dl className="memory-metadata">
        <div>
          <dt>{t("memory.category")}</dt>
          <dd>
            <Select
              value={memory.category}
              onValueChange={(value) => {
                if (value != null && value !== "") onCategory(value);
              }}
            >
              <SelectTrigger
                size="sm"
                className="memory-category-select justify-between"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {MEMORY_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {translatedDynamic(t, "memory.category", value)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </dd>
        </div>
        <div>
          <dt>{t("memory.lastActivity")}</dt>
          <dd>{formatDate(locale, memoryActivityAt(memory), true)}</dd>
        </div>
        <div>
          <dt>{t("memory.usageCount")}</dt>
          <dd>{memory.access_count}</dd>
        </div>
        <div>
          <dt>{t("memory.retention")}</dt>
          <dd>
            {memory.pinned
              ? t("memory.retentionPinned")
              : t("memory.retentionRolling")}
          </dd>
        </div>
      </dl>
      {conflictReason != null && conflictReason !== "" && (
        <aside className="memory-conflict-note">
          <AlertTriangle className="size-4 shrink-0" />
          <div>
            <strong>{t("memory.needsAttention")}</strong>
            <p>{conflictReason}</p>
          </div>
        </aside>
      )}
      <div className="memory-detail-actions">
        <Button size="sm" variant="outline" onClick={onEdit}>
          {memory.editable ? t("memory.edit") : t("memory.correct")}
        </Button>
        {!memory.active && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 />
            {t("memory.deletePermanently")}
          </Button>
        )}
      </div>
      <section className="memory-detail-section">
        <div className="memory-detail-section-title">
          <h3>{t("memory.evidence")}</h3>
          <Button
            variant="ghost"
            size="xs"
            disabled={loading}
            onClick={onReveal}
          >
            {reveal ? <EyeOff /> : <Eye />}
            {reveal ? t("memory.hideSensitive") : t("memory.revealSensitive")}
          </Button>
        </div>
        {loading ? (
          <p className="memory-detail-muted">{t("memory.loading")}</p>
        ) : evidence.length === 0 ? (
          <p className="memory-detail-muted">{t("memory.noEvidence")}</p>
        ) : (
          evidence.map((item) => (
            <Button
              key={`${item.session_id}:${item.part_seq}`}
              type="button"
              variant="ghost"
              size="row"
              focusStyle="inset"
              className="memory-history-item"
              onClick={() => onOpenSession(item.session_id)}
            >
              <span className="min-w-0 flex-1">
                <strong>
                  {item.session_title || item.session_id.slice(0, 8)}
                </strong>
                <small>
                  {t("memory.turnNumber", { number: item.part_seq })} ·{" "}
                  {formatDate(locale, item.created_at, true)}
                </small>
                <span dir="auto">
                  {item.available
                    ? item.excerpt
                    : t("memory.sourceUnavailable")}
                </span>
              </span>
              <ArrowUpRight className="size-3.5 shrink-0" />
            </Button>
          ))
        )}
      </section>
      <section className="memory-detail-section">
        <h3>{t("memory.usageHistory")}</h3>
        {usages.length === 0 ? (
          <p className="memory-detail-muted">{t("memory.noUsage")}</p>
        ) : (
          usages.map((item) => (
            <Button
              key={`${item.session_id}:${item.user_part_seq}`}
              type="button"
              variant="ghost"
              size="row"
              focusStyle="inset"
              className="memory-history-item"
              onClick={() => onOpenSession(item.session_id)}
            >
              <Clock3 className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <strong>
                  {item.session_title || item.session_id.slice(0, 8)}
                </strong>
                <small>
                  {t("memory.turnNumber", { number: item.user_part_seq })} ·{" "}
                  {formatDate(locale, item.created_at, true)}
                </small>
              </span>
              <ArrowUpRight className="size-3.5 shrink-0" />
            </Button>
          ))
        )}
      </section>
    </div>
  );
}

/** An auditable, project-scoped memory console inside Settings. */
export function MemorySettingsPage({
  projectPath,
  projects,
  onOpenSession,
}: {
  projectPath: string;
  projects: Project[];
  onOpenSession: (sessionId: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const narrow = useNarrowMemoryLayout();
  const [selectedProject, setSelectedProject] = useState(
    projectPath || projects[0]?.path || ""
  );
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [policy, setPolicy] = useState(DEFAULT_POLICY(selectedProject));
  const [stats, setStats] = useState(EMPTY_STATS);
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const deferredQuery = useDeferredValue(filter.query);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [detailOpen, setDetailOpen] = useState(false);
  const [evidence, setEvidence] = useState<MemoryEvidence[]>([]);
  const [usages, setUsages] = useState<MemoryUsage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("new");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (projectPath) setSelectedProject(projectPath);
  }, [projectPath]);

  const refresh = async () => {
    if (!selectedProject) {
      setRecords([]);
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextRecords, nextStats, nextPolicy] = await Promise.all([
        listManagedMemories(selectedProject),
        getMemoryStats(selectedProject),
        getMemoryProjectPolicy(selectedProject),
      ]);
      setRecords(nextRecords);
      setStats(nextStats);
      setPolicy(nextPolicy);
      setSelectedId((current) =>
        current != null &&
        current !== "" &&
        nextRecords.some((record) => record.id === current)
          ? current
          : (nextRecords.find((record) => record.layer !== "L3")?.id ?? null)
      );
    } catch (error) {
      toast(String(error), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void getMemorySettings()
      .then(setSettings)
      .catch((error: unknown) => toast(String(error), "error"));
  }, [toast]);
  useEffect(() => {
    setCheckedIds(new Set());
    setSelectedId(null);
    setRevealed(false);
    void refresh();
  }, [refresh]);

  const selected = records.find((record) => record.id === selectedId) ?? null;
  const profile = memoryProfile(records);
  const visible = filterMemories(records, { ...filter, query: deferredQuery });

  const loadDetail = async (memory: MemoryRecord | null, reveal = false) => {
    if (!memory) {
      setEvidence([]);
      setUsages([]);
      return;
    }
    setDetailLoading(true);
    try {
      const [nextEvidence, nextUsages] = await Promise.all([
        getMemoryEvidence(memory.id, reveal),
        getMemoryUsages(memory.id),
      ]);
      setEvidence(nextEvidence);
      setUsages(nextUsages);
    } catch (error) {
      toast(String(error), "error");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    setRevealed(false);
    void loadDetail(selected, false);
  }, [loadDetail, selected]);

  const updateSettings = (patch: Partial<MemorySettings>) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveMemorySettings(next).catch((error: unknown) => {
      setSettings(previous);
      toast(String(error), "error");
    });
  };
  const updatePolicy = (patch: Partial<MemoryProjectPolicy>) => {
    const previous = policy;
    const next = { ...policy, ...patch, project_path: selectedProject };
    setPolicy(next);
    void saveMemoryProjectPolicy(selectedProject, next).catch(
      (error: unknown) => {
        setPolicy(previous);
        toast(String(error), "error");
      }
    );
  };
  const patchRecord = (id: string, patch: Partial<MemoryRecord>) =>
    setRecords((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  const togglePin = async (memory: MemoryRecord) => {
    const pinned = !memory.pinned;
    patchRecord(memory.id, { pinned });
    try {
      await setMemoryPinned(memory.id, pinned);
      await refresh();
    } catch (error) {
      patchRecord(memory.id, { pinned: memory.pinned });
      toast(String(error), "error");
    }
  };
  const forget = async (memory: MemoryRecord) => {
    patchRecord(memory.id, { active: false, forgotten_at: Date.now() });
    try {
      await setMemoryActive(memory.id, false);
      toast(t("memory.forgotten"), "info", {
        label: t("memory.undo"),
        run: () => {
          void setMemoryActive(memory.id, true)
            .then(refresh)
            .catch((error: unknown) => toast(String(error), "error"));
        },
      });
      await refresh();
    } catch (error) {
      patchRecord(memory.id, {
        active: true,
        forgotten_at: memory.forgotten_at,
      });
      toast(String(error), "error");
    }
  };
  const restore = async (memory: MemoryRecord) => {
    await setMemoryActive(memory.id, true);
    toast(t("memory.restored"), "success");
    await refresh();
  };
  const removePermanently = async (memory: MemoryRecord) => {
    if (!(await confirmNative(t("memory.confirmDelete")))) return;
    await deleteMemory(memory.id);
    setDetailOpen(false);
    setSelectedId(null);
    toast(t("memory.deleted"), "info");
    await refresh();
  };
  const updateCategory = async (category: string) => {
    if (!selected) return;
    const previous = selected.category;
    patchRecord(selected.id, { category });
    try {
      patchRecord(selected.id, await setMemoryCategory(selected.id, category));
    } catch (error) {
      patchRecord(selected.id, { category: previous });
      toast(String(error), "error");
    }
  };
  const openRecord = (memory: MemoryRecord) => {
    setSelectedId(memory.id);
    if (narrow) setDetailOpen(true);
  };
  const openEditor = (mode: EditorMode) => {
    setEditorMode(mode);
    setEditorOpen(true);
  };
  const saveEditor = async (
    category: string,
    content: string,
    pinned: boolean
  ) => {
    setSaving(true);
    try {
      let saved: MemoryRecord;
      if (editorMode === "new")
        saved = await addMemory(selectedProject, category, content, pinned);
      else if (!selected) return;
      else if (editorMode === "edit")
        saved = await updateMemory(selected.id, category, content);
      else saved = await correctMemory(selected.id, category, content);
      setEditorOpen(false);
      await refresh();
      setSelectedId(saved.id);
      toast(
        editorMode === "correct" ? t("memory.corrected") : t("memory.saved"),
        "success"
      );
    } catch (error) {
      toast(String(error), "error");
    } finally {
      setSaving(false);
    }
  };
  const runBatch = async (action: "pin" | "unpin" | "forget" | "restore") => {
    const targets = records.filter((record) => checkedIds.has(record.id));
    if (
      action === "forget" &&
      !(await confirmNative(
        t("memory.confirmForget", { count: targets.length })
      ))
    )
      return;
    try {
      await Promise.all(
        targets.map(async (record) =>
          action === "pin" || action === "unpin"
            ? await setMemoryPinned(record.id, action === "pin")
            : await setMemoryActive(record.id, action === "restore")
        )
      );
      setCheckedIds(new Set());
      await refresh();
    } catch (error) {
      toast(String(error), "error");
    }
  };

  const policySummary = settings.enabled
    ? t("memory.behavior.summary", {
        capture: effectivePolicy(
          settings.capture,
          policy.capture,
          settings.enabled
        )
          ? t("memory.behavior.on")
          : t("memory.behavior.offShort"),
        recall: effectivePolicy(
          settings.inject,
          policy.inject,
          settings.enabled
        )
          ? t("memory.behavior.on")
          : t("memory.behavior.offShort"),
      })
    : t("memory.behavior.off");
  const detail = (
    <DetailPanel
      memory={selected}
      evidence={evidence}
      usages={usages}
      loading={detailLoading}
      reveal={revealed}
      onReveal={() => {
        const next = !revealed;
        setRevealed(next);
        void loadDetail(selected, next);
      }}
      onPin={() => {
        if (selected) void togglePin(selected);
      }}
      onForget={() => {
        if (selected) void forget(selected);
      }}
      onRestore={() => {
        if (selected)
          void restore(selected).catch((error: unknown) =>
            toast(String(error), "error")
          );
      }}
      onEdit={() =>
        openEditor(selected?.editable === true ? "edit" : "correct")
      }
      onDelete={() => {
        if (selected)
          void removePermanently(selected).catch((error: unknown) =>
            toast(String(error), "error")
          );
      }}
      onCategory={(category) => {
        void updateCategory(category);
      }}
      onOpenSession={onOpenSession}
    />
  );

  return (
    <div className="memory-console">
      <PageHeader
        title={t("memory.title")}
        description={t("memory.consoleHint")}
        actions={
          <>
            <Select
              value={selectedProject}
              onValueChange={(value) => {
                if (value != null && value !== "") setSelectedProject(value);
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("memory.project")}
                className="memory-project-select justify-between"
              >
                <SelectValue placeholder={t("memory.noProject")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {projects.map((project) => (
                    <SelectItem key={project.path} value={project.path}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!selectedProject || !settings.enabled}
              onClick={() => openEditor("new")}
            >
              <Plus />
              {t("memory.new")}
            </Button>
          </>
        }
      />

      <details className="memory-disclosure">
        <summary>
          <span className="memory-disclosure-icon">
            <ShieldCheck />
          </span>
          <span className="min-w-0 flex-1">
            <strong>{t("memory.behavior")}</strong>
            <small>{policySummary}</small>
          </span>
          <ChevronDown className="memory-disclosure-chevron" />
        </summary>
        <div className="memory-disclosure-body">
          <div className="memory-policy-column">
            <h2>{t("memory.globalDefaults")}</h2>
            <SettingToggle
              checked={settings.enabled}
              label={t("memory.enabled")}
              description={t("memory.enabledHint")}
              onCheckedChange={(enabled) => updateSettings({ enabled })}
            />
            <SettingToggle
              checked={settings.capture}
              disabled={!settings.enabled}
              label={t("memory.capture")}
              description={t("memory.captureHintShort")}
              onCheckedChange={(capture) => updateSettings({ capture })}
            />
            <SettingToggle
              checked={settings.inject}
              disabled={!settings.enabled}
              label={t("memory.inject")}
              description={t("memory.injectHintShort")}
              onCheckedChange={(inject) => updateSettings({ inject })}
            />
            <SettingToggle
              checked={settings.include_external_context}
              disabled={!settings.enabled || !settings.capture}
              label={t("memory.external")}
              description={t("memory.externalHintShort")}
              onCheckedChange={(include_external_context) =>
                updateSettings({ include_external_context })
              }
            />
          </div>
          <div className="memory-policy-column">
            <h2>{t("memory.projectOverrides")}</h2>
            <p className="text-metadata text-muted-foreground">
              {t("memory.projectOverridesHint")}
            </p>
            <PolicySelect
              label={t("memory.capture")}
              value={policy.capture}
              disabled={!selectedProject || !settings.enabled}
              onChange={(capture) => updatePolicy({ capture })}
            />
            <PolicySelect
              label={t("memory.inject")}
              value={policy.inject}
              disabled={!selectedProject || !settings.enabled}
              onChange={(inject) => updatePolicy({ inject })}
            />
            <PolicySelect
              label={t("memory.external")}
              value={policy.include_external_context}
              disabled={!selectedProject || !settings.enabled}
              onChange={(include_external_context) =>
                updatePolicy({ include_external_context })
              }
            />
            <aside className="memory-safety-note">
              <ShieldCheck />
              <p>{t("memory.safety")}</p>
            </aside>
          </div>
        </div>
      </details>

      {profile && (
        <details className="memory-disclosure memory-profile-disclosure">
          <summary>
            <span className="memory-disclosure-icon">
              <FileClock />
            </span>
            <span className="min-w-0 flex-1">
              <strong>{t("memory.projectProfile")}</strong>
              <small dir="auto">{profile.content}</small>
            </span>
            <Badge variant="outline">{t("memory.readOnly")}</Badge>
            <ChevronDown className="memory-disclosure-chevron" />
          </summary>
          <div className="memory-profile-body" dir="auto">
            {profile.content}
          </div>
        </details>
      )}

      {selectedProject ? (
        <div className="memory-workbench">
          <div className="memory-stats" aria-label={t("memory.stats")}>
            <StatButton
              value={stats.active}
              label={t("memory.stat.active")}
              active={filter.view === "all"}
              onClick={() =>
                setFilter((current) => ({ ...current, view: "all" }))
              }
            />
            <StatButton
              value={stats.pinned}
              label={t("memory.stat.pinned")}
              active={filter.view === "pinned"}
              onClick={() =>
                setFilter((current) => ({ ...current, view: "pinned" }))
              }
            />
            <StatButton
              value={stats.recent}
              label={t("memory.stat.recent")}
              active={filter.view === "recent"}
              onClick={() =>
                setFilter((current) => ({ ...current, view: "recent" }))
              }
            />
            <StatButton
              value={stats.forgotten}
              label={t("memory.stat.forgotten")}
              active={filter.view === "forgotten"}
              onClick={() =>
                setFilter((current) => ({ ...current, view: "forgotten" }))
              }
            />
            <StatButton
              value={stats.conflicts}
              label={t("memory.stat.conflicts")}
              warning
              active={filter.view === "conflicts"}
              onClick={() =>
                setFilter((current) => ({ ...current, view: "conflicts" }))
              }
            />
            <span className="memory-pending">
              {t("memory.pendingCount", { count: stats.pending })}
            </span>
          </div>
          <div className="memory-view-switcher">
            <ViewSwitcher
              label={t("memory.views")}
              value={filter.view}
              options={VIEWS.map(({ value, key }) => ({
                value,
                label: t(key),
              }))}
              onValueChange={(view) =>
                setFilter((current) => ({ ...current, view }))
              }
            />
          </div>
          <div className="memory-toolbar">
            <SearchField
              label={t("memory.search")}
              value={filter.query}
              placeholder={t("memory.searchPlaceholderShort")}
              onChange={(event) =>
                setFilter((current) => ({
                  ...current,
                  query: event.currentTarget.value,
                }))
              }
            />
            <Select
              value={filter.category}
              onValueChange={(category) => {
                if (category != null && category !== "")
                  setFilter((current) => ({ ...current, category }));
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("memory.filterCategory")}
                className="memory-filter-select justify-between"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">
                    {t("memory.allCategories")}
                  </SelectItem>
                  {MEMORY_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {translatedDynamic(t, "memory.category", value)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={filter.origin}
              onValueChange={(origin) => {
                if (origin != null && origin !== "")
                  setFilter((current) => ({ ...current, origin }));
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("memory.filterOrigin")}
                className="memory-filter-select justify-between"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("memory.allOrigins")}</SelectItem>
                  <SelectItem value="manual">
                    {t("memory.origin.manual")}
                  </SelectItem>
                  <SelectItem value="automatic">
                    {t("memory.origin.automatic")}
                  </SelectItem>
                  <SelectItem value="user_correction">
                    {t("memory.origin.userCorrection")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={filter.sort}
              onValueChange={(sort) => {
                if (sort)
                  setFilter((current) => ({
                    ...current,
                    sort,
                  }));
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("memory.sort")}
                className="memory-filter-select justify-between"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="activity">
                    {t("memory.sort.activity")}
                  </SelectItem>
                  <SelectItem value="updated">
                    {t("memory.sort.updated")}
                  </SelectItem>
                  <SelectItem value="used">{t("memory.sort.used")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {checkedIds.size > 0 && (
            <div
              className="memory-batch-bar"
              role="toolbar"
              aria-label={t("memory.batchActions")}
            >
              <strong>
                {t("memory.selectedCount", { count: checkedIds.size })}
              </strong>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void runBatch("pin")}
              >
                <Pin />
                {t("memory.pin")}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void runBatch("unpin")}
              >
                <PinOff />
                {t("memory.unpin")}
              </Button>
              {filter.view === "forgotten" ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => void runBatch("restore")}
                >
                  <ArchiveRestore />
                  {t("memory.restore")}
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => void runBatch("forget")}
                >
                  <Eraser />
                  {t("memory.forget")}
                </Button>
              )}
            </div>
          )}
          <div className="memory-management-grid">
            <section
              className="memory-list-panel"
              aria-label={t("memory.list")}
              aria-busy={loading}
            >
              <header className="memory-list-header">
                <label className="flex items-center gap-2">
                  <Checkbox
                    aria-label={t("memory.selectAll")}
                    checked={
                      visible.length > 0 &&
                      visible.every((record) => checkedIds.has(record.id))
                    }
                    onCheckedChange={(value) =>
                      setCheckedIds((current) => {
                        const next = new Set(current);
                        visible.forEach((record) =>
                          value ? next.add(record.id) : next.delete(record.id)
                        );
                        return next;
                      })
                    }
                  />
                  <span>{t("memory.results", { count: visible.length })}</span>
                </label>
                <span>{t("memory.retentionSummary")}</span>
              </header>
              <div className="memory-list-viewport">
                {loading ? (
                  <p className="memory-empty-state">{t("memory.loading")}</p>
                ) : visible.length === 0 ? (
                  <p className="memory-empty-state">{t("memory.empty")}</p>
                ) : (
                  visible.map((memory) => (
                    <MemoryRow
                      key={memory.id}
                      memory={memory}
                      selected={selectedId === memory.id}
                      checked={checkedIds.has(memory.id)}
                      onCheck={(checked) =>
                        setCheckedIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(memory.id);
                          else next.delete(memory.id);
                          return next;
                        })
                      }
                      onOpen={() => openRecord(memory)}
                      onPin={() => void togglePin(memory)}
                    />
                  ))
                )}
              </div>
            </section>
            <aside
              className="memory-detail-panel"
              aria-label={t("memory.details")}
            >
              {detail}
            </aside>
          </div>
        </div>
      ) : (
        <p className="memory-empty-state">{t("memory.noProject")}</p>
      )}

      <Dialog open={narrow && detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          className="memory-detail-dialog"
          aria-label={t("memory.details")}
        >
          {detail}
        </DialogContent>
      </Dialog>
      <MemoryEditor
        open={editorOpen}
        mode={editorMode}
        record={editorMode === "new" ? null : selected}
        saving={saving}
        onOpenChange={setEditorOpen}
        onSave={(category, content, pinned) => {
          void saveEditor(category, content, pinned);
        }}
      />
    </div>
  );
}
