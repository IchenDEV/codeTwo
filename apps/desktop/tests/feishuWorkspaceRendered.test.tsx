// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import {
  activateDom,
  button,
  click,
  dom,
  flush,
  mount,
  restoreDom,
  text,
  waitFor,
} from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { FeishuWorkspacePage } = await import("../src/feishu/FeishuWorkspacePage");

afterEach(() => {
  dom.document.body.replaceChildren();
  dom.window.localStorage.clear();
  restoreDom();
});

const partialConnection = {
  configured: true,
  authorized: false,
  needsUserAuthorization: true,
  waiting: false,
  flow: null,
  method: "device",
  appId: "cli_created",
  redirectUri: "http://127.0.0.1:37641/oauth/callback",
  user: { openId: "ou_creator", name: "" },
  problem: "",
};

function renderFeishu(callCommand, overrides = {}) {
  const navigationHost = dom.document.createElement("div");
  const settingsHost = dom.document.createElement("div");
  dom.document.body.append(navigationHost);
  dom.document.body.append(settingsHost);
  const view = mount(
    <I18nProvider>
      <FeishuWorkspacePage
        enabled
        sessionId={null}
        callCommand={callCommand}
        onHandoff={async () => {}}
        onOpenPluginManager={() => {}}
        navigationHost={navigationHost}
        settingsHost={settingsHost}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { ...view, navigationHost, settingsHost };
}

function resourceButton(container, name) {
  return Array.from(container.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.includes(name)) ?? null;
}

describe("FeishuWorkspacePage", () => {
  test("renders contacts, documents, and bases as one flat directory with real avatars", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const commands = [];
    const opened = [];
    const view = renderFeishu(async (name) => {
      commands.push(name);
      if (name === "connection.status") {
        return { ...partialConnection, authorized: true, needsUserAuthorization: false };
      }
      if (name === "resources.list") {
        return {
          configured: true,
          problem: "",
          chats: [
            { id: "person-1", name: "Lin Xiaoman", description: "Product design", latestMessage: "I updated the launch flow.", avatarUrl: "https://example.invalid/lin.png", mode: "p2p", type: "p2p" },
            { id: "person-2", name: "No Avatar", description: "Design", latestMessage: "Can you review this?", avatarUrl: "", mode: "p2p", type: "p2p" },
            { id: "chat-1", name: "Design review", description: "8 members", avatarUrl: "", mode: "group", type: "group" },
          ],
          documents: [
            { id: "doc-1", name: "Launch brief", type: "docx", url: "https://example.invalid/doc", summary: "Release scope and acceptance criteria" },
            { id: "doc-2", name: "Title only", type: "docx", url: "https://example.invalid/doc-2", summary: "Title only" },
          ],
          bases: [{ id: "base-1", name: "Release tracker", type: "bitable", url: "https://example.invalid/base" }],
          warnings: [],
        };
      }
      throw new Error(`unexpected command: ${name}`);
    }, {
      detailVisible: false,
      onSelectResource: () => opened.push("resource"),
    });

    await waitFor(() => expect(resourceButton(view.navigationHost, "Lin Xiaoman")).not.toBeNull());
    expect(view.container.querySelector(".feishu-workspace")).toBeNull();
    expect(commands).not.toContain("conversation.messages");
    expect(view.navigationHost.querySelector("[data-feishu-directory-toggle]")).toBeNull();
    expect(view.navigationHost.querySelector('[role="tablist"]')).toBeNull();
    expect(view.navigationHost.querySelectorAll("[data-feishu-section]")).toHaveLength(3);
    expect(text(view.settingsHost, "Feishu connection")).not.toBeNull();
    expect(text(view.settingsHost, "Connected")).not.toBeNull();
    expect(text(view.navigationHost, "Contacts")).not.toBeNull();
    expect(text(view.navigationHost, "Docs")).not.toBeNull();
    expect(text(view.navigationHost, "Base")).not.toBeNull();
    const contactsToggle = view.navigationHost.querySelector('[data-feishu-section-toggle="messages"]');
    expect(contactsToggle?.textContent).toBe("Contacts");
    expect(contactsToggle?.children[0]?.textContent).toBe("Contacts");
    expect(contactsToggle?.children[1]?.tagName).toBe("svg");
    expect(contactsToggle?.className).toContain("px-2");
    expect(contactsToggle?.parentElement?.className).toContain("pr-2");
    expect(contactsToggle?.parentElement?.className).not.toContain("px-2");
    expect(resourceButton(view.navigationHost, "Launch brief")).not.toBeNull();
    expect(resourceButton(view.navigationHost, "Release tracker")).not.toBeNull();
    expect(resourceButton(view.navigationHost, "Lin Xiaoman")?.querySelector("img")?.getAttribute("src"))
      .toBe("https://example.invalid/lin.png");
    expect(resourceButton(view.navigationHost, "Lin Xiaoman")?.textContent).toContain("I updated the launch flow.");
    expect(resourceButton(view.navigationHost, "Launch brief")?.textContent).toContain("Release scope and acceptance criteria");
    expect(resourceButton(view.navigationHost, "Launch brief")?.textContent).not.toContain("docx");
    expect(resourceButton(view.navigationHost, "Launch brief")?.querySelector("svg")).toBeNull();
    expect(resourceButton(view.navigationHost, "Launch brief")?.className).toContain("py-1.5");
    expect(resourceButton(view.navigationHost, "Title only")?.textContent).toBe("Title only");
    const fallback = resourceButton(view.navigationHost, "No Avatar")?.querySelector("[data-feishu-avatar-fallback]");
    expect(fallback?.textContent).toBe("N");
    expect(fallback?.className).toContain("rounded-full");

    click(resourceButton(view.navigationHost, "Design review"));
    expect(opened).toEqual(["resource"]);
    view.unmount();
  });

  test("renders Feishu messages as a flat Markdown conversation", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const view = renderFeishu(async (name) => {
      if (name === "connection.status") {
        return { ...partialConnection, authorized: true, needsUserAuthorization: false };
      }
      if (name === "resources.list") {
        return {
          configured: true,
          problem: "",
          chats: [{ id: "person-1", name: "Lin Xiaoman", description: "", latestMessage: "Latest update", avatarUrl: "", mode: "p2p", type: "p2p" }],
          documents: [],
          bases: [],
          warnings: [],
        };
      }
      if (name === "conversation.messages") {
        return {
          messages: [{
            id: "message-1",
            senderId: "ou_lin",
            senderType: "user",
            type: "post",
            text: "**Launch approved** 😊\n\n[Open the brief](https://example.invalid/brief)",
            createdAt: "1724900000000",
            reactions: [
              { emojiType: "THUMBSUP", emoji: "👍", count: 2 },
              { emojiType: "SMILE", emoji: "😊", count: 1 },
            ],
          }, {
            id: "message-2",
            senderId: "ou_lin",
            senderType: "user",
            type: "image",
            text: "",
            createdAt: "1724900001000",
          }],
          hasMore: false,
        };
      }
      throw new Error(`unexpected command: ${name}`);
    });

    await waitFor(() => expect(text(view.container, "Launch approved")).not.toBeNull());
    const message = view.container.querySelector("[data-feishu-message]");
    expect(message?.className).not.toContain("shadow-surface");
    expect(message?.querySelector("strong")?.textContent).toBe("Launch approved");
    expect(message?.textContent).toContain("😊");
    expect(message?.querySelector('a[href="https://example.invalid/brief"]')?.textContent).toBe("Open the brief");
    expect(message?.querySelector("[data-feishu-message-avatar]")?.className).toContain("rounded-full");
    const reactions = Array.from(message?.querySelectorAll("[data-feishu-reactions] > span") ?? []);
    expect(reactions.map((reaction) => reaction.textContent)).toEqual(["👍2", "😊1"]);
    expect(reactions[0]?.getAttribute("aria-label")).toBe("THUMBSUP reaction: 2");
    const renderedMessages = Array.from(view.container.querySelectorAll("[data-feishu-message]"));
    expect(renderedMessages[1]?.textContent).toContain("Image");
    expect(renderedMessages[1]?.textContent).not.toContain("[image]");
    view.unmount();
  });

  test("renders resolved sender names and avatars instead of internal Feishu ids", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const view = renderFeishu(async (name) => {
      if (name === "connection.status") {
        return { ...partialConnection, authorized: true, needsUserAuthorization: false };
      }
      if (name === "resources.list") {
        return {
          configured: true,
          problem: "",
          chats: [{ id: "chat-1", name: "Design review", description: "", latestMessage: "Hello", avatarUrl: "", mode: "group", type: "group" }],
          documents: [],
          bases: [],
          warnings: [],
        };
      }
      if (name === "conversation.messages") {
        return {
          messages: [{
            id: "message-1",
            senderId: "ou_79dcab",
            senderType: "user",
            senderName: "Lin Xiaoman",
            senderAvatarUrl: "https://example.invalid/lin.png",
            type: "text",
            text: "Hello",
            createdAt: "1724900000000",
          }],
          hasMore: false,
        };
      }
      throw new Error(`unexpected command: ${name}`);
    });

    await waitFor(() => expect(text(view.container, "Lin Xiaoman")).not.toBeNull());
    expect(view.container.textContent).not.toContain("Member · 79dcab");
    expect(view.container.querySelector('[data-feishu-message-avatar] img')?.getAttribute("src"))
      .toBe("https://example.invalid/lin.png");
    view.unmount();
  });

  test("renders Feishu document content as Markdown", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const view = renderFeishu(async (name) => {
      if (name === "connection.status") {
        return { ...partialConnection, authorized: true, needsUserAuthorization: false };
      }
      if (name === "resources.list") {
        return {
          configured: true,
          problem: "",
          chats: [],
          documents: [{ id: "doc-1", name: "Launch brief", type: "docx", url: "https://example.invalid/doc", summary: "Release scope" }],
          bases: [],
          warnings: [],
        };
      }
      if (name === "document.read") {
        return {
          content: "# Launch plan\n\n**Approved** for rollout.\n\n- Notify the group\n- Update the tracker\n\n[Open source](https://example.invalid/source)\n\n`release-ready`",
        };
      }
      if (name === "document.component") throw new Error("Live component unavailable in this test");
      throw new Error(`unexpected command: ${name}`);
    });

    await waitFor(() => expect(resourceButton(view.navigationHost, "Launch brief")).not.toBeNull());
    click(resourceButton(view.navigationHost, "Launch brief"));
    await waitFor(() => expect(text(view.container, "Launch plan")).not.toBeNull());

    const document = view.container.querySelector("[data-feishu-document]");
    expect(document?.querySelector("h1")?.textContent).toBe("Launch plan");
    expect(document?.querySelector("strong")?.textContent).toBe("Approved");
    expect(Array.from(document?.querySelectorAll("li") ?? []).map((item) => item.textContent))
      .toEqual(["Notify the group", "Update the tracker"]);
    expect(document?.querySelector('a[href="https://example.invalid/source"]')?.textContent)
      .toBe("Open source");
    expect(document?.querySelector("code")?.textContent).toBe("release-ready");
    expect(document?.textContent).not.toContain("# Launch plan");
    expect(document?.textContent).not.toContain("**Approved**");
    expect(text(view.container, "Live view is unavailable. Showing the latest readable preview.")).not.toBeNull();
    view.unmount();
  });

  test("uses the isolated official Feishu document component before the Markdown fallback", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const commands = [];
    const view = renderFeishu(async (name, input) => {
      commands.push({ name, input });
      if (name === "connection.status") {
        return { ...partialConnection, authorized: true, needsUserAuthorization: false };
      }
      if (name === "resources.list") {
        return {
          configured: true,
          problem: "",
          chats: [],
          documents: [{
            id: "doc-1",
            name: "Launch brief",
            type: "docx",
            url: "https://tenant.feishu.cn/docx/abcdefghijklmnopqrst",
            summary: "Release scope",
          }],
          bases: [],
          warnings: [],
        };
      }
      if (name === "document.read") return { content: "# Fallback only" };
      if (name === "document.component") {
        return {
          id: "component-view-1",
          url: "http://127.0.0.1:43123/component/component-view-1",
          expiresAt: Date.now() + 60_000,
        };
      }
      throw new Error(`unexpected command: ${name}`);
    });

    await waitFor(() => expect(resourceButton(view.navigationHost, "Launch brief")).not.toBeNull());
    click(resourceButton(view.navigationHost, "Launch brief"));
    await waitFor(() => expect(view.container.querySelector("[data-feishu-document-component] iframe")).not.toBeNull());

    const iframe = view.container.querySelector("[data-feishu-document-component] iframe");
    expect(iframe?.getAttribute("src")).toBe("http://127.0.0.1:43123/component/component-view-1");
    expect(iframe?.getAttribute("title")).toBe("Live Feishu document");
    expect(iframe?.getAttribute("sandbox")).toContain("allow-scripts");
    expect(iframe?.getAttribute("sandbox")).toContain("allow-same-origin");
    expect(view.container.querySelector("[data-feishu-document]")).toBeNull();
    expect(commands.find((command) => command.name === "document.component")?.input).toMatchObject({
      documentUrl: "https://tenant.feishu.cn/docx/abcdefghijklmnopqrst",
      locale: "en-US",
      refreshAuth: false,
    });

    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: iframe?.contentWindow,
      data: {
        type: "codetwo-feishu-doc-component",
        id: "component-view-1",
        state: "ready",
      },
    }));
    await flush();
    expect(view.container.textContent).not.toContain("Opening the live Feishu document…");
    expect(view.container.querySelector("[data-feishu-document-fallback]")).toBeNull();
    view.unmount();
  });

  test("refreshes Feishu component authorization once after an auth failure", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const componentInputs = [];
    let componentNumber = 0;
    const view = renderFeishu(async (name, input) => {
      if (name === "connection.status") {
        return { ...partialConnection, authorized: true, needsUserAuthorization: false };
      }
      if (name === "resources.list") {
        return {
          configured: true,
          problem: "",
          chats: [],
          documents: [{
            id: "doc-1",
            name: "Launch brief",
            type: "docx",
            url: "https://tenant.feishu.cn/docx/abcdefghijklmnopqrst",
            summary: "Release scope",
          }],
          bases: [],
          warnings: [],
        };
      }
      if (name === "document.read") return { content: "# Fallback only" };
      if (name === "document.component") {
        componentInputs.push(input);
        componentNumber += 1;
        return {
          id: `component-view-${componentNumber}`,
          url: `http://127.0.0.1:43123/component/component-view-${componentNumber}`,
          expiresAt: Date.now() + 60_000,
        };
      }
      throw new Error(`unexpected command: ${name}`);
    });

    await waitFor(() => expect(resourceButton(view.navigationHost, "Launch brief")).not.toBeNull());
    click(resourceButton(view.navigationHost, "Launch brief"));
    await waitFor(() => expect(view.container.querySelector("iframe")?.getAttribute("src")).toContain("component-view-1"));
    const firstFrame = view.container.querySelector("iframe");
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: firstFrame?.contentWindow,
      data: {
        type: "codetwo-feishu-doc-component",
        id: "component-view-1",
        state: "auth-error",
      },
    }));

    await waitFor(() => expect(view.container.querySelector("iframe")?.getAttribute("src")).toContain("component-view-2"));
    expect(componentInputs).toHaveLength(2);
    expect(componentInputs[0]).toMatchObject({ refreshAuth: false });
    expect(componentInputs[1]).toMatchObject({ refreshAuth: true });
    view.unmount();
  });

  test("collapses sections, limits long resource lists, and keeps pinned resources visible", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const overview = {
      configured: true,
      problem: "",
      chats: Array.from({ length: 8 }, (_, index) => ({
        id: `chat-${index + 1}`,
        name: `Chat ${index + 1}`,
        description: `${index + 2} members`,
        avatarUrl: "",
        mode: "group",
        type: "group",
      })),
      documents: Array.from({ length: 6 }, (_, index) => ({
        id: `doc-${index + 1}`,
        name: `Document ${index + 1}`,
        type: "docx",
        url: `https://example.invalid/doc-${index + 1}`,
      })),
      bases: Array.from({ length: 5 }, (_, index) => ({
        id: `base-${index + 1}`,
        name: `Base ${index + 1}`,
        type: "bitable",
        url: `https://example.invalid/base-${index + 1}`,
      })),
      warnings: [],
    };
    const callCommand = async (name) => {
      if (name === "connection.status") {
        return { ...partialConnection, authorized: true, needsUserAuthorization: false };
      }
      if (name === "resources.list") return overview;
      throw new Error(`unexpected command: ${name}`);
    };

    const view = renderFeishu(callCommand, { detailVisible: false });
    await waitFor(() => expect(resourceButton(view.navigationHost, "Chat 1")).not.toBeNull());

    expect(resourceButton(view.navigationHost, "Chat 5")).toBeNull();
    expect(resourceButton(view.navigationHost, "Document 3")).toBeNull();
    expect(resourceButton(view.navigationHost, "Base 3")).toBeNull();

    const contactsToggle = view.navigationHost.querySelector('[data-feishu-section-toggle="messages"]');
    expect(contactsToggle?.getAttribute("aria-expanded")).toBe("true");
    click(contactsToggle);
    await flush();
    await waitFor(() => expect(view.navigationHost.querySelector('[data-feishu-resource="messages:chat-1"]')).toBeNull());
    expect(dom.window.localStorage.getItem("codetwo.feishu.sections.v1")).toContain('"messages":true');
    click(view.navigationHost.querySelector('[data-feishu-section-toggle="messages"]'));
    await flush();
    await waitFor(() => expect(view.navigationHost.querySelector('[data-feishu-resource="messages:chat-1"]')).not.toBeNull());

    click(view.navigationHost.querySelector('[data-feishu-show-more="messages"]'));
    await flush();
    await waitFor(() => expect(view.navigationHost.querySelector('[data-feishu-resource="messages:chat-8"]')).not.toBeNull());
    click(view.navigationHost.querySelector('button[aria-label="Pin Chat 8"]'));
    await flush();
    await waitFor(() => expect(view.navigationHost.querySelector('button[aria-label="Unpin Chat 8"]')).not.toBeNull());
    click(view.navigationHost.querySelector('[data-feishu-show-less="messages"]'));
    await flush();

    await waitFor(() => expect(view.navigationHost.querySelector('[data-feishu-show-more="messages"]')).not.toBeNull());
    expect(resourceButton(view.navigationHost, "Chat 8")).not.toBeNull();
    expect(view.navigationHost.querySelector('[data-feishu-section="contacts"] [data-feishu-resource]')?.getAttribute("data-feishu-resource"))
      .toBe("messages:chat-8");
    expect(dom.window.localStorage.getItem("codetwo.feishu.pins.v1")).toContain("chat-8");

    view.unmount();
    const restored = renderFeishu(callCommand, { detailVisible: false });
    await waitFor(() => expect(resourceButton(restored.navigationHost, "Chat 8")).not.toBeNull());
    expect(restored.navigationHost.querySelector('[data-feishu-section="contacts"] [data-feishu-resource]')?.getAttribute("data-feishu-resource"))
      .toBe("messages:chat-8");
    expect(restored.navigationHost.querySelector('button[aria-label="Unpin Chat 8"]')).not.toBeNull();
    restored.unmount();
  });

  test("shows local activity dots and refreshes the visible conversation from connector events", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    let listener = null;
    let messageLoads = 0;
    const view = renderFeishu(async (name) => {
      if (name === "connection.status") {
        return { ...partialConnection, authorized: true, needsUserAuthorization: false };
      }
      if (name === "resources.list") {
        return {
          configured: true,
          problem: "",
          chats: [
            { id: "chat-1", name: "Current chat", description: "", latestMessage: "Earlier", avatarUrl: "", mode: "group", type: "group" },
            { id: "chat-2", name: "Background chat", description: "", latestMessage: "Old preview", avatarUrl: "", mode: "group", type: "group" },
          ],
          documents: [{ id: "doc-1", name: "Launch brief", type: "docx", url: "https://example.invalid/doc", summary: "Release scope" }],
          bases: [],
          warnings: [],
        };
      }
      if (name === "conversation.messages") {
        messageLoads += 1;
        return { messages: [], hasMore: false };
      }
      if (name === "document.subscribe" || name === "table.subscribe") return { subscribed: true, problem: "" };
      throw new Error(`unexpected command: ${name}`);
    }, {
      subscribeEvents: async (callback) => {
        listener = callback;
        return () => { listener = null; };
      },
    });

    await waitFor(() => expect(messageLoads).toBe(1));
    listener?.({
      connectorId: "workspace",
      eventId: "message-2",
      kind: "message.created",
      chatId: "chat-2",
      preview: "A new review request",
      createdAt: "1724900000000",
    });
    await flush();

    expect(view.navigationHost.querySelector('[data-feishu-activity-dot="messages:chat-2"]')).not.toBeNull();
    expect(view.navigationHost.querySelector('[data-feishu-section-activity="messages"]')).not.toBeNull();
    expect(resourceButton(view.navigationHost, "Background chat")?.textContent).toContain("A new review request");

    click(resourceButton(view.navigationHost, "Background chat"));
    await waitFor(() => expect(messageLoads).toBe(2));
    expect(view.navigationHost.querySelector('[data-feishu-activity-dot="messages:chat-2"]')).toBeNull();

    listener?.({
      connectorId: "workspace",
      eventId: "message-3",
      kind: "message.created",
      chatId: "chat-2",
      preview: "Visible update",
      createdAt: "1724900001000",
    });
    await waitFor(() => expect(messageLoads).toBe(3));
    expect(view.navigationHost.querySelector('[data-feishu-activity-dot="messages:chat-2"]')).toBeNull();

    listener?.({
      connectorId: "workspace",
      eventId: "document-1",
      kind: "document.changed",
      resourceId: "doc-1",
      resourceType: "docx",
    });
    await flush();
    expect(view.navigationHost.querySelector('[data-feishu-activity-dot="documents:doc-1"]')).not.toBeNull();
    view.unmount();
  });

  test("hides resource groups until authorization and routes sign-in through plugin settings", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const opened = [];
    const english = renderFeishu(async (name) => {
      if (name === "connection.status") return partialConnection;
      throw new Error(`unexpected command: ${name}`);
    }, {
      onOpenPluginManager: () => opened.push("plugins"),
    });
    await waitFor(() => expect(button(english.navigationHost, "Sign in to Feishu")).not.toBeNull());
    expect(english.navigationHost.querySelectorAll("[data-feishu-section]")).toHaveLength(0);
    expect(english.navigationHost.querySelectorAll("[data-feishu-section-toggle]")).toHaveLength(0);
    expect(text(english.container, "Sign in to Feishu")).not.toBeNull();
    expect(english.container.textContent).not.toContain("Finish connecting your Feishu account");
    expect(text(english.settingsHost, "Finish connecting your Feishu account")).not.toBeNull();
    expect(button(english.settingsHost, "Authorize")).not.toBeNull();
    click(button(english.navigationHost, "Sign in to Feishu"));
    expect(opened).toEqual(["plugins"]);
    english.unmount();

    dom.window.localStorage.setItem("codetwo.language", "zh-CN");
    const chinese = renderFeishu(async (name) => {
      if (name === "connection.status") return partialConnection;
      throw new Error(`unexpected command: ${name}`);
    });
    await waitFor(() => expect(button(chinese.navigationHost, "登录飞书")).not.toBeNull());
    expect(chinese.navigationHost.querySelectorAll("[data-feishu-section]")).toHaveLength(0);
    expect(text(chinese.container, "登录飞书")).not.toBeNull();
    expect(chinese.container.textContent).not.toContain("完成飞书账号连接");
    expect(text(chinese.settingsHost, "完成飞书账号连接")).not.toBeNull();
    expect(button(chinese.settingsHost, "授权登录")).not.toBeNull();
    chinese.unmount();
  });

  test("keeps resource sections flat without a duplicate search and exposes permission failures", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    const view = renderFeishu(async (name) => {
      if (name === "connection.status") return { ...partialConnection, authorized: true, needsUserAuthorization: false };
      if (name === "resources.list") {
        return {
          configured: true,
          problem: "",
          chats: [],
          documents: [],
          bases: [],
          warnings: ["missing user permission"],
        };
      }
      throw new Error(`unexpected command: ${name}`);
    });

    await waitFor(() => expect(text(view.navigationHost, "Could not load Feishu resources")).not.toBeNull());
    expect(button(view.navigationHost, "Authorize again")).not.toBeNull();
    expect(view.navigationHost.querySelector('input[aria-label="Search chats and resources"]')).toBeNull();
    expect(view.navigationHost.querySelector("[data-feishu-resource-types]")).toBeNull();
    expect(view.navigationHost.querySelector("[data-feishu-directory-toggle]")).toBeNull();
    expect(view.container.querySelector(".feishu-resource-pane")).toBeNull();
    view.unmount();
  });

  test("continues OAuth automatically after an existing one-click app is upgraded", async () => {
    activateDom();
    dom.window.localStorage.setItem("codetwo.language", "en");
    let statusCalls = 0;
    let beginCalls = 0;
    const view = renderFeishu(async (name) => {
      if (name === "connection.status") {
        statusCalls += 1;
        if (statusCalls === 2) {
          return { ...partialConnection, waiting: true, flow: "registration" };
        }
        if (statusCalls >= 4) {
          return { ...partialConnection, waiting: true, flow: "oauth" };
        }
        return partialConnection;
      }
      if (name === "connection.begin") {
        beginCalls += 1;
        return beginCalls === 1
          ? { url: "https://accounts.feishu.cn/page/launcher", flow: "registration" }
          : { url: "https://open.feishu.cn/open-apis/authen/v1/authorize", flow: "oauth" };
      }
      throw new Error(`unexpected command: ${name}`);
    });

    await waitFor(() => expect(button(view.settingsHost, "Authorize")).not.toBeNull());
    click(button(view.settingsHost, "Authorize"));
    await waitFor(() => expect(beginCalls).toBe(2), 1_800);
    view.unmount();
  });
});
