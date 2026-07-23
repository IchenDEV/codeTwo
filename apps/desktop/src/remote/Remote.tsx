import { useState } from "react";
import { startRemote, type RemoteInfo } from "../bridge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Remote control: start a local server and show the pairing URL/token to open on another device.
 * The remote drives the same live engine/sessions as this app.
 */
export function RemoteModal({
  info,
  onStarted,
  onClose,
}: {
  info: RemoteInfo | null;
  onStarted: (i: RemoteInfo) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const i = await startRemote();
      if (i) onStarted(i);
      else setErr("Remote is only available in the desktop app.");
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remote control</DialogTitle>
        </DialogHeader>

        {info ? (
          <>
            <p className="text-xs text-muted-foreground">Open this on another device on the same network:</p>
            <div className="break-all rounded-md bg-primary/10 px-3 py-2.5 text-[15px] font-semibold">
              <a href={info.url} target="_blank" rel="noreferrer" className="text-primary no-underline">
                {info.url}
              </a>
            </div>
            <p className="text-[13px] text-muted-foreground">
              token: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{info.token}</code>
            </p>
            <p className="text-xs text-muted-foreground">The remote drives the same sessions as this app.</p>
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Start a local server so you can drive codeTwo from your phone, tablet, or another machine on
              the same network.
            </p>
            <Button disabled={busy} onClick={() => void start()}>
              {busy ? "Starting…" : "Start remote server"}
            </Button>
            {err && <p className="text-xs text-destructive">{err}</p>}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
