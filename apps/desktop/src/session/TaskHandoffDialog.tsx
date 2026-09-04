import { useState } from "react";

import { transferTaskToDevice, type TaskHandoffResult } from "../bridge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const TaskHandoffDialog = ({
  session,
  onClose,
  onTransferred,
}: {
  readonly session: string;
  readonly onClose: () => void;
  readonly onTransferred: (result: TaskHandoffResult) => void;
}) => {
  const [pairingUrl, setPairingUrl] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transfer = async () => {
    if (!pairingUrl.trim() || !destination.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onTransferred(
        await transferTaskToDevice(
          session,
          pairingUrl.trim(),
          destination.trim()
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move task to another device</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="handoff-pairing-url">
              Remote agent pairing URL
            </Label>
            <Input
              id="handoff-pairing-url"
              autoComplete="off"
              spellCheck={false}
              placeholder="http://device:4599/pair#token=…"
              value={pairingUrl}
              onChange={(event) => setPairingUrl(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="handoff-destination">Destination folder</Label>
            <Input
              id="handoff-destination"
              autoComplete="off"
              spellCheck={false}
              placeholder="/work/project"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
            <p className="text-metadata text-muted-foreground">
              Choose a new folder on the remote device.
            </p>
          </div>
          {error ? <p className="text-metadata text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !pairingUrl.trim() || !destination.trim()}
            onClick={() => void transfer()}
          >
            {busy ? "Moving…" : "Move task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
