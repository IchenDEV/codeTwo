import { useState } from "react";

function normalizeUrl(u: string): string {
  return /^https?:\/\//.test(u) ? u : `https://${u}`;
}

// Built-in browser (F3): an address bar + embedded page, plus a quick "annotate → prompt" bar (F4).
// Annotations become browser-context blocks in the prompt document, so the agent sees what you see.
export function BrowserPanel({
  url,
  onNavigate,
  onAnnotate,
}: {
  url: string;
  onNavigate: (u: string) => void;
  onAnnotate: (note: string) => void;
}) {
  const [addr, setAddr] = useState(url);
  const [note, setNote] = useState("");

  const go = () => onNavigate(normalizeUrl(addr));
  const annotate = () => {
    if (note.trim()) {
      onAnnotate(note.trim());
      setNote("");
    }
  };

  return (
    <div className="browser">
      <div className="browser-bar">
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="https://…"
        />
        <button onClick={go}>Go</button>
      </div>
      <iframe
        className="browser-frame"
        src={url}
        title="Built-in browser"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
      <div className="browser-annotate">
        <span className="annotate-icon">✎</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && annotate()}
          placeholder="Annotate this page for the agent (added to your prompt)…"
        />
        <button onClick={annotate}>Add to prompt</button>
      </div>
    </div>
  );
}
