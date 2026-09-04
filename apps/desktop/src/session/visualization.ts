export interface VisualizationReference {
  path: string;
  mode?: "wide";
  title?: string;
}

export type RichTextSegment =
  | { kind: "markdown"; text: string }
  | { kind: "visualization"; reference: VisualizationReference };

const visualizeStart = "visualize";
const visualizeEnd = "";

function visualizationReference(value: unknown): VisualizationReference | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.path !== "string" ||
    candidate.path.length === 0 ||
    candidate.path.length > 4096 ||
    !candidate.path.toLowerCase().endsWith(".html") ||
    (!candidate.path.startsWith("/") &&
      !/^[A-Za-z]:[\\/]/u.test(candidate.path))
  ) {
    return null;
  }
  if (candidate.mode !== undefined && candidate.mode !== "wide") {
    return null;
  }
  if (
    candidate.title !== undefined &&
    (typeof candidate.title !== "string" || candidate.title.length > 250)
  ) {
    return null;
  }
  return {
    path: candidate.path,
    ...(candidate.mode === "wide" && { mode: "wide" as const }),
    ...(typeof candidate.title === "string" &&
      candidate.title.trim() && { title: candidate.title.trim() }),
  };
}

export function splitRichText(
  source: string,
  isStreaming = false
): RichTextSegment[] {
  const output: RichTextSegment[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(visualizeStart, cursor);
    if (start === -1) {
      const tail = source.slice(cursor);
      if (tail) {
        output.push({ kind: "markdown", text: tail });
      }
      break;
    }
    if (start > cursor) {
      output.push({ kind: "markdown", text: source.slice(cursor, start) });
    }
    const payloadStart = start + visualizeStart.length;
    const end = source.indexOf(visualizeEnd, payloadStart);
    if (end === -1) {
      if (!isStreaming) {
        output.push({ kind: "markdown", text: source.slice(start) });
      }
      break;
    }
    const literal = source.slice(start, end + visualizeEnd.length);
    try {
      const reference = visualizationReference(
        JSON.parse(source.slice(payloadStart, end))
      );
      if (reference) {
        output.push({ kind: "visualization", reference });
      } else {
        output.push({ kind: "markdown", text: literal });
      }
    } catch {
      output.push({ kind: "markdown", text: literal });
    }
    cursor = end + visualizeEnd.length;
  }
  return output;
}

export const visualizationThemeVariables = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--border",
  "--input",
  "--ring",
  "--blue",
  "--orange",
  "--green",
  "--red",
  "--purple",
  "--yellow",
  "--viz-series-1",
  "--viz-series-2",
  "--viz-series-3",
  "--viz-series-4",
  "--viz-series-5",
  "--viz-series-6",
] as const;

function safeCssValue(value: string): string {
  return value.replaceAll(/[;{}]/gu, "").trim();
}

const visualizationBaseCss = String.raw`
html,body{margin:0;padding:0;background:var(--background);color:var(--foreground);font:var(--font-size-base)/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}
*{box-sizing:border-box}
body{overflow:hidden}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
a{color:var(--primary)}
h1,h2,h3{font-size:inherit;line-height:inherit;font-weight:500;margin:0 0 8px}
p{margin:0}
svg text{font-family:inherit}
.text-small{font-size:max(11px,calc(var(--font-size-base) * .85))}
.text-muted{color:var(--muted-foreground)}
.text-destructive{color:var(--destructive)}
.text-end{text-align:end}
.text-center{text-align:center}
.text-nowrap{white-space:nowrap}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.card{background:var(--card);color:var(--card-foreground);border:1px solid var(--border);border-radius:var(--visualization-radius-module);padding:12px}
.viz-stat-value{font-size:1.4em;font-weight:500}
.viz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:12px}
.viz-row,.viz-controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.viz-controls{margin-block:8px}
.viz-badge{display:inline-flex;align-items:center;border-radius:var(--visualization-radius-control);padding:2px 8px;background:var(--accent);color:var(--accent-foreground)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:5px 10px;border:1px solid var(--border);border-radius:var(--visualization-radius-control);background:var(--secondary);color:var(--secondary-foreground)}
.btn-primary{background:var(--primary);color:var(--primary-foreground);border-color:transparent}
.btn-ghost{background:transparent;border-color:transparent}
.btn-block{width:100%}
.form-label{display:grid;gap:4px}
.form-control,.form-select{min-height:36px;max-width:100%;padding:5px 8px;border:1px solid var(--input);border-radius:var(--visualization-radius-control);background:var(--background);color:var(--foreground)}
.form-range{max-width:100%}
.form-check{display:flex;align-items:center;gap:6px}
.progress{height:8px;border-radius:var(--visualization-radius-control);background:var(--muted);overflow:hidden}
.progress-bar{height:100%;border-radius:var(--visualization-radius-control);background:var(--viz-series-1)}
.table-responsive{max-width:100%;overflow-x:auto}
.table{width:100%;border-collapse:collapse}
.table th,.table td{text-align:start;padding:7px 8px;border-bottom:1px solid var(--border)}
.table th{font-weight:500}
.table-sm th,.table-sm td{padding:4px 6px}
.tooltip{position:absolute;z-index:10;pointer-events:none;background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--visualization-radius-control);padding:6px 8px}
.viz-tile{min-height:44px}
.viz-tile[aria-pressed=true]{box-shadow:0 0 0 2px var(--ring)}
.viz-icon{display:inline-block;width:16px;height:16px;flex:none}
@media(max-width:420px){.viz-controls{align-items:stretch}.viz-controls>.form-label{width:100%}}
`;

export function visualizationDocument(
  fragment: string,
  theme: Readonly<Record<string, string>>,
  token: string
): string {
  const variables = visualizationThemeVariables
    .map((name) => {
      const value = safeCssValue(theme[name] ?? "");
      return value ? `${name}:${value}` : "";
    })
    .filter(Boolean)
    .join(";");
  const safeToken = /^[A-Za-z0-9-]+$/u.test(token) ? token : "visualization";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://esm.sh https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com https://fonts.bunny.net; font-src https://fonts.gstatic.com https://fonts.bunny.net; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>:root{--font-size-base:14px;--visualization-radius-control:12px;--visualization-radius-module:16px;${variables}}${visualizationBaseCss}</style></head><body>${fragment}<script>(()=>{const token=${JSON.stringify(safeToken)};const send=(message)=>parent.postMessage({...message,token},'*');window.openai={sendFollowUpMessage:async(value)=>{send({type:'codetwo-visualize-follow-up',prompt:value?.prompt,title:value?.title});}};document.addEventListener('click',(event)=>{const link=event.target instanceof Element?event.target.closest('a[href]'):null;if(!link)return;event.preventDefault();send({type:'codetwo-visualize-open-link',url:link.href});});const size=()=>send({type:'codetwo-visualize-size',height:Math.ceil(Math.max(document.body.scrollHeight,document.body.offsetHeight))});if(typeof ResizeObserver==='function')new ResizeObserver(size).observe(document.body);document.fonts?.ready?.then(size);addEventListener('load',size);requestAnimationFrame(size);})();</script></body></html>`;
}
