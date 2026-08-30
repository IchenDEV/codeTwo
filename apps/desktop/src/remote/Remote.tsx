import { useCallback, useEffect, useRef, useState } from "react";
import {
  pairRemoteDevice,
  remoteDevices,
  remotePairingLink,
  remoteRevokeDevice,
  remoteStatus,
  startRemote,
  stopRemote,
  type RemoteClientProtocol,
  type RemoteDevice,
  type RemoteEndpoint,
  type RemotePairingLink,
  type RemoteStatus,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function defaultEndpointId(status: RemoteStatus | null): string | null {
  if (!status) return null;
  return (
    status.endpoints.find((endpoint) => endpoint.id.startsWith("lan-") && endpoint.qr_shareable)?.id ??
    status.endpoints.find((endpoint) => endpoint.qr_shareable)?.id ??
    status.endpoints[0]?.id ??
    null
  );
}

function supportedProtocols(status: RemoteStatus): RemoteClientProtocol[] {
  return status.protocols?.length ? status.protocols : ["t3", "legacy"];
}

function protocolLabel(protocol: RemoteClientProtocol): string {
  if (protocol === "c2") return "C2 device sync";
  if (protocol === "t3") return "T3 Code mobile";
  return "Browser remote";
}

function endpointHelp(endpoint: RemoteEndpoint | undefined): string {
  if (!endpoint) return "No pairing address is currently available.";
  if (!endpoint.qr_shareable) {
    return "Works only with another C2 instance on this Mac. Other devices cannot reach 127.0.0.1.";
  }
  if (endpoint.id.startsWith("tailnet-")) {
    return "Verify this candidate in Tailscale. Both devices must share the tailnet and its access policy must allow this port.";
  }
  return "Devices on the same network can use this address.";
}

export function RemoteModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [link, setLink] = useState<RemotePairingLink | null>(null);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [clientProtocol, setClientProtocol] = useState<RemoteClientProtocol>("c2");
  const [pairingUrl, setPairingUrl] = useState("");
  const [pairedMessage, setPairedMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const linkRequest = useRef(0);

  const applyStatus = useCallback((next: RemoteStatus | null) => {
    setStatus(next);
    setSelectedEndpointId((current) => {
      if (current && next?.endpoints.some((endpoint) => endpoint.id === current)) return current;
      return defaultEndpointId(next);
    });
    if (next) {
      const protocols = supportedProtocols(next);
      setClientProtocol((current) => protocols.includes(current) ? current : protocols[0] ?? "c2");
    } else {
      setLink(null);
    }
  }, []);

  const refresh = useCallback(() => {
    remoteStatus().then(applyStatus).catch(() => {});
    remoteDevices().then(setDevices).catch(() => {});
  }, [applyStatus]);

  useEffect(refresh, [refresh]);

  const mintLink = useCallback(
    async (endpointId: string | null, requestedProtocol = clientProtocol) => {
      const request = ++linkRequest.current;
      setLinkBusy(true);
      setErr(null);
      try {
        const next = await remotePairingLink(endpointId ?? undefined, requestedProtocol);
        if (request !== linkRequest.current) return;
        setLink(next);
        if (next) setSelectedEndpointId(next.endpoint_id);
        setCopied(false);
      } catch (error) {
        if (request === linkRequest.current) setErr(String(error));
      } finally {
        if (request === linkRequest.current) setLinkBusy(false);
      }
    },
    [clientProtocol],
  );

  const turnOn = async () => {
    setBusy(true);
    setErr(null);
    try {
      const next = await startRemote();
      if (!next) {
        setErr("Device connections are only available in the desktop app.");
      } else {
        applyStatus(next);
        const protocol = supportedProtocols(next)[0] ?? "c2";
        setClientProtocol(protocol);
        await mintLink(defaultEndpointId(next), protocol);
      }
    } catch (error) {
      setErr(String(error));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setErr(null);
    linkRequest.current += 1;
    setLinkBusy(false);
    try {
      await stopRemote();
      applyStatus(null);
    } catch (error) {
      setErr(String(error));
    } finally {
      setBusy(false);
    }
  };

  const selectEndpoint = (endpointId: string) => {
    setSelectedEndpointId(endpointId);
    void mintLink(endpointId);
  };

  const selectClientProtocol = (protocol: string) => {
    if (protocol !== "c2" && protocol !== "t3" && protocol !== "legacy") return;
    setClientProtocol(protocol);
    setLink(null);
    if (status) void mintLink(selectedEndpointId, protocol);
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The URL remains selectable when clipboard permission is unavailable.
    }
  };

  const pair = async () => {
    if (!pairingUrl.trim()) return;
    setPairBusy(true);
    setErr(null);
    setPairedMessage(null);
    try {
      const result = await pairRemoteDevice(pairingUrl);
      setPairingUrl("");
      setPairedMessage(result.sync.state === "ready"
        ? `Paired with ${result.device.name}. First sync complete.`
        : result.sync.state === "disabled"
          ? `Paired with ${result.device.name}. Device Sync is off.`
          : `Paired with ${result.device.name}. Sync will retry: ${result.sync.message ?? result.sync.state}.`);
      setDevices(await remoteDevices());
    } catch (error) {
      setErr(String(error));
    } finally {
      setPairBusy(false);
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
  const protocols = status ? supportedProtocols(status) : ["c2" as const];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Device connections</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 rounded-module border p-3">
          <p className="text-ui font-medium">Pair this C2 with another device</p>
          <p className="text-hint leading-relaxed text-muted-foreground">
            Paste a one-time link created on the other C2 device. Conversations, projects, and saved memory sync after pairing.
          </p>
          <div className="flex gap-2">
            <Input
              value={pairingUrl}
              placeholder="http://device:4599/pair#token=…"
              aria-label="C2 pairing link"
              onChange={(event) => setPairingUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && pairingUrl.trim() && !pairBusy) void pair();
              }}
            />
            <Button disabled={!pairingUrl.trim() || pairBusy} onClick={() => void pair()}>
              {pairBusy ? "Pairing…" : "Pair"}
            </Button>
          </div>
          {pairedMessage && <p className="text-hint text-foreground">{pairedMessage}</p>}
        </div>

        {status ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-ui">
                <span className="mr-2 inline-block size-2 rounded-full bg-green-500 align-middle" />
                Incoming connections are on — port {status.port}
              </p>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void turnOff()}>
                Turn off
              </Button>
            </div>

            {protocols.length > 1 && (
              <div className="space-y-1.5">
                <label id="remote-client-label" className="text-ui font-medium">Client</label>
                <Select value={clientProtocol} onValueChange={(value) => value && selectClientProtocol(value)}>
                  <SelectTrigger className="w-full" aria-labelledby="remote-client-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {protocols.map((protocol) => (
                        <SelectItem key={protocol} value={protocol}>{protocolLabel(protocol)}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label id="remote-endpoint-label" className="text-ui font-medium">Pairing address</label>
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
                  <SelectGroup>
                    {status.endpoints.map((endpoint) => (
                      <SelectItem key={endpoint.id} value={endpoint.id}>{endpoint.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p id="remote-endpoint-help" className="text-hint text-muted-foreground">
                {endpointHelp(selectedEndpoint)}
              </p>
            </div>

            {link ? (
              <div className="space-y-2 rounded-module border p-3" aria-busy={linkBusy}>
                <p className="text-hint text-muted-foreground">
                  {clientProtocol === "c2"
                    ? "Paste this complete link into Device connections on the other C2 device. "
                    : clientProtocol === "t3"
                      ? linkEndpoint?.qr_shareable
                        ? "Scan this inside T3 Code mobile. "
                        : "Choose a LAN or verified tailnet address for T3 Code mobile. "
                      : "Open this link in the C2 browser client. "}
                  The link is one-time and expires in {Math.round(link.expires_in / 60)} minutes.
                </p>
                {link.qr_svg && (
                  <div className="mx-auto w-fit rounded-control bg-white p-2">
                    <img
                      className="block size-44"
                      alt="Pairing QR code"
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(link.qr_svg)}`}
                    />
                  </div>
                )}
                <div className="break-all rounded-control bg-primary/10 px-3 py-2 font-mono text-hint">{link.url}</div>
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
              Allow another C2 device, T3 Code mobile, or a browser remote to connect over the same LAN or Tailscale tailnet. Access requires a short-lived, one-time link and can be revoked at any time.
            </p>
            <Button disabled={busy} onClick={() => void turnOn()}>
              {busy ? "Starting…" : "Allow incoming connections"}
            </Button>
          </>
        )}

        {devices.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-ui font-medium">Paired devices</p>
            {devices.map((device) => (
              <div key={device.id} className="flex items-center justify-between rounded-control border px-3 py-1.5">
                <div>
                  <p className="text-ui">{device.name}</p>
                  <p className="text-hint text-muted-foreground">
                    {device.direction === "outgoing"
                      ? "Syncs with this C2"
                      : device.protocol === "c2"
                        ? "Can sync into this C2"
                        : "Can control this C2"} · paired{" "}
                    {new Date(device.created_at * 1000).toLocaleDateString()} · last seen{" "}
                    {new Date(device.last_seen * 1000).toLocaleString()}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void revoke(device.id)}>
                  {device.direction === "outgoing" ? "Disconnect" : "Revoke"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {err && <p className="text-hint text-destructive">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
