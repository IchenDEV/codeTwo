use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};

use codetwo_core::provider::default_registry;
use codetwo_core::skill::{builtin_skills, SkillLibrary};
use codetwo_core::{
    Engine, Event, Op, Provider, RunSnapshot, SnapshotChangeKind, SnapshotComparison,
    SnapshotConfig, SnapshotPreparation, SnapshotPreparationOptions, Store, StoreError, TaskStatus,
    WorkArtifactError, WorkArtifactService, WorkMutationGuard, WorkspaceKind, WorkspaceSnapshot,
    WorkspaceSnapshotService,
};
use codetwo_protocol::{
    read_json, write_json, ChangeSummary, EnvelopeError, ErrorKind, EventEnvelope, OwnerState,
    Request, RequestEnvelope, ResetReason, Response, ResponseEnvelope, RollbackReceipt,
    RunStartReceipt, ServerFrame, StreamCursor, StreamEpoch, SubscribeResult, TransportEvent,
    WorkErrorKind, WorkRequest, WorkResponse, MAX_REPLAY_EVENTS,
};
use thiserror::Error;
use tokio::net::{unix::OwnedWriteHalf, UnixListener, UnixStream};
use tokio::sync::{broadcast, watch, Mutex};
use tokio::task::JoinSet;
use uuid::Uuid;

use crate::{RuntimeOwnership, SocketIdentity};

