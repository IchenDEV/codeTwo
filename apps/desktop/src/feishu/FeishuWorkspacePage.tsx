import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  GripVertical,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { openExternal } from "../bridge";
import { useT } from "../i18n";
import { MarkdownContent } from "../session/MarkdownContent";
import { useToast } from "../ui/toast";
import { FeishuDocumentView } from "./FeishuDocumentView";
import {
  feishuResourceTabs,
  loadFeishuSidebarOrder,
  moveFeishuResource,
  moveFeishuSection,
  saveFeishuSidebarOrder,
  sortFeishuResources,
} from "./sidebarOrder";
import type { FeishuResourceTab } from "./sidebarOrder";
import "./feishu-workspace.css";

export type CollaborationConnectorCaller = <T = unknown>(
  operation: string,
  input?: unknown
) => Promise<T>;

export interface CollaborationConnectorEvent {
  connectorId: string;
  eventId: string;
  kind:
    | "message.created"
    | "message.changed"
    | "document.changed"
    | "base.changed"
    | "connection.changed";
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
  callback: (event: CollaborationConnectorEvent) => void
) => Promise<() => void>;

type ResourceTab = FeishuResourceTab;

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

const associationsKey = "codetwo.feishu.associations.v1";
const resourceSectionsKey = "codetwo.feishu.sections.v1";
const resourcePinsKey = "codetwo.feishu.pins.v1";
const resourceTabs: readonly ResourceTab[] = feishuResourceTabs;
const resourceLimits: Record<ResourceTab, number> = {
  bases: 2,
  documents: 2,
  messages: 4,
};
const feishuDragType = "application/x-codetwo-feishu-sidebar-item";

type FeishuDragItem =
  | { kind: "section"; tab: ResourceTab }
  | { kind: "resource"; tab: ResourceTab; id: string };

function writeFeishuDrag(event: React.DragEvent, item: FeishuDragItem): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(feishuDragType, JSON.stringify(item));
  event.dataTransfer.setData(
    "text/plain",
    item.kind === "section" ? item.tab : item.id
  );
}

function readFeishuDrag(event: React.DragEvent): FeishuDragItem | null {
  try {
    const value = JSON.parse(
      event.dataTransfer.getData(feishuDragType)
    ) as FeishuDragItem;
    if (value.kind === "section" && resourceTabs.includes(value.tab)) {
      return value;
    }
    if (
      value.kind === "resource" &&
      resourceTabs.includes(value.tab) &&
      value.id
    ) {
      return value;
    }
  } catch {
    // Ignore drags from other sidebar surfaces and other applications.
  }
  return null;
}

function readCollapsedSections(): ResourceSectionState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(resourceSectionsKey) || "{}"
    ) as Record<string, unknown>;
    return {
      bases: parsed.bases === true,
      documents: parsed.documents === true,
      messages: parsed.messages === true,
    };
  } catch {
    return { bases: false, documents: false, messages: false };
  }
}

function writeCollapsedSections(value: ResourceSectionState) {
  try {
    localStorage.setItem(resourceSectionsKey, JSON.stringify(value));
  } catch {
    // Private mode keeps the current in-memory state until this window closes.
  }
}

function readPinnedResources(): PinnedResourceMap {
  const empty: PinnedResourceMap = { bases: [], documents: [], messages: [] };
  try {
    const parsed = JSON.parse(
      localStorage.getItem(resourcePinsKey) || "{}"
    ) as Record<string, unknown>;
    for (const resourceTab of resourceTabs) {
      const value = parsed[resourceTab];
      if (!Array.isArray(value)) {
        continue;
      }
      empty[resourceTab] = [
        ...new Set(value.filter((id): id is string => typeof id === "string")),
      ];
    }
  } catch {
    // Ignore malformed or unavailable local state.
  }
  return empty;
}

function writePinnedResources(value: PinnedResourceMap) {
  try {
    localStorage.setItem(resourcePinsKey, JSON.stringify(value));
  } catch {
    // Private mode keeps the current in-memory state until this window closes.
  }
}

function readAssociations(): AssociationMap {
  try {
    const raw = localStorage.getItem(associationsKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: AssociationMap = {};
    for (const [chatId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) {
        continue;
      }
      result[chatId] = value.filter((item): item is RelatedResource => {
        if (!item || typeof item !== "object") {
          return false;
        }
        const row = item as Record<string, unknown>;
        return (
          typeof row.id === "string" &&
          typeof row.name === "string" &&
          typeof row.type === "string" &&
          typeof row.url === "string" &&
          (row.kind === "document" || row.kind === "base")
        );
      });
    }
    return result;
  } catch {
    return {};
  }
}

function writeAssociations(value: AssociationMap) {
  try {
    localStorage.setItem(associationsKey, JSON.stringify(value));
  } catch {
    // Private mode keeps the current in-memory association until this window closes.
  }
}

function displayTime(value: string): string {
  const numeric = Number(value);
  const millis =
    Number.isFinite(numeric) && numeric > 0
      ? numeric < 1_000_000_000_000
        ? numeric * 1000
        : numeric
      : Date.parse(value);
  if (!Number.isFinite(millis)) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(millis));
}

function visibleMessageText(
  message: ChatMessageSummary,
  t: ReturnType<typeof useT>
): string {
  if (message.text.trim()) {
    return message.text;
  }
  switch (message.type.trim().toLowerCase()) {
    case "image": {
      return t("feishu.message.image");
    }
    case "file": {
      return t("feishu.message.file");
    }
    case "audio": {
      return t("feishu.message.audio");
    }
    case "media": {
      return t("feishu.message.video");
    }
    case "sticker": {
      return t("feishu.message.sticker");
    }
    case "interactive": {
      return t("feishu.message.card");
    }
    case "post": {
      return t("feishu.message.richText");
    }
    default: {
      return t("feishu.message.unsupported");
    }
  }
}

function sourceLabel(tab: ResourceTab, name: string): string {
  if (tab === "messages") {
    return `飞书对话：${name}`;
  }
  if (tab === "documents") {
    return `飞书云文档：${name}`;
  }
  return `飞书多维表格：${name}`;
}

function localizedSourceLabel(
  tab: ResourceTab,
  name: string,
  t: ReturnType<typeof useT>
): string {
  if (tab === "messages") {
    return t("feishu.source.chat", { name });
  }
  if (tab === "documents") {
    return t("feishu.source.document", { name });
  }
  return t("feishu.source.base", { name });
}

function baseContext(data: BaseData | null): string {
  if (!data || data.fields.length === 0 || data.records.length === 0) {
    return "(当前数据表没有可见记录)";
  }
  const rows = [data.fields.join("\t")];
  for (const record of data.records) {
    const values = new Map(
      record.cells.map((cell) => [cell.field, cell.value])
    );
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
      const sender =
        message.senderName ||
        message.senderId ||
        message.senderType ||
        "unknown";
      return `- [${message.createdAt || "unknown time"}] ${sender}: ${message.text || `[${message.type}]`}`;
    });
    sections.push(
      `\n## ${sourceLabel(input.tab, input.sourceName)}\n${messages.join("\n") || "(没有可见消息)"}`
    );
  } else if (input.tab === "documents") {
    sections.push(
      `\n## ${sourceLabel(input.tab, input.sourceName)}\n来源：${input.sourceUrl || "未提供链接"}\n\n${input.documentContent || "(文档没有可见正文)"}`
    );
  } else {
    sections.push(
      `\n## ${sourceLabel(input.tab, input.sourceName)}\n来源：${input.sourceUrl || "未提供链接"}\n\n${baseContext(input.baseData ?? null)}`
    );
  }
  if (input.related.length > 0) {
    sections.push(
      `\n## 关联资料\n${input.related
        .map(
          (resource) =>
            `- ${resource.kind === "document" ? "云文档" : "多维表格"}：${resource.name || resource.id}${resource.url ? ` — ${resource.url}` : ""}`
        )
        .join("\n")}`
    );
  }
  return sections.join("\n");
}

