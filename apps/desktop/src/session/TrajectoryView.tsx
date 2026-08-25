import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ArrowDown, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useLanguage, useT } from "@/i18n";
import type { StringKey } from "@/i18n/strings";

import type { Turn } from "./turns";
import {
  deriveTrajectory,
  filterTrajectory,
  formatTrajectoryDuration,
  type TrajectoryKind,
  type TrajectoryLane,
  type TrajectoryRecord,
} from "./trajectory";

const KIND_LABEL: Record<TrajectoryKind, StringKey> = {
  user: "trajectory.kind.user",
  assistant: "trajectory.kind.assistant",
  reasoning: "trajectory.kind.reasoning",
  tool: "trajectory.kind.tool",
  memory: "trajectory.kind.memory",
  plan: "trajectory.kind.plan",
  error: "trajectory.kind.error",
};

const LANE_LABEL: Record<TrajectoryLane, StringKey> = {
  context: "trajectory.lane.context",
  assistant: "trajectory.lane.assistant",
  tool: "trajectory.lane.tool",
};

const KIND_TONE: Record<TrajectoryKind, string> = {
  user: "bg-primary",
  assistant: "bg-foreground",
  reasoning: "bg-muted-foreground",
  tool: "bg-warning",
  memory: "bg-success",
  plan: "bg-primary/65",
  error: "bg-destructive",
};

const FILTER_KINDS: Array<TrajectoryKind | "all"> = [
  "all",
  "user",
  "assistant",
  "reasoning",
  "tool",
  "memory",
  "plan",
  "error",
];

function safeDetail(value: unknown): { text: string; object: boolean } | null {
  if (value === undefined || value === null || value === "") return null;
  const object = typeof value !== "string";
  let text: string;
  try {
    text = object ? JSON.stringify(value, null, 2) : String(value);
  } catch {
    text = String(value);
  }
  const limit = 30_000;
  return {
    object,
    text: text.length > limit ? `${text.slice(0, limit)}\n…` : text,
  };
}

function DetailBlock({ label, value }: { label: string; value: unknown }) {
  const detail = safeDetail(value);
  if (!detail) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-fine font-medium text-foreground">{label}</h3>
      <pre
        className={cn(
          "max-h-72 overflow-auto rounded-(--ds-radius-control) bg-fill-quiet p-3 text-fine whitespace-pre-wrap break-words text-foreground",
          detail.object ? "font-mono" : "font-sans",
        )}
      >
        {detail.text}
      </pre>
    </section>
  );
}

interface PackedRecord {
  record: TrajectoryRecord;
  track: number;
}

function packLane(records: readonly TrajectoryRecord[]): { records: PackedRecord[]; tracks: number } {
  const ends: number[] = [];
  const packed = [...records]
    .sort((left, right) => left.startAt - right.startAt || left.index - right.index)
    .map((record) => {
      let track = ends.findIndex((end) => record.startAt >= end);
      if (track < 0) track = ends.length;
      ends[track] = Math.max(record.startAt, record.endAt);
      return { record, track };
    });
  return { records: packed, tracks: Math.max(1, ends.length) };
}

