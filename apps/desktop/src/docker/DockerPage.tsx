import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { SearchField } from "@/components/business/search-field";
import { StatusIndicator } from "@/components/business/status-indicator";
import { ActivityOrb } from "@/components/ui/activity-orb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CircleAlert,
  Info,
  ListRestart,
  Logs,
  PackagePlus,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useT } from "../i18n";
import { useToast } from "../ui/toast";

export type DockerCommandCaller = <T = unknown>(
  name: string,
  args?: unknown
) => Promise<T>;

interface DockerStatus {
  available: boolean;
  serverVersion: string | null;
  context: string | null;
  containers: {
    total: number;
    running: number;
    paused: number;
    stopped: number;
  };
  images: number;
}

interface DockerContainer {
  id: string | null;
  name: string | null;
  image: string | null;
  ports: string | null;
  state: string | null;
  status: string | null;
}

interface DockerImage {
  id: string | null;
  repository: string | null;
  tag: string | null;
  digest: string | null;
  createdSince: string | null;
  size: string | null;
  containers: number;
}

interface DetailState {
  title: string;
  description: string;
  content: string | null;
  loading: boolean;
}

function display(value: string | null | undefined): string {
  return value != null && value !== "" && value !== "<none>" ? value : "—";
}

function shortId(value: string | null): string {
  return display(value?.replace(/^sha256:/u, "").slice(0, 12));
}

function imageReference(image: DockerImage): string {
  if (
    image.repository != null &&
    image.repository !== "" &&
    image.repository !== "<none>"
  ) {
    return image.tag != null && image.tag !== "" && image.tag !== "<none>"
      ? `${image.repository}:${image.tag}`
      : image.repository;
  }
  return image.id ?? "";
}

function ActionButton({
  label,
  busy,
  onClick,
  children,
}: {
  readonly label: string;
  readonly busy?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <TooltipButton
      label={label}
      variant="ghost"
      size="icon-sm"
      disabled={busy}
      onClick={onClick}
    >
      {busy === true ? (
        <ActivityOrb state="working" visualSize={14} aria-hidden="true" />
      ) : (
        children
      )}
    </TooltipButton>
  );
}

