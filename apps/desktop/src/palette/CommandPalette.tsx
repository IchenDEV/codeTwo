import { useEffect, useMemo, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useT } from "../i18n";
import { mergeCommandResults } from "./merge";

export interface Command {
  id: string;
  /** Stable entity identity lets a richer async result replace its metadata-only row. */
  identity?: string;
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
  commands: Command[];
  search?: (query: string) => Promise<Command[]>;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Command[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "pending" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    const value = query.trim();
    if (!search || value.length < 2) {
      setMatches([]);
      setSearchState("idle");
      return;
    }
    setMatches([]);
    setSearchState("pending");
    let current = true;
    const timeout = window.setTimeout(() => {
      setSearchState("loading");
      void search(value)
        .then((results) => {
          if (current) {
            setMatches(results);
            setSearchState("success");
          }
        })
        .catch(() => {
          if (current) {
            setMatches([]);
            setSearchState("error");
          }
        });
    }, 200);
    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [query, search]);

  const visible = useMemo(() => {
    return mergeCommandResults(commands, matches);
  }, [commands, matches]);

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
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t("palette.placeholder")}
      />
      <CommandList>
        <CommandEmpty>{searchStatus ? null : t("palette.empty")}</CommandEmpty>
        {visible.map((c) => (
          <CommandItem
            key={c.id}
            value={`${c.label} ${c.hint ?? ""} ${c.detail ?? ""} ${c.keywords ?? ""}`}
            onSelect={() => {
              onClose();
              c.run();
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{c.label}</span>
              {c.detail && (
                <span className="block truncate text-fine text-muted-foreground">{c.detail}</span>
              )}
            </span>
            {c.hint && <CommandShortcut>{c.hint}</CommandShortcut>}
          </CommandItem>
        ))}
        {searchStatus && (
          <p role="status" className="px-3 py-2 text-fine text-muted-foreground">
            {searchStatus}
          </p>
        )}
      </CommandList>
    </CommandDialog>
  );
}