function Timeline({
  records,
  selectedId,
  onSelect,
}: {
  records: readonly TrajectoryRecord[];
  selectedId: string | null;
  onSelect: (record: TrajectoryRecord) => void;
}) {
  const t = useT();
  const startAt = Math.min(...records.map((record) => record.startAt));
  const rawEnd = Math.max(...records.map((record) => record.endAt));
  const endAt = Math.max(startAt + 1_000, rawEnd);
  const span = endAt - startAt;
  const lanes: TrajectoryLane[] = ["context", "assistant", "tool"];

  return (
    <section className="shrink-0 bg-fill-quiet px-4 py-3" aria-labelledby="trajectory-overview-title">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 id="trajectory-overview-title" className="text-ui font-medium">
          {t("trajectory.overview")}
        </h2>
        <span className="font-mono text-hint text-muted-foreground">
          {formatTrajectoryDuration(span)}
        </span>
      </div>
      <div className="trajectory-overview-grid" role="group" aria-label={t("trajectory.overview")}>
        {lanes.map((lane) => {
          const packed = packLane(records.filter((record) => record.lane === lane));
          const height = Math.max(24, packed.tracks * 12 + 8);
          return (
            <div key={lane} className="contents">
              <span className="self-center pe-3 text-hint text-muted-foreground">
                {t(LANE_LABEL[lane])}
              </span>
              <div className="trajectory-lane bg-background" style={{ height }}>
                {packed.records.map(({ record, track }) => {
                  const left = ((record.startAt - startAt) / span) * 100;
                  const width = ((Math.max(record.endAt, record.startAt) - record.startAt) / span) * 100;
                  const selected = record.id === selectedId;
                  return (
                    <button
                      key={record.id}
                      type="button"
                      className={cn(
                        "trajectory-bar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                        KIND_TONE[record.kind],
                        selected ? "opacity-100 ring-2 ring-foreground/50" : "opacity-60 hover:opacity-90",
                      )}
                      style={{
                        insetInlineStart: `${left}%`,
                        width: `${width}%`,
                        insetBlockStart: track * 12 + 4,
                      }}
                      aria-label={`${t(KIND_LABEL[record.kind])}: ${record.summary}`}
                      aria-pressed={selected}
                      title={`${record.title} · ${formatTrajectoryDuration(record.endAt - record.startAt)}`}
                      onClick={() => onSelect(record)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EventMarker({ kind }: { kind: TrajectoryKind }) {
  return <span className={cn("size-2 shrink-0 rounded-(--ds-radius-micro)", KIND_TONE[kind])} aria-hidden />;
}

function LedgerRow({
  record,
  selected,
  onSelect,
}: {
  record: TrajectoryRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "trajectory-ledger-row w-full text-left outline-none transition-colors duration-(--ds-motion-feedback) ease-(--ds-ease-enter) hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
        selected ? "bg-fill-rest text-foreground" : "bg-background text-muted-foreground",
      )}
      style={{ contentVisibility: "auto", containIntrinsicSize: "36px" } as CSSProperties}
      onClick={onSelect}
    >
      <span className="px-3 py-2 font-mono text-hint tabular-nums">
        {String(record.index).padStart(3, "0")}
      </span>
      <span className="flex min-w-0 items-center gap-2 px-3 py-2 text-fine">
        <EventMarker kind={record.kind} />
        <span className="truncate">{t(KIND_LABEL[record.kind])}</span>
      </span>
      <span className="min-w-0 px-3 py-2 text-fine">
        <span className="block truncate text-foreground">{record.summary || record.title}</span>
        {record.status ? (
          <span className="block truncate text-hint text-muted-foreground">
            {record.title} · {record.status}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Inspector({
  record,
  formatClock,
}: {
  record: TrajectoryRecord | null;
  formatClock: (timestamp: number) => string;
}) {
  const t = useT();
  if (!record) {
    return (
      <aside className="trajectory-inspector flex items-center justify-center bg-fill-quiet p-6 text-center text-fine text-muted-foreground">
        {t("trajectory.inspectHint")}
      </aside>
    );
  }
  return (
    <aside className="trajectory-inspector min-h-0 overflow-y-auto bg-fill-quiet p-4" aria-label={t("trajectory.inspector")}>
      <div className="flex items-start gap-2">
        <EventMarker kind={record.kind} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-ui font-medium text-foreground">{record.title}</h2>
          <p className="mt-1 text-fine text-muted-foreground">
            {record.step > 0
              ? t("trajectory.turnStep", { turn: record.turn, step: record.step })
              : t("trajectory.turn", { turn: record.turn })}
          </p>
        </div>
        {record.status ? <span className="shrink-0 text-hint text-muted-foreground">{record.status}</span> : null}
      </div>

      <dl className="trajectory-timing mt-4 bg-background text-fine">
        <div>
          <dt>{t("trajectory.started")}</dt>
          <dd>{formatClock(record.startAt)}</dd>
        </div>
        <div>
          <dt>{t("trajectory.ended")}</dt>
          <dd>{record.running ? t("trajectory.running") : formatClock(record.endAt)}</dd>
        </div>
        <div>
          <dt>{t("trajectory.duration")}</dt>
          <dd>{formatTrajectoryDuration(record.endAt - record.startAt)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-col gap-4">
        <DetailBlock label={t("trajectory.input")} value={record.input} />
        <DetailBlock label={t("trajectory.output")} value={record.output} />
      </div>
    </aside>
  );
}

export function TrajectoryView({
  turns,
  usage,
  hasEarlier,
  loadingEarlier,
  onLoadEarlier,
}: {
  turns: readonly Turn[];
  usage: { input_tokens: number; output_tokens: number } | null;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState<TrajectoryKind | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedTurns, setCollapsedTurns] = useState<Set<number>>(() => new Set());
  const [following, setFollowing] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const ledgerRef = useRef<HTMLDivElement | null>(null);

  const running = turns.some((turn) => turn.endedAt === undefined);
  const records = useMemo(() => deriveTrajectory(turns, now), [now, turns]);
  const visibleRecords = useMemo(
    () => filterTrajectory(records, kind, deferredQuery),
    [deferredQuery, kind, records],
  );
  const selected = visibleRecords.find((record) => record.id === selectedId)
    ?? visibleRecords[visibleRecords.length - 1]
    ?? null;
  const tailAt = records[records.length - 1]?.endAt ?? 0;
  const turnsWithRecords = useMemo(() => {
    const grouped = new Map<number, TrajectoryRecord[]>();
    for (const record of visibleRecords) {
      const group = grouped.get(record.turn) ?? [];
      group.push(record);
      grouped.set(record.turn, group);
    }
    return [...grouped.entries()];
  }, [visibleRecords]);
  const clock = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }),
    [locale],
  );
  const formatClock = (timestamp: number) => clock.format(new Date(timestamp));

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running, turns]);

  useEffect(() => {
    if (!following) return;
    const frame = requestAnimationFrame(() => {
      const ledger = ledgerRef.current;
      if (ledger) ledger.scrollTop = ledger.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [following, tailAt]);

  useEffect(() => {
    const ledger = ledgerRef.current;
    if (!following || !ledger || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      ledger.scrollTop = ledger.scrollHeight;
    });
    observer.observe(ledger);
    return () => observer.disconnect();
  }, [following]);

  const jumpToLatest = () => {
    setFollowing(true);
    const ledger = ledgerRef.current;
    if (ledger) ledger.scrollTop = ledger.scrollHeight;
  };

  const toggleTurn = (turn: number) => {
    setCollapsedTurns((current) => {
      const next = new Set(current);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });
  };

  return (
    <section className="trajectory-view flex min-h-0 flex-1 flex-col bg-background" aria-label={t("trajectory.label")}>
      <header className="flex shrink-0 flex-wrap items-center gap-2 bg-background px-4 py-2">
        <Input
          type="search"
          size="compact"
          className="min-w-48 flex-1"
          value={query}
          placeholder={t("trajectory.searchPlaceholder")}
          aria-label={t("trajectory.search")}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Select value={kind} onValueChange={(value) => value && setKind(value as TrajectoryKind | "all")}>
          <SelectTrigger size="sm" aria-label={t("trajectory.filter")}>
            <SelectValue>
              {kind === "all" ? t("trajectory.filterAll") : t(KIND_LABEL[kind])}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectGroup>
              {FILTER_KINDS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "all" ? t("trajectory.filterAll") : t(KIND_LABEL[value])}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="shrink-0 font-mono text-hint text-muted-foreground">
          {t("trajectory.eventCount", { count: visibleRecords.length })}
          {usage
            ? ` · ${t("trajectory.tokens", {
                input: usage.input_tokens.toLocaleString(locale),
                output: usage.output_tokens.toLocaleString(locale),
              })}`
            : ""}
        </span>
      </header>

      {visibleRecords.length > 0 ? (
        <Timeline records={visibleRecords} selectedId={selected?.id ?? null} onSelect={(record) => setSelectedId(record.id)} />
      ) : null}

      <div className="trajectory-workbench min-h-0 flex-1">
        <section className="relative flex min-h-0 flex-col bg-background" aria-label={t("trajectory.ledger")}>
          <div aria-hidden className="trajectory-ledger-row shrink-0 bg-fill-quiet text-hint font-medium text-muted-foreground">
            <span className="px-3 py-2">{t("trajectory.index")}</span>
            <span className="px-3 py-2">{t("trajectory.event")}</span>
            <span className="px-3 py-2">{t("trajectory.content")}</span>
          </div>
          <div
            ref={ledgerRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            onScroll={(event) => {
              const element = event.currentTarget;
              setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 40);
            }}
          >
            {hasEarlier ? (
              <div className="flex justify-center px-3 py-2">
                <Button type="button" size="compact" variant="ghost" disabled={loadingEarlier} onClick={onLoadEarlier}>
                  {loadingEarlier ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
                  {loadingEarlier ? t("transcript.loadingEarlier") : t("transcript.loadEarlier")}
                </Button>
              </div>
            ) : null}
            {turnsWithRecords.length === 0 ? (
              <p className="p-6 text-center text-fine text-muted-foreground">{t("trajectory.noEvents")}</p>
            ) : (
              turnsWithRecords.map(([turn, group]) => {
                const collapsed = collapsedTurns.has(turn);
                return (
                  <section key={turn} aria-label={t("trajectory.turn", { turn })}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 bg-fill-quiet px-3 py-2 text-left text-hint font-medium text-muted-foreground outline-none hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                      aria-expanded={!collapsed}
                      onClick={() => toggleTurn(turn)}
                    >
                      {collapsed ? <ChevronRight aria-hidden className="size-3" /> : <ChevronDown aria-hidden className="size-3" />}
                      <span>{t("trajectory.turn", { turn })}</span>
                      <span className="font-mono">{group.length}</span>
                    </button>
                    {collapsed ? null : group.map((record) => (
                      <LedgerRow
                        key={record.id}
                        record={record}
                        selected={record.id === selected?.id}
                        onSelect={() => setSelectedId(record.id)}
                      />
                    ))}
                  </section>
                );
              })
            )}
          </div>
          {!following ? (
            <Button type="button" size="compact" variant="secondary" className="absolute bottom-3 start-1/2 -translate-x-1/2" onClick={jumpToLatest}>
              <ArrowDown data-icon="inline-start" aria-hidden />
              {t("transcript.jumpLatest")}
            </Button>
          ) : null}
        </section>
        <Inspector record={selected} formatClock={formatClock} />
      </div>
    </section>
  );
}
