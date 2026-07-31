import { useCallback, useEffect, useState } from "react";
import { AtSign, ChevronRight, Loader2, MessageSquarePlus, Pencil, Save } from "lucide-react";
import { codeToTokens, type ThemedToken } from "shiki";

import { readText, writeText } from "../bridge";
import { useT } from "../i18n";
import { useColorScheme } from "../theme";
import { useToast } from "../ui/toast";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Extension → shiki grammar. Anything not listed renders as plain text, which is never wrong. */
const LANGS: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  rs: "rust",
  toml: "toml",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  sql: "sql",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  swift: "swift",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
};

function langOf(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGS[ext] ?? null;
}

// Past this, tokenizing costs more than it teaches; the viewer falls back to plain text.
const MAX_HIGHLIGHT_LINES = 5_000;
const MAX_HIGHLIGHT_BYTES = 400_000;

/**
 * The built-in file view — a pane inside the right panel, under the file tabs.
 *
 * Read-only until you ask for otherwise — a stray keystroke in a viewer must cost nothing. Reading
 * gets the full treatment: syntax colours, a breadcrumb, and a gutter you can click or drag to
 * pick lines and leave a comment. The comment doesn't stay here — it lands in the prompt document
 * as a context block, because "look at these lines and do X" is the whole reason a coding agent's
 * app has a file viewer.
 */
