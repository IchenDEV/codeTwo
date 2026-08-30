import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Lock,
  MessageSquare,
  Pin,
  RefreshCw,
  Send,
  ShieldCheck,
  SquareKanban,
  UserRound,
} from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { openExternal } from "../bridge";
import { useT } from "../i18n";
import { MarkdownContent } from "../session/MarkdownContent";
import { useToast } from "../ui/toast";
import { FeishuDocumentView } from "./FeishuDocumentView";
import "./feishu-workspace.css";

export type CollaborationConnectorCaller = <T = unknown>(
  operation: string,
  input?: unknown,
) => Promise<T>;

export interface CollaborationConnectorEvent {
  connectorId: string;
  eventId: string;
  kind: "message.created" | "message.changed" | "document.changed" | "base.changed" | "connection.changed";
  chatId?: string;
  messageId?: string;
  resourceId?: string;
  resourceType?: string;
  preview?: string;
  createdAt?: string;
  state?: string;
  problem?: string;
}

export type CollaborationConnectorSubscriber = (
  callback: (event: CollaborationConnectorEvent) => void,
) => Promise<() => void>;

type ResourceTab = "messages" | "documents" | "bases";

interface ChatSummary {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  mode: string;
  type: string;
  latestMessage?: string;
}

interface CloudResourceSummary {
  id: string;
  name: string;
  type: string;
  url: string;
  summary?: string;
}

interface WorkspaceOverview {
  configured: boolean;
  problem: string;
  chats: ChatSummary[];
  documents: CloudResourceSummary[];
  bases: CloudResourceSummary[];
  warnings: string[];
}

interface FeishuAuthStatus {
  configured: boolean;
  authorized: boolean;
  needsUserAuthorization: boolean;
  waiting: boolean;
  flow: "registration" | "oauth" | null;
  method: "device" | "oauth" | null;
  appId: string;
  redirectUri: string;
  user: { openId: string; name: string } | null;
  problem: string;
}

interface FeishuAuthTicket {
  url: string;
  redirectUri?: string;
  expireIn?: number;
  flow: "registration" | "oauth";
}

interface ChatMessageSummary {
  id: string;
  senderId: string;
  senderType: string;
  senderName: string;
  senderAvatarUrl: string;
  type: string;
  text: string;
  createdAt: string;
  reactions?: { emojiType: string; emoji: string; count: number }[];
}

interface BaseData {
  tables: { id: string; name: string }[];
  selectedTableId: string;
  fields: string[];
  records: { id: string; cells: { field: string; value: string }[] }[];
  total: number;
  hasMore: boolean;
}

interface RelatedResource extends CloudResourceSummary {
  kind: "document" | "base";
}

type AssociationMap = Record<string, RelatedResource[]>;
type ResourceSectionState = Record<ResourceTab, boolean>;
type PinnedResourceMap = Record<ResourceTab, string[]>;
type ResourceActivityMap = Record<ResourceTab, string[]>;

const ASSOCIATIONS_KEY = "codetwo.feishu.associations.v1";
const RESOURCE_SECTIONS_KEY = "codetwo.feishu.sections.v1";
const RESOURCE_PINS_KEY = "codetwo.feishu.pins.v1";
const RESOURCE_TABS: ResourceTab[] = ["messages", "documents", "bases"];
const RESOURCE_LIMITS: Record<ResourceTab, number> = {
  messages: 4,
  documents: 2,
  bases: 2,
};

function readCollapsedSections(): ResourceSectionState {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESOURCE_SECTIONS_KEY) || "{}") as Record<string, unknown>;
    return {
      messages: parsed.messages === true,
      documents: parsed.documents === true,
      bases: parsed.bases === true,
    };
  } catch {
    return { messages: false, documents: false, bases: false };
  }
}

function writeCollapsedSections(value: ResourceSectionState) {
  try {
    localStorage.setItem(RESOURCE_SECTIONS_KEY, JSON.stringify(value));
  } catch {
    // Private mode keeps the current in-memory state until this window closes.
  }
}

function readPinnedResources(): PinnedResourceMap {
  const empty: PinnedResourceMap = { messages: [], documents: [], bases: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(RESOURCE_PINS_KEY) || "{}") as Record<string, unknown>;
    for (const resourceTab of RESOURCE_TABS) {
      const value = parsed[resourceTab];
      if (!Array.isArray(value)) continue;
      empty[resourceTab] = [...new Set(value.filter((id): id is string => typeof id === "string"))];
    }
  } catch {
    // Ignore malformed or unavailable local state.
  }
  return empty;
}

function writePinnedResources(value: PinnedResourceMap) {
  try {
    localStorage.setItem(RESOURCE_PINS_KEY, JSON.stringify(value));
  } catch {
    // Private mode keeps the current in-memory state until this window closes.
  }
}

