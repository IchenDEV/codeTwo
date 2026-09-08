import { useEffect, useRef, useState, useCallback } from "react";

import { StatusIndicator } from "@/components/business/status-indicator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  pairRemoteDevice,
  remoteDevices,
  remotePairingLink,
  remoteRevokeDevice,
  remoteStatus,
  startRemote,
  stopRemote,
} from "../bridge";
import type {
  RemoteClientProtocol,
  RemoteDevice,
  RemoteEndpoint,
  RemotePairingLink,
  RemoteStatus,
} from "../bridge";
import { useLanguage } from "../i18n";

function defaultEndpointId(status: RemoteStatus | null): string | null {
  if (!status) return null;
  return (
    status.endpoints.find(
      (endpoint) => endpoint.id.startsWith("lan-") && endpoint.qr_shareable
    )?.id ??
    status.endpoints.find((endpoint) => endpoint.qr_shareable)?.id ??
    status.endpoints[0]?.id ??
    null
  );
}

function supportedProtocols(status: RemoteStatus): RemoteClientProtocol[] {
  return status.protocols?.length == null ? ["t3", "legacy"] : status.protocols;
}

function protocolLabel(protocol: RemoteClientProtocol): string {
  if (protocol === "c2") return "C2 device sync";
  if (protocol === "t3") return "T3 Code mobile";
  return "Browser remote";
}

