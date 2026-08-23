import { TranscriptPane } from "./TranscriptPane";
import type { Turn } from "./turns";
import { useTranscriptScroll } from "./useTranscriptScroll";

const chart = `\`\`\`chart
{"type":"bar","title":"Renderer verification","xLabel":"Check","yLabel":"Passed assertions","labels":["Transcript order","Markdown","Chart","Visualize"],"series":[{"name":"Desktop","values":[12,8,6,7]},{"name":"Narrow window","values":[10,8,6,7]}]}
\`\`\``;

const previewTurn: Turn = {
  id: 1,
  accepted: true,
  streamBoundaryKnown: true,
  prompt: "检查新的对话渲染：文本、工具调用、图表和交互式可视化应当在同一条流里按顺序出现。",
  text:
    `我先核对转录事件和渲染入口，确认现有流式边界。\n\n` +
    `入口已经确认，下面验证图表在真实内容宽度下的排版。\n\n${chart}\n\n` +
    "完整验证仍在进行，当前结果如下。\n\n" +
    'visualize{"path":"/__codetwo__/rich-transcript-preview.html","mode":"wide","title":"Release confidence"}',
  textDeltas: [],
  observedTextDeltas: 3,
  observedThoughtDeltas: 0,
  pendingTextDeltaSkips: 0,
  pendingThoughtDeltaSkips: 0,
  thoughts: [],
  tools: [
    {
      id: "inspect-transcript",
      title: "Inspect transcript pipeline",
      status: "completed",
      kind: "read",
      outputs: [
        {
          type: "text",
          text: "Located the shared turn reducer, transcript projection, and desktop renderer.",
        },
      ],
    },
    {
      id: "renderer-tests",
      title: "Run renderer verification",
      status: "in_progress",
      kind: "test",
      outputs: [],
    },
  ],
  content: [
    { kind: "text", text: "我先核对转录事件和渲染入口，确认现有流式边界。\n\n" },
    { kind: "tool", toolId: "inspect-transcript" },
    {
      kind: "text",
      text: `入口已经确认，下面验证图表在真实内容宽度下的排版。\n\n${chart}\n\n`,
    },
    { kind: "tool", toolId: "renderer-tests" },
    {
      kind: "text",
      text:
        "完整验证仍在进行，当前结果如下。\n\n" +
        'visualize{"path":"/__codetwo__/rich-transcript-preview.html","mode":"wide","title":"Release confidence"}',
    },
  ],
  plan: [],
  startedAt: Date.now() - 31_000,
};
const previewTurns = [previewTurn] as const;

export function RichTranscriptPreview() {
  const scroll = useTranscriptScroll("rich-transcript-preview", previewTurns);
  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center bg-fill-quiet px-5 py-3">
        <p className="text-ui font-medium">Rich conversation</p>
        <span className="ms-auto text-fine text-muted-foreground">Streaming</span>
      </header>
      <main className="flex min-h-0 flex-1">
        <TranscriptPane
          variant="main"
          turns={previewTurns}
          loading={false}
          hasEarlier={false}
          loadingEarlier={false}
          onLoadEarlier={() => {}}
          scroll={scroll}
          petAnimation="running"
          voiceEnabled={false}
          onVoiceText={() => {}}
          onAddSelection={() => {}}
          onExplainSelection={() => {}}
          onAskSelectionInSideChat={() => {}}
        />
      </main>
      <footer className="shrink-0 px-5 pb-4">
        <div className="mx-auto max-w-3xl rounded-(--ds-radius-module) border bg-card px-4 py-3 text-ui text-muted-foreground shadow-(--ds-elevation-surface)">
          Ask a follow-up…
        </div>
      </footer>
    </div>
  );
}
