import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowUp, MessageSquare, Plus, Square, X } from "@/components/ui/icons";

import {
  cancelTurn,
  closeTransientSession,
  newSession,
  onEngineEvent,
  setConfigOption,
  setModel,
  setSessionMemoryPolicy,
  submitPrompt,
  type ConfigOptionInfo,
  type CoreEvent,
  type ModelChoice,
  type PermissionMode,
  type ProviderInfo,
  type Sandbox,
} from "../bridge";
import { ActivityOrb } from "../components/ui/activity-orb";
import { Button } from "../components/ui/button";
import { LiquidSelectionGroup } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { useT } from "../i18n";
import { cn } from "../lib/utils";
import { ModelPicker } from "./Composer";
import { sessionMode } from "./mode";
import { TurnCard } from "./TurnCard";
import type { BuiltinLinkActions } from "./MarkdownContent";
import { applyEvent, newTurn, type Turn } from "./turns";

export interface SideChatSeed {
  id: string;
  text: string;
}

interface SideChatTab {
  localId: string;
  title: string | null;
  draft: string;
  sessionId: string | null;
  creationRequestId: string | null;
  turns: Turn[];
  running: boolean;
  models: ModelChoice[];
  currentModel: string | null;
  defaultModel: string | null;
  configOptions: ConfigOptionInfo[];
  provider: string;
  cwd: string;
  mode: PermissionMode;
  sandbox: Sandbox;
  controlError: string | null;
}

interface PendingCreation {
  tabId: string;
  prompt: string;
  promptRequestId: string;
}

let localTabSequence = 0;

function localId(prefix: string): string {
  localTabSequence += 1;
  return `${prefix}-${Date.now()}-${localTabSequence}`;
}

function makeTab({
  provider,
  cwd,
  model,
  mode,
  sandbox,
  models,
  draft = "",
}: {
  provider: string;
  cwd: string;
  model: string | null;
  mode: PermissionMode;
  sandbox: Sandbox;
  models: ModelChoice[];
  draft?: string;
}): SideChatTab {
  return {
    localId: localId("side-chat"),
    title: null,
    draft,
    sessionId: null,
    creationRequestId: null,
    turns: [],
    running: false,
    models,
    currentModel: model,
    defaultModel: model,
    configOptions: [],
    provider,
    cwd,
    mode,
    sandbox,
    controlError: null,
  };
}

const TURN_EVENTS = new Set<CoreEvent["event"]>([
  "memory_context",
  "turn_started",
  "agent_text",
  "agent_thought",
  "tool_call",
  "plan",
  "turn_ended",
  "error",
]);

