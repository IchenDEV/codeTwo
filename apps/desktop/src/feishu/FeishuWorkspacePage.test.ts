import { describe, expect, it } from "bun:test";

import { buildFeishuExecutionPrompt } from "./FeishuWorkspacePage";

describe("buildFeishuExecutionPrompt", () => {
  it("keeps chat provenance and related resources", () => {
    const prompt = buildFeishuExecutionPrompt({
      objective: "整理待办并检查风险",
      tab: "messages",
      sourceName: "插件评审群",
      messages: [{
        id: "m1",
        senderId: "ou_alice",
        senderType: "user",
        type: "text",
        text: "缺陷表还有 12 条待验收。",
        createdAt: "1724900000000",
      }],
      related: [{ id: "doc1", name: "需求说明", type: "docx", url: "https://tenant.feishu.cn/docx/doc1", kind: "document" }],
    });
    expect(prompt).toContain("## 飞书对话：插件评审群");
    expect(prompt).toContain("ou_alice: 缺陷表还有 12 条待验收。");
    expect(prompt).toContain("云文档：需求说明");
  });

  it("includes the visible document body instead of claiming an unread source", () => {
    const prompt = buildFeishuExecutionPrompt({
      objective: "按文档实现",
      tab: "documents",
      sourceName: "需求说明",
      sourceUrl: "https://tenant.feishu.cn/docx/doc1",
      documentContent: "权限范围已经补进需求说明。",
      related: [],
    });
    expect(prompt).toContain("权限范围已经补进需求说明。");
    expect(prompt).toContain("来源：https://tenant.feishu.cn/docx/doc1");
  });
});