function resourceName(resource: ChatSummary | CloudResourceSummary): string {
  return resource.name || resource.id;
}

const ResourceIcon = ({ tab }: { readonly tab: ResourceTab }) => {
  if (tab === "messages") {
    return <MessageSquare />;
  }
  if (tab === "documents") {
    return <FileText />;
  }
  return <SquareKanban />;
};

const ChatAvatar = ({ chat }: { readonly chat: ChatSummary }) => {
  const [failed, setFailed] = useState(false);
  const isDirectMessage = chat.mode === "p2p" || chat.type === "p2p";

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
          isDirectMessage ? "rounded-full" : "rounded-control"
        )}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      data-feishu-avatar-fallback
      className={cn(
        "size-control bg-fill-quiet text-cap text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden font-semibold",
        isDirectMessage ? "rounded-full" : "rounded-control"
      )}
      aria-hidden
    >
      {isDirectMessage ? (
        Array.from(chat.name.trim())[0]?.toLocaleUpperCase() || "?"
      ) : (
        <MessageSquare />
      )}
    </span>
  );
};

const MessageAvatar = ({
  label,
  src,
}: {
  readonly label: string;
  readonly src: string;
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  return (
    <span
      data-feishu-message-avatar
      className="size-control bg-fill-quiet text-cap text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
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
      ) : (
        Array.from(label.trim())[0]?.toLocaleUpperCase() || "?"
      )}
    </span>
  );
};

function messageSenderLabel(
  message: ChatMessageSummary,
  memberLabel: string
): string {
  const name = message.senderName?.trim();
  if (name) {
    return name;
  }
  if (message.senderId) {
    return `${memberLabel} · ${message.senderId.slice(-6)}`;
  }
  return message.senderType || memberLabel;
}

