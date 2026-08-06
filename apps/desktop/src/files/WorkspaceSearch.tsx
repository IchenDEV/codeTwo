import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  cancelWorkspaceContentSearch,
  searchWorkspaceContents,
  type WorkspaceContentMatch,
  type WorkspaceSearchOptions,
  type WorkspaceSearchResult,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const DEFAULT_OPTIONS: WorkspaceSearchOptions = {
  regex: false,
  case_sensitive: false,
  whole_word: false,
};

let nextSearchRequest = 0;

export function workspaceSearchTruncationLabel(reason: string | null): string {
  if (!reason) return "a resource limit";
  const labels: Record<string, string> = {
    result_limit: "the result limit",
    per_file_limit: "the per-file result limit",
    stdout_limit: "the output limit",
    stderr_limit: "the diagnostic-output limit",
    timeout: "the time limit",
    partial_record: "an interrupted final record",
    unsupported_path_encoding: "an unsupported path encoding",
    unsafe_or_stale_path: "a path that changed during search",
    unsupported_content_encoding: "an unsupported content encoding",
  };
  return reason
    .split(",")
    .map((part) => labels[part] ?? "a resource limit")
    .join(", ");
}

export function WorkspaceSearchModal({
  cwd,
  onOpen,
  onClose,
}: {
  cwd: string;
  onOpen: (match: WorkspaceContentMatch) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [result, setResult] = useState<WorkspaceSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestRef = useRef(0);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const queryPending = query !== deferredQuery;
  const matches = queryPending ? [] : (result?.matches ?? []);
  const hasQuery = query.trim().length > 0;
  const visibleLoading = loading || queryPending;

  useEffect(() => {
    const request = ++requestRef.current;
    setActiveIndex(-1);
    resultRefs.current = [];

    if (!deferredQuery.trim()) {
      setLoading(false);
      setError(null);
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    let started = false;
    let alive = true;
    const requestId = `workspace-search-${Date.now()}-${++nextSearchRequest}`;
    const timer = window.setTimeout(() => {
      started = true;
      void searchWorkspaceContents(cwd, deferredQuery, options, requestId, 200)
        .then((next) => {
          if (!alive || request !== requestRef.current) return;
          setResult(next);
          setActiveIndex(next.matches.length > 0 ? 0 : -1);
        })
        .catch((cause) => {
          if (!alive || request !== requestRef.current) return;
          setResult(null);
          setError(String(cause));
        })
        .finally(() => {
          if (alive && request === requestRef.current) setLoading(false);
        });
    }, 160);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      if (started) void cancelWorkspaceContentSearch(requestId);
    };
  }, [cwd, deferredQuery, options]);

  const focusResult = (index: number) => {
    if (matches.length === 0) return;
    const next = (index + matches.length) % matches.length;
    setActiveIndex(next);
    resultRefs.current[next]?.focus();
  };

  const openResult = (match: WorkspaceContentMatch) => {
    onOpen(match);
    onClose();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && matches.length > 0) {
      event.preventDefault();
      focusResult(activeIndex < 0 ? 0 : activeIndex);
    } else if (event.key === "Enter" && activeIndex >= 0 && matches[activeIndex]) {
      event.preventDefault();
      openResult(matches[activeIndex]);
    }
  };

  const onResultKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusResult(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) document.getElementById("workspace-content-query")?.focus();
      else focusResult(index - 1);
    }
  };

  const toggle = (key: keyof WorkspaceSearchOptions) => {
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[86dvh] min-h-0 flex-col sm:max-w-3xl"
        aria-busy={visibleLoading}
      >
        <DialogHeader>
          <DialogTitle>Search workspace contents</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="workspace-content-query" className="text-ui font-medium">
            Search text
          </label>
          <Input
            id="workspace-content-query"
            type="search"
            value={query}
            maxLength={256}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-describedby="workspace-search-status"
            placeholder={options.regex ? "Enter a regular expression…" : "Find text in workspace files…"}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <div className="flex flex-wrap gap-2" aria-label="Search options">
            <Button
              type="button"
              size="sm"
              variant={options.case_sensitive ? "default" : "outline"}
              aria-pressed={options.case_sensitive}
              onClick={() => toggle("case_sensitive")}
            >
              Match case
            </Button>
            <Button
              type="button"
              size="sm"
              variant={options.whole_word ? "default" : "outline"}
              aria-pressed={options.whole_word}
              onClick={() => toggle("whole_word")}
            >
              Whole word
            </Button>
            <Button
              type="button"
              size="sm"
              variant={options.regex ? "default" : "outline"}
              aria-pressed={options.regex}
              onClick={() => toggle("regex")}
            >
              Regular expression
            </Button>
          </div>
        </div>

        <div
          id="workspace-search-status"
          className="min-h-5 text-hint text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {!hasQuery && "Enter text to search file contents."}
          {hasQuery && visibleLoading && "Searching…"}
          {hasQuery && !visibleLoading && !error && result && (
            <>
              {matches.length} {matches.length === 1 ? "result" : "results"}.
              {result.truncated && ` Results were truncated by ${workspaceSearchTruncationLabel(result.truncation_reason)}.`}
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="text-hint text-destructive">
            Search failed: {error}
          </p>
        )}

        <ScrollArea className="min-h-0 flex-1 pe-3">
          <ul className="space-y-1" aria-label="Workspace search results">
            {matches.map((match, index) => (
              <li key={`${match.path}:${match.line}:${match.column}:${index}`}>
                <button
                  ref={(node) => {
                    resultRefs.current[index] = node;
                  }}
                  type="button"
                  className={cn(
                    "block w-full min-w-0 rounded-md px-2.5 py-2 text-start outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
                    activeIndex === index && "bg-accent/50",
                  )}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={(event) => onResultKeyDown(event, index)}
                  onClick={() => openResult(match)}
                >
                  <span className="flex min-w-0 items-baseline gap-2 text-hint">
                    <span className="truncate font-mono font-medium text-foreground">{match.path}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {match.line}:{match.column}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-hint text-muted-foreground">
                    {match.preview || "Blank matching line"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {hasQuery && !visibleLoading && !error && result && matches.length === 0 && (
            <p className="py-6 text-center text-ui text-muted-foreground">No matching content.</p>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
