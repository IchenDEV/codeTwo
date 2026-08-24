import { useCallback, useEffect, useRef, useState } from "react";
import {
  remoteDevices,
  remotePairingLink,
  remoteRevokeDevice,
  remoteStatus,
  startRemote,
  stopRemote,
  type RemoteDevice,
  type RemoteClientProtocol,
  type RemoteEndpoint,
  type RemotePairingLink,
  type RemoteStatus,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function defaultEndpointId(status: RemoteStatus | null): string | null {
  if (!status) return null;
  return (
    status.endpoints.find((endpoint) => endpoint.id.startsWith("lan-") && endpoint.qr_shareable)?.id ??
    status.endpoints.find((endpoint) => endpoint.qr_shareable)?.id ??
    status.endpoints[0]?.id ??
    null
  );
}

function endpointHelp(endpoint: RemoteEndpoint | undefined): string {
  if (!endpoint) return "No pairing address is currently available.";
  if (!endpoint.qr_shareable) {
    return "Works only in another browser on this computer. Other devices cannot reach 127.0.0.1, so no QR code is shown.";
  }
  if (endpoint.id.startsWith("tailnet-")) {
    return "Best-effort 100.64/10 match. Verify this address in Tailscale; it works when both devices share the tailnet and its access policy allows this port.";
  }
  return "Devices on the same network can open the generated link.";
}

/**
 * Remote control for C2's mobile and browser clients: toggle network access, mint
 * one-time pairing links and manage paired devices. A paired device drives the same
 * live engine/sessions as this app; pairing survives restarts, and revoking a device cuts it off
 * immediately.
 */
export function RemoteModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [link, setLink] = useState<RemotePairingLink | null>(null);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<RemoteClientProtocol>("t3");
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const linkRequest = useRef(0);

  const applyStatus = useCallback((next: RemoteStatus | null) => {
    setStatus(next);
    setSelectedEndpointId((current) => {
      if (current && next?.endpoints.some((endpoint) => endpoint.id === current)) return current;
      return defaultEndpointId(next);
    });
    if (!next) setLink(null);
  }, []);

  const refresh = useCallback(() => {
    remoteStatus().then(applyStatus).catch(() => {});
    remoteDevices().then(setDevices).catch(() => {});
  }, [applyStatus]);
  useEffect(refresh, [refresh]);

  const mintLink = useCallback(
    async (endpointId: string | null) => {
      const request = ++linkRequest.current;
      setLinkBusy(true);
      setErr(null);
      try {
        const next = await remotePairingLink(endpointId ?? undefined, protocol);
        if (request !== linkRequest.current) return;
        setLink(next);
        if (next) setSelectedEndpointId(next.endpoint_id);
        setCopied(false);
      } catch (e) {
        if (request === linkRequest.current) setErr(String(e));
      } finally {
        if (request === linkRequest.current) setLinkBusy(false);
      }
    },
    [protocol],
  );

  const turnOn = async () => {
    setBusy(true);
    setErr(null);
    try {
      const st = await startRemote();
      if (!st) {
        setErr("Remote is only available in the desktop app.");
      } else {
        applyStatus(st);
        await mintLink(defaultEndpointId(st));
      }
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true);
    linkRequest.current += 1;
    setLinkBusy(false);
    try {
      await stopRemote();
      applyStatus(null);
      setLink(null);
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  };

  const selectEndpoint = (endpointId: string) => {
    setSelectedEndpointId(endpointId);
    void mintLink(endpointId);
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
    setErr(null);
    try {
      await remoteRevokeDevice(id);
      setDevices(await remoteDevices());
    } catch (error) {
      setErr(String(error));
    }
  };

  const selectedEndpoint = status?.endpoints.find((endpoint) => endpoint.id === selectedEndpointId);
  const linkEndpoint = status?.endpoints.find((endpoint) => endpoint.id === link?.endpoint_id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Remote connections</DialogTitle>
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

            <div className="space-y-1.5">
              <label id="remote-client-label" className="text-ui font-medium">
                Client
              </label>
              <Select
                value={protocol}
                onValueChange={(value) => {
                  const next = value as RemoteClientProtocol;
                  setProtocol(next);
                  setLink(null);
                }}
              >
                <SelectTrigger className="w-full" aria-labelledby="remote-client-label">
                  <SelectValue>{protocol === "t3" ? "T3 Code mobile" : "Browser remote"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="t3">T3 Code mobile</SelectItem>
                  <SelectItem value="legacy">Browser remote</SelectItem>
                </SelectContent>
              </Select>

              <label id="remote-endpoint-label" className="text-ui font-medium">
                Pairing target
              </label>
              <Select
                value={selectedEndpointId ?? undefined}
                disabled={status.endpoints.length === 0}
                onValueChange={(endpointId) => endpointId && selectEndpoint(endpointId)}
              >
                <SelectTrigger
                  className="w-full"
                  aria-labelledby="remote-endpoint-label"
                  aria-describedby="remote-endpoint-help"
                >
                  <SelectValue placeholder="Choose an address" />
                </SelectTrigger>
                <SelectContent>
                  {status.endpoints.map((endpoint) => (
                    <SelectItem key={endpoint.id} value={endpoint.id}>
                      {endpoint.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="remote-endpoint-help" className="text-hint text-muted-foreground">
                {endpointHelp(selectedEndpoint)}
              </p>
            </div>

            {link ? (
              <div className="space-y-2 rounded-md border p-3" aria-busy={linkBusy}>
                <p className="text-hint text-muted-foreground">
                  {protocol === "t3"
                    ? linkEndpoint?.qr_shareable && link.qr_svg
                      ? "Scan this code from T3 Code mobile, or open the link there. "
                      : "Open this link in T3 Code mobile on the same network or tailnet. "
                    : linkEndpoint?.qr_shareable
                      ? link.qr_svg
                        ? "Scan this code or open the link in a browser on the same network or tailnet. "
                        : "Open this link in a browser on the same network or tailnet. "
                      : "Copy this link into another browser on this computer. "}
                  The link is <b>one-time</b> and expires in {Math.round(link.expires_in / 60)} minutes;
                  the device stays paired after that.
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
                  <Button variant="outline" size="sm" disabled={linkBusy} onClick={() => void copy()}>
                    {copied ? "Copied ✓" : "Copy link"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-disabled={linkBusy}
                    className="aria-disabled:opacity-50"
                    onClick={() => !linkBusy && void mintLink(selectedEndpointId)}
                  >
                    {linkBusy ? "Creating…" : "New link"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                disabled={status.endpoints.length === 0}
                aria-disabled={linkBusy}
                className="aria-disabled:opacity-50"
                onClick={() => !linkBusy && void mintLink(selectedEndpointId)}
              >
                {linkBusy ? "Creating…" : "Create pairing link"}
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-hint leading-relaxed text-muted-foreground">
              Run C2 from T3 Code mobile or a browser over the same LAN or Tailscale tailnet.
              Turning this on serves the app's live sessions on
              all network interfaces; access requires pairing with a one-time link.
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
