import type { WebviewEventTypes, WebviewTagElement } from "electrobun/view";

import { desktopSetBrowserZoom, isElectrobun } from "../electrobun/client";
import { assertIpcResult } from "../lib/ipcResult";
import { asJsonObject, isJsonObject } from "../lib/jsonValue";
import annotateSource from "./annotate.js?raw";

export interface EmbeddedBrowserNav {
  label: string;
  url: string;
}

export interface EmbeddedBrowserTab {
  id: string;
  url: string;
  title: string;
  active: boolean;
  lease_session?: string | null;
  agent_active: boolean;
}

export interface EmbeddedStyleChange {
  property: string;
  from: string;
  to: string;
}

export interface EmbeddedAnnotation {
  url: string;
  note: string;
  selector: string | null;
  selected_text: string | null;
  styles: EmbeddedStyleChange[];
}

interface PageAnnotation {
  selector?: string;
  text?: string;
  note?: string;
  styles?: EmbeddedStyleChange[];
}

function isPageAnnotation(value: unknown): value is PageAnnotation {
  return isJsonObject(value);
}

interface BrowserEventMap {
  "browser-registry": EmbeddedBrowserTab[];
  "browser-agent-activity": { tabId: string };
  "browser-download-blocked": { label: string };
  "browser-load": EmbeddedBrowserNav;
  "browser-nav": EmbeddedBrowserNav;
  "browser-title": { label: string; title: string };
  "browser-popup": EmbeddedBrowserNav;
}

type BrowserEventName = keyof BrowserEventMap;
type BrowserListener<K extends BrowserEventName> = (
  payload: BrowserEventMap[K]
) => void;

const registryKey = "codetwo.browser.tabs.v1";
const views = new Map<string, WebviewTagElement>();
const viewHandlers = new Map<
  string,
  { name: WebviewEventTypes; listener: (event: CustomEvent) => void }[]
>();
const desired = new Map<
  string,
  { url?: string; visible?: boolean; zoom?: number }