export const FeishuWorkspacePage = ({
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
  readonly enabled: boolean;
  readonly sessionId: string | null;
  readonly callCommand: CollaborationConnectorCaller;
  readonly onHandoff: (prompt: string) => Promise<void>;
  readonly onOpenPluginManager: () => void;
  readonly headerLeadingAction?: ReactNode;
  readonly navigationHost: Element | null;
  readonly settingsHost?: Element | null;
  readonly detailVisible?: boolean;
  readonly onSelectResource?: () => void;
  readonly subscribeEvents?: CollaborationConnectorSubscriber;
}) => {
  const t = useT();
  const toast = useToast();
  const [authStatus, setAuthStatus] = useState<FeishuAuthStatus | null>(null);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ResourceTab>("messages");
  const [selection, setSelection] = useState<Record<ResourceTab, string>>({
    bases: "",
    documents: "",
    messages: "",
  });
  const [messages, setMessages] = useState<ChatMessageSummary[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [documentContent, setDocumentContent] = useState("");
  const [baseData, setBaseData] = useState<BaseData | null>(null);
  const [associations, setAssociations] =
    useState<AssociationMap>(readAssociations);
  const [collapsedSections, setCollapsedSections] =
    useState<ResourceSectionState>(readCollapsedSections);
  const [expandedSections, setExpandedSections] =
    useState<ResourceSectionState>({
      bases: false,
      documents: false,
      messages: false,
    });
  const [pinnedResources, setPinnedResources] =
    useState<PinnedResourceMap>(readPinnedResources);
  const [sidebarOrder, setSidebarOrder] = useState(() =>
    loadFeishuSidebarOrder(
      typeof localStorage === "undefined" ? null : localStorage
    )
  );
  const [dragItem, setDragItem] = useState<FeishuDragItem | null>(null);
  const [resourceActivity, setResourceActivity] = useState<ResourceActivityMap>(
    {
      bases: [],
      documents: [],
      messages: [],
    }
  );
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

  useEffect(() => {
    saveFeishuSidebarOrder(
      typeof localStorage === "undefined" ? null : localStorage,
      sidebarOrder
    );
  }, [sidebarOrder]);

  const reload = async () => {
    if (!enabled) {
      return;
    }
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
        bases: next.bases.some((item) => item.id === current.bases)
          ? current.bases
          : (next.bases[0]?.id ?? ""),
        documents: next.documents.some((item) => item.id === current.documents)
          ? current.documents
          : (next.documents[0]?.id ?? ""),
        messages: next.chats.some((item) => item.id === current.messages)
          ? current.messages
          : (next.chats[0]?.id ?? ""),
      }));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!authStatus?.waiting) {
      return;
    }
    let isLive = true;
    const poll = window.setInterval(() => {
      void callCommand<FeishuAuthStatus>("connection.status", {})
        .then((next) => {
          if (!isLive) {
            return;
          }
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
            if (next.problem) {
              setActivationError(next.problem);
            }
          }
        })
        .catch(() => {});
    }, 1_000);
    return () => {
      isLive = false;
      window.clearInterval(poll);
    };
  }, [authStatus?.waiting, callCommand, reload]);

  useEffect(() => {
    if (
      authStatus?.configured &&
      !authStatus.authorized &&
      !authStatus.method
    ) {
      setManualSetupOpen(true);
    }
  }, [authStatus?.authorized, authStatus?.configured, authStatus?.method]);

  const selectedChat =
    overview?.chats.find((item) => item.id === selection.messages) ?? null;
  const selectedDocument =
    overview?.documents.find((item) => item.id === selection.documents) ?? null;
  const selectedBase =
    overview?.bases.find((item) => item.id === selection.bases) ?? null;
  const selectedResource =
    tab === "messages"
      ? selectedChat
      : tab === "documents"
        ? selectedDocument
        : selectedBase;
  const related = selectedChat ? (associations[selectedChat.id] ?? []) : [];

  const loadMessages = async () => {
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
        { chatId: selectedChat.id }
      );
      if (request === detailRequestRef.current) {
        setMessages(result.messages);
      }
    } catch (cause) {
      if (request === detailRequestRef.current) {
        setError(String(cause));
      }
    } finally {
      if (request === detailRequestRef.current) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!detailVisible || tab !== "messages") {
      return;
    }
    void loadMessages();
  }, [detailVisible, loadMessages, tab]);

  const loadDocument = async () => {
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
      if (request === detailRequestRef.current) {
        setDocumentContent(result.content);
      }
    } catch (cause) {
      if (request === detailRequestRef.current) {
        setError(String(cause));
      }
    } finally {
      if (request === detailRequestRef.current) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!detailVisible || tab !== "documents") {
      return;
    }
    void loadDocument();
  }, [detailVisible, loadDocument, tab]);

  const loadBase = async (tableId = "") => {
    if (!selectedBase) {
      return;
    }
    const request = ++detailRequestRef.current;
    setDetailLoading(true);
    setError(null);
    try {
      const result = await callCommand<BaseData>("table.read", {
        appToken: selectedBase.id,
        tableId,
      });
      if (request === detailRequestRef.current) {
        setBaseData(result);
      }
    } catch (cause) {
      if (request === detailRequestRef.current) {
        setError(String(cause));
      }
    } finally {
      if (request === detailRequestRef.current) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!detailVisible || tab !== "bases") {
      return;
    }
    setBaseData(null);
    void loadBase();
  }, [detailVisible, loadBase, tab]);

  const markResourceActivity = (
    resourceTab: ResourceTab,
    resourceId: string
  ) => {
    if (!resourceId) {
      return;
    }
    setResourceActivity((current) =>
      current[resourceTab].includes(resourceId)
        ? current
        : { ...current, [resourceTab]: [...current[resourceTab], resourceId] }
    );
  };

  const clearResourceActivity = (
    resourceTab: ResourceTab,
    resourceId: string
  ) => {
    setResourceActivity((current) =>
      current[resourceTab].includes(resourceId)
        ? {
            ...current,
            [resourceTab]: current[resourceTab].filter(
              (id) => id !== resourceId
            ),
          }
        : current
    );
  };

  const scheduleRefresh = (key: string, refresh: () => void) => {
    const existing = refreshTimersRef.current.get(key);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      refreshTimersRef.current.delete(key);
      refresh();
    }, 120);
    refreshTimersRef.current.set(key, timer);
  };

  useEffect(
    () => () => {
      for (const timer of refreshTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      refreshTimersRef.current.clear();
    },
    []
  );

  useEffect(() => {
    if (!subscribeEvents) {
      return;
    }
    let isLive = true;
    let unsubscribe: (() => void) | null = null;
    void subscribeEvents((event) => {
      if (!isLive || event.connectorId !== "workspace") {
        return;
      }
      const eventKey = `${event.kind}:${event.eventId}`;
      if (event.eventId && seenConnectorEventsRef.current.has(eventKey)) {
        return;
      }
      if (event.eventId) {
        seenConnectorEventsRef.current.add(eventKey);
        if (seenConnectorEventsRef.current.size > 512) {
          seenConnectorEventsRef.current.delete(
            seenConnectorEventsRef.current.values().next().value!
          );
        }
      }

      if (event.kind === "message.created" && event.chatId) {
        const isKnownChat =
          overview?.chats.some((item) => item.id === event.chatId) === true;
        setOverview((current) => {
          if (!current) {
            return current;
          }
          const chat = current.chats.find((item) => item.id === event.chatId);
          if (!chat) {
            return current;
          }
          const updated = {
            ...chat,
            latestMessage: event.preview || chat.latestMessage,
          };
          return {
            ...current,
            chats: [
              updated,
              ...current.chats.filter((item) => item.id !== event.chatId),
            ],
          };
        });
        if (
          detailVisible &&
          tab === "messages" &&
          selectedChat?.id === event.chatId
        ) {
          scheduleRefresh(`messages:${event.chatId}`, () => {
            void loadMessages();
          });
          clearResourceActivity("messages", event.chatId);
        } else {
          markResourceActivity("messages", event.chatId);
        }
        if (!isKnownChat) {
          void reload();
        }
        return;
      }

      if (event.kind === "message.changed") {
        if (detailVisible && tab === "messages" && selectedChat) {
          scheduleRefresh(`messages:${selectedChat.id}`, () => {
            void loadMessages();
          });
        }
        return;
      }

      if (event.kind === "document.changed" && event.resourceId) {
        if (
          detailVisible &&
          tab === "documents" &&
          selectedDocument?.id === event.resourceId
        ) {
          scheduleRefresh(`documents:${event.resourceId}`, () => {
            void loadDocument();
          });
          clearResourceActivity("documents", event.resourceId);
        } else {
          markResourceActivity("documents", event.resourceId);
        }
        return;
      }

      if (event.kind === "base.changed" && event.resourceId) {
        if (
          detailVisible &&
          tab === "bases" &&
          selectedBase?.id === event.resourceId
        ) {
          scheduleRefresh(`bases:${event.resourceId}`, () => {
            void loadBase(baseData?.selectedTableId || "");
          });
          clearResourceActivity("bases", event.resourceId);
        } else {
          markResourceActivity("bases", event.resourceId);
        }
      }
    })
      .then((dispose) => {
        if (isLive) {
          unsubscribe = dispose;
        } else {
          dispose();
        }
      })
      .catch(() => {});
    return () => {
      isLive = false;
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
    if (!authStatus?.authorized || !overview) {
      return;
    }
    const candidates: Array<{ id: string; type: string; name: string }> = [];
    const addCandidates = (
      resourceTab: "documents" | "bases",
      resources: CloudResourceSummary[]
    ) => {
      const visibleIds = new Set([
        ...resources
          .slice(0, resourceLimits[resourceTab])
          .map((resource) => resource.id),
        ...pinnedResources[resourceTab],
        selection[resourceTab],
      ]);
      for (const resource of resources) {
        if (visibleIds.has(resource.id)) {
          candidates.push(resource);
        }
      }
    };
    addCandidates("documents", overview.documents);
    addCandidates("bases", overview.bases);
    for (const resource of candidates) {
      const key = `${resource.type}:${resource.id}`;
      if (subscriptionAttemptsRef.current.has(key)) {
        continue;
      }
      subscriptionAttemptsRef.current.add(key);
      const operation =
        resource.type === "bitable" ? "table.subscribe" : "document.subscribe";
      void callCommand<{ subscribed: boolean; problem: string }>(operation, {
        fileType: resource.type,
        resourceId: resource.id,
      })
        .then((result) => {
          if (result.subscribed || subscriptionWarningsRef.current.has(key)) {
            return;
          }
          subscriptionWarningsRef.current.add(key);
          toast(
            t("feishu.realtimeUnavailable", {
              name: resource.name || resource.id,
            }),
            "info"
          );
        })
        .catch(() => {});
    }
  }, [
    authStatus?.authorized,
    callCommand,
    overview,
    pinnedResources,
    selection,
    t,
    toast,
  ]);

  const toggleRelated = (resource: RelatedResource) => {
    if (!selectedChat) {
      return;
    }
    setAssociations((current) => {
      const existing = current[selectedChat.id] ?? [];
      const isPresent = existing.some(
        (item) => item.kind === resource.kind && item.id === resource.id
      );
      const next = {
        ...current,
        [selectedChat.id]: isPresent
          ? existing.filter(
              (item) =>
                !(item.kind === resource.kind && item.id === resource.id)
            )
          : [...existing, resource],
      };
      if (next[selectedChat.id]?.length === 0) {
        delete next[selectedChat.id];
      }
      writeAssociations(next);
      return next;
    });
  };

  const sendReply = async () => {
    if (!selectedChat || !reply.trim()) {
      return;
    }
    setSending(true);
    try {
      await callCommand("message.send", {
        chatId: selectedChat.id,
        text: reply.trim(),
      });
      setReply("");
      await loadMessages();
      toast(t("feishu.replySent"), "success");
    } catch (cause) {
      toast(t("feishu.replyFailed", { error: String(cause) }), "error");
    } finally {
      setSending(false);
    }
  };

  const openAuthorization = async (ticket: FeishuAuthTicket) => {
    if (ticket.flow === "registration") {
      continueAfterRegistrationRef.current = true;
      automaticAuthorizationStartedRef.current = false;
    }
    setAuthorizationUrl(ticket.url);
    const next = await callCommand<FeishuAuthStatus>("connection.status", {});
    setAuthStatus(next);
    await openExternal(ticket.url);
  };

  const createFeishuApp = async () => {
    setActivating(true);
    setActivationError("");
    continueAfterRegistrationRef.current = true;
    automaticAuthorizationStartedRef.current = false;
    try {
      const ticket = await callCommand<FeishuAuthTicket>(
        "connection.create",
        {}
      );
      await openAuthorization(ticket);
    } catch (cause) {
      continueAfterRegistrationRef.current = false;
      setActivationError(String(cause));
    } finally {
      setActivating(false);
    }
  };

  useEffect(() => {
    if (
      !authStatus?.needsUserAuthorization ||
      authStatus.waiting ||
      !continueAfterRegistrationRef.current ||
      automaticAuthorizationStartedRef.current
    ) {
      return;
    }
    automaticAuthorizationStartedRef.current = true;
    setActivating(true);
    void callCommand<FeishuAuthTicket>("connection.begin", {})
      .then(openAuthorization)
      .catch((cause) => {
        continueAfterRegistrationRef.current = false;
        setActivationError(String(cause));
      })
      .finally(() => setActivating(false));
  }, [
    authStatus?.needsUserAuthorization,
    authStatus?.waiting,
    callCommand,
    openAuthorization,
  ]);

  const authorize = async () => {
    const normalizedAppId = appId.trim();
    const isReplacingCredentials =
      Boolean(appSecret) || normalizedAppId !== authStatus?.appId;
    if (!normalizedAppId) {
      setActivationError(t("feishu.appIdRequired"));
      return;
    }
    if ((!authStatus?.configured || isReplacingCredentials) && !appSecret) {
      setActivationError(t("feishu.appSecretRequired"));
      return;
    }
    setActivating(true);
    setActivationError("");
    try {
      const ticket =
        isReplacingCredentials || !authStatus?.configured
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
  };

  const reopenAuthorization = () => {
    if (!authorizationUrl) {
      return;
    }
    void openExternal(authorizationUrl).catch((cause) =>
      setActivationError(String(cause))
    );
  };

  const reauthorize = async () => {
    setActivating(true);
    setActivationError("");
    try {
      const ticket = await callCommand<FeishuAuthTicket>(
        "connection.begin",
        {}
      );
      await openAuthorization(ticket);
      toast(t("feishu.authorizationOpened"), "success");
    } catch (cause) {
      toast(t("feishu.authorizationFailed", { error: String(cause) }), "error");
    } finally {
      setActivating(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const next = await callCommand<FeishuAuthStatus>(
        "connection.disconnect",
        {}
      );
      setAuthStatus(next);
      setOverview(null);
      setResourceActivity({ bases: [], documents: [], messages: [] });
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
  };

  const handoff = async () => {
    if (!selectedResource || !objective.trim()) {
      return;
    }
    const prompt = buildFeishuExecutionPrompt({
      baseData,
      documentContent,
      messages,
      objective,
      related,
      sourceName: resourceName(selectedResource),
      sourceUrl: "url" in selectedResource ? selectedResource.url : undefined,
      tab,
    });
    setHandingOff(true);
    let isArmed = false;
    try {
      if (notifyOnComplete && sessionId && selectedChat) {
        await callCommand("notification.arm", {
          chatId: selectedChat.id,
          sessionId,
        });
        isArmed = true;
      }
      await onHandoff(prompt);
      setHandoffOpen(false);
      setObjective("");
      setTaskStatus(
        notifyOnComplete && isArmed
          ? t("feishu.taskHandedOffWithNotification", {
              chat: resourceName(selectedChat!),
            })
          : t("feishu.taskHandedOff")
      );
    } catch (cause) {
      if (isArmed && sessionId) {
        await callCommand("notification.disarm", { sessionId }).catch(() => {});
      }
      toast(t("feishu.handoffFailed", { error: String(cause) }), "error");
    } finally {
      setHandingOff(false);
    }
  };

  const toggleSection = (resourceTab: ResourceTab) => {
    setCollapsedSections((current) => {
      const next = { ...current, [resourceTab]: !current[resourceTab] };
      writeCollapsedSections(next);
      return next;
    });
  };

  const togglePinnedResource = (
    resourceTab: ResourceTab,
    resourceId: string
  ) => {
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

  const commitResourceMove = (
    resourceTab: ResourceTab,
    resourceId: string,
    beforeResourceId: string | null,
    visibleResourceIds: readonly string[]
  ) => {
    setSidebarOrder((current) =>
      moveFeishuResource(
        current,
        resourceTab,
        resourceId,
        beforeResourceId,
        visibleResourceIds
      )
    );
    setDragItem(null);
  };

  const moveResourceBy = (
    resourceTab: ResourceTab,
    resourceId: string,
    offset: -1 | 1,
    visibleResourceIds: readonly string[]
  ) => {
    const currentIndex = visibleResourceIds.indexOf(resourceId);
    const nextIndex = Math.min(
      visibleResourceIds.length - 1,
      Math.max(0, currentIndex + offset)
    );
    if (currentIndex < 0 || currentIndex === nextIndex) {
      return;
    }
    const remaining = visibleResourceIds.filter((id) => id !== resourceId);
    commitResourceMove(
      resourceTab,
      resourceId,
      remaining[nextIndex] ?? null,
      visibleResourceIds
    );
  };

  const moveSectionBy = (resourceTab: ResourceTab, offset: -1 | 1) => {
    const currentIndex = sidebarOrder.sectionOrder.indexOf(resourceTab);
    const nextIndex = Math.min(
      sidebarOrder.sectionOrder.length - 1,
      Math.max(0, currentIndex + offset)
    );
    if (currentIndex < 0 || currentIndex === nextIndex) {
      return;
    }
    const remaining = sidebarOrder.sectionOrder.filter(
      (tab) => tab !== resourceTab
    );
    setSidebarOrder((current) =>
      moveFeishuSection(current, resourceTab, remaining[nextIndex] ?? null)
    );
  };

  const renderResourceRow = (
    resourceTab: ResourceTab,
    resource: ChatSummary | CloudResourceSummary,
    visibleResourceIds: readonly string[]
  ) => {
    const isSelected =
      detailVisible &&
      tab === resourceTab &&
      selection[resourceTab] === resource.id;
    const name = resourceName(resource);
    const rawMeta =
      "description" in resource
        ? resource.latestMessage || resource.description
        : resource.summary || "";
    const meta =
      rawMeta
        .trim()
        .localeCompare(name.trim(), undefined, { sensitivity: "base" }) === 0
        ? ""
        : rawMeta;
    const isPinned = pinnedResources[resourceTab].includes(resource.id);
    const hasActivity = resourceActivity[resourceTab].includes(resource.id);
    return (
      <div
        key={resource.id}
        data-feishu-resource={`${resourceTab}:${resource.id}`}
        data-sidebar-dragging={
          dragItem?.kind === "resource" && dragItem.id === resource.id
            ? "true"
            : undefined
        }
        draggable
        onDragStart={(event) => {
          const item = {
            id: resource.id,
            kind: "resource",
            tab: resourceTab,
          } as const;
          writeFeishuDrag(event, item);
          setDragItem(item);
        }}
        onDragEnd={() => setDragItem(null)}
        onDragOver={(event) => {
          const item = readFeishuDrag(event);
          if (item?.kind !== "resource" || item.tab !== resourceTab) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          const item = readFeishuDrag(event);
          if (item?.kind !== "resource" || item.tab !== resourceTab) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          commitResourceMove(
            resourceTab,
            item.id,
            resource.id,
            visibleResourceIds
          );
        }}
        className="group/resource relative min-w-0 cursor-grab transition-opacity active:cursor-grabbing data-[sidebar-dragging=true]:opacity-45"
      >
        <Button
          variant="selectable"
          size="row"
          focusStyle="inset"
          className="rounded-control pr-control hover:bg-fill-quiet data-[selected=true]:bg-fill-hover min-h-0 gap-2 px-2 py-1.5"
          data-selected={isSelected}
          aria-current={isSelected ? "true" : undefined}
          title={t("feishu.dragResource", { name })}
          onKeyDown={(event) => {
            if (
              !event.altKey ||
              (event.key !== "ArrowUp" && event.key !== "ArrowDown")
            ) {
              return;
            }
            event.preventDefault();
            moveResourceBy(
              resourceTab,
              resource.id,
              event.key === "ArrowUp" ? -1 : 1,
              visibleResourceIds
            );
          }}
          onClick={() => {
            setTab(resourceTab);
            setSelection((current) => ({
              ...current,
              [resourceTab]: resource.id,
            }));
            clearResourceActivity(resourceTab, resource.id);
            onSelectResource?.();
          }}
        >
          {resourceTab === "messages" ? (
            <ChatAvatar chat={resource as ChatSummary} />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="flex h-4 min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "text-ui min-w-0 flex-1 truncate leading-4",
                  isSelected && "font-medium"
                )}
              >
                {name}
              </span>
              {hasActivity ? (
                <span
                  data-feishu-activity-dot={`${resourceTab}:${resource.id}`}
                  className="bg-destructive size-2 shrink-0 rounded-full"
                  aria-label={t("feishu.newActivity", { name })}
                />
              ) : null}
            </span>
            {meta ? (
              <span
                data-slot="navigation-row-meta"
                className="text-fine text-muted-foreground mt-0.5 block h-4 truncate leading-4"
              >
                {meta}
              </span>
            ) : null}
          </span>
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                focusStyle="inset"
                aria-label={
                  isPinned
                    ? t("feishu.unpinResource", { name })
                    : t("feishu.pinResource", { name })
                }
                aria-pressed={isPinned}
                className={cn(
                  "right-inline text-muted-foreground absolute top-1/2 -translate-y-1/2 opacity-0 group-focus-within/resource:opacity-100 group-hover/resource:opacity-100 motion-safe:transition-opacity",
                  isPinned && "text-primary opacity-100"
                )}
                onClick={() => togglePinnedResource(resourceTab, resource.id)}
              >
                <Pin />
              </Button>
            }
          />
          <TooltipContent>
            {isPinned
              ? t("feishu.unpinResource", { name })
              : t("feishu.pinResource", { name })}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  };

  const renderResourceList = (
    resourceTab: ResourceTab,
    resources: Array<ChatSummary | CloudResourceSummary>
  ) => {
    const resourcesById = new Map(
      resources.map((resource) => [resource.id, resource])
    );
    const explicitOrder = sidebarOrder.resourceOrder[resourceTab];
    const ordered = [
      ...sortFeishuResources(
        pinnedResources[resourceTab]
          .map((id) => resourcesById.get(id))
          .filter((resource): resource is ChatSummary | CloudResourceSummary =>
            Boolean(resource)
          ),
        explicitOrder
      ),
      ...sortFeishuResources(
        resources.filter(
          (resource) => !pinnedResources[resourceTab].includes(resource.id)
        ),
        explicitOrder
      ),
    ];
    const orderedIds = ordered.map((resource) => resource.id);
    const visibleWhenLimited = Math.max(
      resourceLimits[resourceTab],
      ordered.filter((resource) =>
        pinnedResources[resourceTab].includes(resource.id)
      ).length
    );
    const isExpanded = expandedSections[resourceTab];
    const visible = isExpanded ? ordered : ordered.slice(0, visibleWhenLimited);
    const hiddenCount = Math.max(0, ordered.length - visibleWhenLimited);

    return (
      <div
        data-feishu-resource-list={resourceTab}
        className="flex flex-col gap-0.5"
        onDragOver={(event) => {
          const item = readFeishuDrag(event);
          if (item?.kind !== "resource" || item.tab !== resourceTab) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          const item = readFeishuDrag(event);
          if (item?.kind !== "resource" || item.tab !== resourceTab) {
            return;
          }
          event.preventDefault();
          commitResourceMove(resourceTab, item.id, null, orderedIds);
        }}
      >
        {visible.map((resource) =>
          renderResourceRow(resourceTab, resource, orderedIds)
        )}
        {hiddenCount > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            focusStyle="inset"
            className="text-muted-foreground w-full justify-start px-2 font-normal"
            data-feishu-show-more={isExpanded ? undefined : resourceTab}
            data-feishu-show-less={isExpanded ? resourceTab : undefined}
            onClick={() =>
              setExpandedSections((current) => ({
                ...current,
                [resourceTab]: !current[resourceTab],
              }))
            }
          >
            {isExpanded
              ? t("feishu.showLess")
              : t("feishu.showMore", { count: hiddenCount })}
          </Button>
        ) : null}
      </div>
    );
  };

  const sectionHeader = (
    resourceTab: ResourceTab,
    label: string,
    actions: ReactNode = null
  ) => (
    <div
      data-feishu-section-header={resourceTab}
      data-sidebar-dragging={
        dragItem?.kind === "section" && dragItem.tab === resourceTab
          ? "true"
          : undefined
      }
      draggable
      onDragStart={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-feishu-section-actions]")
        ) {
          event.preventDefault();
          return;
        }
        const item = { kind: "section", tab: resourceTab } as const;
        writeFeishuDrag(event, item);
        setDragItem(item);
      }}
      onDragEnd={() => setDragItem(null)}
      onDragOver={(event) => {
        if (readFeishuDrag(event)?.kind !== "section") {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const item = readFeishuDrag(event);
        if (item?.kind !== "section") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setSidebarOrder((current) =>
          moveFeishuSection(current, item.tab, resourceTab)
        );
        setDragItem(null);
      }}
      className="group/feishu-section min-h-control-mini relative flex items-center pt-2 pr-2 pb-1 transition-opacity data-[sidebar-dragging=true]:opacity-45"
    >
      <span
        title={t("feishu.dragSection", { section: label })}
        className="text-foreground/35 absolute left-0 flex size-4 cursor-grab items-center justify-center opacity-0 group-hover/feishu-section:opacity-100 active:cursor-grabbing"
        aria-hidden="true"
      >
        <GripVertical className="size-3" />
      </span>
      <Button
        type="button"
        variant="ghost"
        size="compact"
        focusStyle="inset"
        className="text-body text-foreground/55 min-w-0 gap-1 px-2 font-normal"
        data-feishu-section-toggle={resourceTab}
        aria-expanded={!collapsedSections[resourceTab]}
        aria-label={
          collapsedSections[resourceTab]
            ? t("feishu.expandSection", { section: label })
            : t("feishu.collapseSection", { section: label })
        }
        onKeyDown={(event) => {
          if (
            !event.altKey ||
            (event.key !== "ArrowUp" && event.key !== "ArrowDown")
          ) {
            return;
          }
          event.preventDefault();
          moveSectionBy(resourceTab, event.key === "ArrowUp" ? -1 : 1);
        }}
        onClick={() => toggleSection(resourceTab)}
      >
        <span className="min-w-0 truncate">{label}</span>
        {resourceActivity[resourceTab].length > 0 ? (
          <span
            data-feishu-section-activity={resourceTab}
            className="bg-destructive size-1.5 shrink-0 rounded-full"
            aria-label={t("feishu.sectionHasActivity", { section: label })}
          />
        ) : null}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 -rotate-90 motion-safe:transition-transform",
            !collapsedSections[resourceTab] && "rotate-0"
          )}
          aria-hidden="true"
        />
      </Button>
      {actions ? (
        <span
          data-feishu-section-actions
          className="ml-auto flex shrink-0 gap-0.5 opacity-0 group-hover/feishu-section:opacity-100 focus-within:opacity-100"
        >
          {actions}
        </span>
      ) : null}
    </div>
  );

  const isAllResourcesEmpty =
    Boolean(overview) &&
    overview!.chats.length === 0 &&
    overview!.documents.length === 0 &&
    overview!.bases.length === 0;
  const resourceNavigation = authStatus?.authorized ? (
    <nav
      className="feishu-rail-navigator pb-1"
      aria-label={t("feishu.resources")}
      onDragOver={(event) => {
        if (readFeishuDrag(event)?.kind !== "section") {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const item = readFeishuDrag(event);
        if (item?.kind !== "section") {
          return;
        }
        event.preventDefault();
        setSidebarOrder((current) =>
          moveFeishuSection(current, item.tab, null)
        );
        setDragItem(null);
      }}
    >
      {sidebarOrder.sectionOrder.map((resourceTab) => {
        if (resourceTab === "messages") {
          return (
            <section key={resourceTab} data-feishu-section="contacts">
              {sectionHeader(
                "messages",
                t("feishu.section.contacts"),
                <>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("feishu.refresh")}
                          disabled={loading}
                          onClick={() => void reload()}
                        >
                          {loading ? <Spinner /> : <RefreshCw />}
                        </Button>
                      }
                    />
                    <TooltipContent>{t("feishu.refresh")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("feishu.connectionSettings")}
                          onClick={onOpenPluginManager}
                        >
                          <CircleCheck />
                        </Button>
                      }
                    />
                    <TooltipContent>
                      {authStatus.user?.name ||
                        authStatus.user?.openId ||
                        t("feishu.connectionSettings")}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
              {!collapsedSections.messages ? (
                <div className="flex flex-col gap-0.5 pb-1">
                  {loading && !overview ? (
                    <output className="gap-module-inset py-section text-ui text-muted-foreground flex items-center justify-center">
                      <Spinner />
                      {t("feishu.loading")}
                    </output>
                  ) : error && !overview ? (
                    <div
                      role="alert"
                      className="gap-module-inset rounded-control px-module-inset py-control-group text-ui text-destructive flex items-center"
                    >
                      <CircleAlert /> <span className="truncate">{error}</span>
                    </div>
                  ) : isAllResourcesEmpty ? (
                    <div className="gap-module-inset px-surface-inset py-section text-ui text-muted-foreground flex flex-col items-center text-center">
                      <MessageSquare />
                      <p className="text-foreground font-medium">
                        {overview?.warnings.length
                          ? t("feishu.loadFailed")
                          : t("feishu.empty")}
                      </p>
                      <p className="text-fine max-w-64 leading-relaxed">
                        {overview?.warnings.length
                          ? t("feishu.loadFailedHint")
                          : t("feishu.emptyHint")}
                      </p>
                      {overview?.warnings.length ? (
                        <Button
                          variant="secondary"
                          size="compact"
                          onClick={() => void reauthorize()}
                        >
                          <ShieldCheck />
                          {t("feishu.reauthorize")}
                        </Button>
                      ) : null}
                    </div>
                  ) : overview ? (
                    renderResourceList("messages", overview.chats)
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        }
        if (resourceTab === "documents") {
          return (
            <section key={resourceTab} data-feishu-section="documents">
              {sectionHeader("documents", t("feishu.tab.documents"))}
              {!collapsedSections.documents ? (
                <div className="flex flex-col gap-0.5 pb-1">
                  {overview
                    ? renderResourceList("documents", overview.documents)
                    : null}
                </div>
              ) : null}
            </section>
          );
        }
        return (
          <section key={resourceTab} data-feishu-section="bases">
            {sectionHeader("bases", t("feishu.tab.bases"))}
            {!collapsedSections.bases ? (
              <div className="flex flex-col gap-0.5">
                {overview ? renderResourceList("bases", overview.bases) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </nav>
  ) : (
    <nav
      data-feishu-auth-required
      className="feishu-rail-navigator px-2 py-2"
      aria-label={t("feishu.resources")}
    >
      {!authStatus && loading ? (
        <output className="text-ui text-muted-foreground flex items-center gap-2 px-2 py-2">
          <Spinner />
          <span>{t("feishu.loadingConnection")}</span>
        </output>
      ) : (
        <div className="rounded-control flex items-center gap-2 px-2 py-1.5">
          <p className="text-fine text-muted-foreground min-w-0 flex-1 leading-relaxed">
            {enabled
              ? t("feishu.authorizationRequiredHint")
              : t("feishu.pluginNotReadyHint")}
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
  const navigationPortal = navigationHost
    ? createPortal(resourceNavigation, navigationHost)
    : null;
  const connectedSettingsPortal =
    authStatus?.authorized && settingsHost
      ? createPortal(
          <section
            data-feishu-plugin-settings
            className="gap-section flex max-w-2xl flex-col"
            aria-labelledby="feishu-plugin-settings-title"
          >
            <div className="gap-inline flex flex-col">
              <h2
                id="feishu-plugin-settings-title"
                className="text-title font-semibold"
              >
                {t("feishu.connectionSettings")}
              </h2>
              <p className="text-ui text-muted-foreground leading-relaxed">
                {t("feishu.connectionSettingsHint")}
              </p>
            </div>
            <div className="gap-module-inset rounded-control border-border bg-fill-quiet p-surface-inset flex items-center border">
              <span className="size-control bg-background text-primary flex shrink-0 items-center justify-center rounded-full">
                <UserRound />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-ui truncate font-medium">
                  {authStatus.user?.name ||
                    authStatus.user?.openId ||
                    t("feishu.connectedAccount")}
                </p>
                <p className="text-fine text-muted-foreground truncate">
                  {authStatus.appId}
                </p>
              </div>
              <span className="gap-inline text-fine text-muted-foreground flex items-center">
                <CircleCheck className="text-primary" />
                {t("feishu.connected")}
              </span>
            </div>
            {authStatus.method === "oauth" ? (
              <div className="rounded-control border-border px-surface-inset py-module-inset border">
                <p className="text-fine text-muted-foreground">
                  {t("feishu.redirectUri")}
                </p>
                <code className="mt-inline text-fine text-foreground block overflow-x-auto">
                  {authStatus.redirectUri}
                </code>
              </div>
            ) : (
              <div className="rounded-control border-border px-surface-inset py-module-inset text-fine text-muted-foreground border">
                {t("feishu.createdByCodeTwo")}
              </div>
            )}
            <p className="text-fine text-muted-foreground leading-relaxed">
              {t("feishu.disconnectHint")}
            </p>
            <div className="gap-module-inset flex flex-wrap justify-end">
              <Button
                variant="destructive"
                size="compact"
                disabled={disconnecting || activating}
                onClick={() => void disconnect()}
              >
                {disconnecting ? <Spinner /> : null}
                {t("feishu.disconnect")}
              </Button>
              {authStatus.method === "oauth" ? (
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={disconnecting || activating}
                  onClick={() => void reauthorize()}
                >
                  {activating ? <Spinner /> : <ShieldCheck />}
                  {t("feishu.reauthorize")}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="compact"
                  disabled={disconnecting}
                  onClick={() =>
                    void openExternal("https://open.feishu.cn/app")
                  }
                >
                  <ExternalLink />
                  {t("feishu.manageFeishuApp")}
                </Button>
              )}
            </div>
          </section>,
          settingsHost
        )
      : null;

  if (!enabled) {
    return (
      <>
        {navigationPortal}
        {detailVisible ? (
          <Empty className="bg-background min-h-0 flex-1">
            <EmptyMedia variant="icon">
              <CircleAlert />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{t("feishu.pluginNotReady")}</EmptyTitle>
              <EmptyDescription>
                {t("feishu.pluginNotReadyHint")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="secondary"
                size="compact"
                onClick={onOpenPluginManager}
              >
                {t("feishu.openPlugins")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}
      </>
    );
  }

  if (!authStatus?.authorized) {
    const isWaitingForAuthorization = authStatus?.waiting === true;
    const isWaitingForAppCreation = authStatus?.flow === "registration";
    const isNeedsUserAuthorization =
      authStatus?.needsUserAuthorization === true;
    const isCredentialsAlreadySaved =
      authStatus?.configured === true &&
      appId.trim() === authStatus.appId &&
      !appSecret;
    const connectionSettings = (
      <section
        data-feishu-plugin-settings
        className="gap-section flex flex-col"
        aria-labelledby="feishu-plugin-settings-title"
      >
        <div className="gap-inline flex flex-col">
          <h2
            id="feishu-plugin-settings-title"
            className="text-title font-semibold"
          >
            {t("feishu.connectionSettings")}
          </h2>
          <p className="text-ui text-muted-foreground max-w-2xl leading-relaxed">
            {t("feishu.connectionSettingsHint")}
          </p>
        </div>
        {!authStatus && loading ? (
          <output className="gap-module-inset text-ui text-muted-foreground flex min-h-32 items-center justify-center">
            <Spinner />
            {t("feishu.loadingConnection")}
          </output>
        ) : (
          <form
            className="gap-section rounded-module border-border bg-surface p-section flex max-w-2xl flex-col border"
            noValidate
            aria-busy={activating || isWaitingForAuthorization}
            onSubmit={(event) => {
              event.preventDefault();
              void authorize();
            }}
          >
            <div className="gap-surface-inset flex items-start">
              <span className="rounded-module bg-fill-quiet text-primary flex size-12 shrink-0 items-center justify-center">
                <ShieldCheck />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-title font-semibold">
                  {t("feishu.credentialsRequired")}
                </h3>
                <p className="mt-inline text-ui text-muted-foreground leading-relaxed">
                  {t("feishu.credentialsHint")}
                </p>
              </div>
            </div>

            <div className="gap-surface-inset rounded-module border-border bg-fill-quiet p-surface-inset flex flex-col border">
              <div>
                <h4 className="text-ui font-semibold">
                  {isNeedsUserAuthorization
                    ? t("feishu.finishConnectionTitle")
                    : t("feishu.oneClickTitle")}
                </h4>
                <p className="mt-inline text-fine text-muted-foreground leading-relaxed">
                  {isNeedsUserAuthorization
                    ? t("feishu.finishConnectionHint")
                    : t("feishu.oneClickHint")}
                </p>
              </div>
              {isWaitingForAuthorization ? (
                <output className="gap-module-inset rounded-control bg-background p-surface-inset text-ui flex items-start">
                  <Spinner className="mt-px shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {isWaitingForAppCreation
                        ? t("feishu.waitingForCreation")
                        : t("feishu.waitingForAuthorization")}
                    </p>
                    <p className="mt-inline text-fine text-muted-foreground">
                      {isWaitingForAppCreation
                        ? t("feishu.waitingForCreationHint")
                        : t("feishu.waitingForAuthorizationHint")}
                    </p>
                  </div>
                  {authorizationUrl ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      onClick={reopenAuthorization}
                    >
                      <ExternalLink />
                      {t("feishu.reopenAuthorization")}
                    </Button>
                  ) : null}
                </output>
              ) : (
                <Button
                  type="button"
                  className="self-start"
                  size="compact"
                  disabled={activating}
                  onClick={() =>
                    void (isNeedsUserAuthorization
                      ? authorize()
                      : createFeishuApp())
                  }
                >
                  {activating ? <Spinner /> : <ShieldCheck />}
                  {isNeedsUserAuthorization
                    ? t("feishu.continueAuthorization")
                    : t("feishu.createAndConnect")}
                </Button>
              )}
            </div>

            {activationError || authStatus?.problem || error ? (
              <FieldError>
                {activationError || authStatus?.problem || error}
              </FieldError>
            ) : null}

            <Separator />

            <Collapsible
              open={manualSetupOpen}
              onOpenChange={setManualSetupOpen}
            >
              <CollapsibleTrigger className="group gap-module-inset rounded-control px-module-inset py-control-group text-ui text-muted-foreground hover:bg-fill-hover hover:text-foreground focus-visible:focus-ring flex w-full items-center text-left font-medium">
                <span className="min-w-0 flex-1">
                  {t("feishu.useExistingApp")}
                </span>
                <ChevronDown
                  className="size-icon-list shrink-0 transition-transform group-data-[state=open]:rotate-180"
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-section">
                <div className="gap-section grid sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="feishu-app-id">
                      {t("feishu.appId")}
                    </FieldLabel>
                    <Input
                      id="feishu-app-id"
                      value={appId}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="cli_…"
                      aria-invalid={
                        activationError && !appId.trim() ? true : undefined
                      }
                      onChange={(event) => {
                        setAppId(event.currentTarget.value);
                        setActivationError("");
                      }}
                    />
                    <FieldDescription>{t("feishu.appIdHint")}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="feishu-app-secret">
                      {t("feishu.appSecret")}
                    </FieldLabel>
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
                        placeholder={
                          isCredentialsAlreadySaved
                            ? t("feishu.secretSaved")
                            : t("feishu.appSecretPlaceholder")
                        }
                        aria-invalid={
                          activationError &&
                          !appSecret &&
                          !isCredentialsAlreadySaved
                            ? true
                            : undefined
                        }
                        onChange={(event) => {
                          setAppSecret(event.currentTarget.value);
                          setActivationError("");
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="right-inline absolute top-1/2 -translate-y-1/2"
                        aria-label={
                          secretVisible
                            ? t("feishu.hideSecret")
                            : t("feishu.showSecret")
                        }
                        onClick={() => setSecretVisible((current) => !current)}
                      >
                        {secretVisible ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                    <FieldDescription className="gap-inline flex items-start">
                      <Lock className="size-icon-list mt-px shrink-0" />
                      {t("feishu.appSecretHint")}
                    </FieldDescription>
                  </Field>
                </div>

                <div className="mt-section rounded-control bg-fill-quiet p-surface-inset">
                  <p className="text-ui font-medium">
                    {t("feishu.redirectUri")}
                  </p>
                  <code className="mt-module-inset rounded-control bg-background px-module-inset py-control-group text-fine text-foreground block overflow-x-auto">
                    {authStatus?.redirectUri ||
                      "http://127.0.0.1:37641/oauth/callback"}
                  </code>
                  <p className="mt-module-inset text-fine text-muted-foreground leading-relaxed">
                    {t("feishu.redirectHint")}
                  </p>
                </div>

                <div className="mt-section gap-module-inset flex flex-wrap items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={() =>
                      void openExternal("https://open.feishu.cn/app")
                    }
                  >
                    <ExternalLink />
                    {t("feishu.openDeveloperConsole")}
                  </Button>
                  <Button
                    type="submit"
                    size="compact"
                    disabled={activating || isWaitingForAuthorization}
                  >
                    {activating ? <Spinner /> : <ShieldCheck />}
                    {isCredentialsAlreadySaved
                      ? t("feishu.continueAuthorization")
                      : t("feishu.saveAndAuthorize")}
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
          <section className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="electrobun-webkit-app-region-drag h-titlebar gap-module-inset px-page flex shrink-0 items-center">
              {headerLeadingAction}
              <h1 className="text-dialog font-semibold">{t("feishu.title")}</h1>
            </header>
            <Empty className="min-h-0 flex-1">
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{t("feishu.authorizationRequired")}</EmptyTitle>
                <EmptyDescription>
                  {t("feishu.authorizationRequiredHint")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  size="compact"
                  onClick={onOpenPluginManager}
                >
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
      {detailVisible ? (
        <section
          className="feishu-workspace bg-background text-foreground flex min-h-0 min-w-0 flex-1"
          aria-label={t("feishu.title")}
        >
          <div className="feishu-detail-pane bg-background flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="electrobun-webkit-app-region-drag h-titlebar gap-module-inset px-section flex shrink-0 items-center">
              {headerLeadingAction}
              {selectedResource ? (
                <>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-dialog truncate font-semibold">
                      {resourceName(selectedResource)}
                    </h2>
                    <p className="text-fine text-muted-foreground truncate">
                      {localizedSourceLabel(
                        tab,
                        resourceName(selectedResource),
                        t
                      )}
                    </p>
                  </div>
                  {"url" in selectedResource && selectedResource.url ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("feishu.openInFeishu")}
                            onClick={() =>
                              void openExternal(selectedResource.url)
                            }
                          >
                            <ExternalLink />
                          </Button>
                        }
                      />
                      <TooltipContent>
                        {t("feishu.openInFeishu")}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {selectedChat ? (
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() => setRelationsOpen(true)}
                    >
                      <FileText />
                      {t("feishu.related", { count: related.length })}
                    </Button>
                  ) : null}
                  <Button size="compact" onClick={() => setHandoffOpen(true)}>
                    <Bot />
                    {t("feishu.handoff")}
                  </Button>
                </>
              ) : (
                <div className="flex-1" />
              )}
            </header>
            <Separator />

            {!selectedResource ? (
              <Empty>
                <EmptyMedia variant="icon">
                  <ResourceIcon tab={tab} />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>{t("feishu.selectResource")}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : tab === "messages" && selectedChat ? (
              <>
                {related.length > 0 ? (
                  <div className="gap-inline px-section py-module-inset text-fine text-muted-foreground flex shrink-0 flex-wrap items-center">
                    <span>{t("feishu.relatedResources")}</span>
                    {related.map((resource) => (
                      <Button
                        key={`${resource.kind}:${resource.id}`}
                        type="button"
                        variant="secondary"
                        size="compact"
                        onClick={() => {
                          setTab(
                            resource.kind === "document" ? "documents" : "bases"
                          );
                          setSelection((current) => ({
                            ...current,
                            [resource.kind === "document"
                              ? "documents"
                              : "bases"]: resource.id,
                          }));
                        }}
                      >
                        {resource.name || resource.id}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <ScrollArea className="min-h-0 flex-1">
                  <div className="px-page py-section mx-auto flex w-full max-w-4xl flex-col">
                    {detailLoading ? (
                      <output className="gap-module-inset py-section text-ui text-muted-foreground flex items-center justify-center">
                        <Spinner />
                        {t("feishu.loadingMessages")}
                      </output>
                    ) : null}
                    {!detailLoading && messages.length === 0 ? (
                      <p className="py-section text-ui text-muted-foreground text-center">
                        {t("feishu.noMessages")}
                      </p>
                    ) : null}
                    {messages.map((message) => (
                      <article
                        key={message.id}
                        data-feishu-message
                        className="gap-x-module-inset gap-y-inline border-border/70 py-section grid grid-cols-[auto_1fr_auto] border-b last:border-b-0"
                      >
                        <MessageAvatar
                          label={messageSenderLabel(
                            message,
                            t("feishu.member")
                          )}
                          src={message.senderAvatarUrl || ""}
                        />
                        <p className="text-ui truncate font-medium">
                          {messageSenderLabel(message, t("feishu.member"))}
                        </p>
                        <time className="text-fine text-muted-foreground tabular-nums">
                          {displayTime(message.createdAt)}
                        </time>
                        <div
                          dir="auto"
                          className="text-body col-start-2 col-end-4 min-w-0 leading-relaxed"
                        >
                          <MarkdownContent
                            text={visibleMessageText(message, t)}
                          />
                          {message.reactions?.length ? (
                            <div
                              data-feishu-reactions
                              className="mt-inline gap-inline flex flex-wrap"
                            >
                              {message.reactions.map((reaction) => (
                                <span
                                  key={reaction.emojiType}
                                  className="gap-inline bg-fill-quiet px-module-inset py-inline text-fine text-muted-foreground inline-flex items-center rounded-full"
                                  aria-label={t("feishu.reaction", {
                                    count: reaction.count,
                                    name: reaction.emojiType,
                                  })}
                                  title={reaction.emojiType}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="text-body"
                                  >
                                    {reaction.emoji}
                                  </span>
                                  <span className="tabular-nums">
                                    {reaction.count}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </ScrollArea>
                <div className="gap-module-inset bg-surface px-section py-surface-inset shadow-surface flex shrink-0 items-end">
                  <label className="sr-only" htmlFor="feishu-reply">
                    {t("feishu.reply")}
                  </label>
                  <Textarea
                    id="feishu-reply"
                    size="compact"
                    rows={2}
                    value={reply}
                    onChange={(event) => setReply(event.currentTarget.value)}
                    placeholder={t("feishu.replyPlaceholder")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendReply();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    aria-label={t("feishu.sendReply")}
                    disabled={sending || !reply.trim()}
                    onClick={() => void sendReply()}
                  >
                    {sending ? <Spinner /> : <Send />}
                  </Button>
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
                  <div
                    className="gap-inline px-section py-module-inset flex shrink-0 overflow-x-auto"
                    role="tablist"
                    aria-label={t("feishu.baseTables")}
                  >
                    {baseData.tables.map((table) => (
                      <Button
                        key={table.id}
                        role="tab"
                        aria-selected={baseData.selectedTableId === table.id}
                        data-selected={baseData.selectedTableId === table.id}
                        variant="selectable"
                        size="compact"
                        onClick={() => void loadBase(table.id)}
                      >
                        {table.name || table.id}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <ScrollArea className="min-h-0 flex-1">
                  <div className="p-section">
                    {detailLoading ? (
                      <output className="gap-module-inset py-section text-ui text-muted-foreground flex items-center justify-center">
                        <Spinner />
                        {t("feishu.loadingBase")}
                      </output>
                    ) : null}
                    {!detailLoading &&
                    (!baseData || baseData.records.length === 0) ? (
                      <p className="py-section text-ui text-muted-foreground text-center">
                        {t("feishu.emptyBase")}
                      </p>
                    ) : null}
                    {baseData && baseData.records.length > 0 ? (
                      <div className="rounded-module bg-surface shadow-surface overflow-auto">
                        <table className="text-ui w-full min-w-max border-collapse">
                          <thead>
                            <tr>
                              {baseData.fields.map((field) => (
                                <th
                                  key={field}
                                  scope="col"
                                  className="border-border bg-fill-quiet px-surface-inset py-module-inset border-r border-b text-left font-medium last:border-r-0"
                                >
                                  {field}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {baseData.records.map((record) => {
                              const cells = new Map(
                                record.cells.map((cell) => [
                                  cell.field,
                                  cell.value,
                                ])
                              );
                              return (
                                <tr key={record.id}>
                                  {baseData.fields.map((field) => (
                                    <td
                                      key={field}
                                      dir="auto"
                                      className="border-border px-surface-inset py-module-inset max-w-72 border-r border-b align-top last:border-r-0"
                                    >
                                      {cells.get(field) || "—"}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                </ScrollArea>
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="bg-fill-quiet px-section py-module-inset text-ui text-destructive shrink-0"
              >
                {error}
              </div>
            ) : null}
            {taskStatus ? (
              <output className="bg-fill-quiet px-section py-module-inset text-ui text-muted-foreground shrink-0">
                {taskStatus}
              </output>
            ) : null}
          </div>

          <Dialog open={relationsOpen} onOpenChange={setRelationsOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("feishu.relatedDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {selectedChat
                    ? t("feishu.relatedDialogDescription", {
                        chat: resourceName(selectedChat),
                      })
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-dialog-content">
                <div className="gap-inline flex flex-col">
                  {[
                    ...(overview?.documents ?? []).map((resource) => ({
                      ...resource,
                      kind: "document" as const,
                    })),
                    ...(overview?.bases ?? []).map((resource) => ({
                      ...resource,
                      kind: "base" as const,
                    })),
                  ].map((resource) => {
                    const isChecked = related.some(
                      (item) =>
                        item.kind === resource.kind && item.id === resource.id
                    );
                    return (
                      <label
                        key={`${resource.kind}:${resource.id}`}
                        className="gap-module-inset rounded-control px-module-inset py-control-group hover:bg-fill-hover flex cursor-pointer items-center"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleRelated(resource)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-ui block truncate font-medium">
                            {resourceName(resource)}
                          </span>
                          <span className="text-fine text-muted-foreground block truncate">
                            {resource.kind === "document"
                              ? t("feishu.tab.documents")
                              : t("feishu.tab.bases")}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>

          <Dialog open={handoffOpen} onOpenChange={setHandoffOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("feishu.handoffTitle")}</DialogTitle>
                <DialogDescription>
                  {selectedResource
                    ? t("feishu.handoffDescription", {
                        source: localizedSourceLabel(
                          tab,
                          resourceName(selectedResource),
                          t
                        ),
                      })
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="gap-section flex flex-col">
                <label
                  className="gap-module-inset text-ui flex flex-col font-medium"
                  htmlFor="feishu-objective"
                >
                  {t("feishu.objective")}
                  <Textarea
                    id="feishu-objective"
                    rows={5}
                    value={objective}
                    onChange={(event) =>
                      setObjective(event.currentTarget.value)
                    }
                    placeholder={t("feishu.objectivePlaceholder")}
                  />
                </label>
                <label
                  className={cn(
                    "gap-module-inset rounded-control bg-fill-quiet p-surface-inset flex items-start",
                    (!sessionId || !selectedChat) && "opacity-50"
                  )}
                >
                  <Checkbox
                    checked={notifyOnComplete}
                    disabled={!sessionId || !selectedChat}
                    onCheckedChange={(checked) =>
                      setNotifyOnComplete(checked === true)
                    }
                  />
                  <span className="text-ui min-w-0">
                    <span className="block font-medium">
                      {t("feishu.notifyOnComplete")}
                    </span>
                    <span className="mt-inline text-fine text-muted-foreground block">
                      {sessionId && selectedChat
                        ? t("feishu.notifyTarget", {
                            chat: resourceName(selectedChat),
                          })
                        : t("feishu.notifyUnavailable")}
                    </span>
                  </span>
                </label>
              </div>
              <DialogFooter>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => setHandoffOpen(false)}
                >
                  {t("feishu.cancel")}
                </Button>
                <Button
                  size="compact"
                  disabled={handingOff || !objective.trim()}
                  onClick={() => void handoff()}
                >
                  {handingOff ? <Spinner /> : <Bot />}
                  {t("feishu.handoff")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      ) : null}
    </>
  );
};
