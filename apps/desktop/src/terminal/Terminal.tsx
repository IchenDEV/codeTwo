import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { ArrowDown, ArrowUp, X } from "@/components/ui/icons";
import { onPtyExit, onPtyOutput, ptyResize, ptySpawn, ptyWrite } from "../bridge";
import { useT } from "../i18n";
import { useColorScheme } from "../theme";
import { Separator } from "@/components/ui/separator";
import { useTerminalSettings } from "./settings";

const FALLBACK_MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';

function cssVar(name: string, fallback = ""): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * The renderer's palette, read from the `--term-*` custom properties.
 *
 * Those are declared in hex precisely so this can hand them straight to xterm — it parses colour
 * strings itself and has no browser to resolve the `oklch()` the rest of the app's tokens use.
 */
function terminalTheme(): ITheme {
  const ansi = (n: number) => cssVar(`--term-ansi-${n}`);
  return {
    background: cssVar("--term-bg", "#1d2026"),
    foreground: cssVar("--term-fg", "#c9cfd9"),
    cursor: cssVar("--term-cursor", "#79a9f0"),
    cursorAccent: cssVar("--term-bg", "#1d2026"),
    selectionBackground: cssVar("--term-selection", "#3b6ea566"),
    black: ansi(0),
    red: ansi(1),
    green: ansi(2),
    yellow: ansi(3),
    blue: ansi(4),
    magenta: ansi(5),
    cyan: ansi(6),
    white: ansi(7),
    brightBlack: ansi(8),
    brightRed: ansi(9),
    brightGreen: ansi(10),
    brightYellow: ansi(11),
    brightBlue: ansi(12),
    brightMagenta: ansi(13),
    brightCyan: ansi(14),
    brightWhite: ansi(15),
  };
}

/**
 * The embedded terminal's renderer.
 *
 * The terminal itself lives in the core, as a real emulator with its own scrollback — this is only
 * a view onto it. That split is why `id` matters more than it looks: it's a stable key, so
 * remounting (a dock tab switch, a session change, an app restart) re-attaches to the running
 * terminal and replays its state instead of spawning a second shell over the top of the first.
 * Unmounting therefore does *not* kill anything; only closing the tab does.
 */