>();
const listeners = new Map<BrowserEventName, Set<(payload: unknown) => void>>();
const pendingQueries = new Map<
  string,
  {
    label: string;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

function isEmbeddedBrowserTab(value: unknown): value is EmbeddedBrowserTab {
  if (!isJsonObject(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    /^browser-\d+$/u.test(value.id) &&
    typeof value.url === "string"
  );
}

function isWebviewTagElement(
  element: HTMLElement | null
): element is WebviewTagElement {
  return element != null && "loadURL" in element;
}

function defaultRegistry(): EmbeddedBrowserTab[] {
  return [
    {
      active: true,
      agent_active: false,
      id: "browser-1",
      lease_session: null,
      title: "",
      url: "about:blank",
    },
  ];
}

function loadRegistry(): EmbeddedBrowserTab[] {
  if (typeof window === "undefined") {
    return defaultRegistry();
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(registryKey) ?? "[]"
    ) as unknown;
    if (!Array.isArray(parsed)) {
      return defaultRegistry();
    }
    const tabs = parsed.filter(isEmbeddedBrowserTab);
    if (tabs.length === 0) {
      return defaultRegistry();
    }
    const active = tabs.findIndex((tab) => tab.active);
    return tabs.map((tab, index) => {
      return {
        ...tab,
        active: active !== -1 ? index === active : index === 0,
        agent_active: false,
        lease_session: null,
        title: typeof tab.title === "string" ? tab.title : "",
      };
    });
  } catch {
    return defaultRegistry();
  }
}

let registry = loadRegistry();

function persistRegistry(): void {
  try {
    window.localStorage.setItem(registryKey, JSON.stringify(registry));
  } catch {
    // A locked-down webview can reject storage; tabs still work for the current process.
  }
}

function emit<K extends BrowserEventName>(
  name: K,
  payload: BrowserEventMap[K]
): void {
  for (const listener of listeners.get(name) ?? []) {
    listener(payload);
  }
}

function publishRegistry(): void {
  persistRegistry();
  emit(
    "browser-registry",
    registry.map((tab) => ({ ...tab }))
  );
}

function patchTab(label: string, patch: Partial<EmbeddedBrowserTab>): void {
  let isChanged = false;
  registry = registry.map((tab) => {
    if (tab.id !== label) {
      return tab;
    }
    isChanged = true;
    return { ...tab, ...patch };
  });
  if (isChanged) {
    publishRegistry();
  }
}

function eventUrl(event: CustomEvent, fallback: string): string {
  if (typeof event.detail === "string" && event.detail) {
    return event.detail;
  }
  const detail = asJsonObject(event.detail);
  if (detail != null && typeof detail.url === "string") {
    return detail.url;
  }
  return fallback;
}

function eventObject(event: CustomEvent): Record<string, unknown> | null {
  const direct = asJsonObject(event.detail);
  if (direct != null) {
    return direct;
  }
  if (typeof event.detail !== "string") {
    return null;
  }
  try {
    return asJsonObject(JSON.parse(event.detail) as unknown);
  } catch {
    return null;
  }
}

const childPost = `(payload) => {
  const bridge = window.__electrobunEventBridge || window.__electrobunInternalBridge;
  if (!bridge) return;
  bridge.postMessage(JSON.stringify({
    id: "webviewEvent",
    type: "message",
    payload: {
      id: window.__electrobunWebviewId,
      eventName: "host-message",
      detail: JSON.stringify(payload),
    },
  }));
}`;

function injectPageTools(label: string, view: WebviewTagElement): void {
  const script = `${annotateSource}\n;(() => {
    const post = ${childPost};
    const sendTitle = () => post({ source: "codetwo-browser", kind: "title", title: document.title });
    sendTitle();
    const title = document.querySelector("title") || document.documentElement;
    new MutationObserver(sendTitle).observe(title, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", (event) => {
      const anchor = event.target && event.target.closest ? event.target.closest("a[download]") : null;
      if (!anchor) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      post({ source: "codetwo-browser", kind: "download-blocked" });
    }, true);
  })();`;
  view.executeJavascript(script);
  const url =
    registry.find((tab) => tab.id === label)?.url ?? view.src ?? "about:blank";
  emit("browser-load", { label, url });
}

function handleHostMessage(label: string, event: CustomEvent): void {
  const message = eventObject(event);
  if (!message || message.source !== "codetwo-browser") {
    return;
  }
  if (message.kind === "title" && typeof message.title === "string") {
    patchTab(label, { title: message.title });
    emit("browser-title", { label, title: message.title });
    return;
  }
  if (message.kind === "download-blocked") {
    emit("browser-download-blocked", { label });
    return;
  }
  if (message.kind !== "query-response" || typeof message.id !== "string") {
    return;
  }
  const pending = pendingQueries.get(message.id);
  if (!pending || pending.label !== label) {
    return;
  }
  clearTimeout(pending.timeout);
  pendingQueries.delete(message.id);
  if (typeof message.error === "string") {
    pending.reject(new Error(message.error));
  } else {
    pending.resolve(message.result);
  }
}

function attach(label: string, view: WebviewTagElement): void {
  const handlers: {
    name: WebviewEventTypes;
    listener: (event: CustomEvent) => void;
  }[] = [];
  const on = (
    name: WebviewEventTypes,
    listener: (event: CustomEvent) => void
  ) => {
    handlers.push({ listener, name });
    view.on(name, listener);
  };
  const navigate = (event: CustomEvent) => {
    const fallback =
      registry.find((tab) => tab.id === label)?.url ?? "about:blank";
    const url = eventUrl(event, fallback);
    patchTab(label, { url });
    emit("browser-nav", { label, url });
  };
  on("did-navigate", navigate);
  on("did-navigate-in-page", navigate);
  on("dom-ready", (event) => {
    navigate(event);
    injectPageTools(label, view);
  });
  on("new-window-open", (event) => {
    const url = eventUrl(event, "");
    if (url) {
      emit("browser-popup", { label, url });
    }
  });
  on("host-message", (event) => handleHostMessage(label, event));
  viewHandlers.set(label, handlers);
}

function detach(label: string, view: WebviewTagElement): void {
  for (const { name, listener } of viewHandlers.get(label) ?? []) {
    view.off(name, listener);
  }
  viewHandlers.delete(label);
}

export function registerBrowserWebview(
  label: string,
  element: HTMLElement | null
): void {
  const view = isWebviewTagElement(element) ? element : null;
  const previous = views.get(label);
  if (previous && previous !== view) {
    detach(label, previous);
  }
  if (!view) {
    views.delete(label);
    return;
  }
  if (previous === view) {
    return;
  }
  views.set(label, view);
  attach(label, view);
  const state = desired.get(label);
  if (state?.visible !== undefined) {
    view.toggleHidden(!state.visible);
  }
  if (state?.url != null && state?.url !== "" && view.src !== state.url) {
    view.loadURL(state.url);
  }
  if (state?.zoom !== undefined && typeof view.webviewId === "number") {
    void desktopSetBrowserZoom(view.webviewId, state.zoom);
  }
}

export const embeddedBrowserRenderer: "cef" | "native" =
  typeof navigator !== "undefined" && /Linux/iu.test(navigator.userAgent)
    ? "cef"
    : "native";

export function browserSubscribe<K extends BrowserEventName>(
  name: K,
  listener: BrowserListener<K>
): () => void {
  const group = listeners.get(name) ?? new Set<(payload: unknown) => void>();
  const wrapped = (payload: unknown): void => {
    listener(assertIpcResult<BrowserEventMap[K]>(payload));
  };
  group.add(wrapped);
  listeners.set(name, group);
  return () => {
    group.delete(wrapped);
    if (group.size === 0) {
      listeners.delete(name);
    }
  };
}

export function browserOpenLocal(label: string, url: string): void {
  const state = desired.get(label) ?? {};
  desired.set(label, { ...state, url, visible: true });
  const view = views.get(label);
  if (!view) {
    return;
  }
  if (view.src !== url) {
    view.loadURL(url);
  }
  view.toggleHidden(false);
  view.syncDimensions(true);
}

export function browserBoundsLocal(label: string): void {
  views.get(label)?.syncDimensions(true);
}

export function browserNavigateLocal(label: string, url: string): void {
  const state = desired.get(label) ?? {};
  desired.set(label, { ...state, url });
  patchTab(label, { url });
  views.get(label)?.loadURL(url);
}

export function browserHistoryLocal(label: string, delta: number): void {
  const view = views.get(label);
  if (delta < 0) {
    view?.goBack();
  }
  if (delta > 0) {
    view?.goForward();
  }
}

export function browserReloadLocal(label: string): void {
  views.get(label)?.reload();
}

export function browserVisibleLocal(label: string, isVisible: boolean): void {
  const state = desired.get(label) ?? {};
  desired.set(label, { ...state, visible: isVisible });
  views.get(label)?.toggleHidden(!isVisible);
}

export function browserZoomLocal(label: string, factor: number): void {
  const state = desired.get(label) ?? {};
  desired.set(label, { ...state, zoom: factor });
  const id = views.get(label)?.webviewId;
  if (isElectrobun && typeof id === "number") {
    void desktopSetBrowserZoom(id, factor);
  }
}

export function browserDevtoolsLocal(label: string): void {
  views.get(label)?.openDevTools();
}

export function browserCloseLocal(label: string): void {
  views.get(label)?.toggleHidden(true);
  desired.delete(label);
  const closing = registry.findIndex((tab) => tab.id === label);
  if (closing === -1) {
    return;
  }
  const wasActive = registry[closing].active;
  registry = registry.filter((tab) => tab.id !== label);
  if (registry.length === 0) {
    registry = defaultRegistry();
  } else if (wasActive) {
    registry[Math.max(0, closing - 1)].active = true;
  }
  publishRegistry();
}

export function browserCloseAllLocal(): void {
  for (const [label, view] of views) {
    view.toggleHidden(true);
    detach(label, view);
  }
  for (const [id, pending] of pendingQueries) {
    clearTimeout(pending.timeout);
    pending.reject(new Error(`browser page query ${id} was cancelled`));
  }
  pendingQueries.clear();
  views.clear();
  desired.clear();
}

export function browserRegistrySnapshotLocal(): EmbeddedBrowserTab[] {
  return registry.map((tab) => ({ ...tab }));
}

export function browserRegistryCreateLocal(url: string): EmbeddedBrowserTab {
  const nextId =
    Math.max(
      0,
      ...registry
        .map((tab) => Number(tab.id.replace(/^browser-/u, "")))
        .filter(Number.isFinite)
    ) + 1;
  registry = registry.map((tab) => ({ ...tab, active: false }));
  const tab: EmbeddedBrowserTab = {
    active: true,
    agent_active: false,
    id: `browser-${nextId}`,
    lease_session: null,
    title: "",
    url,
  };
  registry.push(tab);
  publishRegistry();
  return { ...tab };
}

export function browserTakeControlLocal(label: string): void {
  let isFound = false;
  registry = registry.map((tab) => {
    if (tab.id === label) {
      isFound = true;
    }
    return {
      ...tab,
      active: tab.id === label,
      agent_active: false,
      lease_session: null,
    };
  });
  if (isFound) {
    publishRegistry();
  }
}

export function browserAnnotateLocal(label: string, isOn: boolean): void {
  views
    .get(label)
    ?.executeJavascript(
      `window.__codetwoAnnotate && window.__codetwoAnnotate.setMode(${JSON.stringify(isOn)})`
    );
}

async function queryPage(label: string, expression: string): Promise<unknown> {
  const view = views.get(label);
  if (!view) {
    throw new Error(`browser tab ${label} is not rendered`);
  }
  const id = crypto.randomUUID();
  const result = new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingQueries.delete(id);
      reject(new Error("browser page query timed out"));
    }, 3000);
    pendingQueries.set(id, { label, reject, resolve, timeout });
  });
  view.executeJavascript(`void (async () => {
    const post = ${childPost};
    try {
      const result = await (${expression});
      post({ source: "codetwo-browser", kind: "query-response", id: ${JSON.stringify(id)}, result });
    } catch (error) {
      post({ source: "codetwo-browser", kind: "query-response", id: ${JSON.stringify(id)}, error: String(error) });
    }
  })()`);
  return result;
}

export async function browserAnnotationsLocal(
  label: string,
  url: string
): Promise<EmbeddedAnnotation[]> {
  try {
    const result = await queryPage(
      label,
      "window.__codetwoAnnotate ? window.__codetwoAnnotate.list() : []"
    );
    if (!Array.isArray(result)) {
      return [];
    }
    return result.filter(isPageAnnotation).map((annotation) => {
      return {
        note: annotation.note ?? "",
        selected_text:
          annotation.text != null && annotation.text !== ""
            ? annotation.text
            : null,
        selector: annotation.selector ?? null,
        styles: Array.isArray(annotation.styles) ? annotation.styles : [],
        url,
      };
    });
  } catch {
    return [];
  }
}

export async function browserAnnotationCountLocal(
  label: string
): Promise<number> {
  try {
    const count = await queryPage(
      label,
      "window.__codetwoAnnotate ? window.__codetwoAnnotate.count() : 0"
    );
    return typeof count === "number" && Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

export function browserAnnotationsClearLocal(label: string): void {
  views
    .get(label)
    ?.executeJavascript(
      "window.__codetwoAnnotate && window.__codetwoAnnotate.clear()"
    );
}
