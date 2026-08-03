import { useCallback, useEffect, useState } from "react";
import {
  remoteDevices,
  remotePairingLink,
  remoteRevokeDevice,
  remoteStatus,
  startRemote,
  stopRemote,
  type RemoteDevice,
  type RemotePairingLink,
  type RemoteStatus,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Remote control, t3code-style: toggle network access, mint one-time pairing links (URL + QR), and
 * manage paired devices. A paired device drives the same live engine/sessions as this app; pairing
 * survives restarts, and revoking a device cuts it off immediately.
 */
export function RemoteModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [link, setLink] = useState<RemotePairingLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    remoteStatus().then(setStatus).catch(() => {});
    remoteDevices().then(setDevices).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  const turnOn = async () => {
    setBusy(true);
    setErr(null);
    try {
      const st = await startRemote();
      if (!st) {
        setErr("Remote is only available in the desktop app.");
      } else {
        setStatus(st);
        setLink(await remotePairingLink());
      }
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await stopRemote();
      setStatus(null);
      setLink(null);
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  };

  const newLink = async () => {
    setErr(null);
    try {
      setLink(await remotePairingLink());
      setCopied(false);
    } catch (e) {
      setErr(String(e));
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the URL is selectable */
    }
  };

  const revoke = async (id: string) => {
    await remoteRevokeDevice(id).catch(() => {});
    remoteDevices().then(setDevices).catch(() => {});
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Remote control</DialogTitle>
        </DialogHeader>

        {status ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-ui">
                <span className="mr-2 inline-block size-2 rounded-full bg-green-500 align-middle" />
                Network access is on — port {status.port}
              </p>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void turnOff()}>
                Turn off
              </Button>
            </div>

            <div className="space-y-1">
              {status.endpoints.map((e) => (
                <p key={e.url} className="text-hint text-muted-foreground">
                  <span className="mr-1.5 inline-block w-16 font-medium text-foreground">{e.label}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{e.url}</code>
                </p>
              ))}
            </div>

            {link ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-hint text-muted-foreground">
                  Scan or open on the other device. The link is <b>one-time</b> and expires in{" "}
                  {Math.round(link.expires_in / 60)} minutes; the device stays paired after that.
                </p>
                {link.qr_svg && (
                  <div className="mx-auto w-fit rounded-md bg-white p-2">
                    <img
                      className="block size-44"
                      alt="Pairing QR code"
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(link.qr_svg)}`}
                    />
                  </div>
                )}
                <div className="break-all rounded-md bg-primary/10 px-3 py-2 font-mono text-hint">{link.url}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void copy()}>
                    {copied ? "Copied ✓" : "Copy link"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void newLink()}>
                    New link
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => void newLink()}>
                Create pairing link
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-hint leading-relaxed text-muted-foreground">
              Drive Code2 from your phone, tablet, or another machine on the same network. Turning
              this on serves the app's live sessions on all network interfaces; access requires
              pairing with a one-time link.
            </p>
            <Button disabled={busy} onClick={() => void turnOn()}>
              {busy ? "Starting…" : "Turn on network access"}
            </Button>
          </>
        )}

        {devices.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-ui font-medium">Paired devices</p>
            {devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                <div>
                  <p className="text-ui">{d.name}</p>
                  <p className="text-hint text-muted-foreground">
                    paired {new Date(d.created_at * 1000).toLocaleDateString()} · last seen{" "}
                    {new Date(d.last_seen * 1000).toLocaleString()}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void revoke(d.id)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}

        {err && <p className="text-hint text-destructive">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
