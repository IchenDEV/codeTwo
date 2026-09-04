import { describe, expect, it } from "bun:test";

import { buildFeishuExecutionPrompt } from "./FeishuWorkspacePage";

describe("buildFeishuExecutionPrompt", () => {
  it("keeps chat provenance and related resources", () => {
    const prompt = buildFeishuExecutionPrompt({
      messages: [
        {
          createdAt: "1724900000000",
          id: "m1",
          senderAvatarUrl: "https://example.invalid/lin-avatar.png",
          senderId: "ou_alice",
          senderName: "林小满",
          senderType: "user",
          text: "缺陷表还有 12 条待验收。",
          type: "text",
        },
      ],
      objective: "整理待办并检查风险",
      related: [
        {
          id: "doc1",
          kind: "document",
          name: "需求说明",
          type: "docx",
          url: "https://tenant.feishu.cn/docx/doc1",
        },
      ],
      sourceName: "插件评审群",
      tab: "messages",
    });
    expect(prompt).toContain("## 飞书对话：插件评审群");
    expect(prompt).toContain("林小满: 缺陷表还有 12 条待验收。");
    expect(prompt).toContain("云文档：需求说明");
  });

  it("includes the visible document body instead of claiming an unread source", () => {
    const prompt = buildFeishuExecutionPrompt({
      documentContent: "权限范围已经补进需求说明。",
      objective: "按文档实现",
      related: [],
      sourceName: "需求说明",
      sourceUrl: "https://tenant.feishu.cn/docx/doc1",
      tab: "documents",
    });
    expect(prompt).toContain("权限范围已经补进需求说明。");
    expect(prompt).toContain("来源：https://tenant.feishu.cn/docx/doc1");
  });
});