function endpointHelp(
  endpoint: RemoteEndpoint | undefined,
  locale = "en"
): string {
  if (locale === "zh-CN") {
    if (!endpoint) return "暂无可用配对地址。";
    if (!endpoint.qr_shareable)
      return "此地址仅限本机 C2 使用，其他设备无法访问 127.0.0.1。";
    return endpoint.id.startsWith("tailnet-")
      ? "请在 Tailscale 中确认此地址；双方须在同一网络并允许该端口。"
      : "同一局域网内的设备可使用此地址。";
  }
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
  const { locale } = useLanguage();
  const tr = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [link, setLink] = useState<RemotePairingLink | null>(null);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(
    null
  );
  const [clientProtocol, setClientProtocol] =
    useState<RemoteClientProtocol>("c2");
  const [pairingUrl, setPairingUrl] = useState("");
  const [pairedMessage, setPairedMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const linkRequest = useRef(0);

  const applyStatus = (next: RemoteStatus | null) => {
    setStatus(next);
    setSelectedEndpointId((current) => {
      if (
        current != null &&
        current !== "" &&
        next?.endpoints.some((endpoint) => endpoint.id === current) === true
      )
        return current;
      return defaultEndpointId(next);
    });
    if (next) {
      const protocols = supportedProtocols(next);
      setClientProtocol((current) =>
        protocols.includes(current) ? current : (protocols[0] ?? "c2")
      );
    } else {
      setLink(null);
    }
  };

  const refresh = useCallback(() => {
    remoteStatus()
      .then(applyStatus)
      .catch(() => {
        /* empty */
      });
    remoteDevices()
      .then(setDevices)
      .catch(() => {
        /* empty */
      });
  }, [applyStatus]);

  useEffect(refresh, [refresh]);

  const mintLink = async (
    endpointId: string | null,
    requestedProtocol = clientProtocol
  ) => {
    const request = (linkRequest.current += 1);
    setLinkBusy(true);
    setErr(null);
    try {
      const next = await remotePairingLink(
        endpointId ?? undefined,
        requestedProtocol
      );
      if (request !== linkRequest.current) return;
      setLink(next);
      if (next) setSelectedEndpointId(next.endpoint_id);
      setCopied(false);
    } catch (error) {
      if (request === linkRequest.current) setErr(String(error));
    } finally {
      if (request === linkRequest.current) setLinkBusy(false);
    }
  };

  const turnOn = async () => {
    setBusy(true);
    setErr(null);
    try {
      const next = await startRemote();
      if (next) {
        applyStatus(next);
        const protocol = supportedProtocols(next)[0] ?? "c2";
        setClientProtocol(protocol);
        await mintLink(defaultEndpointId(next), protocol);
      } else {
        setErr("Device connections are only available in the desktop app.");
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
      setPairedMessage(
        result.sync.state === "ready"
          ? `Paired with ${result.device.name}. First sync complete.`
          : result.sync.state === "disabled"
            ? `Paired with ${result.device.name}. Device Sync is off.`
            : `Paired with ${result.device.name}. Sync will retry: ${result.sync.message ?? result.sync.state}.`
      );
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

  const selectedEndpoint = status?.endpoints.find(
    (endpoint) => endpoint.id === selectedEndpointId
  );
  const linkEndpoint = status?.endpoints.find(
    (endpoint) => endpoint.id === link?.endpoint_id
  );
  const protocols = status ? supportedProtocols(status) : ["c2" as const];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr("Device connections", "设备连接")}</DialogTitle>
        </DialogHeader>

        <Card variant="flat" density="compact" className="p-3">
          <p className="text-body font-medium">
            {tr(
              "Pair this C2 with another device",
              "连接另一台 C2（此设备主动连接）"
            )}
          </p>
          <p className="text-metadata text-muted-foreground">
            {tr(
              "Paste a one-time link created on the other C2 device. Conversations, projects, and saved memory sync after pairing.",
              "粘贴另一台 C2 生成的一次性链接。配对后可同步会话、项目和已保存的记忆。下方的传入连接则供其他设备连接此机。"
            )}
          </p>
          <div className="flex gap-2">
            <Input
              value={pairingUrl}
              placeholder="http://device:4599/pair#token=…"
              aria-label={tr("C2 pairing link", "另一台 C2 的配对链接")}
              onChange={(event) => setPairingUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && pairingUrl.trim() && !pairBusy)
                  void pair();
              }}
            />
            <Button
              disabled={!pairingUrl.trim() || pairBusy}
              onClick={() => void pair()}
            >
              {pairBusy ? tr("Pairing\u2026", "正在配对…") : tr("Pair", "连接")}
            </Button>
          </div>
          {pairedMessage != null && pairedMessage !== "" && (
            <p className="text-metadata text-foreground">{pairedMessage}</p>
          )}
        </Card>

        {status ? (
          <>
            <div className="flex items-center justify-between">
              <StatusIndicator
                tone="success"
                label={`${tr("Incoming connections are on — port", "允许传入连接 · 端口")} ${status.port}`}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void turnOff()}
              >
                {tr("Turn off", "关闭传入连接")}
              </Button>
            </div>

            {protocols.length > 1 && (
              <div className="space-y-1.5">
                <label
                  id="remote-client-label"
                  className="text-body font-medium"
                >
                  {tr("Client", "客户端类型")}
                </label>
                <Select
                  value={clientProtocol}
                  onValueChange={(value) =>
                    value && selectClientProtocol(value)
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    aria-labelledby="remote-client-label"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {protocols.map((protocol) => (
                        <SelectItem key={protocol} value={protocol}>
                          {protocolLabel(protocol)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                id="remote-endpoint-label"
                className="text-body font-medium"
              >
                {tr("Pairing address", "供其他设备使用的地址")}
              </label>
              <Select
                value={selectedEndpointId ?? undefined}
                disabled={status.endpoints.length === 0}
                onValueChange={(endpointId) =>
                  endpointId != null &&
                  endpointId !== "" &&
                  selectEndpoint(endpointId)
                }
              >
                <SelectTrigger
                  className="w-full"
                  aria-labelledby="remote-endpoint-label"
                  aria-describedby="remote-endpoint-help"
                >
                  <SelectValue
                    placeholder={tr("Choose an address", "选择地址")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {status.endpoints.map((endpoint) => (
                      <SelectItem key={endpoint.id} value={endpoint.id}>
                        {endpoint.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p
                id="remote-endpoint-help"
                className="text-metadata text-muted-foreground"
              >
                {endpointHelp(selectedEndpoint, locale)}
              </p>
            </div>

            {link ? (
              <Card
                variant="flat"
                density="compact"
                className="p-3"
                aria-busy={linkBusy}
              >
                <p className="text-metadata text-muted-foreground">
                  {clientProtocol === "c2"
                    ? tr(
                        "Paste this complete link into Device connections on the other C2 device. ",
                        "在另一台 C2 的设备连接页粘贴此完整链接。"
                      )
                    : clientProtocol === "t3"
                      ? linkEndpoint?.qr_shareable === true
                        ? tr(
                            "Scan this inside T3 Code mobile. ",
                            "请使用 T3 Code 移动端扫描。"
                          )
                        : tr(
                            "Choose a LAN or verified tailnet address for T3 Code mobile. ",
                            "请为移动端选择局域网或已确认的 Tailscale 地址。"
                          )
                      : tr(
                          "Open this link in the C2 browser client. ",
                          "在 C2 浏览器客户端打开此链接。"
                        )}
                  {tr(
                    "The link is one-time and expires in",
                    "链接仅可使用一次，有效期"
                  )}{" "}
                  {Math.round(link.expires_in / 60)} {tr("minutes.", "分钟。")}
                </p>
                {link.qr_svg && (
                  <div className="rounded-control bg-qr-surface mx-auto w-fit p-2">
                    <img
                      className="block size-44"
                      alt={tr("Pairing QR code", "配对二维码")}
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(link.qr_svg)}`}
                    />
                  </div>
                )}
                <div className="rounded-control bg-fill-rest text-metadata px-3 py-2 font-mono break-all">
                  {link.url}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={linkBusy}
                    onClick={() => void copy()}
                  >
                    {copied ? (
                      <>
                        <Check data-icon="inline-start" aria-hidden />
                        {tr("Copied", "已复制")}
                      </>
                    ) : (
                      tr("Copy link", "复制链接")
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-disabled={linkBusy}
                    className="aria-disabled:opacity-50"
                    onClick={() =>
                      !linkBusy && void mintLink(selectedEndpointId)
                    }
                  >
                    {linkBusy
                      ? tr("Creating\u2026", "正在生成…")
                      : tr("New link", "重新生成链接")}
                  </Button>
                </div>
              </Card>
            ) : (
              <Button
                variant="outline"
                disabled={status.endpoints.length === 0}
                aria-disabled={linkBusy}
                className="aria-disabled:opacity-50"
                onClick={() => !linkBusy && void mintLink(selectedEndpointId)}
              >
                {linkBusy
                  ? tr("Creating\u2026", "正在生成…")
                  : tr("Create pairing link", "生成配对链接")}
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-metadata text-muted-foreground">
              {tr(
                "Allow another C2 device, T3 Code mobile, or a browser remote to connect over LAN or Tailscale with a revocable one-time link.",
                "允许其他 C2、T3 Code 移动端或浏览器通过局域网或 Tailscale 连接此机。使用短期一次性链接，可随时撤销。"
              )}
            </p>
            <Button disabled={busy} onClick={() => void turnOn()}>
              {busy
                ? tr("Starting\u2026", "正在启动…")
                : tr("Allow incoming connections", "允许其他设备连接此 C2")}
            </Button>
          </>
        )}

        {devices.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-body font-medium">
              {tr("Paired devices", "已配对设备")}
            </p>
            {devices.map((device) => (
              <div
                key={device.id}
                className="rounded-control flex items-center justify-between border px-3 py-1.5"
              >
                <div>
                  <p className="text-body">{device.name}</p>
                  <p className="text-metadata text-muted-foreground">
                    {device.direction === "outgoing"
                      ? tr("Syncs with this C2", "与此 C2 同步")
                      : device.protocol === "c2"
                        ? tr("Can sync into this C2", "可同步至此 C2")
                        : tr("Can control this C2", "可控制此 C2")}{" "}
                    · {tr("Paired", "配对时间")}{" "}
                    {new Date(device.created_at * 1000).toLocaleDateString(
                      locale
                    )}{" "}
                    · {tr("Last seen", "最近在线")}{" "}
                    {new Date(device.last_seen * 1000).toLocaleString(locale)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void revoke(device.id)}
                >
                  {device.direction === "outgoing"
                    ? "Disconnect"
                    : tr("Revoke", "撤销")}
                </Button>
              </div>
            ))}
          </div>
        )}

        {err != null && err !== "" && (
          <p className="text-metadata text-destructive">{err}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tr("Done", "完成")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
