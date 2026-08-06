import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { BrainCircuit, Eraser, Pin, PinOff, Plus, Search, ShieldCheck } from "lucide-react";

import {
  addMemory,
  getMemorySettings,
  getMemoryStats,
  listMemories,
  saveMemorySettings,
  searchMemories,
  setMemoryActive,
  setMemoryPinned,
  type MemoryRecord,
  type MemorySettings,
  type MemoryStats,
} from "../bridge";
import { useLanguage, useT } from "../i18n";
import { en as EN_STRINGS, type StringKey } from "../i18n/strings";
import { useToast } from "../ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DEFAULT_SETTINGS: MemorySettings = {
  enabled: true,
  capture: true,
  inject: true,
  include_external_context: true,
};
const EMPTY_STATS: MemoryStats = { l0: 0, l1: 0, l2: 0, l3: 0, pending: 0 };
const CATEGORIES = ["constraint", "preference", "fact", "event", "relationship"] as const;

function translatedDynamic(t: ReturnType<typeof useT>, prefix: string, value: string): string {
  const key = `${prefix}.${value}` as StringKey;
  return key in EN_STRINGS ? t(key) : value;
}

function ToggleRow({
  checked,
  disabled,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-8 py-3.5">
      <div className="max-w-[470px]">
        <div className="text-ui font-medium">{label}</div>
        <p className="mt-0.5 text-hint leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <Checkbox
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
    </div>
  );
}

function MemoryCard({
  memory,
  onForget,
  onPin,
}: {
  memory: MemoryRecord;
  onForget: (memory: MemoryRecord) => void;
  onPin: (memory: MemoryRecord) => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const source = memory.sources[0];
  const sourceLabel = source ? `${source.session_id.slice(0, 8)}:${source.part_seq}` : t("memory.manual");
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(memory.updated_at));

  return (
    <article className="rounded-lg bg-fill-quiet px-3 py-3">
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-cap">
            {memory.layer}
          </Badge>
          <span className="text-fine font-medium text-muted-foreground">
            {translatedDynamic(t, "memory.category", memory.category)}
          </span>
          {memory.relevance !== null && (
            <span className="font-mono text-cap text-muted-foreground">
              {Math.round(memory.relevance * 100)}%
            </span>
          )}
        </div>
        {memory.editable && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              aria-label={memory.pinned ? t("memory.unpin") : t("memory.pin")}
              title={memory.pinned ? t("memory.unpin") : t("memory.pin")}
              variant="ghost"
              size="icon"
              className={cn("size-7", memory.pinned ? "text-primary" : "text-muted-foreground")}
              onClick={() => onPin(memory)}
            >
              {memory.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </Button>
            <Button
              aria-label={t("memory.forget")}
              title={t("memory.forget")}
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={() => onForget(memory)}
            >
              <Eraser className="size-3.5" />
            </Button>
          </div>
        )}
      </header>
      <p dir="auto" className="mt-2 whitespace-pre-wrap break-words text-ui leading-relaxed">
        {memory.content}
      </p>
      <footer className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-cap text-muted-foreground">
        <span>{translatedDynamic(t, "memory.layer", memory.layer)}</span>
        <span aria-hidden="true">·</span>
        <span>{t("memory.source", { source: sourceLabel })}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={new Date(memory.updated_at).toISOString()}>{when}</time>
      </footer>
    </article>
  );
}