#[derive(Debug, Error)]
pub enum DaemonError {
    #[error("ownership: {0}")]
    Ownership(#[from] crate::OwnershipError),
    #[error("I/O: {0}")]
    Io(#[from] io::Error),
    #[error("protocol: {0}")]
    Protocol(#[from] EnvelopeError),
    #[error("store: {0}")]
    Store(#[from] StoreError),
}

struct State {
    epoch: StreamEpoch,
    replay: Mutex<VecDeque<EventEnvelope>>,
    events: broadcast::Sender<EventEnvelope>,
    shutdown: watch::Sender<bool>,
    store: Arc<Store>,
    artifacts: WorkArtifactService,
    managed_workspace_root: PathBuf,
    snapshot_root: PathBuf,
    pending_snapshots: StdMutex<HashMap<String, PendingSnapshot>>,
    engine: Engine,
    engine_events: StdMutex<Option<tokio::sync::mpsc::UnboundedReceiver<Event>>>,
}

struct PendingSnapshot {
    id: String,
    task_id: String,
    snapshot: WorkspaceSnapshot,
}

pub struct Daemon {
    _ownership: RuntimeOwnership,
    listener: UnixListener,
    socket_path: PathBuf,
    socket_identity: SocketIdentity,
    state: Arc<State>,
}

impl Daemon {
    pub fn bind(runtime_dir: impl AsRef<Path>) -> Result<Self, DaemonError> {
        let runtime_dir = runtime_dir.as_ref().to_owned();
        let ownership = RuntimeOwnership::acquire(&runtime_dir)?;
        let store = Arc::new(Store::open(
            runtime_dir.join("codetwo.db").to_string_lossy().as_ref(),
        )?);
        Self::bind_owned(
            runtime_dir,
            ownership,
            store,
            default_registry(),
            SkillLibrary::new(builtin_skills()),
        )
    }

    pub fn bind_with_store(
        runtime_dir: impl AsRef<Path>,
        store: Arc<Store>,
    ) -> Result<Self, DaemonError> {
        let runtime_dir = runtime_dir.as_ref().to_owned();
        let ownership = RuntimeOwnership::acquire(&runtime_dir)?;
        Self::bind_owned(
            runtime_dir,
            ownership,
            store,
            default_registry(),
            SkillLibrary::new(builtin_skills()),
        )
    }

    pub fn bind_with_components(
        runtime_dir: impl AsRef<Path>,
        store: Arc<Store>,
        providers: Vec<Provider>,
        skills: SkillLibrary,
    ) -> Result<Self, DaemonError> {
        let runtime_dir = runtime_dir.as_ref().to_owned();
        let ownership = RuntimeOwnership::acquire(&runtime_dir)?;
        Self::bind_owned(runtime_dir, ownership, store, providers, skills)
    }

    fn bind_owned(
        runtime_dir: PathBuf,
        ownership: RuntimeOwnership,
        store: Arc<Store>,
        providers: Vec<Provider>,
        skills: SkillLibrary,
    ) -> Result<Self, DaemonError> {
        let socket_path = runtime_dir.join("daemon.sock");
        ownership.remove_stale_socket(&socket_path)?;
        let listener = UnixListener::bind(&socket_path)?;
        fs::set_permissions(&socket_path, fs::Permissions::from_mode(0o600))?;
        let socket_identity = SocketIdentity::capture(&socket_path)?;
        let epoch = StreamEpoch::new(Uuid::new_v4().simple().to_string())?;
        let ready = EventEnvelope::new(
            epoch.clone(),
            1,
            TransportEvent::OwnerLifecycle {
                state: OwnerState::Ready,
            },
        );
        let (events, _) = broadcast::channel(MAX_REPLAY_EVENTS);
        let (shutdown, _) = watch::channel(false);
        let artifacts = WorkArtifactService::new(store.clone());
        let managed_workspace_root = runtime_dir.join("workspaces");
        fs::create_dir_all(&managed_workspace_root)?;
        fs::set_permissions(&managed_workspace_root, fs::Permissions::from_mode(0o700))?;
        let snapshot_root = runtime_dir.join("snapshots");
        fs::create_dir_all(&snapshot_root)?;
        fs::set_permissions(&snapshot_root, fs::Permissions::from_mode(0o700))?;
        let (engine, engine_events) = Engine::with_store(providers, skills, store.clone());
        Ok(Self {
            _ownership: ownership,
            listener,
            socket_path,
            socket_identity,
            state: Arc::new(State {
                epoch,
                replay: Mutex::new(VecDeque::from([ready])),
                events,
                shutdown,
                store,
                artifacts,
                managed_workspace_root,
                snapshot_root,
                pending_snapshots: StdMutex::new(HashMap::new()),
                engine,
                engine_events: StdMutex::new(Some(engine_events)),
            }),
        })
    }

    pub fn socket_path(&self) -> &Path {
        &self.socket_path
    }
    pub fn epoch(&self) -> StreamEpoch {
        self.state.epoch.clone()
    }
    pub async fn publish(&self, event: TransportEvent) -> EventEnvelope {
        append(&self.state, event).await
    }
    pub async fn run(self) -> Result<(), DaemonError> {
        let mut shutdown = self.state.shutdown.subscribe();
        let mut connections = JoinSet::new();
        let engine_events = self
            .state
            .engine_events
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
            .ok_or_else(|| io::Error::other("daemon engine events already consumed"))?;
        connections.spawn(engine_event_loop(engine_events, Arc::clone(&self.state)));
        while !*shutdown.borrow() {
            tokio::select! {
                result = self.listener.accept() => { let (stream, _) = result?; connections.spawn(connection(stream, Arc::clone(&self.state))); }
                changed = shutdown.changed() => { changed.map_err(|_| io::Error::other("shutdown watch closed"))?; }
                Some(_) = connections.join_next() => {}
            }
        }
        connections.abort_all();
        while connections.join_next().await.is_some() {}
        self.socket_identity.remove_if_matches(&self.socket_path)?;
        Ok(())
    }
}
async fn append(state: &State, event: TransportEvent) -> EventEnvelope {
    let mut replay = state.replay.lock().await;
    let sequence = replay
        .back()
        .map_or(0, |item| item.sequence)
        .saturating_add(1);
    let item = EventEnvelope::new(state.epoch.clone(), sequence, event);
    if replay.len() == MAX_REPLAY_EVENTS {
        replay.pop_front();
    }
    replay.push_back(item.clone());
    let _ = state.events.send(item.clone());
    item
}
async fn snapshot(state: &State) -> (StreamCursor, Vec<EventEnvelope>) {
    let replay = state.replay.lock().await;
    let cursor = StreamCursor::new(
        state.epoch.clone(),
        replay.back().map_or(0, |item| item.sequence),
    );
    (cursor, replay.iter().cloned().collect())
}
async fn send(writer: &mut OwnedWriteHalf, id: u64, response: Response) -> bool {
    write_json(
        writer,
        &ServerFrame::response(ResponseEnvelope::new(id, response)),
    )
    .await
    .is_ok()
}
async fn send_error(
    writer: &mut OwnedWriteHalf,
    id: u64,
    kind: ErrorKind,
    message: &'static str,
) -> bool {
    send(
        writer,
        id.max(1),
        Response::Error {
            error: kind,
            message: message.into(),
        },
    )
    .await
}
async fn reset(writer: &mut OwnedWriteHalf, state: &State, next: u64) -> bool {
    let cursor = snapshot(state).await.0;
    write_json(
        writer,
        &ServerFrame::event(EventEnvelope::new(
            state.epoch.clone(),
            next,
            TransportEvent::Reset {
                reason: ResetReason::SubscriberLagged,
                cursor,
            },
        )),
    )
    .await
    .is_ok()
}

async fn connection(stream: UnixStream, state: Arc<State>) {
    let (mut reader, mut writer) = stream.into_split();
    let mut hello = false;
    let mut live: Option<broadcast::Receiver<EventEnvelope>> = None;
    let mut next = 0;
    loop {
        if let Some(receiver) = live.as_mut() {
            tokio::select! {
                result = read_json::<_, RequestEnvelope>(&mut reader) => { if !handle(result, &mut writer, &state, &mut hello, &mut live, &mut next).await { break; } }
                result = receiver.recv() => match result {
                    Ok(event) if event.sequence < next => {}
                    Ok(event) if event.epoch != state.epoch || event.sequence != next => { if !reset(&mut writer, &state, next).await { break; } live = None; }
                    Ok(event) => { if write_json(&mut writer, &ServerFrame::event(event)).await.is_err() { break; } next = next.saturating_add(1); }
                    Err(broadcast::error::RecvError::Lagged(_)) => { if !reset(&mut writer, &state, next).await { break; } live = None; }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        } else {
            let result = read_json::<_, RequestEnvelope>(&mut reader).await;
            if !handle(
                result,
                &mut writer,
                &state,
                &mut hello,
                &mut live,
                &mut next,
            )
            .await
            {
                break;
            }
        }
    }
}

async fn handle(
    result: Result<RequestEnvelope, codetwo_protocol::FrameError>,
    writer: &mut OwnedWriteHalf,
    state: &State,
    hello: &mut bool,
    live: &mut Option<broadcast::Receiver<EventEnvelope>>,
    next: &mut u64,
) -> bool {
    let request = match result {
        Ok(request) => request,
        Err(_) => return false,
    };
    if let Err(error) = request.validate() {
        let kind = match error {
            EnvelopeError::UnsupportedVersion(_) => ErrorKind::UnsupportedVersion,
            EnvelopeError::InvalidField(_) => ErrorKind::InvalidRequest,
        };
        return send_error(writer, request.request_id, kind, "invalid request").await;
    }
    if !*hello && !matches!(request.request, Request::Hello { .. }) {
        let _ = send_error(
            writer,
            request.request_id,
            ErrorKind::InvalidRequest,
            "hello required",
        )
        .await;
        return false;
    }
    match request.request {
        Request::Hello { .. } if *hello => {
            send_error(
                writer,
                request.request_id,
                ErrorKind::InvalidRequest,
                "hello already sent",
            )
            .await
        }
        Request::Hello { .. } => {
            let cursor = snapshot(state).await.0;
            if !send(
                writer,
                request.request_id,
                Response::Hello {
                    epoch: state.epoch.clone(),
                    cursor,
                },
            )
            .await
            {
                return false;
            }
            *hello = true;
            true
        }
        Request::Ping { nonce } => send(writer, request.request_id, Response::Pong { nonce }).await,
        Request::ListSessions { include_archived } => {
            let sessions = if include_archived {
                state.engine.list_archived()
            } else {
                state.engine.list_sessions()
            };
            match sessions {
                Ok(sessions) => {
                    send(writer, request.request_id, Response::Sessions { sessions }).await
                }
                Err(_) => {
                    send_error(
                        writer,
                        request.request_id,
                        ErrorKind::Internal,
                        "session snapshot failed",
                    )
                    .await
                }
            }
        }
        Request::TranscriptPage {
            session,
            before,
            limit,
        } => match state.engine.transcript_page(&session, before, limit) {
            Ok(page) => {
                send(
                    writer,
                    request.request_id,
                    Response::TranscriptPage { page },
                )
                .await
            }
            Err(_) => {
                send_error(
                    writer,
                    request.request_id,
                    ErrorKind::Internal,
                    "transcript snapshot failed",
                )
                .await
            }
        },
        Request::ReplaceSkills { skills } => {
            state.engine.set_skills(SkillLibrary::new(skills));
            send(writer, request.request_id, Response::SkillsReplaced).await
        }
        Request::Work {
            request: work_request,
        } => {
            let (response, events) = dispatch_work(state, request.request_id, work_request).await;
            for event in events {
                append(state, event).await;
            }
            send(writer, request.request_id, Response::Work { response }).await
        }
        Request::Core { op }
            if matches!(
                &op,
                Op::NewSession {
                    task_id: Some(_),
                    ..
                }
            ) =>
        {
            send_error(
                writer,
                request.request_id,
                ErrorKind::InvalidRequest,
                "Work runs must use the Work start-run request",
            )
            .await
        }
        Request::Core { op } => match state.engine.submit(op).await {
            Ok(()) => send(writer, request.request_id, Response::CoreAccepted).await,
            Err(_) => {
                send_error(
                    writer,
                    request.request_id,
                    ErrorKind::Internal,
                    "core submission failed",
                )
                .await
            }
        },
        Request::Subscribe { cursor } => {
            let receiver = state.events.subscribe();
            let (head, events) = snapshot(state).await;
            let result = cursor.map_or(
                SubscribeResult::Replay {
                    cursor: head.clone(),
                    events: events.clone(),
                },
                |cursor| {
                    if cursor.epoch != state.epoch {
                        SubscribeResult::Reset {
                            cursor: head.clone(),
                            reason: ResetReason::StreamMismatch,
                        }
                    } else if cursor.sequence > head.sequence {
                        SubscribeResult::Reset {
                            cursor: head.clone(),
                            reason: ResetReason::CursorAhead,
                        }
                    } else if events
                        .first()
                        .is_some_and(|event| event.sequence > cursor.sequence.saturating_add(1))
                    {
                        SubscribeResult::Reset {
                            cursor: head.clone(),
                            reason: ResetReason::ReplayGap,
                        }
                    } else {
                        SubscribeResult::Replay {
                            cursor: head.clone(),
                            events: events
                                .into_iter()
                                .filter(|event| event.sequence > cursor.sequence)
                                .collect(),
                        }
                    }
                },
            );
            if !send(writer, request.request_id, Response::Subscribe(result)).await {
                return false;
            }
            *next = head.sequence.saturating_add(1);
            *live = Some(receiver);
            true
        }
        Request::Shutdown => {
            if !send(writer, request.request_id, Response::Shutdown).await {
                return false;
            }
            let _ = append(
                state,
                TransportEvent::OwnerLifecycle {
                    state: OwnerState::Stopping,
                },
            )
            .await;
            state.shutdown.send_replace(true);
            false
        }
    }
}

async fn engine_event_loop(
    mut receiver: tokio::sync::mpsc::UnboundedReceiver<Event>,
    state: Arc<State>,
) {
    while let Some(event) = receiver.recv().await {
        let created_run = match &event {
            Event::SessionCreated {
                session,
                request_id,
                ..
            } => Some((session.clone(), request_id.clone())),
            _ => None,
        };
        let snapshot_result = created_run.as_ref().and_then(|(run_id, request_id)| {
            let request_id = request_id.as_ref()?;
            let pending = state
                .pending_snapshots
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .remove(request_id)?;
            let record = RunSnapshot {
                id: pending.id,
                task_id: pending.task_id,
                run_id: run_id.clone(),
                storage_path: pending
                    .snapshot
                    .snapshot_root
                    .to_string_lossy()
                    .into_owned(),
                manifest: pending.snapshot.manifest,
                not_covered: pending.snapshot.not_covered,
                created_at: 0,
            };
            let guard = WorkMutationGuard::new(
                None,
                "daemon",
                "local_daemon",
                format!("snapshot:{request_id}"),
            );
            Some((
                run_id.clone(),
                request_id.clone(),
                state.store.work_save_run_snapshot(record, &guard),
            ))
        });
        append(&state, TransportEvent::Core { event }).await;
        if let Some((run_id, _)) = created_run {
            if let Ok(Some(run)) = state.store.work_get_run(&run_id) {
                append(
                    &state,
                    TransportEvent::RunChanged {
                        run: run.entity,
                        revision: run.revision,
                    },
                )
                .await;
            }
        }
        match snapshot_result {
            Some((_, _, Ok(saved))) => {
                append(
                    &state,
                    TransportEvent::SnapshotPrepared {
                        snapshot_id: saved.entity.id,
                        task_id: saved.entity.task_id,
                        run_id: saved.entity.run_id,
                        file_count: u64::try_from(saved.entity.manifest.files.len())
                            .unwrap_or(u64::MAX),
                        not_covered: u64::try_from(saved.entity.not_covered.len())
                            .unwrap_or(u64::MAX),
                        revision: saved.revision,
                    },
                )
                .await;
            }
            Some((run_id, request_id, Err(_))) => {
                append(
                    &state,
                    TransportEvent::Core {
                        event: Event::Error {
                            session: Some(run_id),
                            message: "Work snapshot metadata could not be persisted".to_owned(),
                            terminal: false,
                            request_id: Some(request_id),
                        },
                    },
                )
                .await;
            }
            None => {}
        }
    }
}

async fn dispatch_work(
    state: &State,
    request_id: u64,
    request: WorkRequest,
) -> (WorkResponse, Vec<TransportEvent>) {
    match request {
        WorkRequest::ListWorkspaces { cursor, limit } => {
            match state.store.work_list_workspaces(cursor.as_deref(), limit) {
                Ok(page) => (WorkResponse::Workspaces { page }, Vec::new()),
                Err(error) => (work_error(error), Vec::new()),
            }
        }
        WorkRequest::SaveWorkspace {
            mut workspace,
            expected_revision,
        } => {
            if workspace.kind == WorkspaceKind::Managed
                && provision_managed_workspace(&state.managed_workspace_root, &mut workspace)
                    .is_err()
            {
                return (invalid_work_response(), Vec::new());
            }
            let guard = WorkMutationGuard::new(
                expected_revision,
                "local_client",
                format!("local_uid:{}", unsafe { libc::geteuid() }),
                format!("local:{request_id}"),
            );
            match state.store.work_save_workspace(&workspace, &guard) {
                Ok(item) => {
                    let event = TransportEvent::WorkspaceChanged {
                        workspace: item.entity.clone(),
                        revision: item.revision,
                    };
                    (WorkResponse::WorkspaceSaved { item }, vec![event])
                }
                Err(error) => (work_error(error), Vec::new()),
            }
        }
        WorkRequest::ListTasks {
            workspace_id,
            include_archived,
            cursor,
            limit,
        } => match state.store.work_list_tasks(
            workspace_id.as_deref(),
            include_archived,
            cursor.as_deref(),
            limit,
        ) {
            Ok(page) => (WorkResponse::Tasks { page }, Vec::new()),
            Err(error) => (work_error(error), Vec::new()),
        },
        WorkRequest::SaveTask {
            task,
            expected_revision,
        } => {
            let guard = local_guard(request_id, expected_revision);
            match state.store.work_save_task(&task, &guard) {
                Ok(item) => {
                    let event = TransportEvent::TaskChanged {
                        task: item.entity.clone(),
                        revision: item.revision,
                    };
                    (WorkResponse::TaskSaved { item }, vec![event])
                }
                Err(error) => (work_error(error), Vec::new()),
            }
        }
        WorkRequest::SubmitForReview {
            task_id,
            expected_revision,
        } => transition_task(
            state,
            request_id,
            &task_id,
            expected_revision,
            TaskStatus::Review,
        ),
        WorkRequest::AcceptTask {
            task_id,
            expected_revision,
        } => transition_task(
            state,
            request_id,
            &task_id,
            expected_revision,
            TaskStatus::Completed,
        ),
        WorkRequest::GetBrief { task_id } => match state.store.work_current_brief(&task_id) {
            Ok(brief) => (WorkResponse::Brief { brief }, Vec::new()),
            Err(error) => (work_error(error), Vec::new()),
        },
        WorkRequest::SaveBrief {
            brief,
            expected_revision,
        } => {
            let guard = local_guard(request_id, expected_revision);
            match state.store.work_save_brief(brief, &guard) {
                Ok(result) => {
                    let events = vec![
                        TransportEvent::BriefChanged {
                            brief: result.brief.entity.clone(),
                            revision: result.brief.revision,
                        },
                        TransportEvent::TaskChanged {
                            task: result.task.entity.clone(),
                            revision: result.task.revision,
                        },
                    ];
                    (WorkResponse::BriefSaved { result }, events)
                }
                Err(error) => (work_error(error), Vec::new()),
            }
        }
        WorkRequest::ListRuns {
            task_id,
            cursor,
            limit,
        } => match state
            .store
            .work_list_runs(&task_id, cursor.as_deref(), limit)
        {
            Ok(page) => (WorkResponse::Runs { page }, Vec::new()),
            Err(error) => (work_error(error), Vec::new()),
        },
        WorkRequest::StartRun {
            task_id,
            provider,
            allow_without_rollback,
        } => {
            let client_request_id = request_id;
            let task = match state.store.work_get_task(&task_id) {
                Ok(Some(task)) => task,
                Ok(None) => return (invalid_work_response(), Vec::new()),
                Err(error) => return (work_error(error), Vec::new()),
            };
            if matches!(
                task.entity.status,
                TaskStatus::Completed | TaskStatus::Cancelled
            ) {
                return (invalid_work_response(), Vec::new());
            }
            let workspace_root = match state.store.work_workspace_root_for_task(&task_id) {
                Ok(root) => root,
                Err(error) => return (work_error(error), Vec::new()),
            };
            let request_id = format!("work-run:{}", Uuid::new_v4().simple());
            let snapshot_id = Uuid::new_v4().to_string();
            let snapshot_path = state.snapshot_root.join(&snapshot_id);
            let service = WorkspaceSnapshotService::new(
                SnapshotConfig::new(&workspace_root, &snapshot_path).provider_cwd(&workspace_root),
            );
            let (snapshot_id, rollback_available, not_covered, prepared_snapshot) = match service
                .create_with_options(SnapshotPreparationOptions {
                    allow_without_rollback,
                }) {
                Ok(SnapshotPreparation::Snapshot(snapshot)) => {
                    let count = u64::try_from(snapshot.not_covered.len()).unwrap_or(u64::MAX);
                    (Some(snapshot_id), true, count, Some(snapshot))
                }
                Ok(SnapshotPreparation::NoRollback(preparation)) => (
                    None,
                    false,
                    u64::try_from(preparation.not_covered.len()).unwrap_or(u64::MAX),
                    None,
                ),
                Err(_) => return (invalid_work_response(), Vec::new()),
            };
            let mut lifecycle_events = Vec::new();
            if task.entity.status != TaskStatus::Active {
                let guard = local_guard(client_request_id, Some(task.revision));
                let active = match state.store.work_transition_task_status(
                    &task_id,
                    TaskStatus::Active,
                    &guard,
                ) {
                    Ok(active) => active,
                    Err(error) => {
                        if rollback_available {
                            let _ = fs::remove_dir_all(&snapshot_path);
                        }
                        return (work_error(error), Vec::new());
                    }
                };
                lifecycle_events.push(TransportEvent::TaskChanged {
                    task: active.entity,
                    revision: active.revision,
                });
            }
            if let Some(snapshot) = prepared_snapshot {
                state
                    .pending_snapshots
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .insert(
                        request_id.clone(),
                        PendingSnapshot {
                            id: snapshot_id.clone().unwrap_or_default(),
                            task_id: task_id.clone(),
                            snapshot,
                        },
                    );
            }
            let submission = state
                .engine
                .submit(Op::NewSession {
                    provider,
                    cwd: workspace_root.to_string_lossy().into_owned(),
                    use_worktree: false,
                    worktree_base: None,
                    worktree_base_sha: None,
                    request_id: Some(request_id.clone()),
                    initial_policy: None,
                    task_id: Some(task_id),
                })
                .await;
            if submission.is_err() {
                state
                    .pending_snapshots
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .remove(&request_id);
                if rollback_available {
                    let _ = fs::remove_dir_all(&snapshot_path);
                }
                return (invalid_work_response(), lifecycle_events);
            }
            (
                WorkResponse::RunStarted {
                    receipt: RunStartReceipt {
                        request_id,
                        snapshot_id,
                        rollback_available,
                        not_covered,
                    },
                },
                lifecycle_events,
            )
        }
        WorkRequest::InspectRunChanges { run_id } => {
            let record = match state.store.work_snapshot_for_run(&run_id) {
                Ok(Some(record)) => record,
                Ok(None) => return (invalid_work_response(), Vec::new()),
                Err(error) => return (work_error(error), Vec::new()),
            };
            let workspace_root = match state.store.work_workspace_root_for_task(&record.task_id) {
                Ok(root) => root,
                Err(error) => return (work_error(error), Vec::new()),
            };
            let workspace_root = fs::canonicalize(&workspace_root).unwrap_or(workspace_root);
            let mut snapshot = match WorkspaceSnapshot::load(&record.storage_path, &workspace_root)
            {
                Ok(snapshot) if snapshot.manifest == record.manifest => snapshot,
                _ => return (invalid_work_response(), Vec::new()),
            };
            snapshot.not_covered = record.not_covered.clone();
            let service = WorkspaceSnapshotService::new(
                SnapshotConfig::new(&workspace_root, &record.storage_path)
                    .provider_cwd(&workspace_root),
            );
            let comparison = match service.compare(&snapshot) {
                Ok(comparison) => comparison,
                Err(_) => return (invalid_work_response(), Vec::new()),
            };
            let guard = local_guard(request_id, None);
            let saved =
                match state
                    .store
                    .work_save_run_changes(&record.id, comparison.changes, &guard)
                {
                    Ok(saved) => saved,
                    Err(error) => return (work_error(error), Vec::new()),
                };
            let saved_changes = saved
                .iter()
                .map(|item| item.entity.change.clone())
                .collect::<Vec<_>>();
            let summary = change_summary(record.id, &saved_changes, comparison.not_covered.len());
            (
                WorkResponse::ChangeSummary {
                    summary: summary.clone(),
                },
                vec![TransportEvent::ChangeSetPrepared { summary }],
            )
        }
        WorkRequest::ListChanges {
            snapshot_id,
            cursor,
            limit,
        } => match state
            .store
            .work_list_changes(&snapshot_id, cursor.as_deref(), limit)
        {
            Ok(page) => (WorkResponse::Changes { page }, Vec::new()),
            Err(error) => (work_error(error), Vec::new()),
        },
        WorkRequest::RollbackRun {
            run_id,
            snapshot_id,
            paths,
        } => {
            let record = match state.store.work_snapshot_for_run(&run_id) {
                Ok(Some(record)) if record.id == snapshot_id => record,
                Ok(_) => return (invalid_work_response(), Vec::new()),
                Err(error) => return (work_error(error), Vec::new()),
            };
            let workspace_root = match state.store.work_workspace_root_for_task(&record.task_id) {
                Ok(root) => root,
                Err(error) => return (work_error(error), Vec::new()),
            };
            let workspace_root = fs::canonicalize(&workspace_root).unwrap_or(workspace_root);
            let mut snapshot = match WorkspaceSnapshot::load(&record.storage_path, &workspace_root)
            {
                Ok(snapshot) if snapshot.manifest == record.manifest => snapshot,
                _ => return (invalid_work_response(), Vec::new()),
            };
            snapshot.not_covered = record.not_covered;
            let service = WorkspaceSnapshotService::new(
                SnapshotConfig::new(&workspace_root, &record.storage_path)
                    .provider_cwd(&workspace_root),
            );
            let mut changes = Vec::new();
            let mut cursor = None;
            loop {
                let page = match state
                    .store
                    .work_list_changes(&record.id, cursor.as_deref(), 100)
                {
                    Ok(page) => page,
                    Err(error) => return (work_error(error), Vec::new()),
                };
                changes.extend(page.items.into_iter().map(|item| item.entity.change));
                cursor = page.next_cursor;
                if cursor.is_none() {
                    break;
                }
            }
            let comparison = SnapshotComparison {
                changes,
                not_covered: snapshot.not_covered.clone(),
            };
            let report = match paths {
                Some(paths) => service.rollback_paths(&snapshot, &comparison, &paths),
                None => service.rollback(&snapshot, &comparison),
            };
            let report = match report {
                Ok(report) => report,
                Err(_) => return (invalid_work_response(), Vec::new()),
            };
            let receipt = RollbackReceipt {
                snapshot_id,
                restored: u64::try_from(report.restored.len()).unwrap_or(u64::MAX),
                removed: u64::try_from(report.removed.len()).unwrap_or(u64::MAX),
                not_covered: u64::try_from(report.not_covered.len()).unwrap_or(u64::MAX),
                conflicts: u64::try_from(report.conflicts.len()).unwrap_or(u64::MAX),
            };
            (
                WorkResponse::RollbackCompleted {
                    receipt: receipt.clone(),
                },
                vec![TransportEvent::RollbackCompleted { receipt }],
            )
        }
        WorkRequest::RegisterDeliverable {
            task_id,
            run_id,
            path,
        } => {
            let guard = local_guard(request_id, None);
            match state.artifacts.register(&task_id, &run_id, &path, &guard) {
                Ok(result) => {
                    let mut events = Vec::new();
                    if result.changed {
                        if let Some(retired) = result.retired {
                            events.push(TransportEvent::DeliverableChanged {
                                deliverable: retired.entity,
                                revision: retired.revision,
                            });
                        }
                        events.push(TransportEvent::DeliverableChanged {
                            deliverable: result.item.entity.clone(),
                            revision: result.item.revision,
                        });
                    }
                    (
                        WorkResponse::DeliverableRegistered { item: result.item },
                        events,
                    )
                }
                Err(error) => (work_artifact_error(error), Vec::new()),
            }
        }
        WorkRequest::ListDeliverables {
            task_id,
            cursor,
            limit,
        } => match state
            .store
            .work_list_deliverables(&task_id, cursor.as_deref(), limit)
        {
            Ok(page) => (WorkResponse::Deliverables { page }, Vec::new()),
            Err(error) => (work_error(error), Vec::new()),
        },
    }
}

fn provision_managed_workspace(
    root: &Path,
    workspace: &mut codetwo_core::Workspace,
) -> io::Result<()> {
    let directory = Uuid::parse_str(&workspace.id)
        .map(|id| id.to_string())
        .map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "managed Workspace id must be a UUID",
            )
        })?;
    let workspace_dir = root.join(directory);
    let files = workspace_dir.join("files");
    if let Some(configured) = workspace.root_path.as_deref() {
        if Path::new(configured) != files {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "managed Workspace root does not match its service-owned directory",
            ));
        }
    }
    for path in [&workspace_dir, &files] {
        if fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "managed Workspace directory must not be a symlink",
            ));
        }
    }
    fs::create_dir_all(&files)?;
    fs::set_permissions(&workspace_dir, fs::Permissions::from_mode(0o700))?;
    fs::set_permissions(&files, fs::Permissions::from_mode(0o700))?;
    let canonical_root = fs::canonicalize(root)?;
    let canonical_files = fs::canonicalize(&files)?;
    if !canonical_files.starts_with(&canonical_root) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "managed Workspace escaped its service-owned directory",
        ));
    }
    workspace.root_path = Some(canonical_files.to_string_lossy().into_owned());
    Ok(())
}

