import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function normalizeUrl(u: string): string {
  return /^https?:\/\//.test(u) ? u : `https://${u}`;
}

// Built-in browser: an address bar + embedded page, plus a quick "annotate → prompt" bar.
// Annotations become browser-context blocks in the prompt document.
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
    <div className="flex w-full flex-col">
      <div className="flex items-center gap-2 border-b bg-card px-2 py-1.5">
        <Input
          className="h-8 flex-1"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="https://…"
        />
        <Button variant="outline" size="sm" onClick={go}>
          Go
        </Button>
      </div>

      <iframe
        className="w-full flex-1 border-0 bg-white"
        src={url}
        title="Built-in browser"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />

      <div className="flex items-center gap-2 border-t bg-card px-2 py-1.5">
        <Pencil className="size-3.5 shrink-0 text-primary" />
        <Input
          className="h-8 flex-1"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && annotate()}
          placeholder="Annotate this page for the agent (added to your prompt)…"
        />
        <Button size="sm" onClick={annotate}>
          Add to prompt
        </Button>
      </div>
    </div>
  );
}
