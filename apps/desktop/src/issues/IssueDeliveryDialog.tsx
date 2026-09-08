import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { asJsonObject } from "@/lib/jsonValue";

import { useT } from "../i18n";
import {
  connectorIdentity,
  issueDeliveryApi,
  issueStageLabel,
  safeIssueLink,
} from "./issueDelivery";
import type {
  IssueConnector,
  IssueDelivery,
  IssueDeliveryApi,
  TrackerConnection,
  TrackedIssue,
} from "./issueDelivery";

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue>
            {options.find((option) => option.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function IssueConnectorSettings({
  connector,
  onOpen,
  api = issueDeliveryApi,
}: {
  connector: IssueConnector;
  onOpen: () => void;
  api?: IssueDeliveryApi;
}) {
  const t = useT();
  const tokenId = useId();
  const [token, setToken] = useState("");
  const [connection, setConnection] = useState<TrackerConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    void api<TrackerConnection>("read", {
      connector: connectorIdentity(connector),
      operation: "connection.info",
    })
      .then((value) => {
        if (!disposed) setConnection(value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [api, connector]);
  async function connect() {
    setBusy(true);
    setError(null);
    try {
      setConnection(
        await api<TrackerConnection>("connect", {
          connector: connectorIdentity(connector),
          token,
        })
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setToken("");
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api("disconnect", connectorIdentity(connector));
      setConnection(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t("issueFlow.connection")}
    >
      <h3>{t("issueFlow.connection")}</h3>
      {connection ? (
        <>
          <p>
            {connection.workspace.name} · {connection.account.name}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onOpen}>{t("issueFlow.open")}</Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              {t("issueFlow.disconnect")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor={tokenId}>{t("issueFlow.apiKey")}</FieldLabel>
            <Input
              id={tokenId}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>
          <p className="text-metadata text-muted-foreground">
            {t("issueFlow.credentialHint")}
          </p>
          <Button
            disabled={busy || !token.trim()}
            onClick={() => void connect()}
          >
            {busy ? t("issueFlow.working") : t("issueFlow.connect")}
          </Button>
        </>
      )}
      {error != null && error !== "" ? (
        <p role="alert" className="text-body text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function IssueDeliveryDialog({
  connector,
  projects,
  providers,
  repository: initialRepository,
  onOpenSession,
  onClose,
  api = issueDeliveryApi,
}: {
  connector: IssueConnector;
  projects: { path: string; name: string }[];
  providers: {
    id: string;
    display_name: string;
    available: boolean;
    enabled: boolean;
  }[];
  repository: string;
  onOpenSession: (id: string) => void;
  onClose: () => void;
  api?: IssueDeliveryApi;
}) {
  const t = useT();
  const [connection, setConnection] = useState<TrackerConnection | null>(null);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [mine, setMine] = useState(false);
  const [items, setItems] = useState<TrackedIssue[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [issue, setIssue] = useState<TrackedIssue | null>(null);
  const [runs, setRuns] = useState<IssueDelivery[]>([]);
  const [repository, setRepository] = useState(
    initialRepository || projects[0]?.path || ""
  );
  const [provider, setProvider] = useState(
    providers.find((p) => p.available && p.enabled)?.id ?? ""
  );
  const [repositoryIdentity, setRepositoryIdentity] = useState("");
  const [base, setBase] = useState("");
  const [validation, setValidation] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [newAttemptMode, setNewAttemptMode] = useState(false);
  const [doneState, setDoneState] = useState("native");
  const [message, setMessage] = useState("");
  const [acceptUpdate, setAcceptUpdate] = useState(false);
  const [permissions, setPermissions] = useState({
    push: true,
    create_pr: true,
    writeback: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRequest = useRef(0);
  const detailRequest = useRef(0);
  const runsRequest = useRef(0);
  const preferencesKey = connection
    ? `codetwo.issue-delivery.${connection.workspace.id}.${connector.connector_id}`
    : null;
  const hydratedPreferences = useRef<string | null>(null);
  useEffect(() => {
    if (
      preferencesKey === null ||
      hydratedPreferences.current === preferencesKey
    )
      return;
    hydratedPreferences.current = preferencesKey;
    try {
      const preferences = asJsonObject(
        JSON.parse(localStorage.getItem(preferencesKey) ?? "null")
      );
      if (preferences === null) return;
      if (
        !initialRepository &&
        typeof preferences.repository === "string" &&
        projects.some((project) => project.path === preferences.repository)
      )
        setRepository(preferences.repository);
      if (
        typeof preferences.provider === "string" &&
        providers.some(
          (candidate) =>
            candidate.id === preferences.provider &&
            candidate.available &&
            candidate.enabled
        )
      )
        setProvider(preferences.provider);
      if (
        typeof preferences.team === "string" &&
        connection?.teams.some(
          (candidate) => candidate.id === preferences.team
        ) === true
      )
        setTeam(preferences.team);
      const savedPermissions = asJsonObject(preferences.permissions);
      if (
        savedPermissions !== null &&
        typeof savedPermissions.push === "boolean" &&
        typeof savedPermissions.create_pr === "boolean" &&
        typeof savedPermissions.writeback === "boolean"
      ) {
        setPermissions({
          push: savedPermissions.push,
          create_pr: savedPermissions.create_pr,
          writeback: savedPermissions.writeback,
        });
      }
    } catch {
      /* Missing or invalid preferences use the visible form defaults. */
    }
  }, [connection, initialRepository, preferencesKey, projects, providers]);
  const identity = connectorIdentity(connector);
  const refresh = useCallback(async () => {
    const request = ++runsRequest.current;
    const values = await api<IssueDelivery[]>("list");
    if (request === runsRequest.current) setRuns(values);
  }, [api]);
  const loadConnection = useCallback(async () => {
    setConnection(
      await api<TrackerConnection>("read", {
        connector: {
          plugin_id: connector.plugin_id,
          connector_id: connector.connector_id,
        },
        operation: "connection.info",
      })
    );
  }, [api, connector.plugin_id, connector.connector_id]);
  useEffect(() => {
    void loadConnection().catch(() => {});
    void refresh().catch((reason: unknown) => setError(String(reason)));
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 5000);
    return () => {
      clearInterval(timer);
      runsRequest.current++;
      searchRequest.current++;
      detailRequest.current++;
    };
  }, [loadConnection, refresh]);
  useEffect(() => {
    let disposed = false;
    setBase("");
    setRepositoryIdentity("");
    if (repository)
      void api<{
        base_branch: string;
        validation_command: string;
        repository_identity: string;
      }>("repository", { path: repository })
        .then((value) => {
          if (!disposed) {
            setBase(value.base_branch);
            setValidation(value.validation_command);
            setRepositoryIdentity(value.repository_identity);
          }
        })
        .catch((reason: unknown) => {
          if (!disposed) setError(String(reason));
        });
    return () => {
      disposed = true;
    };
  }, [api, repository]);
  async function selectIssue(id: string) {
    const request = ++detailRequest.current;
    setError(null);
    try {
      const value = await api<TrackedIssue>("read", {
        connector: identity,
        operation: "issues.get",
        input: { id },
      });
      if (request === detailRequest.current) {
        setIssue(value);
        setSelectedRunId(null);
        setAcceptance(value.description);
        setDoneState("native");
        setNewAttemptMode(false);
      }
    } catch (reason) {
      if (request === detailRequest.current) setError(String(reason));
    }
  }
  async function search(more = false) {
    const request = ++searchRequest.current;
    setError(null);
    try {
      if (
        !more &&
        (query.startsWith("https://") ||
          /^[a-zA-Z][a-zA-Z0-9]*-\d+$/.test(query.trim()))
      ) {
        await selectIssue(query);
        return;
      }
      const result = await api<{
        items: TrackedIssue[];
        cursor: string | null;
      }>("read", {
        connector: identity,
        operation: "issues.list",
        input: {
          query: query.trim(),
          team_id: team === "all" ? undefined : team,
          assignee_id: mine ? connection?.account.id : undefined,
          cursor: more ? cursor : undefined,
        },
      });
      if (request === searchRequest.current) {
        setItems((previous) =>
          more ? [...previous, ...result.items] : result.items
        );
        setCursor(result.cursor);
      }
    } catch (reason) {
      if (request === searchRequest.current) setError(String(reason));
    }
  }
  const matchingRuns = issue
    ? runs.filter(
        (r) =>
          r.issue.workspace_id === issue.workspace_id &&
          r.issue.id === issue.id &&
          (r.repository_identity === repositoryIdentity ||
            r.repository === repository)
      )
    : [];
  const run =
    matchingRuns.find((candidate) => candidate.id === selectedRunId) ??
    matchingRuns.find(
      (candidate) =>
        !["merged", "closed", "cancelled"].includes(candidate.stage)
    ) ??
    matchingRuns.at(0);
  const terminal =
    run !== undefined && ["merged", "closed", "cancelled"].includes(run.stage);
  const workspaceRuns = runs.filter(
    (r) =>
      r.plugin_id === connector.plugin_id &&
      r.connector_id === connector.connector_id
  );
  async function start(newAttempt = false) {
    if (!issue) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<IssueDelivery>("start", {
        connector: identity,
        issue_id: issue.id,
        repository,
        provider,
        base_branch: base,
        acceptance,
        validation_commands: validation
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
        permissions,
        done_state_id: doneState === "native" ? null : doneState,
        new_attempt: newAttempt,
      });
      if (preferencesKey !== null) {
        try {
          localStorage.setItem(
            preferencesKey,
            JSON.stringify({ repository, provider, team, permissions })
          );
        } catch {
          /* The durable task retains the actual authorization. */
        }
      }
      await refresh();
      setSelectedRunId(result.id);
      setNewAttemptMode(false);
      if (result.session_id != null && result.session_id !== "")
        onOpenSession(result.session_id);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function action(operation: string) {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await api(operation, {
        id: run.id,
        message,
        accept_issue_update: acceptUpdate,
      });
      await refresh();
      setMessage("");
      setAcceptUpdate(false);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  const states =
    connection?.teams
      .find((candidate) => candidate.id === issue?.team_id)
      ?.states.nodes.filter((state) => state.type === "completed") ?? [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[85vh] max-h-[900px] flex-col sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {connector.name} · {t("issueFlow.open")}
          </DialogTitle>
        </DialogHeader>
        {error != null && error !== "" ? (
          <p role="alert" className="text-body text-destructive">
            {error}
          </p>
        ) : null}
        {connection ? null : (
          <IssueConnectorSettings
            connector={connector}
            api={api}
            onOpen={() =>
              void loadConnection().catch((reason: unknown) =>
                setError(String(reason))
              )
            }
          />
        )}
        <div className="grid min-h-0 gap-5 overflow-y-auto md:grid-cols-[minmax(200px,1fr)_minmax(0,2fr)]">
          <aside className="flex min-w-0 flex-col gap-3">
            <p className="text-metadata text-muted-foreground">
              {connection?.workspace.name ?? connector.name} ·{" "}
              {connection?.account.name ?? ""}
            </p>
            <Input
              aria-label={t("issueFlow.search")}
              placeholder={t("issueFlow.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void search();
              }}
            />
            <Choice
              label={t("issueFlow.team")}
              value={team}
              onChange={setTeam}
              options={[
                { value: "all", label: t("issueFlow.allTeams") },
                ...(connection?.teams ?? []).map((v) => ({
                  value: v.id,
                  label: v.name,
                })),
              ]}
            />
            <label className="flex items-center gap-2">
              <Checkbox
                checked={mine}
                onCheckedChange={(value) => setMine(value)}
              />
              {t("issueFlow.mine")}
            </label>
            <Button
              variant="secondary"
              disabled={!connection}
              onClick={() => void search()}
            >
              {t("issueFlow.searchButton")}
            </Button>
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <Button
                  key={item.id}
                  variant={issue?.id === item.id ? "secondary" : "ghost"}
                  className="justify-start"
                  onClick={() => void selectIssue(item.id)}
                >
                  <span className="truncate">
                    {item.identifier} · {item.title}
                  </span>
                </Button>
              ))}
            </div>
            {cursor != null && cursor !== "" ? (
              <Button variant="ghost" onClick={() => void search(true)}>
                {t("issueFlow.more")}
              </Button>
            ) : null}
            <h3>{t("issueFlow.recent")}</h3>
            {workspaceRuns.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setIssue(item.issue);
                  setSelectedRunId(item.id);
                  setRepository(item.repository);
                  setAcceptance(item.acceptance);
                  setNewAttemptMode(false);
                }}
              >
                <span className="truncate">
                  {item.issue.identifier} · {issueStageLabel(item.stage, t)}
                </span>
              </Button>
            ))}
          </aside>
          <section className="flex min-w-0 flex-col gap-4">
            {issue ? (
              <>
                <div>
                  <a
                    href={safeIssueLink(issue.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {issue.identifier}
                  </a>
                  <h2 className="text-heading">{issue.title}</h2>
                </div>
                <details>
                  <summary>{t("issueFlow.context")}</summary>
                  <p className="text-body whitespace-pre-wrap">
                    {issue.description}
                  </p>
                  {issue.comments.map((comment) => (
                    <div key={comment.id} className="mt-3">
                      <p>{comment.user?.name}</p>
                      <p className="text-body whitespace-pre-wrap">
                        {comment.body}
                      </p>
                    </div>
                  ))}
                  {issue.attachments.map((attachment) => (
                    <p key={attachment.id}>
                      <a
                        href={safeIssueLink(attachment.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {attachment.title}
                      </a>
                    </p>
                  ))}
                </details>
                <Choice
                  label={t("issueFlow.repository")}
                  value={repository}
                  onChange={setRepository}
                  options={[
                    ...projects.map((project) => ({
                      value: project.path,
                      label: project.name,
                    })),
                    ...(repository &&
                    !projects.some((project) => project.path === repository)
                      ? [{ value: repository, label: repository }]
                      : []),
                  ]}
                />
                {run && !newAttemptMode ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{issueStageLabel(run.stage, t)}</Badge>
                      {run.sync_pending ? (
                        <Badge variant="outline">
                          {t("issueFlow.syncPending")}
                        </Badge>
                      ) : null}
                    </div>
                    {run.error != null && run.error !== "" ? (
                      <p role="alert" className="text-body text-destructive">
                        {run.error}
                      </p>
                    ) : null}
                    {run.sync_error != null && run.sync_error !== "" ? (
                      <p
                        role="status"
                        className="text-body text-muted-foreground"
                      >
                        {t("issueFlow.syncError")} {run.sync_error}
                      </p>
                    ) : null}
                    {run.pull_request ? (
                      <a
                        href={safeIssueLink(run.pull_request.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        PR #{run.pull_request.number} · {run.pull_request.state}
                      </a>
                    ) : null}
                    {run.verification ? (
                      <details>
                        <summary>
                          {t("issueFlow.validationResults")} ·{" "}
                          {run.verification.passed
                            ? t("issueFlow.pass")
                            : t("issueFlow.fail")}
                        </summary>
                        <code>{run.verification.head}</code>
                        {run.verification.results.map((result, index) => (
                          <div key={index}>
                            <p>
                              {result.command} ·{" "}
                              {result.exit_code ?? t("issueFlow.fail")}
                            </p>
                            <pre className="text-metadata overflow-x-auto whitespace-pre-wrap">
                              {result.output}
                            </pre>
                          </div>
                        ))}
                      </details>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={
                          run.session_id == null || run.session_id === ""
                        }
                        onClick={() => {
                          if (run.session_id != null && run.session_id !== "")
                            onOpenSession(run.session_id);
                        }}
                      >
                        {t("issueFlow.openTask")}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void action("refresh")}
                      >
                        {t("issueFlow.refresh")}
                      </Button>
                      {(run.session_id == null || run.session_id === "") &&
                      !terminal ? (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void action("retry_creation")}
                        >
                          {t("issueFlow.retryCreation")}
                        </Button>
                      ) : null}
                      {terminal ? null : (
                        <Button
                          variant="destructive"
                          onClick={() => void action("cancel")}
                        >
                          {t("issueFlow.cancel")}
                        </Button>
                      )}
                    </div>
                    {terminal ? (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setNewAttemptMode(true);
                          setPermissions(run.permissions);
                          setValidation(run.validation_commands.join("\n"));
                        }}
                      >
                        {t("issueFlow.newAttempt")}
                      </Button>
                    ) : (
                      <>
                        {run.pending_issue ? (
                          <div className="flex flex-col gap-2">
                            <p>{t("issueFlow.requirementsChanged")}</p>
                            <details>
                              <summary>{t("issueFlow.changedContext")}</summary>
                              <p className="whitespace-pre-wrap">
                                {run.pending_issue.description}
                              </p>
                            </details>
                            <label className="flex items-center gap-2">
                              <Checkbox
                                checked={acceptUpdate}
                                onCheckedChange={(value) =>
                                  setAcceptUpdate(value)
                                }
                              />
                              {t("issueFlow.acceptChanges")}
                            </label>
                          </div>
                        ) : null}
                        <Textarea
                          aria-label={t("issueFlow.clarification")}
                          placeholder={t("issueFlow.clarification")}
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                        />
                        <Button
                          variant="secondary"
                          disabled={
                            busy ||
                            !message.trim() ||
                            Boolean(run.pending_issue && !acceptUpdate)
                          }
                          onClick={() => void action("continue")}
                        >
                          {t("issueFlow.continue")}
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Choice
                      label={t("issueFlow.provider")}
                      value={provider}
                      onChange={setProvider}
                      options={providers
                        .filter((p) => p.available && p.enabled)
                        .map((p) => ({ value: p.id, label: p.display_name }))}
                    />
                    <p>
                      {t("issueFlow.base")}: {base || "—"}
                    </p>
                    <Field>
                      <FieldLabel htmlFor="issue-acceptance">
                        {t("issueFlow.acceptance")}
                      </FieldLabel>
                      <Textarea
                        id="issue-acceptance"
                        value={acceptance}
                        onChange={(e) => setAcceptance(e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="issue-validation">
                        {t("issueFlow.validation")}
                      </FieldLabel>
                      <Textarea
                        id="issue-validation"
                        value={validation}
                        onChange={(e) => setValidation(e.target.value)}
                      />
                    </Field>
                    <p className="text-metadata text-muted-foreground">
                      {t("issueFlow.validationHint")}
                    </p>
                    <div className="flex flex-col gap-2">
                      {(["push", "create_pr", "writeback"] as const).map(
                        (key) => (
                          <label key={key} className="flex items-center gap-2">
                            <Checkbox
                              checked={permissions[key]}
                              onCheckedChange={(value) =>
                                setPermissions((current) => ({
                                  ...current,
                                  [key]: value,
                                }))
                              }
                            />
                            {t(
                              key === "push"
                                ? "issueFlow.allowPush"
                                : key === "create_pr"
                                  ? "issueFlow.allowPr"
                                  : "issueFlow.allowWriteback"
                            )}
                          </label>
                        )
                      )}
                    </div>
                    <Choice
                      label={t("issueFlow.doneState")}
                      value={doneState}
                      onChange={setDoneState}
                      options={[
                        { value: "native", label: t("issueFlow.nativeState") },
                        ...states.map((state) => ({
                          value: state.id,
                          label: state.name,
                        })),
                      ]}
                    />
                    <p className="text-metadata text-muted-foreground">
                      {t("issueFlow.startHint")}
                    </p>
                    <Button
                      disabled={
                        busy ||
                        !connection ||
                        !repository ||
                        !provider ||
                        !base ||
                        !acceptance.trim() ||
                        !validation.trim()
                      }
                      onClick={() => void start(newAttemptMode)}
                    >
                      {busy ? t("issueFlow.working") : t("issueFlow.start")}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <p className="text-body text-muted-foreground">
                {t("issueFlow.selectIssue")}
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