export function FileViewer({
  cwd,
  path,
  editing,
  onEditing,
  onInsert,
  onComment,
}: {
  cwd: string;
  path: string;
  editing: boolean;
  onEditing: (v: boolean) => void;
  onInsert: (path: string) => void;
  /** Receives a ready-made markdown context block for the prompt document. */
  onComment: (text: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const scheme = useColorScheme();
  const [content, setContent] = useState<string | null>(null);
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Line selection: `a` is the anchor, `b` the end the drag or shift-click moved to.
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setContent(null);
    setError(null);
    setSel(null);
    setNote("");
    readText(cwd, path)
      .then((text) => {
        setContent(text);
        setDraft(text);
      })
      .catch((e) => setError(String(e)));
  }, [cwd, path]);

  // Highlight off the render path: plain text paints immediately, colour arrives when ready.
  useEffect(() => {
    setTokens(null);
    if (content === null) return;
    const lang = langOf(path);
    if (!lang || content.length > MAX_HIGHLIGHT_BYTES) return;
    const lineCount = content.split("\n").length;
    if (lineCount > MAX_HIGHLIGHT_LINES) return;
    let alive = true;
    codeToTokens(content, {
      lang: lang as never,
      theme: scheme === "dark" ? "github-dark" : "github-light",
    })
      .then((r) => {
        if (alive) setTokens(r.tokens);
      })
      .catch(() => {
        /* unknown grammar or tokenizer failure — plain text is already on screen */
      });
    return () => {
      alive = false;
    };
  }, [content, path, scheme]);

  useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const dirty = editing && draft !== content;
  const lines = content?.split("\n") ?? [];
  const lo = sel ? Math.min(sel.a, sel.b) : -1;
  const hi = sel ? Math.max(sel.a, sel.b) : -1;
  const range = sel ? (lo === hi ? `L${lo + 1}` : `L${lo + 1}–L${hi + 1}`) : "";

  const clearSel = () => {
    setSel(null);
    setNote("");
  };

  const submit = () => {
    if (!sel || !note.trim() || content === null) return;
    const excerpt = lines.slice(lo, hi + 1).join("\n");
    const lang = langOf(path) ?? "";
    // Same shape as the browser's context block: a labelled quote the agent can act on.
    const block = `**File comment** — \`${path}\` (${range})\n\n\`\`\`${lang}\n${excerpt}\n\`\`\`\n\n${note.trim()}\n`;
    toast(t("files.commentAdded"), "success");
    clearSel();
    onComment(block);
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await writeText(cwd, path, draft);
      setContent(draft);
      onEditing(false);
      toast(t("files.saved", { path }), "success");
    } catch (e) {
      toast(String(e), "error");
    }
    setSaving(false);
  }, [cwd, path, draft, onEditing, toast, t]);

  // The project's own name leads the breadcrumb, reference-style: "project > docs > file.md".
  const parts = [cwd.split("/").filter(Boolean).pop() ?? cwd, ...path.split("/")];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b px-3 py-1.5">
        {/* Breadcrumb, not a raw path: the segments are how you know where you are. */}
        <span className="flex min-w-0 flex-1 items-center gap-0.5 text-hint">
          {parts.map((p, i) =>
            i === parts.length - 1 ? (
              <span key={i} className="truncate font-medium">
                {p}
                {dirty && <span className="ml-1.5 text-warning">•</span>}
              </span>
            ) : (
              <span key={i} className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                <span className="max-w-32 truncate">{p}</span>
                <ChevronRight className="size-3 text-muted-foreground/50" />
              </span>
            ),
          )}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => onInsert(path)}>
              <AtSign className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("files.insert")}</TooltipContent>
        </Tooltip>

        {editing ? (
          <>
            <Button variant="ghost" size="sm" className="h-7 text-hint" onClick={() => { setDraft(content ?? ""); onEditing(false); }}>
              {t("files.cancel")}
            </Button>
            <Button size="sm" className="h-7 text-hint" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {t("files.save")}
            </Button>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={content === null}
                onClick={() => onEditing(true)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("files.edit")}</TooltipContent>
          </Tooltip>
        )}
      </header>

      {error ? (
        <p className="px-6 py-4 text-ui text-destructive">{error}</p>
      ) : content === null ? (
        <p className="flex items-center gap-2 px-6 py-4 text-ui text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("files.loading")}
        </p>
      ) : editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent px-6 pb-6 font-mono text-hint leading-relaxed outline-none"
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-2 pb-6 font-mono text-hint leading-relaxed" title={sel ? undefined : t("files.gutterHint")}>
            {lines.map((line, i) => {
              const selected = sel !== null && i >= lo && i <= hi;
              return (
                <div key={i}>
                  <div className={cn("flex", selected && "bg-primary/8")}>
                    {/* The gutter is the comment affordance: click a number, or drag a range. */}
                    <span
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (e.shiftKey && sel) {
                          setSel({ a: sel.a, b: i });
                        } else {
                          setSel({ a: i, b: i });
                          setDragging(true);
                        }
                      }}
                      onMouseEnter={() => dragging && setSel((s) => (s ? { a: s.a, b: i } : s))}
                      className={cn(
                        "w-12 shrink-0 cursor-pointer select-none pr-3 text-right",
                        selected ? "text-primary" : "text-muted-foreground/50 hover:text-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 whitespace-pre-wrap break-words border-l-2 pl-3",
                        selected ? "border-primary" : "border-transparent",
                      )}
                    >
                      {tokens?.[i] ? (
                        tokens[i].map((tk, j) => (
                          <span key={j} style={{ color: tk.color }}>
                            {tk.content}
                          </span>
                        ))
                      ) : line.length === 0 ? (
                        "​"
                      ) : (
                        line
                      )}
                    </span>
                  </div>

                  {/* The comment card sits right under the selection, where the eye already is. */}
                  {sel !== null && i === hi && (
                    <div className="glass-raised my-2 ml-14 max-w-md rounded-xl border p-3 font-sans shadow-lg">
                      <div className="flex items-center gap-2 text-hint font-medium">
                        <MessageSquarePlus className="size-3.5 text-primary" />
                        {t("files.commentTitle")}
                      </div>
                      <div className="mt-0.5 text-fine text-muted-foreground">
                        {t("files.commentOn", { range })}
                      </div>
                      <textarea
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") clearSel();
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                        }}
                        placeholder={t("files.commentPlaceholder")}
                        className="mt-2 min-h-16 w-full resize-y rounded-md border bg-transparent px-2.5 py-1.5 text-hint outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-hint" onClick={clearSel}>
                          {t("files.cancel")}
                        </Button>
                        <Button size="sm" className="h-7 text-hint" disabled={!note.trim()} onClick={submit}>
                          {t("browser.addToPrompt")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