export function SideChatPanel({
  open,
  onClose,
  provider,
  providers,
  cwd,
  model,
  mode,
  sandbox,
  seed,
  onSeedHandled,
  linkActions,
}: {
  open: boolean;
  onClose: () => void;
  provider: string;
  providers: ProviderInfo[];
  cwd: string;
  model: string | null;
  mode: PermissionMode;
  sandbox: Sandbox;
  seed: SideChatSeed | null;
  onSeedHandled: (id: string) => void;
  linkActions?: BuiltinLinkActions;
}) {
  const t = useT();
  const [tabs, setTabs] = useState<SideChatTab[]>([]);
  const tabsRef = useRef(tabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const pendingCreationsRef = useRef(new Map<string, PendingCreation>());
  const handledSeedsRef = useRef(new Set<string>());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (open) panel.removeAttribute("inert");
    else panel.setAttribute("inert", "");
  }, [open]);

  const providerModels = useCallback(
    (providerId: string) =>
      providers.find((candidate) => candidate.id === providerId)?.models ?? [],
    [providers],
  );

  const createLocalTab = useCallback(
    (draft = "") => {
      const tab = makeTab({
        provider,
        cwd: cwd || ".",
        model,
        mode,
        sandbox,
        models: providerModels(provider),
        draft,
      });
      setTabs((current) => [...current, tab]);
      setActiveTabId(tab.localId);
      return tab.localId;
    },
    [cwd, mode, model, provider, providerModels, sandbox],
  );

  useEffect(() => {
    if (open && tabs.length === 0) createLocalTab();
  }, [createLocalTab, open, tabs.length]);

  useEffect(() => {
    setTabs((current) =>
      current.map((tab) =>
        tab.sessionId === null && tab.creationRequestId === null
          ? { ...tab, models: providerModels(tab.provider) }
          : tab,
      ),
    );
  }, [providerModels]);

  useEffect(() => {
    if (!seed || handledSeedsRef.current.has(seed.id)) return;
    handledSeedsRef.current.add(seed.id);
    const active = tabsRef.current.find((tab) => tab.localId === activeTabId);
    if (
      active &&
      active.sessionId === null &&
      active.creationRequestId === null &&
      active.turns.length === 0 &&
      active.draft.trim().length === 0
    ) {
      setTabs((current) =>
        current.map((tab) =>
          tab.localId === active.localId ? { ...tab, draft: seed.text } : tab,
        ),
      );
    } else {
      createLocalTab(seed.text);
    }
    onSeedHandled(seed.id);
  }, [activeTabId, createLocalTab, onSeedHandled, seed]);

  const updateTab = useCallback(
    (tabId: string, update: (tab: SideChatTab) => SideChatTab) => {
      setTabs((current) =>
        current.map((tab) => (tab.localId === tabId ? update(tab) : tab)),
      );
    },
    [],
  );

  const failPrompt = useCallback(
    (tabId: string, requestId: string, message: string) => {
      updateTab(tabId, (tab) => ({
        ...tab,
        running: false,
        creationRequestId: null,
        turns: applyEvent(tab.turns, {
          event: "error",
          session: tab.sessionId,
          message,
          terminal: true,
          request_id: requestId,
        }),
      }));
    },
    [updateTab],
  );

  useEffect(() => {
    let disposed = false;
    const subscription = onEngineEvent((event) => {
      if (event.event === "session_created" && event.request_id) {
        const pending = pendingCreationsRef.current.get(event.request_id);
        if (!pending) return;
        pendingCreationsRef.current.delete(event.request_id);
        const tab = tabsRef.current.find((candidate) => candidate.localId === pending.tabId);
        if (!tab) {
          void closeTransientSession(event.session);
          return;
        }

        updateTab(pending.tabId, (current) => ({
          ...current,
          sessionId: event.session,
          creationRequestId: null,
        }));
        void (async () => {
          // Side chat can use project memory for context, but app-lifetime conversations never
          // write durable memories of their own.
          await setSessionMemoryPolicy(event.session, "inherit", "deny");
          if (!tabsRef.current.some((candidate) => candidate.localId === pending.tabId)) {
            await closeTransientSession(event.session);
            return;
          }
          await submitPrompt(
            event.session,
            [{ type: "text", text: pending.prompt }],
            pending.promptRequestId,
          );
        })().catch((error) =>
          failPrompt(pending.tabId, pending.promptRequestId, String(error)),
        );
        return;
      }

      if (event.event === "error" && event.session === null && event.request_id) {
        const pending = pendingCreationsRef.current.get(event.request_id);
        if (!pending) return;
        pendingCreationsRef.current.delete(event.request_id);
        failPrompt(pending.tabId, pending.promptRequestId, event.message);
        return;
      }

      if (event.session === null) return;
      const tab = tabsRef.current.find((candidate) => candidate.sessionId === event.session);
      if (!tab) return;

      if (event.event === "session_title_changed") {
        updateTab(tab.localId, (current) => ({ ...current, title: event.title }));
        return;
      }
      if (event.event === "models") {
        updateTab(tab.localId, (current) => ({
          ...current,
          models: event.available.length > 0 ? event.available : current.models,
          currentModel: event.current || current.currentModel,
          defaultModel: current.defaultModel ?? event.current ?? null,
        }));
        return;
      }
      if (event.event === "config_options") {
        updateTab(tab.localId, (current) => ({ ...current, configOptions: event.options }));
        return;
      }
      if (event.event === "execution_policy_changed") {
        updateTab(tab.localId, (current) => ({ ...current, ...event.policy }));
        return;
      }
      if (!TURN_EVENTS.has(event.event)) return;

      updateTab(tab.localId, (current) => ({
        ...current,
        running:
          event.event === "turn_ended" || (event.event === "error" && event.terminal)
            ? false
            : current.running,
        turns: applyEvent(current.turns, event),
      }));
    });
    return () => {
      disposed = true;
      void subscription.then((unlisten) => {
        if (disposed) unlisten();
      });
    };
  }, [failPrompt, updateTab]);

  const activeTab = tabs.find((tab) => tab.localId === activeTabId) ?? tabs[0] ?? null;

  useEffect(() => {
    if (!open || !activeTab) return;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab?.localId, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [activeTab?.turns]);

  const send = useCallback(async () => {
    const tab = tabsRef.current.find((candidate) => candidate.localId === activeTabId);
    if (!tab || tab.running) return;
    const prompt = tab.draft.trim();
    if (!prompt) return;
    const promptRequestId = localId("side-prompt");
    updateTab(tab.localId, (current) => ({
      ...current,
      draft: "",
      running: true,
      turns: [...current.turns, newTurn(prompt, promptRequestId)],
    }));

    if (tab.sessionId) {
      try {
        await submitPrompt(
          tab.sessionId,
          [{ type: "text", text: prompt }],
          promptRequestId,
        );
      } catch (error) {
        failPrompt(tab.localId, promptRequestId, String(error));
      }
      return;
    }

    const creationRequestId = promptRequestId;
    pendingCreationsRef.current.set(creationRequestId, {
      tabId: tab.localId,
      prompt,
      promptRequestId,
    });
    updateTab(tab.localId, (current) => ({
      ...current,
      creationRequestId,
    }));
    try {
      await newSession(
        tab.provider,
        tab.cwd,
        null,
        creationRequestId,
        null,
        { mode: tab.mode, sandbox: tab.sandbox },
        tab.currentModel,
        true,
      );
    } catch (error) {
      if (pendingCreationsRef.current.delete(creationRequestId)) {
        failPrompt(tab.localId, promptRequestId, String(error));
      }
    }
  }, [activeTabId, failPrompt, updateTab]);

  const closeTab = useCallback(
    (tabId: string) => {
      const current = tabsRef.current;
      const index = current.findIndex((tab) => tab.localId === tabId);
      if (index < 0) return;
      const closing = current[index];
      const remaining = current.filter((tab) => tab.localId !== tabId);
      tabsRef.current = remaining;
      setTabs(remaining);
      if (closing.sessionId) void closeTransientSession(closing.sessionId);
      if (activeTabId === tabId) {
        setActiveTabId(remaining[Math.min(index, remaining.length - 1)]?.localId ?? null);
      }
      if (remaining.length === 0) onClose();
    },
    [activeTabId, onClose],
  );

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={t("sideChat.title")}
      aria-hidden={!open}
      data-open={open ? "" : undefined}
      className={cn(
        "side-chat-panel fixed z-50 flex min-h-0 flex-col overflow-hidden bg-background shadow-(--ds-elevation-modal) ring-1 ring-foreground/10",
        !open && "pointer-events-none",
      )}
    >
      <header className="side-chat-header flex shrink-0 items-center gap-1">
        <LiquidSelectionGroup
          activeSelector='[data-selected="true"]'
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          role="tablist"
        >
          {tabs.map((tab) => (
            <div
              key={tab.localId}
              data-selected={tab.localId === activeTab?.localId}
              className={cn(
                "side-chat-tab flex max-w-48 shrink-0 items-center py-0.5 ps-1 transition-colors",
                tab.localId === activeTab?.localId
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab.localId === activeTab?.localId}
                className="min-w-0 flex-1 truncate px-2 text-ui"
                onClick={() => setActiveTabId(tab.localId)}
              >
                {tab.title || t("sideChat.title")}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label={t("sideChat.closeTab")}
                onClick={() => closeTab(tab.localId)}
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={t("sideChat.new")}
            onClick={() => createLocalTab()}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </LiquidSelectionGroup>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={t("sideChat.hide")}
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {activeTab && activeTab.turns.length > 0 ? (
          <ol className="mx-auto m-0 w-full max-w-2xl list-none px-5 pb-8 pt-5">
            {activeTab.turns.map((turn) => (
              <li key={turn.transcriptStartSeq ?? turn.id}>
                <TurnCard
                  turn={turn}
                  linkActions={{ ...linkActions, workspaceRoot: activeTab.cwd }}
                />
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex size-full flex-col items-center justify-center px-8 text-center">
            <span className="mb-4 flex size-10 items-center justify-center rounded-full border bg-fill-quiet text-muted-foreground">
              <MessageSquare className="size-5" aria-hidden />
            </span>
            <h2 className="text-ui font-medium">{t("sideChat.title")}</h2>
            <p className="mt-2 max-w-72 text-ui leading-relaxed text-muted-foreground">
              {t("sideChat.temporary")}
            </p>
          </div>
        )}
      </div>

      {activeTab && (
        <form
          className="shrink-0 p-4 pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {activeTab.controlError ? (
            <p role="alert" className="mb-2 px-1 text-fine text-destructive">
              {activeTab.controlError}
            </p>
          ) : null}
          <div className="rounded-(--ds-radius-module) bg-card shadow-raised ring-[0.5px] ring-foreground/[0.07] focus-within:ring-ring/20">
            <Textarea
              value={activeTab.draft}
              disabled={activeTab.running}
              rows={3}
              aria-label={t("sideChat.placeholder")}
              placeholder={t("sideChat.placeholder")}
              className="max-h-48 min-h-20 resize-none bg-transparent px-4 pb-2 pt-3 shadow-none focus-visible:ring-0"
              onChange={(event) => {
                const draft = event.currentTarget.value;
                updateTab(activeTab.localId, (tab) => ({ ...tab, draft }));
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex items-center gap-2 px-3 pb-2 pt-1">
              <span className="shrink-0 rounded-(--ds-radius-control) bg-muted/50 px-2 py-1 text-fine text-muted-foreground">
                {t(`mode.${sessionMode(activeTab.mode, activeTab.sandbox)}` as "mode.ask")}
              </span>
              <div className="min-w-0 flex-1" />
              <ModelPicker
                models={activeTab.models}
                current={activeTab.currentModel}
                defaultModel={activeTab.defaultModel}
                provider={activeTab.provider}
                configOptions={activeTab.configOptions}
                hasSession={activeTab.sessionId !== null}
                disabled={activeTab.running}
                onModel={(nextModel) => {
                  const previousModel = activeTab.currentModel;
                  updateTab(activeTab.localId, (tab) => ({
                    ...tab,
                    currentModel: nextModel,
                    controlError: null,
                  }));
                  if (activeTab.sessionId) {
                    void setModel(activeTab.sessionId, nextModel).catch((error) =>
                      updateTab(activeTab.localId, (tab) => ({
                        ...tab,
                        currentModel: previousModel,
                        controlError: t("toast.modelFailed", { error: String(error) }),
                      })),
                    );
                  }
                }}
                onConfigOption={(configId, value) => {
                  if (!activeTab.sessionId) return;
                  const previousOptions = activeTab.configOptions;
                  updateTab(activeTab.localId, (tab) => ({
                    ...tab,
                    controlError: null,
                    configOptions: tab.configOptions.map((option) =>
                      option.id === configId ? { ...option, current: value } : option,
                    ),
                  }));
                  void setConfigOption(activeTab.sessionId, configId, value).catch((error) =>
                    updateTab(activeTab.localId, (tab) => ({
                      ...tab,
                      configOptions: previousOptions,
                      controlError: t("toast.modelFailed", { error: String(error) }),
                    })),
                  );
                }}
              />
              {activeTab.running ? (
                activeTab.sessionId ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="size-8 shrink-0 rounded-full"
                    aria-label={t("composer.stop")}
                    onClick={() => void cancelTurn(activeTab.sessionId!)}
                  >
                    <Square className="size-3.5 fill-current" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="size-8 shrink-0 rounded-full"
                    aria-label={t("session.loading")}
                    disabled
                  >
                    <ActivityOrb state="connecting" aria-hidden="true" />
                  </Button>
                )
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  variant={activeTab.draft.trim() ? "default" : "secondary"}
                  className="size-8 shrink-0 rounded-full"
                  aria-label={t("sideChat.send")}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </form>
      )}
    </aside>
  );
}
