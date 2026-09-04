import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

import { useT } from "../i18n";
import { mergeCommandResults } from "./merge";

export type CommandCategory = "action" | "session" | "setting";

export interface Command {
  id: string;
  /**
  Stable entity identity lets a richer async result replace its metadata-only row.
  */
  identity?: string;
  category?: CommandCategory;
  label: string;
  hint?: string;
  detail?: string;
  keywords?: string;
  run: () => void;
}

// Command palette (Mod+K): immediate fuzzy search plus a debounced durable transcript search.
export function CommandPalette({
  commands,
  search,
  onClose,
}: {
  readonly commands: Command[];
  readonly search?: (query: string) => Promise<Command[]>;
  readonly onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Command[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "pending" | "loading" | "success" | "error"
  >("idle");
  const [filter, setFilter] = useState<"all" | CommandCategory>("all");

  useEffect(() => {
    const value = query.trim();
    if (!search || value.length < 2) {
      setMatches([]);
      setSearchState("idle");
      return;
    }
    setMatches([]);
    setSearchState("pending");
    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      setSearchState("loading");
      void search(value)
        .then((results) => {
          if (isCurrent) {
            setMatches(results);
            setSearchState("success");
          }
        })
        .catch(() => {
          if (isCurrent) {
            setMatches([]);
            setSearchState("error");
          }
        });
    }, 200);
    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
    };
  }, [query, search]);

  const visible = mergeCommandResults(commands, matches);

  const groups = (() => {
    const filtered =
      filter === "all"
        ? visible
        : visible.filter(
            (command) => (command.category ?? "action") === filter
          );
    return (["session", "action", "setting"] as const)
      .map((category) => ({
        category,
        commands: filtered.filter(
          (command) => (command.category ?? "action") === category
        ),
      }))
      .filter((group) => group.commands.length > 0);
  })();

  const filters = [
    { id: "all" as const, label: t("palette.filterAll") },
    { id: "action" as const, label: t("palette.actions") },
    { id: "session" as const, label: t("palette.sessions") },
    { id: "setting" as const, label: t("palette.settings") },
  ];

  const groupLabel = (category: CommandCategory) => {
    if (category === "session" && query.trim().length === 0) {
      return t("palette.recentSessions");
    }
    if (category === "session") {
      return t("palette.sessions");
    }
    if (category === "setting") {
      return t("palette.settings");
    }
    return t("palette.actions");
  };

  const searchStatus =
    searchState === "error"
      ? t("palette.searchFailed")
      : searchState === "pending" || searchState === "loading"
        ? t("palette.searching")
        : null;

  return (
    <CommandDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("palette.title")}
      description={t("palette.description")}
      className="command-palette-surface gap-0 p-0 shadow-(--ds-elevation-modal) sm:max-w-3xl"
      showCloseButton={false}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t("palette.placeholder")}
        aria-label={t("palette.description")}
      />
      <CommandSeparator className="mx-0" />
      <div
        role="toolbar"
        aria-label={t("palette.filters")}
        className="flex items-center gap-1 px-3 py-2"
      >
        {filters.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            size="compact"
            data-palette-filter={item.id}
            aria-pressed={filter === item.id}
            className={
              filter === item.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground"
            }
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <CommandList className="max-h-none min-h-0 flex-1">
        <CommandEmpty>
          {searchStatus != null && searchStatus !== ""
            ? null
            : t("palette.empty")}
        </CommandEmpty>
        {groups.map((group) => (
          <CommandGroup
            key={group.category}
            heading={groupLabel(group.category)}
            data-palette-group={group.category}
          >
            {group.commands.map((command) => (
              <CommandItem
                key={command.id}
                value={`${command.label} ${command.hint ?? ""} ${command.detail ?? ""} ${command.keywords ?? ""}`}
                onSelect={() => {
                  onClose();
                  command.run();
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{command.label}</span>
                  {command.detail != null && command.detail !== "" ? (
                    <span className="text-callout text-muted-foreground block truncate">
                      {command.detail}
                    </span>
                  ) : null}
                </span>
                {command.hint != null && command.hint !== "" ? (
                  <CommandShortcut>{command.hint}</CommandShortcut>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {searchStatus != null &&
        searchStatus !== "" &&
        (filter === "all" || filter === "session") ? (
          <output className="text-callout text-muted-foreground px-3 py-2">
            {searchStatus}
          </output>
        ) : null}
      </CommandList>
      <CommandSeparator className="mx-0" />
      <div className="text-callout text-muted-foreground flex items-center gap-4 px-3 py-2">
        <span>
          <kbd className="text-foreground font-mono">↑↓</kbd>{" "}
          {t("palette.navigate")}
        </span>
        <span>
          <kbd className="text-foreground font-mono">↵</kbd> {t("palette.open")}
        </span>
        <span className="ml-auto">
          <kbd className="text-foreground font-mono">esc</kbd>{" "}
          {t("palette.close")}
        </span>
      </div>
    </CommandDialog>
  );
}
