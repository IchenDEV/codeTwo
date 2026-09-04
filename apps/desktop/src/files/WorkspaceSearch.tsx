import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  cancelWorkspaceContentSearch,
  searchWorkspaceContents,
} from "../bridge";
import type {
  WorkspaceContentMatch,
  WorkspaceSearchOptions,
  WorkspaceSearchResult,
} from "../bridge";

const defaultOptions: WorkspaceSearchOptions = {
  case_sensitive: false,
  regex: false,
  whole_word: false,
};

let nextSearchRequest = 0;

export function workspaceSearchTruncationLabel(reason: string | null): string {
  if (reason == null || reason === "") {
    return "a resource limit";
  }
  const labels: Record<string, string> = {
    partial_record: "an interrupted final record",
    per_file_limit: "the per-file result limit",
    result_limit: "the result limit",
    stderr_limit: "the diagnostic-output limit",
    stdout_limit: "the output limit",
    timeout: "the time limit",
    unsafe_or_stale_path: "a path that changed during search",
    unsupported_content_encoding: "an unsupported content encoding",
    unsupported_path_encoding: "an unsupported path encoding",
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
  readonly cwd: string;
  readonly onOpen: (match: WorkspaceContentMatch) => void;
  readonly onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [options, setOptions] = useState(defaultOptions);
  const [result, setResult] = useState<WorkspaceSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const isQueryPending = query !== deferredQuery;
  const matches = isQueryPending ? [] : (result?.matches ?? []);
  const hasQuery = query.trim().length > 0;
  const isVisibleLoading = loading || isQueryPending;

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
    let isStarted = false;
    let isAlive = true;
    const requestId = `workspace-search-${Date.now()}-${++nextSearchRequest}`;
    const timer = window.setTimeout(() => {
      isStarted = true;
      void searchWorkspaceContents(cwd, deferredQuery, options, requestId, 200)
        .then((next) => {
          if (!isAlive || request !== requestRef.current) {
            return;
          }
          setResult(next);
          setActiveIndex(next.matches.length > 0 ? 0 : -1);
        })
        .catch((cause) => {
          if (!isAlive || request !== requestRef.current) {
            return;
          }
          setResult(null);
          setError(String(cause));
        })
        .finally(() => {
          if (isAlive && request === requestRef.current) {
            setLoading(false);
          }
        });
    }, 160);

    return () => {
      isAlive = false;
      window.clearTimeout(timer);
      if (isStarted) {
        void cancelWorkspaceContentSearch(requestId);
      }
    };
  }, [cwd, deferredQuery, options]);

  const focusResult = (index: number) => {
    if (matches.length === 0) {
      return;
    }
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
    } else if (
      event.key === "Enter" &&
      activeIndex >= 0 &&
      matches[activeIndex] != null
    ) {
      event.preventDefault();
      openResult(matches[activeIndex]);
    }
  };

  const onResultKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusResult(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        document.getElementById("workspace-content-query")?.focus();
      } else {
        focusResult(index - 1);
      }
    }
  };

  const toggle = (key: keyof WorkspaceSearchOptions) => {
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-dialog-max flex min-h-0 flex-col sm:max-w-3xl"
        aria-busy={isVisibleLoading}
        initialFocus={queryInputRef}
      >
        <DialogHeader>
          <DialogTitle>Search workspace contents</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <label
            htmlFor="workspace-content-query"
            className="text-body font-medium"
          >
            Search text
          </label>
          <Input
            ref={queryInputRef}
            id="workspace-content-query"
            type="search"
            value={query}
            maxLength={256}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="workspace-search-status"
            placeholder={
              options.regex
                ? "Enter a regular expression…"
                : "Find text in workspace files…"
            }
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <div className="flex flex-wrap gap-2" aria-label="Search options">
            <Button
              type="button"
              size="sm"
              variant={options.case_sensitive ? "default" : "secondary"}
              aria-pressed={options.case_sensitive}
              onClick={() => toggle("case_sensitive")}
            >
              Match case
            </Button>
            <Button
              type="button"
              size="sm"
              variant={options.whole_word ? "default" : "secondary"}
              aria-pressed={options.whole_word}
              onClick={() => toggle("whole_word")}
            >
              Whole word
            </Button>
            <Button
              type="button"
              size="sm"
              variant={options.regex ? "default" : "secondary"}
              aria-pressed={options.regex}
              onClick={() => toggle("regex")}
            >
              Regular expression
            </Button>
          </div>
        </div>

        <output
          id="workspace-search-status"
          className="min-h-control-mini text-metadata text-muted-foreground"
          aria-live="polite"
        >
          {!hasQuery && "Enter text to search file contents."}
          {hasQuery && isVisibleLoading ? "Searching…" : null}
          {hasQuery &&
          !isVisibleLoading &&
          (error == null || error === "") &&
          result != null ? (
            <>
              {matches.length} {matches.length === 1 ? "result" : "results"}.
              {result.truncated
                ? ` Results were truncated by ${workspaceSearchTruncationLabel(result.truncation_reason)}.`
                : null}
            </>
          ) : null}
        </output>

        {error ? (
          <p role="alert" className="text-metadata text-destructive">
            Search failed: {error}
          </p>
        ) : null}

        <ScrollArea className="min-h-0 flex-1 pe-3">
          <ul className="space-y-1" aria-label="Workspace search results">
            {matches.map((match, index) => (
              <li key={`${match.path}:${match.line}:${match.column}:${index}`}>
                <Button
                  ref={(node) => {
                    resultRefs.current[index] = node;
                  }}
                  type="button"
                  variant="selectable"
                  size="row"
                  focusStyle="inset"
                  data-selected={activeIndex === index ? "true" : "false"}
                  className="gap-optical min-w-0 flex-col items-stretch"
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={(event) => onResultKeyDown(event, index)}
                  onClick={() => openResult(match)}
                >
                  <span className="text-metadata flex min-w-0 items-baseline gap-2">
                    <span className="text-foreground truncate font-mono font-medium">
                      {match.path}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {match.line}:{match.column}
                    </span>
                  </span>
                  <span className="text-metadata text-muted-foreground mt-0.5 block truncate font-mono">
                    {match.preview || "Blank matching line"}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          {hasQuery &&
          !isVisibleLoading &&
          !error &&
          result &&
          matches.length === 0 ? (
            <p className="text-body text-muted-foreground py-6 text-center">
              No matching content.
            </p>
          ) : null}
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