export function DockerPage({
  enabled,
  callCommand,
  onOpenPluginManager,
  headerLeadingAction,
}: {
  readonly enabled: boolean;
  readonly callCommand: DockerCommandCaller;
  readonly onOpenPluginManager: () => void;
  readonly headerLeadingAction?: ReactNode;
}) {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState<DockerStatus | null>(null);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [pullReference, setPullReference] = useState("");
  const [removeTarget, setRemoveTarget] = useState<DockerImage | null>(null);

  const refresh = async () => {
    if (!enabled) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, nextContainers, nextImages] = await Promise.all([
        callCommand<DockerStatus>("docker.status", {}),
        callCommand<{ containers: DockerContainer[] }>("docker.containers", {
          all: true,
          limit: 500,
        }),
        callCommand<{ images: DockerImage[] }>("docker.images", {
          all: false,
          limit: 500,
        }),
      ]);
      setStatus(nextStatus);
      setContainers(nextContainers.containers);
      setImages(nextImages.images);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredContainers = normalizedQuery
    ? containers.filter((container) =>
        `${container.name ?? ""}\n${container.image ?? ""}\n${container.state ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : containers;
  const filteredImages = normalizedQuery
    ? images.filter((image) =>
        `${image.repository ?? ""}\n${image.tag ?? ""}\n${image.id ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : images;

  const runContainerAction = async (
    action: "start" | "stop" | "restart",
    container: DockerContainer
  ) => {
    const name = container.name ?? container.id;
    if (name == null || name === "") {
      return;
    }
    const key = `${action}:${name}`;
    setBusyAction(key);
    try {
      await callCommand(`docker.${action}`, { container: name });
      const messageKey =
        action === "start"
          ? "docker.startedToast"
          : action === "stop"
            ? "docker.stoppedToast"
            : "docker.restartedToast";
      toast(t(messageKey, { name }), "success");
      await refresh();
    } catch (cause) {
      toast(t("docker.commandFailed", { error: String(cause) }), "error");
    } finally {
      setBusyAction(null);
    }
  };

  const showInspect = async (container: DockerContainer) => {
    const name = container.name ?? container.id;
    if (name == null || name === "") {
      return;
    }
    setDetail({
      content: null,
      description: t("docker.inspectDescription"),
      loading: true,
      title: t("docker.inspectTitle", { name }),
    });
    try {
      const result = await callCommand<{ details: unknown }>("docker.inspect", {
        container: name,
      });
      setDetail((current) =>
        current
          ? {
              ...current,
              content: JSON.stringify(result.details, null, 2),
              loading: false,
            }
          : null
      );
    } catch (cause) {
      setDetail((current) =>
        current ? { ...current, content: String(cause), loading: false } : null
      );
    }
  };

  const showLogs = async (container: DockerContainer) => {
    const name = container.name ?? container.id;
    if (name == null || name === "") {
      return;
    }
    setDetail({
      content: null,
      description: t("docker.logsDescription"),
      loading: true,
      title: t("docker.logsTitle", { name }),
    });
    try {
      const result = await callCommand<{ stdout: string; stderr: string }>(
        "docker.logs",
        {
          container: name,
          tail: 200,
          timestamps: true,
        }
      );
      setDetail((current) =>
        current
          ? {
              ...current,
              content: [result.stdout, result.stderr]
                .filter(Boolean)
                .join("\n"),
              loading: false,
            }
          : null
      );
    } catch (cause) {
      setDetail((current) =>
        current ? { ...current, content: String(cause), loading: false } : null
      );
    }
  };

  const pullImage = async () => {
    const image = pullReference.trim();
    if (!image) {
      return;
    }
    setBusyAction("pull");
    try {
      await callCommand("docker.pull", { image });
      setPullReference("");
      toast(t("docker.pulled", { name: image }), "success");
      await refresh();
    } catch (cause) {
      toast(t("docker.commandFailed", { error: String(cause) }), "error");
    } finally {
      setBusyAction(null);
    }
  };

  const removeImage = async () => {
    if (!removeTarget) {
      return;
    }
    const image = imageReference(removeTarget);
    if (!image) {
      return;
    }
    setBusyAction(`remove:${image}`);
    try {
      await callCommand("docker.remove_image", { image });
      setRemoveTarget(null);
      toast(t("docker.removed", { name: image }), "success");
      await refresh();
    } catch (cause) {
      toast(t("docker.commandFailed", { error: String(cause) }), "error");
    } finally {
      setBusyAction(null);
    }
  };

  if (!enabled) {
    return (
      <section
        className="animate-data-page-in bg-background flex min-h-0 min-w-0 flex-1 flex-col"
        aria-label={t("docker.title")}
      >
        <header className="electrobun-webkit-app-region-drag flex shrink-0 items-center gap-2 px-4 py-2.5">
          {headerLeadingAction}
          <h1 className="text-dialog font-semibold">{t("docker.title")}</h1>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <CircleAlert className="text-warning size-5" />
          <h2 className="text-section font-semibold">
            {t("docker.unavailableTitle")}
          </h2>
          <p className="text-prose text-muted-foreground max-w-md">
            {t("docker.unavailableHint")}
          </p>
          <Button
            variant="secondary"
            size="compact"
            onClick={onOpenPluginManager}
          >
            {t("docker.openPlugins")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="animate-data-page-in bg-background text-foreground flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label={t("docker.title")}
    >
      <header className="electrobun-webkit-app-region-drag flex shrink-0 items-center gap-3 px-4 py-2.5">
        {headerLeadingAction}
        <h1 className="text-dialog font-semibold">{t("docker.title")}</h1>
        {status ? (
          <StatusIndicator
            tone="success"
            label={`Docker ${status.serverVersion ?? "—"} · ${status.context ?? "—"}`}
          />
        ) : null}
        <div className="electrobun-webkit-app-region-drag flex-1" />
        <Button
          variant="secondary"
          size="compact"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? (
            <Spinner className="size-3.5" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {t("docker.refresh")}
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-7xl px-5 pt-5 pb-10 sm:px-8">
          {status ? (
            <div
              className="text-body text-muted-foreground mb-5 flex flex-wrap items-center gap-x-2 gap-y-1"
              aria-live="polite"
            >
              <span>
                {t("docker.runningSummary", {
                  count: status.containers.running,
                })}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t("docker.stoppedSummary", {
                  count: status.containers.stopped,
                })}
              </span>
              <span aria-hidden="true">·</span>
              <span>{t("docker.imagesSummary", { count: status.images })}</span>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-control bg-destructive/10 text-body text-destructive mb-5 flex items-center gap-3 px-4 py-3"
            >
              <CircleAlert className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">
                {t("docker.loadFailed", { error })}
              </span>
              <Button
                variant="outline"
                size="compact"
                onClick={() => void refresh()}
              >
                {t("docker.retry")}
              </Button>
            </div>
          ) : null}

          <Tabs
            defaultValue="containers"
            onValueChange={() => setQuery("")}
            className="flex-col"
          >
            <TabsList variant="line" className="mb-5">
              <TabsTrigger value="containers">
                {t("docker.containers")}
              </TabsTrigger>
              <TabsTrigger value="images">{t("docker.images")}</TabsTrigger>
            </TabsList>

            <TabsContent value="containers">
              <SearchField
                className="mb-4 max-w-lg"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                label={t("docker.filterContainers")}
                placeholder={t("docker.filterContainers")}
              />
              <div className="rounded-control bg-fill-quiet overflow-x-auto">
                <table className="text-body w-full min-w-3xl border-collapse text-left">
                  <thead className="bg-fill-quiet text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.name")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.image")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.state")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.ports")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-medium"
                      >
                        {t("docker.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {filteredContainers.map((container) => {
                      const name = container.name ?? container.id ?? "—";
                      const isRunning = container.state === "running";
                      const isPaused = container.state === "paused";
                      return (
                        <tr
                          key={container.id ?? name}
                          className="hover:bg-accent/20"
                        >
                          <th scope="row" className="px-4 py-3 font-medium">
                            {name}
                          </th>
                          <td
                            className="text-callout max-w-72 truncate px-4 py-3 font-mono"
                            title={container.image ?? undefined}
                          >
                            {display(container.image)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={cn(
                                  "size-2 rounded-full",
                                  isRunning
                                    ? "bg-success"
                                    : isPaused
                                      ? "bg-warning"
                                      : "bg-muted-foreground/60"
                                )}
                                aria-hidden="true"
                              />
                              {isRunning
                                ? t("docker.running")
                                : isPaused
                                  ? t("docker.paused")
                                  : t("docker.stopped")}
                            </span>
                          </td>
                          <td
                            className="text-callout text-muted-foreground max-w-60 truncate px-4 py-3 font-mono"
                            title={container.ports ?? undefined}
                          >
                            {display(container.ports)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-0.5">
                              <ActionButton
                                label={t("docker.logs")}
                                onClick={() => void showLogs(container)}
                              >
                                <Logs className="size-4" />
                              </ActionButton>
                              <ActionButton
                                label={t("docker.inspect")}
                                onClick={() => void showInspect(container)}
                              >
                                <Info className="size-4" />
                              </ActionButton>
                              {isRunning ? (
                                <ActionButton
                                  label={t("docker.stop")}
                                  busy={busyAction === `stop:${name}`}
                                  onClick={() =>
                                    void runContainerAction("stop", container)
                                  }
                                >
                                  <Square className="size-3.5" />
                                </ActionButton>
                              ) : (
                                <ActionButton
                                  label={t("docker.start")}
                                  busy={busyAction === `start:${name}`}
                                  onClick={() =>
                                    void runContainerAction("start", container)
                                  }
                                >
                                  <Play className="size-4" />
                                </ActionButton>
                              )}
                              <ActionButton
                                label={t("docker.restart")}
                                busy={busyAction === `restart:${name}`}
                                onClick={() =>
                                  void runContainerAction("restart", container)
                                }
                              >
                                <ListRestart className="size-4" />
                              </ActionButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!loading && filteredContainers.length === 0 ? (
                  <div className="text-body text-muted-foreground px-5 py-12 text-center">
                    {query
                      ? t("docker.noContainerMatches")
                      : t("docker.emptyContainers")}
                  </div>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="images">
              <form
                className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  void pullImage();
                }}
              >
                <label className="text-body min-w-0 flex-1 font-medium">
                  <span className="mb-1.5 block">
                    {t("docker.imageReference")}
                  </span>
                  <Input
                    size="compact"
                    value={pullReference}
                    onChange={(event) =>
                      setPullReference(event.currentTarget.value)
                    }
                    placeholder={t("docker.pullPlaceholder")}
                    aria-invalid={
                      pullReference.trim().startsWith("-") || undefined
                    }
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  size="compact"
                  disabled={busyAction === "pull"}
                >
                  {busyAction === "pull" ? (
                    <ActivityOrb state="working" visualSize={14} />
                  ) : (
                    <PackagePlus className="size-3.5" />
                  )}
                  {t("docker.pull")}
                </Button>
              </form>
              <SearchField
                className="mb-4 max-w-lg"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                label={t("docker.filterImages")}
                placeholder={t("docker.filterImages")}
              />
              <div className="rounded-control bg-fill-quiet overflow-x-auto">
                <table className="text-body w-full min-w-4xl border-collapse text-left">
                  <thead className="bg-fill-quiet text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.repository")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.tag")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.id")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.created")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.size")}
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        {t("docker.usedBy")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-medium"
                      >
                        {t("docker.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {filteredImages.map((image) => {
                      const reference = imageReference(image);
                      return (
                        <tr
                          key={image.id ?? reference}
                          className="hover:bg-accent/20"
                        >
                          <th
                            scope="row"
                            className="max-w-72 truncate px-4 py-3 font-medium"
                            title={image.repository ?? undefined}
                          >
                            {display(image.repository)}
                          </th>
                          <td className="text-callout px-4 py-3 font-mono">
                            {display(image.tag)}
                          </td>
                          <td
                            className="text-callout text-muted-foreground px-4 py-3 font-mono"
                            title={image.id ?? undefined}
                          >
                            {shortId(image.id)}
                          </td>
                          <td className="text-muted-foreground px-4 py-3">
                            {display(image.createdSince)}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {display(image.size)}
                          </td>
                          <td className="text-muted-foreground px-4 py-3 tabular-nums">
                            {image.containers}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <ActionButton
                              label={t("docker.remove")}
                              busy={busyAction === `remove:${reference}`}
                              onClick={() => setRemoveTarget(image)}
                            >
                              <Trash2 className="text-destructive size-4" />
                            </ActionButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!loading && filteredImages.length === 0 ? (
                  <div className="text-body text-muted-foreground px-5 py-12 text-center">
                    {query
                      ? t("docker.noImageMatches")
                      : t("docker.emptyImages")}
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>{detail?.description}</DialogDescription>
          </DialogHeader>
          {detail?.loading ? (
            <output className="text-body text-muted-foreground flex min-h-48 items-center justify-center gap-2">
              <ActivityOrb state="searching" visualSize={14} />
              {t("docker.loading")}
            </output>
          ) : (
            <pre className="rounded-control bg-fill-quiet text-callout max-h-96 min-h-48 overflow-auto p-4 break-words whitespace-pre-wrap">
              {detail?.content || t("docker.noOutput")}
            </pre>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyAction === null) {
            setRemoveTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("docker.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("docker.removeDescription", {
                name: removeTarget ? imageReference(removeTarget) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction?.startsWith("remove:")}>
              {t("docker.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyAction?.startsWith("remove:")}
              onClick={() => void removeImage()}
            >
              {busyAction?.startsWith("remove:") ? (
                <ActivityOrb state="working" visualSize={14} />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {t("docker.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