export function TerminalPanel({
  id,
  cwd,
  projectPath,
  tmux = false,
}: {
  /** Stable across remounts — see above. */
  id: string;
  cwd: string | null;
  /** Command realm owning this terminal; null denotes the global user graph. */
  projectPath: string | null;
  tmux?: boolean;
}) {
  const t = useT();
  const scheme = useColorScheme();
  const settings = useTerminalSettings();

  const boxRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);

  // Read at construction only, so changing them later doesn't tear the terminal down and back up.
  const initial = useRef(settings);
  initial.current = settings;

  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");

  // Terminals stay mounted when they're not the visible tab, so they have no layout box — and
  // xterm's fit addon throws on those. The dock's resize event reaches every mounted instance, so
  // this guard is what keeps a panel resize from spraying errors from the hidden ones.
  const refit = useCallback(() => {
    const el = boxRef.current;
    const term = termRef.current;
    if (!el || !term || el.offsetParent === null || el.clientWidth === 0 || el.clientHeight === 0) {
      return false;
    }
    try {
      fitRef.current?.fit();
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    const term = new Terminal({
      fontSize: initial.current.fontSize,
      fontFamily: initial.current.fontFamily || cssVar("--font-mono", FALLBACK_MONO),
      scrollback: initial.current.scrollback,
      theme: terminalTheme(),
      // xterm's defaults date the terminal more than anything else about it. 1.0 line height is
      // tighter than any editor in this app; a hard block cursor and instant scroll jumps read as
      // an emulator from a decade ago.
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      // A filled block over the character you're not currently typing in is noise; an outline says
      // "this terminal is here but not focused" without shouting.
      cursorInactiveStyle: "outline",
      smoothScrollDuration: 90,
      // Font smoothing makes 400 look thin at these sizes on a dark background.
      fontWeight: 450,
      fontWeightBold: 650,
      // Bold text should be bold, not a different colour — the bright ANSI slots are for programs
      // that actually asked for them.
      drawBoldTextInBrightColors: false,
      // ⌥ as Meta is what every macOS terminal does, and readline is unusable without it.
      macOptionIsMeta: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(el);

    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;
    refit();

    let disposed = false;
    let stopOutput: (() => void) | null = null;
    let stopExit: (() => void) | null = null;

    void (async () => {
      // Output that lands while we're still attaching has to wait for the restore dump, or it
      // would be painted first and then overwritten by the older state.
      let pending: string[] | null = [];

      stopOutput = await onPtyOutput((p) => {
        if (p.id !== id || p.project_path !== projectPath) return;
        if (pending) pending.push(p.data);
        else term.write(p.data);
      });
      stopExit = await onPtyExit((exited) => {
        if (exited.id === id && exited.project_path === projectPath) {
          term.write(`\r\n\x1b[2m${t("terminal.exited")}\x1b[0m\r\n`);
        }
      });
      if (disposed) return;

      const { restore } = await ptySpawn(id, cwd, term.rows, term.cols, {
        tmuxSession: tmux ? id : null,
        scrollback: initial.current.scrollback,
      });
      if (disposed) return;

      if (restore) term.write(restore);
      const queued = pending ?? [];
      pending = null;
      for (const chunk of queued) term.write(chunk);
    })();

    const dataSub = term.onData((d) => {
      void ptyWrite(id, d);
    });
    const onResize = () => {
      if (refit()) void ptyResize(id, term.rows, term.cols);
    };
    window.addEventListener("resize", onResize);

    // Dragging the dock's edge resizes the panel without a window resize event, and xterm sizes
    // itself in whole cells — so without this the grid keeps whatever width it was first fitted at
    // and spills past the panel. Watching the box covers every way it can change.
    const observer = new ResizeObserver(onResize);
    observer.observe(el);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      dataSub.dispose();
      stopOutput?.();
      stopExit?.();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
    // `t` is deliberately absent: re-attaching the terminal to restate one label would be absurd.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cwd, projectPath, tmux, refit]);

  // Appearance changes apply to the live terminal — no reason to lose the session over a font.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = settings.fontSize;
    term.options.fontFamily = settings.fontFamily || cssVar("--font-mono", FALLBACK_MONO);
    if (refit()) void ptyResize(id, term.rows, term.cols);
  }, [id, refit, settings.fontFamily, settings.fontSize]);

  useEffect(() => {
    // `scheme` isn't read directly — it's the signal that `.dark` has been re-applied and the
    // custom properties now resolve to their other values.
    void scheme;
    const term = termRef.current;
    if (term) term.options.theme = terminalTheme();
  }, [scheme]);

  const find = useCallback(
    (next: boolean) => {
      if (!query) return;
      const search = searchRef.current;
      if (next) search?.findNext(query);
      else search?.findPrevious(query);
    },
    [query],
  );

  return (
    <div
      // `min-w-0` matters: xterm sizes its grid in whole cells and will happily report a width
      // wider than the dock, which without this would push the panel's own chrome off-screen.
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "f") {
          e.preventDefault();
          e.stopPropagation();
          setFinding(true);
        }
      }}
    >
      {finding && (
        <>
          <div className="flex items-center gap-1 bg-muted/40 px-2 py-1.5">
            <input
              autoFocus
              value={query}
              placeholder={t("terminal.search")}
              onChange={(e) => {
                setQuery(e.target.value);
                searchRef.current?.findNext(e.target.value, { incremental: true });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") find(!e.shiftKey);
                if (e.key === "Escape") {
                  setFinding(false);
                  searchRef.current?.clearDecorations();
                  termRef.current?.focus();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-fine outline-none placeholder:text-muted-foreground/60"
            />
            <FindButton title={t("terminal.findPrev")} onClick={() => find(false)}>
              <ArrowUp className="size-3" />
            </FindButton>
            <FindButton title={t("terminal.findNext")} onClick={() => find(true)}>
              <ArrowDown className="size-3" />
            </FindButton>
            <FindButton
              title={t("terminal.closeFind")}
              onClick={() => {
                setFinding(false);
                searchRef.current?.clearDecorations();
                termRef.current?.focus();
              }}
            >
              <X className="size-3" />
            </FindButton>
          </div>
          <Separator />
        </>
      )}
      <div className="terminal" ref={boxRef} />
    </div>
  );
}

function FindButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-control p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