fn transition_task(
    state: &State,
    request_id: u64,
    task_id: &str,
    expected_revision: u64,
    target: TaskStatus,
) -> (WorkResponse, Vec<TransportEvent>) {
    let guard = local_guard(request_id, Some(expected_revision));
    match state
        .store
        .work_transition_task_status(task_id, target, &guard)
    {
        Ok(item) => {
            let event = TransportEvent::TaskChanged {
                task: item.entity.clone(),
                revision: item.revision,
            };
            (WorkResponse::TaskTransitioned { item }, vec![event])
        }
        Err(error) => (work_error(error), Vec::new()),
    }
}

fn local_guard(request_id: u64, expected_revision: Option<u64>) -> WorkMutationGuard {
    WorkMutationGuard::new(
        expected_revision,
        "local_client",
        format!("local_uid:{}", unsafe { libc::geteuid() }),
        format!("local:{request_id}"),
    )
}

fn invalid_work_response() -> WorkResponse {
    WorkResponse::Error {
        error: WorkErrorKind::InvalidRequest,
        message: "invalid Work request".to_owned(),
        current_revision: None,
    }
}

fn change_summary(
    snapshot_id: String,
    changes: &[codetwo_core::SnapshotChange],
    not_covered: usize,
) -> ChangeSummary {
    let mut summary = ChangeSummary {
        snapshot_id,
        added: 0,
        modified: 0,
        deleted: 0,
        not_covered: u64::try_from(not_covered).unwrap_or(u64::MAX),
    };
    for change in changes {
        match change.kind {
            SnapshotChangeKind::Added => summary.added += 1,
            SnapshotChangeKind::Modified => summary.modified += 1,
            SnapshotChangeKind::Deleted => summary.deleted += 1,
        }
    }
    summary
}

fn work_error(error: StoreError) -> WorkResponse {
    match error {
        StoreError::WorkConflict {
            current_revision, ..
        } => WorkResponse::Error {
            error: WorkErrorKind::RevisionConflict,
            message: "Work revision conflict".to_owned(),
            current_revision,
        },
        StoreError::Domain(_) => WorkResponse::Error {
            error: WorkErrorKind::InvalidRequest,
            message: "invalid Work request".to_owned(),
            current_revision: None,
        },
        _ => WorkResponse::Error {
            error: WorkErrorKind::Store,
            message: "Work store unavailable".to_owned(),
            current_revision: None,
        },
    }
}

fn work_artifact_error(error: WorkArtifactError) -> WorkResponse {
    match error {
        WorkArtifactError::Store(error) => work_error(error),
        WorkArtifactError::Invalid(_)
        | WorkArtifactError::UnsafePath(_)
        | WorkArtifactError::Unsupported(_)
        | WorkArtifactError::Changed
        | WorkArtifactError::Io { .. } => WorkResponse::Error {
            error: WorkErrorKind::InvalidRequest,
            message: "invalid Work request".to_owned(),
            current_revision: None,
        },
    }
}
