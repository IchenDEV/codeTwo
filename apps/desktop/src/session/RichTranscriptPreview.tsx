import { useState } from "react";

import { Button } from "@/components/ui/button";

import { EnvironmentPopover } from "../environment/EnvironmentPopover";
import { TrajectoryView } from "./TrajectoryView";
import { TranscriptPane } from "./TranscriptPane";
import type { Turn } from "./turns";

const chart = `\`\`\`chart
{"type":"bar","title":"Renderer verification","xLabel":"Check","yLabel":"Passed assertions","labels":["Transcript order","Markdown","Chart","Visualize"],"series":[{"name":"Desktop","values":[12,8,6,7]},{"name":"Narrow window","values":[10,8,6,7]}]}
\`\`\``;

const previewStartedAt = Date.now() - 31_000;

const previewTurn: Turn = {
  accepted: true,
  content: [
    {
      createdAt: previewStartedAt + 1000,
      kind: "text",
      text: "我先核对转录事件和渲染入口，确认现有流式边界。\n\n",
    },
    {
      createdAt: previewStartedAt + 11_000,
      kind: "tool",
      toolId: "inspect-transcript",
    },
    {
      createdAt: previewStartedAt + 13_000,
      kind: "text",
      text: `入口已经确认，下面验证图表在真实内容宽度下的排版。\n\n${chart}\n\n`,
    },
    {
      createdAt: previewStartedAt + 21_000,
      kind: "tool",
      toolId: "renderer-tests",
    },
    {
      createdAt: previewStartedAt + 22_000,
      kind: "tool",
      toolId: "agent-accessibility",
    },
    {
      createdAt: previewStartedAt + 23_000,
      kind: "tool",
      toolId: "agent-layout",
    },
    {
      createdAt: previewStartedAt + 24_000,
      kind: "tool",
      toolId: "agent-tests",
    },
    {
      createdAt: previewStartedAt + 24_000,
      kind: "text",
      text:
        "完整验证仍在进行，当前结果如下。\n\n" +
        'visualize{"path":"/__codetwo__/rich-transcript-preview.html","mode":"wide","title":"Release confidence"}',
    },
  ],
  endedAt: previewStartedAt + 25_000,
  id: 1,
  observedTextDeltas: 3,
  observedThoughtDeltas: 0,
  pendingTextDeltaSkips: 0,
  pendingThoughtDeltaSkips: 0,
  plan: [
    { content: "Inspect the transcript path", status: "completed" },
    { content: "Run renderer checks", status: "in_progress" },
    { content: "Report the evidence", status: "pending" },
  ],
  prompt:
    "检查新的对话渲染：文本、工具调用、图表和交互式可视化应当在同一条流里按顺序出现。",
  startedAt: previewStartedAt,
  streamBoundaryKnown: true,
  text:
    `我先核对转录事件和渲染入口，确认现有流式边界。\n\n` +
    `入口已经确认，下面验证图表在真实内容宽度下的排版。\n\n${chart}\n\n` +
    "完整验证仍在进行，当前结果如下。\n\n" +
    'visualize{"path":"/__codetwo__/rich-transcript-preview.html","mode":"wide","title":"Release confidence"}',
  textDeltas: [],
  thoughts: [
    "I should inspect the shared renderer before changing the presentation.",
  ],
  tools: [
    {
      endedAt: previewStartedAt + 11_000,
      id: "inspect-transcript",
      kind: "read",
      outputs: [
        {
          text: "Located the shared turn reducer, transcript projection, and desktop renderer.",
          type: "text",
        },
      ],
      startedAt: previewStartedAt + 4000,
      status: "completed",
      title: "Inspect transcript pipeline",
    },
    {
      id: "renderer-tests",
      kind: "test",
      outputs: [],
      startedAt: previewStartedAt + 21_000,
      status: "in_progress",
      title: "Run renderer verification",
    },
    {
      agentInput: {
        agent_type: "explorer",
        message: "Check the transcript controls and status announcements.",
        task_name: "accessibility_review",
      },
      id: "agent-accessibility",
      kind: "agent",
      outputs: [],
      startedAt: previewStartedAt + 8000,
      status: "in_progress",
      title: "spawn_agent",
    },
    {
      agentInput: {
        agent_type: "worker",
        message: "Verify the transcript at a narrow desktop width.",
        task_name: "narrow_layout",
      },
      endedAt: previewStartedAt + 18_000,
      id: "agent-layout",
      kind: "agent",
      outputs: [],
      startedAt: previewStartedAt + 2000,
      status: "completed",
      title: "spawn_agent",
    },
    {
      agentInput: {
        agent_type: "worker",
        message: "Run the renderer regression suite.",
        task_name: "renderer_tests",
      },
      endedAt: previewStartedAt + 14_000,
      id: "agent-tests",
      kind: "agent",
      outputs: [],
      startedAt: previewStartedAt + 3000,
      status: "failed",
      title: "spawn_agent",
    },
  ],
  transcriptStartSeq: 1,
};
const previewTurns = [previewTurn] as const;

export function RichTranscriptPreview() {
  const [trajectory, setTrajectory] = useState(false);
  return (
    <div className="bg-background text-foreground flex h-screen min-h-0 flex-col">
      <header className="bg-fill-quiet flex shrink-0 items-center gap-2 px-5 py-3">
        <p className="text-body font-medium">Rich conversation</p>
        <span className="text-callout text-muted-foreground ms-auto">
          Streaming
        </span>
        <EnvironmentPopover
          project="codeTwo"
          projectPath="/tmp/codeTwo"
          projects={[]}
          git={{
            ahead: 0,
            behind: 0,
            branch: "codex/tasks",
            files: [],
            is_repo: true,
          }}
          diffStat={{ added: 42, deleted: 8 }}
          onRefresh={() => {}}
          onSelectProject={() => {}}
          onAddProject={() => {}}
          onOpenSourceControl={() => {}}
          onOpenSettings={() => {}}
          turns={previewTurns}
          onOpenPlanAsDocument={() => {}}
        />
        <Button
          type="button"
          size="compact"
          variant="secondary"
          onClick={() => setTrajectory((current) => !current)}
        >
          {trajectory ? "Conversation" : "Trajectory"}
        </Button>
      </header>
      <main className="flex min-h-0 flex-1">
        {trajectory ? (
          <TrajectoryView
            turns={previewTurns}
            usage={{ input_tokens: 12_480, output_tokens: 3206 }}
            hasEarlier={false}
            loadingEarlier={false}
            onLoadEarlier={() => {}}
          />
        ) : (
          <TranscriptPane
            sessionId="rich-transcript-preview"
            variant="main"
            turns={previewTurns}
            loading={false}
            hasEarlier={false}
            loadingEarlier={false}
            onLoadEarlier={() => {}}
            onForkTurn={() => {}}
            onAddSelection={() => {}}
            onExplainSelection={() => {}}
            onAskSelectionInSideChat={() => {}}
          />
        )}
      </main>
      <footer className="shrink-0 px-5 pb-4">
        <div className="rounded-module bg-card text-body text-muted-foreground mx-auto max-w-3xl border px-4 py-3 shadow-(--ds-elevation-surface)">
          Ask a follow-up…
        </div>
      </footer>
    </div>
  );
}