function readAssociations(): AssociationMap {
  try {
    const raw = localStorage.getItem(ASSOCIATIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: AssociationMap = {};
    for (const [chatId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      result[chatId] = value.filter((item): item is RelatedResource => {
        if (!item || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        return typeof row.id === "string"
          && typeof row.name === "string"
          && typeof row.type === "string"
          && typeof row.url === "string"
          && (row.kind === "document" || row.kind === "base");
      });
    }
    return result;
  } catch {
    return {};
  }
}

function writeAssociations(value: AssociationMap) {
  try {
    localStorage.setItem(ASSOCIATIONS_KEY, JSON.stringify(value));
  } catch {
    // Private mode keeps the current in-memory association until this window closes.
  }
}

function displayTime(value: string): string {
  const numeric = Number(value);
  const millis = Number.isFinite(numeric) && numeric > 0
    ? numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
    : Date.parse(value);
  if (!Number.isFinite(millis)) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" })
    .format(new Date(millis));
}

function visibleMessageText(message: ChatMessageSummary, t: ReturnType<typeof useT>): string {
  if (message.text.trim()) return message.text;
  switch (message.type.trim().toLowerCase()) {
    case "image": return t("feishu.message.image");
    case "file": return t("feishu.message.file");
    case "audio": return t("feishu.message.audio");
    case "media": return t("feishu.message.video");
    case "sticker": return t("feishu.message.sticker");
    case "interactive": return t("feishu.message.card");
    case "post": return t("feishu.message.richText");
    default: return t("feishu.message.unsupported");
  }
}

function sourceLabel(tab: ResourceTab, name: string): string {
  if (tab === "messages") return `飞书对话：${name}`;
  if (tab === "documents") return `飞书云文档：${name}`;
  return `飞书多维表格：${name}`;
}

function localizedSourceLabel(tab: ResourceTab, name: string, t: ReturnType<typeof useT>): string {
  if (tab === "messages") return t("feishu.source.chat", { name });
  if (tab === "documents") return t("feishu.source.document", { name });
  return t("feishu.source.base", { name });
}

function baseContext(data: BaseData | null): string {
  if (!data || data.fields.length === 0 || data.records.length === 0) {
    return "(当前数据表没有可见记录)";
  }
  const rows = [data.fields.join("\t")];
  for (const record of data.records) {
    const values = new Map(record.cells.map((cell) => [cell.field, cell.value]));
    rows.push(data.fields.map((field) => values.get(field) ?? "").join("\t"));
  }
  return rows.join("\n");
}

export function buildFeishuExecutionPrompt(input: {
  objective: string;
  tab: ResourceTab;
  sourceName: string;
  sourceUrl?: string;
  messages?: ChatMessageSummary[];
  documentContent?: string;
  baseData?: BaseData | null;
  related: RelatedResource[];
}): string {
  const sections = [
    "请根据下面的飞书协作上下文完成任务。引用事实时保留来源；没有权限读取的资料不要猜测。",
    `\n## 任务\n${input.objective.trim()}`,
  ];
  if (input.tab === "messages") {
    const messages = (input.messages ?? []).map((message) => {
      const sender = message.senderName || message.senderId || message.senderType || "unknown";
      return `- [${message.createdAt || "unknown time"}] ${sender}: ${message.text || `[${message.type}]`}`;
    });
    sections.push(`\n## ${sourceLabel(input.tab, input.sourceName)}\n${messages.join("\n") || "(没有可见消息)"}`);
  } else if (input.tab === "documents") {
    sections.push(
      `\n## ${sourceLabel(input.tab, input.sourceName)}\n来源：${input.sourceUrl || "未提供链接"}\n\n${input.documentContent || "(文档没有可见正文)"}`,
    );
  } else {
    sections.push(
      `\n## ${sourceLabel(input.tab, input.sourceName)}\n来源：${input.sourceUrl || "未提供链接"}\n\n${baseContext(input.baseData ?? null)}`,
    );
  }
  if (input.related.length > 0) {
    sections.push(`\n## 关联资料\n${input.related.map((resource) =>
      `- ${resource.kind === "document" ? "云文档" : "多维表格"}：${resource.name || resource.id}${resource.url ? ` — ${resource.url}` : ""}`,
    ).join("\n")}`);
  }
  return sections.join("\n");
}

function resourceName(resource: ChatSummary | CloudResourceSummary): string {
  return resource.name || resource.id;
}

function ResourceIcon({ tab }: { tab: ResourceTab }) {
  if (tab === "messages") return <MessageSquare />;
  if (tab === "documents") return <FileText />;
  return <SquareKanban />;
}

function ChatAvatar({ chat }: { chat: ChatSummary }) {
  const [failed, setFailed] = useState(false);
  const directMessage = chat.mode === "p2p" || chat.type === "p2p";

  useEffect(() => setFailed(false), [chat.avatarUrl]);

  if (chat.avatarUrl && !failed) {
    return (
      <img
        src={chat.avatarUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className={cn(
          "size-control shrink-0 overflow-hidden object-cover",
          directMessage ? "rounded-full" : "rounded-control",
        )}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      data-feishu-avatar-fallback
      className={cn(
        "flex size-control shrink-0 items-center justify-center overflow-hidden bg-fill-quiet text-cap font-semibold text-muted-foreground",
        directMessage ? "rounded-full" : "rounded-control",
      )}
      aria-hidden
    >
      {directMessage ? Array.from(chat.name.trim())[0]?.toLocaleUpperCase() || "?" : <MessageSquare />}
    </span>
  );
}

function MessageAvatar({ label, src }: { label: string; src: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  return (
    <span
      data-feishu-message-avatar
      className="flex size-control shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-quiet text-cap font-semibold text-muted-foreground"
      aria-hidden
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : Array.from(label.trim())[0]?.toLocaleUpperCase() || "?"}
    </span>
  );
}

function messageSenderLabel(message: ChatMessageSummary, memberLabel: string): string {
  const name = message.senderName?.trim();
  if (name) return name;
  if (message.senderId) return `${memberLabel} · ${message.senderId.slice(-6)}`;
  return message.senderType || memberLabel;
}

export function FeishuWorkspacePage({
  enabled,
  sessionId,
  callCommand,
  onHandoff,
  onOpenPluginManager,
  headerLeadingAction,
  navigationHost,
  settingsHost,
  detailVisible = true,
  onSelectResource,
  subscribeEvents,
}: {
  enabled: boolean;
  sessionId: string | null;
  callCommand: CollaborationConnectorCaller;
  onHandoff: (prompt: string) => Promise<void>;
  onOpenPluginManager: () => void;
  headerLeadingAction?: ReactNode;
  navigationHost: Element | null;
  settingsHost?: Element | null;
  detailVisible?: boolean;
  onSelectResource?: () => void;
  subscribeEvents?: CollaborationConnectorSubscriber;
}) {
  const t = useT();
  const toast = useToast();
  const [authStatus, setAuthStatus] = useState<FeishuAuthStatus | null>(null);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ResourceTab>("messages");
  const [selection, setSelection] = useState<Record<ResourceTab, string>>({
    messages: "",
    documents: "",
    bases: "",
  });
  const [messages, setMessages] = useState<ChatMessageSummary[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [documentContent, setDocumentContent] = useState("");
  const [baseData, setBaseData] = useState<BaseData | null>(null);
  const [associations, setAssociations] = useState<AssociationMap>(readAssociations);
  const [collapsedSections, setCollapsedSections] = useState<ResourceSectionState>(readCollapsedSections);
  const [expandedSections, setExpandedSections] = useState<ResourceSectionState>({
    messages: false,
    documents: false,
    bases: false,
  });
  const [pinnedResources, setPinnedResources] = useState<PinnedResourceMap>(readPinnedResources);
  const [resourceActivity, setResourceActivity] = useState<ResourceActivityMap>({
    messages: [],
    documents: [],
    bases: [],
  });
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [objective, setObjective] = useState("");
  const [notifyOnComplete, setNotifyOnComplete] = useState(false);
  const [handingOff, setHandingOff] = useState(false);
  const [taskStatus, setTaskStatus] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [secretVisible, setSecretVisible] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [manualSetupOpen, setManualSetupOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const detailRequestRef = useRef(0);
  const continueAfterRegistrationRef = useRef(false);
  const automaticAuthorizationStartedRef = useRef(false);
  const seenConnectorEventsRef = useRef(new Set<string>());
  const subscriptionAttemptsRef = useRef(new Set<string>());
  const subscriptionWarningsRef = useRef(new Set<string>());
  const refreshTimersRef = useRef(new Map<string, number>());

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const auth = await callCommand<FeishuAuthStatus>("connection.status", {});
      setAuthStatus(auth);
      setAppId((current) => current || auth.appId);
      if (!auth.authorized) {
        setOverview(null);
        return;
      }
      const next = await callCommand<WorkspaceOverview>("resources.list", {});
      setOverview(next);
      setSelection((current) => ({
        messages: next.chats.some((item) => item.id === current.messages) ? current.messages : next.chats[0]?.id ?? "",
        documents: next.documents.some((item) => item.id === current.documents) ? current.documents : next.documents[0]?.id ?? "",
        bases: next.bases.some((item) => item.id === current.bases) ? current.bases : next.bases[0]?.id ?? "",
      }));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, [callCommand, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!authStatus?.waiting) return;
    let live = true;
    const poll = window.setInterval(() => {
      void callCommand<FeishuAuthStatus>("connection.status", {}).then((next) => {
        if (!live) return;
        setAuthStatus(next);
        if (next.authorized) {
          window.clearInterval(poll);
          continueAfterRegistrationRef.current = false;
          automaticAuthorizationStartedRef.current = false;
          setAppSecret("");
          setActivationError("");
          void reload();
        } else if (!next.waiting) {
          window.clearInterval(poll);
          if (next.problem) setActivationError(next.problem);
        }
      }).catch(() => {});
    }, 1_000);
    return () => {
      live = false;
      window.clearInterval(poll);
    };
  }, [authStatus?.waiting, callCommand, reload]);

  useEffect(() => {
    if (authStatus?.configured && !authStatus.authorized && !authStatus.method) {
      setManualSetupOpen(true);
    }
  }, [authStatus?.authorized, authStatus?.configured, authStatus?.method]);

  const selectedChat = overview?.chats.find((item) => item.id === selection.messages) ?? null;
  const selectedDocument = overview?.documents.find((item) => item.id === selection.documents) ?? null;
  const selectedBase = overview?.bases.find((item) => item.id === selection.bases) ?? null;
  const selectedResource = tab === "messages" ? selectedChat : tab === "documents" ? selectedDocument : selectedBase;
  const related = selectedChat ? associations[selectedChat.id] ?? [] : [];

  const loadMessages = useCallback(async () => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }
    const request = ++detailRequestRef.current;
    setDetailLoading(true);
    setError(null);
    try {
      const result = await callCommand<{ messages: ChatMessageSummary[] }>(
        "conversation.messages",
        { chatId: selectedChat.id },
      );
      if (request === detailRequestRef.current) setMessages(result.messages);
    } catch (cause) {
      if (request === detailRequestRef.current) setError(String(cause));
    } finally {
      if (request === detailRequestRef.current) setDetailLoading(false);
    }
  }, [callCommand, selectedChat]);

  useEffect(() => {
    if (!detailVisible || tab !== "messages") return;
    void loadMessages();
  }, [detailVisible, loadMessages, tab]);

  const loadDocument = useCallback(async () => {
    if (!selectedDocument) {
      setDocumentContent("");
      return;
    }
    const request = ++detailRequestRef.current;
    setDetailLoading(true);
    setError(null);
    setDocumentContent("");
    try {
      const result = await callCommand<{ content: string }>("document.read", {
        documentId: selectedDocument.id,
      });
      if (request === detailRequestRef.current) setDocumentContent(result.content);
    } catch (cause) {
      if (request === detailRequestRef.current) setError(String(cause));
    } finally {
      if (request === detailRequestRef.current) setDetailLoading(false);
    }
  }, [callCommand, selectedDocument]);

  useEffect(() => {
    if (!detailVisible || tab !== "documents") return;
    void loadDocument();
  }, [detailVisible, loadDocument, tab]);

  const loadBase = useCallback(async (tableId = "") => {
    if (!selectedBase) return;
    const request = ++detailRequestRef.current;
    setDetailLoading(true);
    setError(null);
    try {
      const result = await callCommand<BaseData>("table.read", {
        appToken: selectedBase.id,
        tableId,
      });
      if (request === detailRequestRef.current) setBaseData(result);
    } catch (cause) {
      if (request === detailRequestRef.current) setError(String(cause));
    } finally {
      if (request === detailRequestRef.current) setDetailLoading(false);
    }
  }, [callCommand, selectedBase]);

  useEffect(() => {
    if (!detailVisible || tab !== "bases") return;
    setBaseData(null);
    void loadBase();
  }, [detailVisible, loadBase, tab]);

  const markResourceActivity = useCallback((resourceTab: ResourceTab, resourceId: string) => {
    if (!resourceId) return;
    setResourceActivity((current) => current[resourceTab].includes(resourceId)
      ? current
      : { ...current, [resourceTab]: [...current[resourceTab], resourceId] });
  }, []);

  const clearResourceActivity = useCallback((resourceTab: ResourceTab, resourceId: string) => {
    setResourceActivity((current) => current[resourceTab].includes(resourceId)
      ? { ...current, [resourceTab]: current[resourceTab].filter((id) => id !== resourceId) }
      : current);
  }, []);

  const scheduleRefresh = useCallback((key: string, refresh: () => void) => {
    const existing = refreshTimersRef.current.get(key);
    if (existing !== undefined) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      refreshTimersRef.current.delete(key);
      refresh();
    }, 120);
    refreshTimersRef.current.set(key, timer);
  }, []);

  useEffect(() => () => {
    for (const timer of refreshTimersRef.current.values()) window.clearTimeout(timer);
    refreshTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!subscribeEvents) return;
    let live = true;
    let unsubscribe: (() => void) | null = null;
    void subscribeEvents((event) => {
      if (!live || event.connectorId !== "workspace") return;
      const eventKey = `${event.kind}:${event.eventId}`;
      if (event.eventId && seenConnectorEventsRef.current.has(eventKey)) return;
      if (event.eventId) {
        seenConnectorEventsRef.current.add(eventKey);
        if (seenConnectorEventsRef.current.size > 512) {
          seenConnectorEventsRef.current.delete(seenConnectorEventsRef.current.values().next().value!);
        }
      }

      if (event.kind === "message.created" && event.chatId) {
        const knownChat = overview?.chats.some((item) => item.id === event.chatId) === true;
        setOverview((current) => {
          if (!current) return current;
          const chat = current.chats.find((item) => item.id === event.chatId);
          if (!chat) return current;
          const updated = { ...chat, latestMessage: event.preview || chat.latestMessage };
          return {
            ...current,
            chats: [updated, ...current.chats.filter((item) => item.id !== event.chatId)],
          };
        });
        if (detailVisible && tab === "messages" && selectedChat?.id === event.chatId) {
          scheduleRefresh(`messages:${event.chatId}`, () => { void loadMessages(); });
          clearResourceActivity("messages", event.chatId);
        } else {
          markResourceActivity("messages", event.chatId);
        }
        if (!knownChat) void reload();
        return;
      }

      if (event.kind === "message.changed") {
        if (detailVisible && tab === "messages" && selectedChat) {
          scheduleRefresh(`messages:${selectedChat.id}`, () => { void loadMessages(); });
        }
        return;
      }

      if (event.kind === "document.changed" && event.resourceId) {
        if (detailVisible && tab === "documents" && selectedDocument?.id === event.resourceId) {
          scheduleRefresh(`documents:${event.resourceId}`, () => { void loadDocument(); });
          clearResourceActivity("documents", event.resourceId);
        } else {
          markResourceActivity("documents", event.resourceId);
        }
        return;
      }

      if (event.kind === "base.changed" && event.resourceId) {
        if (detailVisible && tab === "bases" && selectedBase?.id === event.resourceId) {
          scheduleRefresh(`bases:${event.resourceId}`, () => { void loadBase(baseData?.selectedTableId || ""); });
          clearResourceActivity("bases", event.resourceId);
        } else {
          markResourceActivity("bases", event.resourceId);
        }
      }
    }).then((dispose) => {
      if (live) unsubscribe = dispose;
      else dispose();
    }).catch(() => {});
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, [
    baseData?.selectedTableId,
    clearResourceActivity,
    detailVisible,
    loadBase,
    loadDocument,
    loadMessages,
    markResourceActivity,
    overview?.chats,
    reload,
    scheduleRefresh,
    selectedBase,
    selectedChat,
    selectedDocument,
    subscribeEvents,
    tab,
  ]);

  useEffect(() => {
    if (!authStatus?.authorized || !overview) return;
    const candidates: Array<{ id: string; type: string; name: string }> = [];
    const addCandidates = (resourceTab: "documents" | "bases", resources: CloudResourceSummary[]) => {
      const visibleIds = new Set([
        ...resources.slice(0, RESOURCE_LIMITS[resourceTab]).map((resource) => resource.id),
        ...pinnedResources[resourceTab],
        selection[resourceTab],
      ]);
      for (const resource of resources) {
        if (visibleIds.has(resource.id)) candidates.push(resource);
      }
    };
    addCandidates("documents", overview.documents);
    addCandidates("bases", overview.bases);
    for (const resource of candidates) {
      const key = `${resource.type}:${resource.id}`;
      if (subscriptionAttemptsRef.current.has(key)) continue;
      subscriptionAttemptsRef.current.add(key);
      const operation = resource.type === "bitable" ? "table.subscribe" : "document.subscribe";
      void callCommand<{ subscribed: boolean; problem: string }>(operation, {
        resourceId: resource.id,
        fileType: resource.type,
      }).then((result) => {
        if (result.subscribed || subscriptionWarningsRef.current.has(key)) return;
        subscriptionWarningsRef.current.add(key);
        toast(t("feishu.realtimeUnavailable", { name: resource.name || resource.id }), "info");
      }).catch(() => {});
    }
  }, [authStatus?.authorized, callCommand, overview, pinnedResources, selection, t, toast]);

  const toggleRelated = useCallback((resource: RelatedResource) => {
    if (!selectedChat) return;
    setAssociations((current) => {
      const existing = current[selectedChat.id] ?? [];
      const present = existing.some((item) => item.kind === resource.kind && item.id === resource.id);
      const next = {
        ...current,
        [selectedChat.id]: present
          ? existing.filter((item) => !(item.kind === resource.kind && item.id === resource.id))
          : [...existing, resource],
      };
      if (next[selectedChat.id]?.length === 0) delete next[selectedChat.id];
      writeAssociations(next);
      return next;
    });
  }, [selectedChat]);

  const sendReply = useCallback(async () => {
    if (!selectedChat || !reply.trim()) return;
    setSending(true);
    try {
      await callCommand("message.send", { chatId: selectedChat.id, text: reply.trim() });
      setReply("");
      await loadMessages();
      toast(t("feishu.replySent"), "success");
    } catch (cause) {
      toast(t("feishu.replyFailed", { error: String(cause) }), "error");
    } finally {
      setSending(false);
    }
  }, [callCommand, loadMessages, reply, selectedChat, t, toast]);

  const openAuthorization = useCallback(async (ticket: FeishuAuthTicket) => {
    if (ticket.flow === "registration") {
      continueAfterRegistrationRef.current = true;
      automaticAuthorizationStartedRef.current = false;
    }
    setAuthorizationUrl(ticket.url);
    const next = await callCommand<FeishuAuthStatus>("connection.status", {});
    setAuthStatus(next);
    await openExternal(ticket.url);
  }, [callCommand]);

  const createFeishuApp = useCallback(async () => {
    setActivating(true);
    setActivationError("");
    continueAfterRegistrationRef.current = true;
    automaticAuthorizationStartedRef.current = false;
    try {
      const ticket = await callCommand<FeishuAuthTicket>("connection.create", {});
      await openAuthorization(ticket);
    } catch (cause) {
      continueAfterRegistrationRef.current = false;
      setActivationError(String(cause));
    } finally {
      setActivating(false);
    }
  }, [callCommand, openAuthorization]);

  useEffect(() => {
    if (!authStatus?.needsUserAuthorization
      || authStatus.waiting
      || !continueAfterRegistrationRef.current
      || automaticAuthorizationStartedRef.current) return;
    automaticAuthorizationStartedRef.current = true;
    setActivating(true);
    void callCommand<FeishuAuthTicket>("connection.begin", {})
      .then(openAuthorization)
      .catch((cause) => {
        continueAfterRegistrationRef.current = false;
        setActivationError(String(cause));
      })
      .finally(() => setActivating(false));
  }, [authStatus?.needsUserAuthorization, authStatus?.waiting, callCommand, openAuthorization]);

  const authorize = useCallback(async () => {
    const normalizedAppId = appId.trim();
    const replacingCredentials = Boolean(appSecret) || normalizedAppId !== authStatus?.appId;
    if (!normalizedAppId) {
      setActivationError(t("feishu.appIdRequired"));
      return;
    }
    if ((!authStatus?.configured || replacingCredentials) && !appSecret) {
      setActivationError(t("feishu.appSecretRequired"));
      return;
    }
    setActivating(true);
    setActivationError("");
    try {
      const ticket = replacingCredentials || !authStatus?.configured
        ? await callCommand<FeishuAuthTicket>("connection.activate", {
            appId: normalizedAppId,
            appSecret,
          })
        : await callCommand<FeishuAuthTicket>("connection.begin", {});
      await openAuthorization(ticket);
    } catch (cause) {
      setActivationError(String(cause));
    } finally {
      setActivating(false);
    }
  }, [appId, appSecret, authStatus, callCommand, openAuthorization, t]);

  const reopenAuthorization = useCallback(() => {
    if (!authorizationUrl) return;
    void openExternal(authorizationUrl).catch((cause) => setActivationError(String(cause)));
  }, [authorizationUrl]);

  const reauthorize = useCallback(async () => {
    setActivating(true);
    setActivationError("");
    try {
      const ticket = await callCommand<FeishuAuthTicket>("connection.begin", {});
      await openAuthorization(ticket);
      toast(t("feishu.authorizationOpened"), "success");
    } catch (cause) {
      toast(t("feishu.authorizationFailed", { error: String(cause) }), "error");
    } finally {
      setActivating(false);
    }
  }, [callCommand, openAuthorization, t, toast]);

  const disconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      const next = await callCommand<FeishuAuthStatus>("connection.disconnect", {});
      setAuthStatus(next);
      setOverview(null);
      setResourceActivity({ messages: [], documents: [], bases: [] });
      seenConnectorEventsRef.current.clear();
      subscriptionAttemptsRef.current.clear();
      subscriptionWarningsRef.current.clear();
      setAppId("");
      setAppSecret("");
      setAuthorizationUrl("");
      setManualSetupOpen(false);
      toast(t("feishu.disconnected"), "success");
    } catch (cause) {
      toast(t("feishu.disconnectFailed", { error: String(cause) }), "error");
    } finally {
      setDisconnecting(false);
    }
  }, [callCommand, t, toast]);

  const handoff = useCallback(async () => {
    if (!selectedResource || !objective.trim()) return;
    const prompt = buildFeishuExecutionPrompt({
      objective,
      tab,
      sourceName: resourceName(selectedResource),
      sourceUrl: "url" in selectedResource ? selectedResource.url : undefined,
      messages,
      documentContent,
      baseData,
      related,
    });
    setHandingOff(true);
    let armed = false;
    try {
      if (notifyOnComplete && sessionId && selectedChat) {
        await callCommand("notification.arm", {
          chatId: selectedChat.id,
          sessionId,
        });
        armed = true;
      }
      await onHandoff(prompt);
      setHandoffOpen(false);
      setObjective("");
      setTaskStatus(notifyOnComplete && armed
        ? t("feishu.taskHandedOffWithNotification", { chat: resourceName(selectedChat!) })
        : t("feishu.taskHandedOff"));
    } catch (cause) {
      if (armed && sessionId) {
        await callCommand("notification.disarm", { sessionId }).catch(() => {});
      }
      toast(t("feishu.handoffFailed", { error: String(cause) }), "error");
    } finally {
      setHandingOff(false);
    }
  }, [baseData, callCommand, documentContent, messages, notifyOnComplete, objective, onHandoff, related, selectedChat, selectedResource, sessionId, t, tab, toast]);

  const toggleSection = (resourceTab: ResourceTab) => {
    setCollapsedSections((current) => {
      const next = { ...current, [resourceTab]: !current[resourceTab] };
      writeCollapsedSections(next);
      return next;
    });
  };

  const togglePinnedResource = (resourceTab: ResourceTab, resourceId: string) => {
    setPinnedResources((current) => {
      const pinned = current[resourceTab];
      const nextIds = pinned.includes(resourceId)
        ? pinned.filter((id) => id !== resourceId)
        : [resourceId, ...pinned];
      const next = { ...current, [resourceTab]: nextIds };
      writePinnedResources(next);
      return next;
    });
  };

  const renderResourceRow = (
    resourceTab: ResourceTab,
    resource: ChatSummary | CloudResourceSummary,
  ) => {
    const selected = detailVisible
      && tab === resourceTab
      && selection[resourceTab] === resource.id;
    const name = resourceName(resource);
    const rawMeta = "description" in resource
      ? resource.latestMessage || resource.description
      : resource.summary || "";
    const meta = rawMeta.trim().localeCompare(name.trim(), undefined, { sensitivity: "base" }) === 0
      ? ""
      : rawMeta;
    const pinned = pinnedResources[resourceTab].includes(resource.id);
    const hasActivity = resourceActivity[resourceTab].includes(resource.id);
    return (
      <div
        key={resource.id}
        data-feishu-resource={`${resourceTab}:${resource.id}`}
        className="group/resource relative min-w-0"
      >
        <Button
          variant="selectable"
          size="row"
          focusStyle="inset"
          className="min-h-0 gap-2 rounded-control px-2 py-1.5 pr-control hover:bg-fill-quiet data-[selected=true]:bg-fill-hover"
          data-selected={selected}
          aria-current={selected ? "true" : undefined}
          onClick={() => {
            setTab(resourceTab);
            setSelection((current) => ({ ...current, [resourceTab]: resource.id }));
            clearResourceActivity(resourceTab, resource.id);
            onSelectResource?.();
          }}
        >
          {resourceTab === "messages" ? (
            <ChatAvatar chat={resource as ChatSummary} />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="flex h-4 min-w-0 items-center gap-1.5">
              <span className={cn("min-w-0 flex-1 truncate text-ui leading-4", selected && "font-medium")}>{name}</span>
              {hasActivity ? (
                <span
                  data-feishu-activity-dot={`${resourceTab}:${resource.id}`}
                  className="size-2 shrink-0 rounded-full bg-destructive"
                  aria-label={t("feishu.newActivity", { name })}
                />
              ) : null}
            </span>
            {meta ? (
              <span
                data-slot="navigation-row-meta"
                className="mt-0.5 block h-4 truncate text-fine leading-4 text-muted-foreground"
              >
                {meta}
              </span>
            ) : null}
          </span>
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={<Button
              variant="ghost"
              size="icon-xs"
              focusStyle="inset"
              aria-label={pinned ? t("feishu.unpinResource", { name }) : t("feishu.pinResource", { name })}
              aria-pressed={pinned}
              className={cn(
                "absolute right-inline top-1/2 -translate-y-1/2 text-muted-foreground opacity-0 motion-safe:transition-opacity group-hover/resource:opacity-100 group-focus-within/resource:opacity-100",
                pinned && "text-primary opacity-100",
              )}
              onClick={() => togglePinnedResource(resourceTab, resource.id)}
            >
              <Pin />
            </Button>}
          />
          <TooltipContent>
            {pinned ? t("feishu.unpinResource", { name }) : t("feishu.pinResource", { name })}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  };

  const renderResourceList = (
    resourceTab: ResourceTab,
    resources: Array<ChatSummary | CloudResourceSummary>,
  ) => {
    const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
    const ordered = [
      ...pinnedResources[resourceTab]
        .map((id) => resourcesById.get(id))
        .filter((resource): resource is ChatSummary | CloudResourceSummary => Boolean(resource)),
      ...resources.filter((resource) => !pinnedResources[resourceTab].includes(resource.id)),
    ];
    const visibleWhenLimited = Math.max(
      RESOURCE_LIMITS[resourceTab],
      ordered.filter((resource) => pinnedResources[resourceTab].includes(resource.id)).length,
    );
    const expanded = expandedSections[resourceTab];
    const visible = expanded ? ordered : ordered.slice(0, visibleWhenLimited);
    const hiddenCount = Math.max(0, ordered.length - visibleWhenLimited);

    return (
      <>
        {visible.map((resource) => renderResourceRow(resourceTab, resource))}
        {hiddenCount > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            focusStyle="inset"
            className="w-full justify-start px-2 font-normal text-muted-foreground"
            data-feishu-show-more={expanded ? undefined : resourceTab}
            data-feishu-show-less={expanded ? resourceTab : undefined}
            onClick={() => setExpandedSections((current) => ({ ...current, [resourceTab]: !current[resourceTab] }))}
          >
            {expanded ? t("feishu.showLess") : t("feishu.showMore", { count: hiddenCount })}
          </Button>
        ) : null}
      </>
    );
  };

  const sectionHeader = (
    resourceTab: ResourceTab,
    label: string,
    actions: ReactNode = null,
  ) => (
    <div className="group/feishu-section flex min-h-control-mini items-center pr-2 pb-1 pt-2">
      <button
        type="button"
        className="flex min-w-0 items-center gap-1 rounded px-2 text-ui font-normal leading-4 text-foreground/55 outline-none transition-colors hover:text-foreground focus-visible:focus-ring-inset"
        data-feishu-section-toggle={resourceTab}
        aria-expanded={!collapsedSections[resourceTab]}
        aria-label={collapsedSections[resourceTab]
          ? t("feishu.expandSection", { section: label })
          : t("feishu.collapseSection", { section: label })}
        onClick={() => toggleSection(resourceTab)}
      >
        <span className="min-w-0 truncate">{label}</span>
        {resourceActivity[resourceTab].length > 0 ? (
          <span
            data-feishu-section-activity={resourceTab}
            className="size-1.5 shrink-0 rounded-full bg-destructive"
            aria-label={t("feishu.sectionHasActivity", { section: label })}
          />
        ) : null}
        <ChevronDown
          className={cn("size-3.5 shrink-0 -rotate-90 motion-safe:transition-transform", !collapsedSections[resourceTab] && "rotate-0")}
          aria-hidden="true"
        />
      </button>
      {actions ? (
        <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 group-hover/feishu-section:opacity-100 focus-within:opacity-100">
          {actions}
        </span>
      ) : null}
    </div>
  );

  const allResourcesEmpty = Boolean(overview)
    && overview!.chats.length === 0
    && overview!.documents.length === 0
    && overview!.bases.length === 0;
  const resourceNavigation = authStatus?.authorized ? (
    <nav className="feishu-rail-navigator pb-1" aria-label={t("feishu.resources")}>
      <section data-feishu-section="contacts">
        {sectionHeader("messages", t("feishu.section.contacts"), (
          <>
            <Tooltip>
              <TooltipTrigger
                render={<Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("feishu.refresh")}
                  disabled={loading}
                  onClick={() => void reload()}
                >
                  {loading ? <Spinner /> : <RefreshCw />}
                </Button>}
              />
              <TooltipContent>{t("feishu.refresh")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={<Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("feishu.connectionSettings")}
                  onClick={onOpenPluginManager}
                >
                  <CircleCheck />
                </Button>}
              />
              <TooltipContent>{authStatus.user?.name || authStatus.user?.openId || t("feishu.connectionSettings")}</TooltipContent>
            </Tooltip>
          </>
        ))}
        {!collapsedSections.messages ? <div className="flex flex-col gap-0.5 pb-1">
          {loading && !overview ? (
            <div role="status" className="flex items-center justify-center gap-module-inset py-section text-ui text-muted-foreground"><Spinner />{t("feishu.loading")}</div>
          ) : error && !overview ? (
            <div role="alert" className="flex items-center gap-module-inset rounded-control px-module-inset py-control-group text-ui text-destructive"><CircleAlert /> <span className="truncate">{error}</span></div>
          ) : allResourcesEmpty ? (
            <div className="flex flex-col items-center gap-module-inset px-surface-inset py-section text-center text-ui text-muted-foreground">
              <MessageSquare />
              <p className="font-medium text-foreground">{overview?.warnings.length ? t("feishu.loadFailed") : t("feishu.empty")}</p>
              <p className="max-w-64 text-fine leading-relaxed">{overview?.warnings.length ? t("feishu.loadFailedHint") : t("feishu.emptyHint")}</p>
              {overview?.warnings.length ? <Button variant="secondary" size="compact" onClick={() => void reauthorize()}><ShieldCheck />{t("feishu.reauthorize")}</Button> : null}
            </div>
          ) : overview ? renderResourceList("messages", overview.chats) : null}
        </div> : null}
      </section>

      <section data-feishu-section="documents">
        {sectionHeader("documents", t("feishu.tab.documents"))}
        {!collapsedSections.documents ? <div className="flex flex-col gap-0.5 pb-1">
          {authStatus?.authorized && overview ? renderResourceList("documents", overview.documents) : null}
        </div> : null}
      </section>

      <section data-feishu-section="bases">
        {sectionHeader("bases", t("feishu.tab.bases"))}
        {!collapsedSections.bases ? <div className="flex flex-col gap-0.5">
          {authStatus?.authorized && overview ? renderResourceList("bases", overview.bases) : null}
        </div> : null}
      </section>
    </nav>
  ) : (
    <nav
      data-feishu-auth-required
      className="feishu-rail-navigator px-2 py-2"
      aria-label={t("feishu.resources")}
    >
      {!authStatus && loading ? (
        <div role="status" className="flex items-center gap-2 px-2 py-2 text-ui text-muted-foreground">
          <Spinner />
          <span>{t("feishu.loadingConnection")}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-control px-2 py-1.5">
          <p className="min-w-0 flex-1 text-fine leading-relaxed text-muted-foreground">
            {enabled ? t("feishu.authorizationRequiredHint") : t("feishu.pluginNotReadyHint")}
          </p>
          <Button
            type="button"
            size="compact"
            variant="secondary"
            className="shrink-0"
            onClick={onOpenPluginManager}
          >
            {enabled ? t("feishu.signIn") : t("feishu.openPlugins")}
          </Button>
        </div>
      )}
    </nav>
  );
  const navigationPortal = navigationHost ? createPortal(resourceNavigation, navigationHost) : null;
  const connectedSettingsPortal = authStatus?.authorized && settingsHost
    ? createPortal(
      <section
        data-feishu-plugin-settings
        className="flex max-w-2xl flex-col gap-section"
        aria-labelledby="feishu-plugin-settings-title"
      >
        <div className="flex flex-col gap-inline">
          <h2 id="feishu-plugin-settings-title" className="text-title font-semibold">
            {t("feishu.connectionSettings")}
          </h2>
          <p className="text-ui leading-relaxed text-muted-foreground">
            {t("feishu.connectionSettingsHint")}
          </p>
        </div>
        <div className="flex items-center gap-module-inset rounded-control border border-border bg-fill-quiet p-surface-inset">
          <span className="flex size-control shrink-0 items-center justify-center rounded-full bg-background text-primary"><UserRound /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-ui font-medium">{authStatus.user?.name || authStatus.user?.openId || t("feishu.connectedAccount")}</p>
            <p className="truncate text-fine text-muted-foreground">{authStatus.appId}</p>
          </div>
          <span className="flex items-center gap-inline text-fine text-muted-foreground"><CircleCheck className="text-primary" />{t("feishu.connected")}</span>
        </div>
        {authStatus.method === "oauth" ? (
          <div className="rounded-control border border-border px-surface-inset py-module-inset">
            <p className="text-fine text-muted-foreground">{t("feishu.redirectUri")}</p>
            <code className="mt-inline block overflow-x-auto text-fine text-foreground">{authStatus.redirectUri}</code>
          </div>
        ) : (
          <div className="rounded-control border border-border px-surface-inset py-module-inset text-fine text-muted-foreground">
            {t("feishu.createdByCodeTwo")}
          </div>
        )}
        <p className="text-fine leading-relaxed text-muted-foreground">{t("feishu.disconnectHint")}</p>
        <div className="flex flex-wrap justify-end gap-module-inset">
          <Button variant="destructive" size="compact" disabled={disconnecting || activating} onClick={() => void disconnect()}>
            {disconnecting ? <Spinner /> : null}{t("feishu.disconnect")}
          </Button>
          {authStatus.method === "oauth" ? (
            <Button variant="secondary" size="compact" disabled={disconnecting || activating} onClick={() => void reauthorize()}>
              {activating ? <Spinner /> : <ShieldCheck />}{t("feishu.reauthorize")}
            </Button>
          ) : (
            <Button variant="secondary" size="compact" disabled={disconnecting} onClick={() => void openExternal("https://open.feishu.cn/app")}>
              <ExternalLink />{t("feishu.manageFeishuApp")}
            </Button>
          )}
        </div>
      </section>,
      settingsHost,
    )
    : null;

  if (!enabled) {
    return (
      <>
        {navigationPortal}
        {detailVisible ? (
          <Empty className="min-h-0 flex-1 bg-background">
            <EmptyMedia variant="icon"><CircleAlert /></EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{t("feishu.pluginNotReady")}</EmptyTitle>
              <EmptyDescription>{t("feishu.pluginNotReadyHint")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><Button variant="secondary" size="compact" onClick={onOpenPluginManager}>{t("feishu.openPlugins")}</Button></EmptyContent>
          </Empty>
        ) : null}
      </>
    );
  }

  if (!authStatus?.authorized) {
    const waitingForAuthorization = authStatus?.waiting === true;
    const waitingForAppCreation = authStatus?.flow === "registration";
    const needsUserAuthorization = authStatus?.needsUserAuthorization === true;
    const credentialsAlreadySaved = authStatus?.configured === true
      && appId.trim() === authStatus.appId
      && !appSecret;
    const connectionSettings = (
      <section
        data-feishu-plugin-settings
        className="flex flex-col gap-section"
        aria-labelledby="feishu-plugin-settings-title"
      >
        <div className="flex flex-col gap-inline">
          <h2 id="feishu-plugin-settings-title" className="text-title font-semibold">
            {t("feishu.connectionSettings")}
          </h2>
          <p className="max-w-2xl text-ui leading-relaxed text-muted-foreground">
            {t("feishu.connectionSettingsHint")}
          </p>
        </div>
        {!authStatus && loading ? (
          <div role="status" className="flex min-h-32 items-center justify-center gap-module-inset text-ui text-muted-foreground">
            <Spinner />{t("feishu.loadingConnection")}
          </div>
        ) : (
          <form
            className="flex max-w-2xl flex-col gap-section rounded-module border border-border bg-surface p-section"
            noValidate
            aria-busy={activating || waitingForAuthorization}
            onSubmit={(event) => {
              event.preventDefault();
              void authorize();
            }}
          >
            <div className="flex items-start gap-surface-inset">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-module bg-fill-quiet text-primary"><ShieldCheck /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-title font-semibold">{t("feishu.credentialsRequired")}</h3>
                <p className="mt-inline text-ui leading-relaxed text-muted-foreground">{t("feishu.credentialsHint")}</p>
              </div>
            </div>

            <div className="flex flex-col gap-surface-inset rounded-module border border-border bg-fill-quiet p-surface-inset">
              <div>
                <h4 className="text-ui font-semibold">{needsUserAuthorization ? t("feishu.finishConnectionTitle") : t("feishu.oneClickTitle")}</h4>
                <p className="mt-inline text-fine leading-relaxed text-muted-foreground">{needsUserAuthorization ? t("feishu.finishConnectionHint") : t("feishu.oneClickHint")}</p>
              </div>
              {waitingForAuthorization ? (
                <div role="status" className="flex items-start gap-module-inset rounded-control bg-background p-surface-inset text-ui">
                  <Spinner className="mt-px shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{waitingForAppCreation ? t("feishu.waitingForCreation") : t("feishu.waitingForAuthorization")}</p>
                    <p className="mt-inline text-fine text-muted-foreground">{waitingForAppCreation ? t("feishu.waitingForCreationHint") : t("feishu.waitingForAuthorizationHint")}</p>
                  </div>
                  {authorizationUrl ? <Button type="button" variant="secondary" size="compact" onClick={reopenAuthorization}><ExternalLink />{t("feishu.reopenAuthorization")}</Button> : null}
                </div>
              ) : (
                <Button type="button" className="self-start" size="compact" disabled={activating} onClick={() => void (needsUserAuthorization ? authorize() : createFeishuApp())}>
                  {activating ? <Spinner /> : <ShieldCheck />}
                  {needsUserAuthorization ? t("feishu.continueAuthorization") : t("feishu.createAndConnect")}
                </Button>
              )}
            </div>

            {activationError || authStatus?.problem || error ? (
              <FieldError>{activationError || authStatus?.problem || error}</FieldError>
            ) : null}

            <Separator />

            <Collapsible open={manualSetupOpen} onOpenChange={setManualSetupOpen}>
              <CollapsibleTrigger className="group flex w-full items-center gap-module-inset rounded-control px-module-inset py-control-group text-left text-ui font-medium text-muted-foreground hover:bg-fill-hover hover:text-foreground focus-visible:focus-ring">
                <span className="min-w-0 flex-1">{t("feishu.useExistingApp")}</span>
                <ChevronDown className="size-icon-list shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-section">
                <div className="grid gap-section sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="feishu-app-id">{t("feishu.appId")}</FieldLabel>
                    <Input
                      id="feishu-app-id"
                      value={appId}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="cli_…"
                      aria-invalid={activationError && !appId.trim() ? true : undefined}
                      onChange={(event) => {
                        setAppId(event.currentTarget.value);
                        setActivationError("");
                      }}
                    />
                    <FieldDescription>{t("feishu.appIdHint")}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="feishu-app-secret">{t("feishu.appSecret")}</FieldLabel>
                    <div className="relative">
                      <Input
                        id="feishu-app-secret"
                        type={secretVisible ? "text" : "password"}
                        value={appSecret}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="pr-control"
                        placeholder={credentialsAlreadySaved ? t("feishu.secretSaved") : t("feishu.appSecretPlaceholder")}
                        aria-invalid={activationError && !appSecret && !credentialsAlreadySaved ? true : undefined}
                        onChange={(event) => {
                          setAppSecret(event.currentTarget.value);
                          setActivationError("");
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-inline top-1/2 -translate-y-1/2"
                        aria-label={secretVisible ? t("feishu.hideSecret") : t("feishu.showSecret")}
                        onClick={() => setSecretVisible((current) => !current)}
                      >
                        {secretVisible ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                    <FieldDescription className="flex items-start gap-inline"><Lock className="mt-px size-icon-list shrink-0" />{t("feishu.appSecretHint")}</FieldDescription>
                  </Field>
                </div>

                <div className="mt-section rounded-control bg-fill-quiet p-surface-inset">
                  <p className="text-ui font-medium">{t("feishu.redirectUri")}</p>
                  <code className="mt-module-inset block overflow-x-auto rounded-control bg-background px-module-inset py-control-group text-fine text-foreground">{authStatus?.redirectUri || "http://127.0.0.1:37641/oauth/callback"}</code>
                  <p className="mt-module-inset text-fine leading-relaxed text-muted-foreground">{t("feishu.redirectHint")}</p>
                </div>

                <div className="mt-section flex flex-wrap items-center justify-between gap-module-inset">
                  <Button type="button" variant="ghost" size="compact" onClick={() => void openExternal("https://open.feishu.cn/app")}>
                    <ExternalLink />{t("feishu.openDeveloperConsole")}
                  </Button>
                  <Button type="submit" size="compact" disabled={activating || waitingForAuthorization}>
                    {activating ? <Spinner /> : <ShieldCheck />}
                    {credentialsAlreadySaved ? t("feishu.continueAuthorization") : t("feishu.saveAndAuthorize")}
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </form>
        )}
      </section>
    );
    const settingsPortal = settingsHost
      ? createPortal(connectionSettings, settingsHost)
      : null;
    return (
      <>
        {navigationPortal}
        {settingsPortal}
        {detailVisible ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <header className="electrobun-webkit-app-region-drag flex h-titlebar shrink-0 items-center gap-module-inset px-page">
              {headerLeadingAction}
              <h1 className="text-dialog font-semibold">{t("feishu.title")}</h1>
            </header>
            <Empty className="min-h-0 flex-1">
              <EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{t("feishu.authorizationRequired")}</EmptyTitle>
                <EmptyDescription>{t("feishu.authorizationRequiredHint")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" size="compact" onClick={onOpenPluginManager}>
                  {t("feishu.signIn")}
                </Button>
              </EmptyContent>
            </Empty>
          </section>
        ) : null}
      </>
    );
  }

  return (
    <>
      {navigationPortal}
      {connectedSettingsPortal}
      {detailVisible ? <section
      className="feishu-workspace flex min-h-0 min-w-0 flex-1 bg-background text-foreground"
      aria-label={t("feishu.title")}
    >
      <div className="feishu-detail-pane flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="electrobun-webkit-app-region-drag flex h-titlebar shrink-0 items-center gap-module-inset px-section">
          {headerLeadingAction}
          {selectedResource ? (
            <>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-dialog font-semibold">{resourceName(selectedResource)}</h2>
                <p className="truncate text-fine text-muted-foreground">{localizedSourceLabel(tab, resourceName(selectedResource), t)}</p>
              </div>
              {"url" in selectedResource && selectedResource.url ? (
                <Tooltip>
                  <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("feishu.openInFeishu")} onClick={() => void openExternal(selectedResource.url)}><ExternalLink /></Button>} />
                  <TooltipContent>{t("feishu.openInFeishu")}</TooltipContent>
                </Tooltip>
              ) : null}
              {selectedChat ? (
                <Button variant="secondary" size="compact" onClick={() => setRelationsOpen(true)}>
                  <FileText />{t("feishu.related", { count: related.length })}
                </Button>
              ) : null}
              <Button size="compact" onClick={() => setHandoffOpen(true)}><Bot />{t("feishu.handoff")}</Button>
            </>
          ) : <div className="flex-1" />}
        </header>
        <Separator />

        {!selectedResource ? (
          <Empty><EmptyMedia variant="icon"><ResourceIcon tab={tab} /></EmptyMedia><EmptyHeader><EmptyTitle>{t("feishu.selectResource")}</EmptyTitle></EmptyHeader></Empty>
        ) : tab === "messages" && selectedChat ? (
          <>
            {related.length > 0 ? (
              <div className="flex shrink-0 flex-wrap items-center gap-inline px-section py-module-inset text-fine text-muted-foreground">
                <span>{t("feishu.relatedResources")}</span>
                {related.map((resource) => <button key={`${resource.kind}:${resource.id}`} type="button" className="rounded-control bg-fill-quiet px-module-inset py-inline text-foreground hover:bg-fill-hover focus-visible:focus-ring" onClick={() => { setTab(resource.kind === "document" ? "documents" : "bases"); setSelection((current) => ({ ...current, [resource.kind === "document" ? "documents" : "bases"]: resource.id })); }}>{resource.name || resource.id}</button>)}
              </div>
            ) : null}
            <ScrollArea className="min-h-0 flex-1">
              <div className="mx-auto flex w-full max-w-4xl flex-col px-page py-section">
                {detailLoading ? <div role="status" className="flex items-center justify-center gap-module-inset py-section text-ui text-muted-foreground"><Spinner />{t("feishu.loadingMessages")}</div> : null}
                {!detailLoading && messages.length === 0 ? <p className="py-section text-center text-ui text-muted-foreground">{t("feishu.noMessages")}</p> : null}
                {messages.map((message) => (
                  <article key={message.id} data-feishu-message className="grid grid-cols-[auto_1fr_auto] gap-x-module-inset gap-y-inline border-b border-border/70 py-section last:border-b-0">
                    <MessageAvatar
                      label={messageSenderLabel(message, t("feishu.member"))}
                      src={message.senderAvatarUrl || ""}
                    />
                    <p className="truncate text-ui font-medium">{messageSenderLabel(message, t("feishu.member"))}</p>
                    <time className="text-fine tabular-nums text-muted-foreground">{displayTime(message.createdAt)}</time>
                    <div dir="auto" className="col-start-2 col-end-4 min-w-0 text-body leading-relaxed">
                      <MarkdownContent text={visibleMessageText(message, t)} />
                      {message.reactions?.length ? (
                        <div data-feishu-reactions className="mt-inline flex flex-wrap gap-inline">
                          {message.reactions.map((reaction) => (
                            <span
                              key={reaction.emojiType}
                              className="inline-flex items-center gap-inline rounded-full bg-fill-quiet px-module-inset py-inline text-fine text-muted-foreground"
                              aria-label={t("feishu.reaction", { name: reaction.emojiType, count: reaction.count })}
                              title={reaction.emojiType}
                            >
                              <span aria-hidden="true" className="text-body">{reaction.emoji}</span>
                              <span className="tabular-nums">{reaction.count}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </ScrollArea>
            <div className="flex shrink-0 items-end gap-module-inset bg-surface px-section py-surface-inset shadow-surface">
              <label className="sr-only" htmlFor="feishu-reply">{t("feishu.reply")}</label>
              <Textarea id="feishu-reply" size="compact" rows={2} value={reply} onChange={(event) => setReply(event.currentTarget.value)} placeholder={t("feishu.replyPlaceholder")} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendReply(); } }} />
              <Button size="icon" aria-label={t("feishu.sendReply")} disabled={sending || !reply.trim()} onClick={() => void sendReply()}>{sending ? <Spinner /> : <Send />}</Button>
            </div>
          </>
        ) : tab === "documents" && selectedDocument ? (
          <FeishuDocumentView
            callCommand={callCommand}
            documentUrl={selectedDocument.url}
            markdown={documentContent}
            markdownLoading={detailLoading}
          />
        ) : tab === "bases" && selectedBase ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {baseData?.tables.length ? (
              <div className="flex shrink-0 gap-inline overflow-x-auto px-section py-module-inset" role="tablist" aria-label={t("feishu.baseTables")}>{baseData.tables.map((table) => <Button key={table.id} role="tab" aria-selected={baseData.selectedTableId === table.id} data-selected={baseData.selectedTableId === table.id} variant="selectable" size="compact" onClick={() => void loadBase(table.id)}>{table.name || table.id}</Button>)}</div>
            ) : null}
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-section">
                {detailLoading ? <div role="status" className="flex items-center justify-center gap-module-inset py-section text-ui text-muted-foreground"><Spinner />{t("feishu.loadingBase")}</div> : null}
                {!detailLoading && (!baseData || baseData.records.length === 0) ? <p className="py-section text-center text-ui text-muted-foreground">{t("feishu.emptyBase")}</p> : null}
                {baseData && baseData.records.length > 0 ? (
                  <div className="overflow-auto rounded-module bg-surface shadow-surface">
                    <table className="w-full min-w-max border-collapse text-ui">
                      <thead><tr>{baseData.fields.map((field) => <th key={field} scope="col" className="border-b border-r border-border bg-fill-quiet px-surface-inset py-module-inset text-left font-medium last:border-r-0">{field}</th>)}</tr></thead>
                      <tbody>{baseData.records.map((record) => { const cells = new Map(record.cells.map((cell) => [cell.field, cell.value])); return <tr key={record.id}>{baseData.fields.map((field) => <td key={field} dir="auto" className="max-w-72 border-b border-r border-border px-surface-inset py-module-inset align-top last:border-r-0">{cells.get(field) || "—"}</td>)}</tr>; })}</tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        ) : null}

        {error ? <div role="alert" className="shrink-0 bg-fill-quiet px-section py-module-inset text-ui text-destructive">{error}</div> : null}
        {taskStatus ? <div role="status" className="shrink-0 bg-fill-quiet px-section py-module-inset text-ui text-muted-foreground">{taskStatus}</div> : null}
      </div>

      <Dialog open={relationsOpen} onOpenChange={setRelationsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("feishu.relatedDialogTitle")}</DialogTitle>
            <DialogDescription>{selectedChat ? t("feishu.relatedDialogDescription", { chat: resourceName(selectedChat) }) : ""}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-dialog-content">
            <div className="flex flex-col gap-inline">
              {[...(overview?.documents ?? []).map((resource) => ({ ...resource, kind: "document" as const })), ...(overview?.bases ?? []).map((resource) => ({ ...resource, kind: "base" as const }))].map((resource) => {
                const checked = related.some((item) => item.kind === resource.kind && item.id === resource.id);
                return <label key={`${resource.kind}:${resource.id}`} className="flex cursor-pointer items-center gap-module-inset rounded-control px-module-inset py-control-group hover:bg-fill-hover"><Checkbox checked={checked} onCheckedChange={() => toggleRelated(resource)} /><span className="min-w-0 flex-1"><span className="block truncate text-ui font-medium">{resourceName(resource)}</span><span className="block truncate text-fine text-muted-foreground">{resource.kind === "document" ? t("feishu.tab.documents") : t("feishu.tab.bases")}</span></span></label>;
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={handoffOpen} onOpenChange={setHandoffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("feishu.handoffTitle")}</DialogTitle>
            <DialogDescription>{selectedResource ? t("feishu.handoffDescription", { source: localizedSourceLabel(tab, resourceName(selectedResource), t) }) : ""}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-section">
            <label className="flex flex-col gap-module-inset text-ui font-medium" htmlFor="feishu-objective">{t("feishu.objective")}<Textarea id="feishu-objective" rows={5} value={objective} onChange={(event) => setObjective(event.currentTarget.value)} placeholder={t("feishu.objectivePlaceholder")} /></label>
            <label className={cn("flex items-start gap-module-inset rounded-control bg-fill-quiet p-surface-inset", (!sessionId || !selectedChat) && "opacity-50")}>
              <Checkbox checked={notifyOnComplete} disabled={!sessionId || !selectedChat} onCheckedChange={(checked) => setNotifyOnComplete(checked === true)} />
              <span className="min-w-0 text-ui"><span className="block font-medium">{t("feishu.notifyOnComplete")}</span><span className="mt-inline block text-fine text-muted-foreground">{sessionId && selectedChat ? t("feishu.notifyTarget", { chat: resourceName(selectedChat) }) : t("feishu.notifyUnavailable")}</span></span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="secondary" size="compact" onClick={() => setHandoffOpen(false)}>{t("feishu.cancel")}</Button>
            <Button size="compact" disabled={handingOff || !objective.trim()} onClick={() => void handoff()}>{handingOff ? <Spinner /> : <Bot />}{t("feishu.handoff")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </section> : null}
    </>
  );
}