/** Full memory control surface inside Settings. */
export function MemorySettingsPage({ projectPath }: { projectPath: string }) {
  const t = useT();
  const toast = useToast();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("constraint");
  const [content, setContent] = useState("");

  const refresh = useCallback(async () => {
    if (!projectPath) {
      setRecords([]);
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextRecords, nextStats] = await Promise.all([
        deferredQuery
          ? searchMemories(projectPath, deferredQuery, 50)
          : listMemories(projectPath, 100),
        getMemoryStats(projectPath),
      ]);
      setRecords(nextRecords);
      setStats(nextStats);
    } catch (error) {
      toast(String(error), "error");
    } finally {
      setLoading(false);
    }
  }, [deferredQuery, projectPath, toast]);

  useEffect(() => {
    void getMemorySettings().then(setSettings).catch((error) => toast(String(error), "error"));
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateSettings = (patch: Partial<MemorySettings>) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveMemorySettings(next).catch((error) => {
      setSettings(previous);
      toast(String(error), "error");
    });
  };

  const submitMemory = () => {
    const text = content.trim();
    if (!text) {
      toast(t("memory.contentPlaceholder"), "error");
      return;
    }
    void addMemory(projectPath, category, text, true)
      .then(() => {
        setContent("");
        toast(t("memory.saved"), "success");
        return refresh();
      })
      .catch((error) => toast(String(error), "error"));
  };

  const pinMemory = (memory: MemoryRecord) => {
    const pinned = !memory.pinned;
    setRecords((items) => items.map((item) => (item.id === memory.id ? { ...item, pinned } : item)));
    void setMemoryPinned(memory.id, pinned).catch((error) => {
      setRecords((items) => items.map((item) => (item.id === memory.id ? { ...item, pinned: memory.pinned } : item)));
      toast(String(error), "error");
    });
  };

  const forgetMemory = (memory: MemoryRecord) => {
    const layerKey = memory.layer.toLowerCase() as keyof MemoryStats;
    setRecords((items) => items.filter((item) => item.id !== memory.id));
    void setMemoryActive(memory.id, false)
      .then(() => {
        setStats((current) => ({
          ...current,
          [layerKey]: Math.max(0, current[layerKey] - 1),
        }));
        toast(t("memory.forgotten"), "info", {
          label: t("memory.undo"),
          run: () => {
            void setMemoryActive(memory.id, true).then(refresh).catch((error) => toast(String(error), "error"));
          },
        });
      })
      .catch((error) => {
        setRecords((items) => [memory, ...items]);
        toast(String(error), "error");
      });
  };

  const layers = (["L0", "L1", "L2", "L3"] as const).map((layer) => ({
    layer,
    count: stats[layer.toLowerCase() as keyof MemoryStats],
  }));

  return (
    <div>
      <h1 className="text-display font-semibold tracking-tight">{t("memory.title")}</h1>
      <p className="pb-3 pt-1.5 text-hint leading-relaxed text-muted-foreground">{t("memory.hint")}</p>

      <section aria-label={t("memory.title")}>
        <ToggleRow
          checked={settings.enabled}
          label={t("memory.enabled")}
          hint={t("memory.enabledHint")}
          onChange={(enabled) => updateSettings({ enabled })}
        />
        <ToggleRow
          checked={settings.capture}
          disabled={!settings.enabled}
          label={t("memory.capture")}
          hint={t("memory.captureHint")}
          onChange={(capture) => updateSettings({ capture })}
        />
        <ToggleRow
          checked={settings.inject}
          disabled={!settings.enabled}
          label={t("memory.inject")}
          hint={t("memory.injectHint")}
          onChange={(inject) => updateSettings({ inject })}
        />
        <ToggleRow
          checked={settings.include_external_context}
          disabled={!settings.enabled || !settings.capture}
          label={t("memory.external")}
          hint={t("memory.externalHint")}
          onChange={(include_external_context) => updateSettings({ include_external_context })}
        />
        <aside className="mt-2 flex gap-2 rounded-lg bg-fill-quiet px-3 py-2.5 text-hint leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>{t("memory.safety")}</p>
        </aside>
      </section>

      {!projectPath ? (
        <p className="mt-8 text-ui text-muted-foreground">{t("memory.noProject")}</p>
      ) : (
        <>
          <section aria-label={t("memory.title")} className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {layers.map(({ layer, count }) => (
              <div key={layer} className="rounded-lg bg-fill-quiet px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-cap text-muted-foreground">{layer}</span>
                  <strong className="font-mono text-title tabular-nums">{count}</strong>
                </div>
                <p className="mt-1 text-fine text-muted-foreground">{translatedDynamic(t, "memory.layer", layer)}</p>
              </div>
            ))}
            <div className="rounded-lg bg-fill-quiet px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-cap text-muted-foreground">L1?</span>
                <strong className="font-mono text-title tabular-nums">{stats.pending}</strong>
              </div>
              <p className="mt-1 text-fine text-muted-foreground">{t("memory.pending")}</p>
            </div>
          </section>

          <section aria-labelledby="memory-add-title" className="mt-8">
            <h2 id="memory-add-title" className="text-title font-semibold">{t("memory.addHeading")}</h2>
            <p className="mt-1 text-hint leading-relaxed text-muted-foreground">{t("memory.addHint")}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
                <SelectTrigger aria-label={t("memory.category")} size="sm" className="w-full justify-between sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>{translatedDynamic(t, "memory.category", value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="min-w-0 flex-1">
                <label htmlFor="memory-content" className="sr-only">{t("memory.content")}</label>
                <Input
                  id="memory-content"
                  value={content}
                  placeholder={t("memory.contentPlaceholder")}
                  onChange={(event) => setContent(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) submitMemory();
                  }}
                  className="h-8 text-hint"
                />
              </div>
              <Button size="sm" className="gap-1.5" onClick={submitMemory}>
                <Plus className="size-3.5" />
                {t("memory.add")}
              </Button>
            </div>
          </section>

          <section aria-labelledby="memory-search-title" className="mt-8">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <label id="memory-search-title" htmlFor="memory-search" className="text-title font-semibold">
                  {t("memory.search")}
                </label>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="memory-search"
                    type="search"
                    value={query}
                    placeholder={t("memory.searchPlaceholder")}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-8 ps-8 text-hint"
                  />
                </div>
              </div>
              <span role="status" aria-live="polite" className="pb-1 text-fine text-muted-foreground">
                {t("memory.results", { count: records.length })}
              </span>
            </div>

            <div aria-busy={loading} className="mt-3 space-y-2">
              {loading ? (
                <div className="flex items-center gap-2 py-6 text-ui text-muted-foreground">
                  <BrainCircuit className="size-4" />
                  {t("memory.loading")}
                </div>
              ) : records.length === 0 ? (
                <p className="py-6 text-ui text-muted-foreground">{t("memory.empty")}</p>
              ) : (
                records.map((memory) => (
                  <MemoryCard key={memory.id} memory={memory} onForget={forgetMemory} onPin={pinMemory} />
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
