use std::collections::VecDeque;
use std::fs;
use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use codetwo_core::{Store, StoreError, WorkMutationGuard};
use codetwo_protocol::{
    read_json, write_json, EnvelopeError, ErrorKind, EventEnvelope, OwnerState, Request,
    RequestEnvelope, ResetReason, Response, ResponseEnvelope, ServerFrame, StreamCursor,
    StreamEpoch, SubscribeResult, TransportEvent, WorkErrorKind, WorkRequest, WorkResponse,
    MAX_REPLAY_EVENTS,
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
        Self::bind_owned(runtime_dir, ownership, store)
    }

    pub fn bind_with_store(
        runtime_dir: impl AsRef<Path>,
        store: Arc<Store>,
    ) -> Result<Self, DaemonError> {
        let runtime_dir = runtime_dir.as_ref().to_owned();
        let ownership = RuntimeOwnership::acquire(&runtime_dir)?;
        Self::bind_owned(runtime_dir, ownership, store)
    }

    fn bind_owned(
        runtime_dir: PathBuf,
        ownership: RuntimeOwnership,
        store: Arc<Store>,
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
        Request::Work {
            request: work_request,
        } => {
            let (response, event) = dispatch_work(state, request.request_id, work_request);
            if let Some(event) = event {
                append(state, event).await;
            }
            send(writer, request.request_id, Response::Work { response }).await
        }
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

fn dispatch_work(
    state: &State,
    request_id: u64,
    request: WorkRequest,
) -> (WorkResponse, Option<TransportEvent>) {
    match request {
        WorkRequest::ListWorkspaces { cursor, limit } => {
            match state.store.work_list_workspaces(cursor.as_deref(), limit) {
                Ok(page) => (WorkResponse::Workspaces { page }, None),
                Err(error) => (work_error(error), None),
            }
        }
        WorkRequest::SaveWorkspace {
            workspace,
            expected_revision,
        } => {
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
                    (WorkResponse::WorkspaceSaved { item }, Some(event))
                }
                Err(error) => (work_error(error), None),
            }
        }
    }
}

fn work_error(error: StoreError) -> WorkResponse {
    match error {
        StoreError::WorkConflict {
            current_revision, ..
        } => WorkResponse::Error {
            error: WorkErrorKind::RevisionConflict,
            message: "workspace revision conflict".to_owned(),
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
