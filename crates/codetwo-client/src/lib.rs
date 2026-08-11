//! A small, strict client for the local CodeTwo Unix-domain transport.
//!
//! The client exposes typed Hello, Ping, and one direct event subscription
//! seam. `subscribe(None)` requests replay from the beginning of the current
//! stream; an explicit cursor requests only the events after that cursor. It
//! does not know about work/session/core payloads and it never sends a
//! shutdown request when dropped.

use std::collections::HashMap;
use std::fmt;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

use codetwo_protocol::{
    read_json, write_json, BriefRevision, BriefSaveResult, ChangeSummary, Deliverable,
    EventEnvelope, Op, Request, RequestEnvelope, ResetReason, Response, ResponseEnvelope,
    RollbackReceipt, Run, RunChange, RunStartReceipt, ServerFrame, Session, Skill, StreamCursor,
    StreamEpoch, SubscribeResult, Task, TranscriptCursor, TranscriptPage, TransportEvent,
    WorkErrorKind, WorkPage, WorkRequest, WorkResponse, WorkVersioned, Workspace,
    MAX_REPLAY_EVENTS, PROTOCOL_VERSION,
};
use thiserror::Error;
use tokio::net::{unix::OwnedReadHalf, UnixStream};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;

/// Errors terminate the client connection.  The payloads are owned strings so
/// one terminal error can be cloned and delivered to every pending waiter.
#[derive(Debug, Clone, Error, PartialEq, Eq)]
pub enum ClientError {
    #[error("unix transport I/O: {0}")]
    Io(String),
    #[error("invalid protocol frame: {0}")]
    Frame(String),
    #[error("invalid protocol envelope: {0}")]
    Envelope(String),
    #[error("client connection is closed")]
    Disconnected,
    #[error("response has no pending request (id {actual})")]
    UnknownResponseId { actual: u64 },
    #[error("unexpected response variant: expected {expected}, got {actual}")]
    UnexpectedResponse {
        expected: &'static str,
        actual: &'static str,
    },
    #[error("pong nonce mismatch: expected {expected}, got {actual}")]
    PingNonceMismatch { expected: u64, actual: u64 },
    #[error("a subscription is already active or pending")]
    SubscriptionActive,
    #[error("subscription protocol violation: {0}")]
    Subscription(String),
    #[error("subscription receiver closed")]
    SubscriptionClosed,
    #[error("Work request failed ({error:?}): {message}")]
    Work {
        error: WorkErrorKind,
        message: String,
        current_revision: Option<u64>,
    },
}

/// Items delivered directly by a successful subscription receiver.
#[derive(Debug, Clone, PartialEq)]
pub enum SubscriptionMessage {
    Event(EventEnvelope),
    Reset {
        reason: ResetReason,
        cursor: StreamCursor,
    },
}

pub type SubscriptionReceiver = mpsc::Receiver<SubscriptionMessage>;

#[derive(Debug, Clone)]
enum ExpectedResponse {
    Hello,
    Ping {
        nonce: u64,
    },
    Subscribe {
        requested: Option<StreamCursor>,
        sender: mpsc::Sender<SubscriptionMessage>,
    },
    Work,
    Core,
    Sessions,
    TranscriptPage,
    Skills,
    Shutdown,
}

impl ExpectedResponse {
    fn name(&self) -> &'static str {
        match self {
            Self::Hello => "hello",
            Self::Ping { .. } => "pong",
            Self::Subscribe { .. } => "subscribe",
            Self::Work => "work",
            Self::Core => "core_accepted",
            Self::Sessions => "sessions",
            Self::TranscriptPage => "transcript_page",
            Self::Skills => "skills_replaced",
            Self::Shutdown => "shutdown",
        }
    }
}

fn response_name(response: &Response) -> &'static str {
    match response {
        Response::Hello { .. } => "hello",
        Response::Subscribe(_) => "subscribe",
        Response::Pong { .. } => "pong",
        Response::Sessions { .. } => "sessions",
        Response::TranscriptPage { .. } => "transcript_page",
        Response::SkillsReplaced => "skills_replaced",
        Response::Work { .. } => "work",
        Response::CoreAccepted => "core_accepted",
        Response::Shutdown => "shutdown",
        Response::Error { .. } => "error",
    }
}

struct PendingRequest {
    expected: ExpectedResponse,
    waiter: oneshot::Sender<Result<Response, ClientError>>,
}

enum SubscriptionPhase {
    Idle,
    Pending {
        request_id: u64,
    },
    Active {
        epoch: StreamEpoch,
        cursor: StreamCursor,
        sender: mpsc::Sender<SubscriptionMessage>,
    },
}

struct Inner {
    /// The only writer for this connection.  Taking the option on terminal
    /// failure drops the write half and makes the peer observe EOF.
    writer: Mutex<Option<tokio::net::unix::OwnedWriteHalf>>,
    pending: StdMutex<HashMap<u64, PendingRequest>>,
    closed: AtomicBool,
    terminal_error: StdMutex<Option<ClientError>>,
    hello_epoch: StdMutex<Option<StreamEpoch>>,
    subscription: StdMutex<SubscriptionPhase>,
}

impl Inner {
    fn new(writer: tokio::net::unix::OwnedWriteHalf) -> Self {
        Self {
            writer: Mutex::new(Some(writer)),
            pending: StdMutex::new(HashMap::new()),
            closed: AtomicBool::new(false),
            terminal_error: StdMutex::new(None),
            hello_epoch: StdMutex::new(None),
            subscription: StdMutex::new(SubscriptionPhase::Idle),
        }
    }

    fn current_error(&self) -> ClientError {
        self.terminal_error
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
            .unwrap_or(ClientError::Disconnected)
    }

    /// Mark a connection terminal, wake every waiter, and close the writer.
    async fn fail(&self, error: ClientError) {
        if self.closed.swap(true, Ordering::SeqCst) {
            return;
        }
        *self
            .terminal_error
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(error.clone());

        *self
            .subscription
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = SubscriptionPhase::Idle;

        let pending = {
            let mut pending = self
                .pending
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            pending
                .drain()
                .map(|(_, request)| request)
                .collect::<Vec<_>>()
        };
        for request in pending {
            let _ = request.waiter.send(Err(error.clone()));
        }

        let mut writer = self.writer.lock().await;
        writer.take();
    }
}

/// The negotiated Hello information returned by the daemon.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HelloInfo {
    pub epoch: StreamEpoch,
    pub cursor: StreamCursor,
}

/// A connected local daemon client.
pub struct Client {
    inner: Arc<Inner>,
    reader_task: Option<JoinHandle<()>>,
    hello: HelloInfo,
}

impl fmt::Debug for Client {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Client")
            .field("hello", &self.hello)
            .finish_non_exhaustive()
    }
}

// Request IDs are process-wide so two live clients cannot start with the same
// identifier.  Zero is reserved by the protocol and is skipped on wraparound.
static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

impl Client {
    /// Connect to a Unix-domain socket and complete the typed protocol Hello.
    pub async fn connect(path: impl AsRef<Path>) -> Result<Self, ClientError> {
        let stream = UnixStream::connect(path)
            .await
            .map_err(|error| ClientError::Io(error.to_string()))?;
        let (reader, writer) = stream.into_split();
        let inner = Arc::new(Inner::new(writer));
        let reader_task = tokio::spawn(reader_loop(reader, Arc::clone(&inner)));
        let mut client = Self {
            inner,
            reader_task: Some(reader_task),
            // This value is replaced before connect returns successfully.
            hello: HelloInfo {
                epoch: StreamEpoch::new("connecting")
                    .expect("the internal placeholder is a valid epoch"),
                cursor: StreamCursor::new(
                    StreamEpoch::new("connecting")
                        .expect("the internal placeholder is a valid epoch"),
                    0,
                ),
            },
        };

        let response = client
            .request(
                Request::Hello {
                    client_version: PROTOCOL_VERSION,
                },
                ExpectedResponse::Hello,
            )
            .await?;
        let Response::Hello { epoch, cursor } = response else {
            // The reader already rejects this variant and terminates the
            // connection; this branch is defensive for future changes.
            return Err(ClientError::UnexpectedResponse {
                expected: "hello",
                actual: response_name(&response),
            });
        };
        if cursor.epoch != epoch {
            let error = ClientError::Envelope("hello cursor epoch mismatch".to_owned());
            client.inner.fail(error.clone()).await;
            return Err(error);
        }
        *client
            .inner
            .hello_epoch
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(epoch.clone());
        client.hello = HelloInfo { epoch, cursor };
        Ok(client)
    }

    /// The daemon's negotiated stream epoch and cursor.
    pub fn hello(&self) -> &HelloInfo {
        &self.hello
    }

    /// Send one bounded typed Ping and return the echoed nonce.
    pub async fn ping(&self, nonce: u64) -> Result<u64, ClientError> {
        let response = self
            .request(Request::Ping { nonce }, ExpectedResponse::Ping { nonce })
            .await?;
        match response {
            Response::Pong { nonce } => Ok(nonce),
            response => Err(ClientError::UnexpectedResponse {
                expected: "pong",
                actual: response_name(&response),
            }),
        }
    }

    pub async fn list_sessions(&self, include_archived: bool) -> Result<Vec<Session>, ClientError> {
        match self
            .request(
                Request::ListSessions { include_archived },
                ExpectedResponse::Sessions,
            )
            .await?
        {
            Response::Sessions { sessions } => Ok(sessions),
            response => Err(ClientError::UnexpectedResponse {
                expected: "sessions",
                actual: response_name(&response),
            }),
        }
    }

    pub async fn transcript_page(
        &self,
        session: String,
        before: Option<TranscriptCursor>,
        limit: usize,
    ) -> Result<TranscriptPage, ClientError> {
        match self
            .request(
                Request::TranscriptPage {
                    session,
                    before,
                    limit,
                },
                ExpectedResponse::TranscriptPage,
            )
            .await?
        {
            Response::TranscriptPage { page } => Ok(page),
            response => Err(ClientError::UnexpectedResponse {
                expected: "transcript_page",
                actual: response_name(&response),
            }),
        }
    }

    pub async fn replace_skills(&self, skills: Vec<Skill>) -> Result<(), ClientError> {
        match self
            .request(Request::ReplaceSkills { skills }, ExpectedResponse::Skills)
            .await?
        {
            Response::SkillsReplaced => Ok(()),
            response => Err(ClientError::UnexpectedResponse {
                expected: "skills_replaced",
                actual: response_name(&response),
            }),
        }
    }

    pub async fn list_workspaces(
        &self,
        cursor: Option<String>,
        limit: usize,
    ) -> Result<WorkPage<Workspace>, ClientError> {
        match self
            .work(WorkRequest::ListWorkspaces { cursor, limit })
            .await?
        {
            WorkResponse::Workspaces { page } => Ok(page),
            response => Err(ClientError::UnexpectedResponse {
                expected: "workspaces",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn save_workspace(
        &self,
        workspace: Workspace,
        expected_revision: Option<u64>,
    ) -> Result<WorkVersioned<Workspace>, ClientError> {
        match self
            .work(WorkRequest::SaveWorkspace {
                workspace,
                expected_revision,
            })
            .await?
        {
            WorkResponse::WorkspaceSaved { item } => Ok(item),
            response => Err(ClientError::UnexpectedResponse {
                expected: "workspace_saved",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn list_tasks(
        &self,
        workspace_id: Option<String>,
        include_archived: bool,
        cursor: Option<String>,
        limit: usize,
    ) -> Result<WorkPage<Task>, ClientError> {
        match self
            .work(WorkRequest::ListTasks {
                workspace_id,
                include_archived,
                cursor,
                limit,
            })
            .await?
        {
            WorkResponse::Tasks { page } => Ok(page),
            response => Err(ClientError::UnexpectedResponse {
                expected: "tasks",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn save_task(
        &self,
        task: Task,
        expected_revision: Option<u64>,
    ) -> Result<WorkVersioned<Task>, ClientError> {
        match self
            .work(WorkRequest::SaveTask {
                task,
                expected_revision,
            })
            .await?
        {
            WorkResponse::TaskSaved { item } => Ok(item),
            response => Err(ClientError::UnexpectedResponse {
                expected: "task_saved",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn submit_for_review(
        &self,
        task_id: String,
        expected_revision: u64,
    ) -> Result<WorkVersioned<Task>, ClientError> {
        match self
            .work(WorkRequest::SubmitForReview {
                task_id,
                expected_revision,
            })
            .await?
        {
            WorkResponse::TaskTransitioned { item } => Ok(item),
            response => Err(ClientError::UnexpectedResponse {
                expected: "task_transitioned",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn accept_task(
        &self,
        task_id: String,
        expected_revision: u64,
    ) -> Result<WorkVersioned<Task>, ClientError> {
        match self
            .work(WorkRequest::AcceptTask {
                task_id,
                expected_revision,
            })
            .await?
        {
            WorkResponse::TaskTransitioned { item } => Ok(item),
            response => Err(ClientError::UnexpectedResponse {
                expected: "task_transitioned",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn get_brief(
        &self,
        task_id: String,
    ) -> Result<Option<WorkVersioned<BriefRevision>>, ClientError> {
        match self.work(WorkRequest::GetBrief { task_id }).await? {
            WorkResponse::Brief { brief } => Ok(brief),
            response => Err(ClientError::UnexpectedResponse {
                expected: "brief",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn save_brief(
        &self,
        brief: BriefRevision,
        expected_revision: Option<u64>,
    ) -> Result<BriefSaveResult, ClientError> {
        match self
            .work(WorkRequest::SaveBrief {
                brief,
                expected_revision,
            })
            .await?
        {
            WorkResponse::BriefSaved { result } => Ok(result),
            response => Err(ClientError::UnexpectedResponse {
                expected: "brief_saved",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn list_runs(
        &self,
        task_id: String,
        cursor: Option<String>,
        limit: usize,
    ) -> Result<WorkPage<Run>, ClientError> {
        match self
            .work(WorkRequest::ListRuns {
                task_id,
                cursor,
                limit,
            })
            .await?
        {
            WorkResponse::Runs { page } => Ok(page),
            response => Err(ClientError::UnexpectedResponse {
                expected: "runs",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn start_run(
        &self,
        task_id: String,
        provider: codetwo_protocol::ProviderId,
        allow_without_rollback: bool,
    ) -> Result<RunStartReceipt, ClientError> {
        match self
            .work(WorkRequest::StartRun {
                task_id,
                provider,
                allow_without_rollback,
            })
            .await?
        {
            WorkResponse::RunStarted { receipt } => Ok(receipt),
            response => Err(ClientError::UnexpectedResponse {
                expected: "run_started",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn inspect_run_changes(&self, run_id: String) -> Result<ChangeSummary, ClientError> {
        match self.work(WorkRequest::InspectRunChanges { run_id }).await? {
            WorkResponse::ChangeSummary { summary } => Ok(summary),
            response => Err(ClientError::UnexpectedResponse {
                expected: "change_summary",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn list_changes(
        &self,
        snapshot_id: String,
        cursor: Option<String>,
        limit: usize,
    ) -> Result<WorkPage<RunChange>, ClientError> {
        match self
            .work(WorkRequest::ListChanges {
                snapshot_id,
                cursor,
                limit,
            })
            .await?
        {
            WorkResponse::Changes { page } => Ok(page),
            response => Err(ClientError::UnexpectedResponse {
                expected: "changes",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn rollback_run(
        &self,
        run_id: String,
        snapshot_id: String,
    ) -> Result<RollbackReceipt, ClientError> {
        match self
            .work(WorkRequest::RollbackRun {
                run_id,
                snapshot_id,
                paths: None,
            })
            .await?
        {
            WorkResponse::RollbackCompleted { receipt } => Ok(receipt),
            response => Err(ClientError::UnexpectedResponse {
                expected: "rollback_completed",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn rollback_paths(
        &self,
        run_id: String,
        snapshot_id: String,
        paths: Vec<String>,
    ) -> Result<RollbackReceipt, ClientError> {
        match self
            .work(WorkRequest::RollbackRun {
                run_id,
                snapshot_id,
                paths: Some(paths),
            })
            .await?
        {
            WorkResponse::RollbackCompleted { receipt } => Ok(receipt),
            response => Err(ClientError::UnexpectedResponse {
                expected: "rollback_completed",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn register_deliverable(
        &self,
        task_id: String,
        run_id: String,
        path: String,
    ) -> Result<WorkVersioned<Deliverable>, ClientError> {
        match self
            .work(WorkRequest::RegisterDeliverable {
                task_id,
                run_id,
                path,
            })
            .await?
        {
            WorkResponse::DeliverableRegistered { item } => Ok(item),
            response => Err(ClientError::UnexpectedResponse {
                expected: "deliverable_registered",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn list_deliverables(
        &self,
        task_id: String,
        cursor: Option<String>,
        limit: usize,
    ) -> Result<WorkPage<Deliverable>, ClientError> {
        match self
            .work(WorkRequest::ListDeliverables {
                task_id,
                cursor,
                limit,
            })
            .await?
        {
            WorkResponse::Deliverables { page } => Ok(page),
            response => Err(ClientError::UnexpectedResponse {
                expected: "deliverables",
                actual: work_response_name(&response),
            }),
        }
    }

    pub async fn shutdown(&self) -> Result<(), ClientError> {
        match self
            .request(Request::Shutdown, ExpectedResponse::Shutdown)
            .await?
        {
            Response::Shutdown => Ok(()),
            response => Err(ClientError::UnexpectedResponse {
                expected: "shutdown",
                actual: response_name(&response),
            }),
        }
    }

    pub async fn submit(&self, op: Op) -> Result<(), ClientError> {
        match self
            .request(Request::Core { op }, ExpectedResponse::Core)
            .await?
        {
            Response::CoreAccepted => Ok(()),
            response => Err(ClientError::UnexpectedResponse {
                expected: "core_accepted",
                actual: response_name(&response),
            }),
        }
    }

    async fn work(&self, request: WorkRequest) -> Result<WorkResponse, ClientError> {
        match self
            .request(Request::Work { request }, ExpectedResponse::Work)
            .await?
        {
            Response::Work {
                response:
                    WorkResponse::Error {
                        error,
                        message,
                        current_revision,
                    },
            } => Err(ClientError::Work {
                error,
                message,
                current_revision,
            }),
            Response::Work { response } => Ok(response),
            response => Err(ClientError::UnexpectedResponse {
                expected: "work",
                actual: response_name(&response),
            }),
        }
    }

    /// Start one typed event subscription.  The receiver is registered before
    /// the request is written, so replay and an immediately-following live
    /// event cannot race the caller's receive path.
    pub async fn subscribe(
        &self,
        cursor: Option<StreamCursor>,
    ) -> Result<SubscriptionReceiver, ClientError> {
        if self.inner.closed.load(Ordering::SeqCst) {
            return Err(self.inner.current_error());
        }

        let (sender, receiver) = mpsc::channel(MAX_REPLAY_EVENTS + 8);
        let (waiter, response_receiver) = oneshot::channel();
        let request_id = next_request_id();
        {
            let mut phase = self
                .inner
                .subscription
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !matches!(&*phase, SubscriptionPhase::Idle) {
                return Err(ClientError::SubscriptionActive);
            }
            *phase = SubscriptionPhase::Pending { request_id };
        }

        let registration_error = {
            let mut pending = self
                .inner
                .pending
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if self.inner.closed.load(Ordering::SeqCst) {
                Some(ClientError::Disconnected)
            } else if pending.contains_key(&request_id) || request_id == 0 {
                Some(ClientError::Disconnected)
            } else {
                pending.insert(
                    request_id,
                    PendingRequest {
                        expected: ExpectedResponse::Subscribe {
                            requested: cursor.clone(),
                            sender,
                        },
                        waiter,
                    },
                );
                None
            }
        };
        if let Some(error) = registration_error {
            {
                *self
                    .inner
                    .subscription
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner()) = SubscriptionPhase::Idle;
            }
            if self.inner.closed.load(Ordering::SeqCst) {
                return Err(self.inner.current_error());
            }
            return Err(error);
        }

        let envelope = RequestEnvelope::new(request_id, Request::Subscribe { cursor });
        let write_result = {
            let mut writer = self.inner.writer.lock().await;
            if self.inner.closed.load(Ordering::SeqCst) {
                Err(self.inner.current_error())
            } else if let Some(writer) = writer.as_mut() {
                write_json(writer, &envelope)
                    .await
                    .map_err(|error| ClientError::Frame(error.to_string()))
            } else {
                Err(ClientError::Disconnected)
            }
        };
        if let Err(error) = write_result {
            self.inner.fail(error.clone()).await;
            return Err(error);
        }

        match response_receiver
            .await
            .unwrap_or_else(|_| Err(self.inner.current_error()))?
        {
            Response::Subscribe(_) => Ok(receiver),
            response => Err(ClientError::UnexpectedResponse {
                expected: "subscribe",
                actual: response_name(&response),
            }),
        }
    }

    /// Detach by dropping this client.  No Shutdown request is sent.
    pub fn detach(self) {
        drop(self);
    }

    async fn request(
        &self,
        request: Request,
        expected: ExpectedResponse,
    ) -> Result<Response, ClientError> {
        if self.inner.closed.load(Ordering::SeqCst) {
            return Err(self.inner.current_error());
        }

        let request_id = next_request_id();
        let (sender, receiver) = oneshot::channel();
        let registration_error = {
            let mut pending = self
                .inner
                .pending
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if self.inner.closed.load(Ordering::SeqCst) {
                Some(ClientError::Disconnected)
            } else if pending.contains_key(&request_id) || request_id == 0 {
                Some(ClientError::Disconnected)
            } else {
                // An atomic process-wide counter makes this practically
                // unreachable; retain the check as a strict map invariant.
                pending.insert(
                    request_id,
                    PendingRequest {
                        expected,
                        waiter: sender,
                    },
                );
                None
            }
        };
        if let Some(error) = registration_error {
            return if self.inner.closed.load(Ordering::SeqCst) {
                Err(self.inner.current_error())
            } else {
                Err(error)
            };
        }

        let envelope = RequestEnvelope::new(request_id, request);
        let write_result = {
            let mut writer = self.inner.writer.lock().await;
            if self.inner.closed.load(Ordering::SeqCst) {
                Err(self.inner.current_error())
            } else if let Some(writer) = writer.as_mut() {
                write_json(writer, &envelope)
                    .await
                    .map_err(|error| ClientError::Frame(error.to_string()))
            } else {
                Err(ClientError::Disconnected)
            }
        };
        if let Err(error) = write_result {
            self.inner.fail(error.clone()).await;
            return Err(error);
        }

        receiver
            .await
            .unwrap_or_else(|_| Err(self.inner.current_error()))
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        // Aborting the sole reader task drops its read half.  The writer lives
        // in `Inner` and is dropped with the last Arc, so this closes only this
        // client connection and never emits a protocol Shutdown message.
        if let Some(reader_task) = self.reader_task.take() {
            reader_task.abort();
        }
    }
}

fn next_request_id() -> u64 {
    loop {
        let id = NEXT_REQUEST_ID.fetch_add(1, Ordering::SeqCst);
        if id != 0 {
            return id;
        }
    }
}

async fn reader_loop(mut reader: OwnedReadHalf, inner: Arc<Inner>) {
    let terminal = loop {
        let frame: ServerFrame = match read_json(&mut reader).await {
            Ok(frame) => frame,
            Err(error) => break ClientError::Frame(error.to_string()),
        };
        if let Err(error) = frame.validate() {
            break ClientError::Envelope(error.to_string());
        }

        match frame {
            ServerFrame::Event(event) => {
                if let Err(error) = handle_event(&inner, event).await {
                    break error;
                }
            }
            ServerFrame::Response(response) => {
                let request_id = response.request_id;
                let pending = {
                    let mut pending = inner
                        .pending
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    pending.remove(&request_id)
                };
                let Some(pending) = pending else {
                    break ClientError::UnknownResponseId { actual: request_id };
                };

                let result = match pending.expected {
                    ExpectedResponse::Subscribe { requested, sender } => {
                        handle_subscribe_response(&inner, request_id, response, requested, sender)
                            .await
                    }
                    expected => match (&expected, &response.response) {
                        (ExpectedResponse::Hello, Response::Hello { .. }) => Ok(response.response),
                        (ExpectedResponse::Work, Response::Work { .. }) => Ok(response.response),
                        (ExpectedResponse::Core, Response::CoreAccepted) => Ok(response.response),
                        (ExpectedResponse::Sessions, Response::Sessions { .. }) => {
                            Ok(response.response)
                        }
                        (ExpectedResponse::TranscriptPage, Response::TranscriptPage { .. }) => {
                            Ok(response.response)
                        }
                        (ExpectedResponse::Skills, Response::SkillsReplaced) => {
                            Ok(response.response)
                        }
                        (ExpectedResponse::Shutdown, Response::Shutdown) => Ok(response.response),
                        (
                            ExpectedResponse::Ping { nonce: expected },
                            Response::Pong { nonce: actual },
                        ) if expected == actual => Ok(response.response),
                        (
                            ExpectedResponse::Ping { nonce: expected },
                            Response::Pong { nonce: actual },
                        ) => Err(ClientError::PingNonceMismatch {
                            expected: *expected,
                            actual: *actual,
                        }),
                        (expected, actual) => Err(ClientError::UnexpectedResponse {
                            expected: expected.name(),
                            actual: response_name(actual),
                        }),
                    },
                };

                match result {
                    Ok(response) => {
                        let _ = pending.waiter.send(Ok(response));
                    }
                    Err(error) => {
                        let _ = pending.waiter.send(Err(error.clone()));
                        break error;
                    }
                }
            }
        }
    };
    inner.fail(terminal).await;
}

fn work_response_name(response: &WorkResponse) -> &'static str {
    match response {
        WorkResponse::Workspaces { .. } => "workspaces",
        WorkResponse::WorkspaceSaved { .. } => "workspace_saved",
        WorkResponse::Tasks { .. } => "tasks",
        WorkResponse::TaskSaved { .. } => "task_saved",
        WorkResponse::TaskTransitioned { .. } => "task_transitioned",
        WorkResponse::Brief { .. } => "brief",
        WorkResponse::BriefSaved { .. } => "brief_saved",
        WorkResponse::Runs { .. } => "runs",
        WorkResponse::RunStarted { .. } => "run_started",
        WorkResponse::ChangeSummary { .. } => "change_summary",
        WorkResponse::Changes { .. } => "changes",
        WorkResponse::RollbackCompleted { .. } => "rollback_completed",
        WorkResponse::DeliverableRegistered { .. } => "deliverable_registered",
        WorkResponse::Deliverables { .. } => "deliverables",
        WorkResponse::Error { .. } => "error",
    }
}

async fn handle_subscribe_response(
    inner: &Inner,
    request_id: u64,
    response: ResponseEnvelope,
    requested: Option<StreamCursor>,
    sender: mpsc::Sender<SubscriptionMessage>,
) -> Result<Response, ClientError> {
    let Response::Subscribe(result) = response.response.clone() else {
        return Err(ClientError::UnexpectedResponse {
            expected: "subscribe",
            actual: response_name(&response.response),
        });
    };
    let hello_epoch = inner
        .hello_epoch
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
        .ok_or_else(|| ClientError::Subscription("Hello has not completed".to_owned()))?;
    let result_cursor = result.cursor().clone();
    if result_cursor.epoch != hello_epoch {
        return Err(ClientError::Subscription(
            "subscribe cursor epoch differs from Hello epoch".to_owned(),
        ));
    }
    if let Some(requested) = &requested {
        if requested.epoch != hello_epoch {
            if !matches!(
                &result,
                SubscribeResult::Reset {
                    reason: ResetReason::StreamMismatch,
                    ..
                }
            ) {
                return Err(ClientError::Subscription(
                    "old-epoch cursor must receive StreamMismatch reset".to_owned(),
                ));
            }
        } else if let SubscribeResult::Replay { events, .. } = &result {
            match events.first() {
                None if result_cursor.sequence != requested.sequence => {
                    return Err(ClientError::Subscription(
                        "empty replay cursor must equal requested cursor".to_owned(),
                    ));
                }
                Some(first) => {
                    let expected = requested.sequence.checked_add(1).ok_or_else(|| {
                        ClientError::Subscription(
                            "maximum requested cursor cannot have replay events".to_owned(),
                        )
                    })?;
                    if first.sequence != expected {
                        return Err(ClientError::Subscription(
                            "replay must start immediately after requested cursor".to_owned(),
                        ));
                    }
                }
                None => {}
            }
        }
    }

    {
        let mut phase = inner
            .subscription
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !matches!(&*phase, SubscriptionPhase::Pending { request_id: id } if *id == request_id) {
            return Err(ClientError::Subscription(
                "subscribe response has no matching pending subscription".to_owned(),
            ));
        }
        *phase = SubscriptionPhase::Active {
            epoch: hello_epoch,
            cursor: result_cursor.clone(),
            sender: sender.clone(),
        };
    }

    match &result {
        SubscribeResult::Replay { events, .. } => {
            for event in events {
                sender
                    .send(SubscriptionMessage::Event(event.clone()))
                    .await
                    .map_err(|_| ClientError::SubscriptionClosed)?;
            }
        }
        SubscribeResult::Reset { reason, cursor } => {
            *inner
                .subscription
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = SubscriptionPhase::Idle;
            sender
                .send(SubscriptionMessage::Reset {
                    reason: reason.clone(),
                    cursor: cursor.clone(),
                })
                .await
                .map_err(|_| ClientError::SubscriptionClosed)?;
        }
    }
    Ok(response.response)
}

async fn handle_event(inner: &Inner, event: EventEnvelope) -> Result<(), ClientError> {
    let (epoch, cursor, sender) = {
        let phase = inner
            .subscription
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let SubscriptionPhase::Active {
            epoch,
            cursor,
            sender,
        } = &*phase
        else {
            return Err(ClientError::Subscription(
                "unsolicited event without an active subscription".to_owned(),
            ));
        };
        (epoch.clone(), cursor.clone(), sender.clone())
    };

    if event.epoch != epoch {
        send_reset(inner, sender, ResetReason::StreamMismatch, cursor).await?;
        return Ok(());
    }

    let expected = cursor.sequence.checked_add(1);
    let Some(expected) = expected else {
        send_reset(inner, sender, ResetReason::LegacyCursor, cursor).await?;
        return Ok(());
    };
    if event.sequence != expected {
        let reason = if event.sequence > expected {
            ResetReason::ReplayGap
        } else {
            ResetReason::LegacyCursor
        };
        send_reset(inner, sender, reason, cursor).await?;
        return Ok(());
    }

    let server_reset = match &event.event {
        TransportEvent::Reset { reason, cursor } => Some((reason.clone(), cursor.clone())),
        _ => None,
    };
    if let Some((reset_reason, reset_cursor)) = server_reset {
        {
            let mut phase = inner
                .subscription
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if let SubscriptionPhase::Active { cursor, .. } = &mut *phase {
                *cursor = reset_cursor.clone();
            }
            *phase = SubscriptionPhase::Idle;
        }
        // The state is cleared before waking the receiver so a caller can
        // immediately establish a fresh subscription after observing reset.
        sender
            .send(SubscriptionMessage::Reset {
                reason: reset_reason,
                cursor: reset_cursor,
            })
            .await
            .map_err(|_| ClientError::SubscriptionClosed)?;
        return Ok(());
    }

    {
        let mut phase = inner
            .subscription
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let SubscriptionPhase::Active { cursor, .. } = &mut *phase {
            cursor.sequence = event.sequence;
        }
    }
    sender
        .send(SubscriptionMessage::Event(event))
        .await
        .map_err(|_| ClientError::SubscriptionClosed)
}

async fn send_reset(
    inner: &Inner,
    sender: mpsc::Sender<SubscriptionMessage>,
    reason: ResetReason,
    cursor: StreamCursor,
) -> Result<(), ClientError> {
    *inner
        .subscription
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = SubscriptionPhase::Idle;
    sender
        .send(SubscriptionMessage::Reset { reason, cursor })
        .await
        .map_err(|_| ClientError::SubscriptionClosed)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::Duration;

    use codetwo_protocol::{read_frame, read_json, write_json, FrameError};
    use tokio::net::UnixListener;
    use tokio::time::timeout;
    use uuid::Uuid;

    struct SocketFixture {
        directory: std::path::PathBuf,
        socket: std::path::PathBuf,
    }

    impl SocketFixture {
        fn new() -> Self {
            // macOS limits Unix socket paths to `SUN_LEN`; keep the random
            // directory name short enough even under a long temp root.
            let id = Uuid::new_v4().simple().to_string();
            let directory = std::env::temp_dir().join(format!("c2-{}", &id[..8]));
            fs::create_dir(&directory).expect("create unique test directory");
            let socket = directory.join("transport.sock");
            Self { directory, socket }
        }

        fn listener(&self) -> UnixListener {
            UnixListener::bind(&self.socket).expect("bind test socket")
        }
    }

    impl Drop for SocketFixture {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.socket);
            let _ = fs::remove_dir(&self.directory);
        }
    }

    async fn accept(listener: UnixListener) -> (tokio::net::UnixStream, UnixListener) {
        let (stream, _) = timeout(Duration::from_secs(2), listener.accept())
            .await
            .expect("server accept timeout")
            .expect("server accept failed");
        (stream, listener)
    }

    async fn read_request(reader: &mut tokio::net::unix::OwnedReadHalf) -> RequestEnvelope {
        timeout(Duration::from_secs(2), read_json(reader))
            .await
            .expect("server request timeout")
            .expect("server request decode failed")
    }

    async fn write_response(
        writer: &mut tokio::net::unix::OwnedWriteHalf,
        response: &ResponseEnvelope,
    ) {
        timeout(
            Duration::from_secs(2),
            write_json(writer, &ServerFrame::response(response.clone())),
        )
        .await
        .expect("server response timeout")
        .expect("server response write failed");
    }

    async fn write_event(writer: &mut tokio::net::unix::OwnedWriteHalf, event: &EventEnvelope) {
        timeout(
            Duration::from_secs(2),
            write_json(writer, &ServerFrame::event(event.clone())),
        )
        .await
        .expect("server event timeout")
        .expect("server event write failed");
    }

    fn hello_response(request_id: u64) -> ResponseEnvelope {
        hello_response_for(request_id, "test-epoch")
    }

    fn hello_response_for(request_id: u64, epoch_name: &str) -> ResponseEnvelope {
        let epoch = StreamEpoch::new(epoch_name).unwrap();
        ResponseEnvelope::new(
            request_id,
            Response::Hello {
                epoch: epoch.clone(),
                cursor: StreamCursor::new(epoch, 0),
            },
        )
    }

    fn lifecycle_event(epoch: &StreamEpoch, sequence: u64) -> EventEnvelope {
        EventEnvelope::new(
            epoch.clone(),
            sequence,
            TransportEvent::OwnerLifecycle {
                state: codetwo_protocol::OwnerState::Ready,
            },
        )
    }

    fn replay_response(
        request_id: u64,
        epoch: &StreamEpoch,
        cursor: u64,
        events: Vec<EventEnvelope>,
    ) -> ResponseEnvelope {
        ResponseEnvelope::new(
            request_id,
            Response::Subscribe(SubscribeResult::Replay {
                cursor: StreamCursor::new(epoch.clone(), cursor),
                events,
            }),
        )
    }

    async fn assert_invalid_replay(
        requested_sequence: u64,
        result: SubscribeResult,
        expected_message: &'static str,
    ) {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            write_response(&mut writer, &hello_response(hello.request_id)).await;
            let subscribe = read_request(&mut reader).await;
            write_response(
                &mut writer,
                &ResponseEnvelope::new(subscribe.request_id, Response::Subscribe(result)),
            )
            .await;
            let _ = timeout(Duration::from_secs(2), read_frame(&mut reader)).await;
        });

        let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap();
        let epoch = StreamEpoch::new("test-epoch").unwrap();
        let error = timeout(
            Duration::from_secs(2),
            client.subscribe(Some(StreamCursor::new(epoch, requested_sequence))),
        )
        .await
        .expect("invalid replay timeout")
        .unwrap_err();
        assert!(
            matches!(error, ClientError::Subscription(message) if message.contains(expected_message))
        );
        drop(client);
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn hello_then_ping_uses_exact_request_correlation() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            assert!(matches!(hello.request, Request::Hello { .. }));
            write_response(&mut writer, &hello_response(hello.request_id)).await;

            let ping = read_request(&mut reader).await;
            let Request::Ping { nonce } = ping.request else {
                panic!("expected ping request");
            };
            assert_eq!(nonce, 42);
            write_response(
                &mut writer,
                &ResponseEnvelope::new(ping.request_id, Response::Pong { nonce }),
            )
            .await;
        });

        let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap();
        assert_eq!(client.hello().cursor.sequence, 0);
        assert_eq!(
            timeout(Duration::from_secs(2), client.ping(42))
                .await
                .expect("client ping timeout")
                .unwrap(),
            42
        );
        drop(client);
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn subscribe_installs_receiver_before_replay_and_live_event() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            let epoch = StreamEpoch::new("test-epoch").unwrap();
            write_response(&mut writer, &hello_response(hello.request_id)).await;

            let subscribe = read_request(&mut reader).await;
            assert!(matches!(
                subscribe.request,
                Request::Subscribe { cursor: None }
            ));
            let replay = vec![lifecycle_event(&epoch, 1), lifecycle_event(&epoch, 2)];
            write_response(
                &mut writer,
                &replay_response(subscribe.request_id, &epoch, 2, replay),
            )
            .await;
            write_event(&mut writer, &lifecycle_event(&epoch, 3)).await;

            let result = timeout(Duration::from_secs(2), read_frame(&mut reader))
                .await
                .expect("server drop timeout");
            assert!(matches!(result, Err(FrameError::Truncated)));
        });

        let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap();
        let mut receiver = timeout(Duration::from_secs(2), client.subscribe(None))
            .await
            .expect("subscribe timeout")
            .unwrap();
        assert!(matches!(
            timeout(Duration::from_secs(2), client.subscribe(None))
                .await
                .expect("duplicate subscribe timeout"),
            Err(ClientError::SubscriptionActive)
        ));
        for expected_sequence in 1..=3 {
            let message = timeout(Duration::from_secs(2), receiver.recv())
                .await
                .expect("event receive timeout")
                .expect("subscription receiver closed");
            let SubscriptionMessage::Event(event) = message else {
                panic!("expected replay/live event");
            };
            assert_eq!(event.sequence, expected_sequence);
        }
        drop(receiver);
        drop(client);
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn event_epoch_gap_and_duplicate_emit_typed_resets_and_allow_resubscribe() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            let epoch = StreamEpoch::new("test-epoch").unwrap();
            let other_epoch = StreamEpoch::new("other-epoch").unwrap();
            write_response(&mut writer, &hello_response(hello.request_id)).await;

            let first = read_request(&mut reader).await;
            write_response(
                &mut writer,
                &replay_response(first.request_id, &epoch, 0, Vec::new()),
            )
            .await;
            write_event(&mut writer, &lifecycle_event(&other_epoch, 1)).await;

            let second = read_request(&mut reader).await;
            write_response(
                &mut writer,
                &replay_response(second.request_id, &epoch, 0, Vec::new()),
            )
            .await;
            write_event(&mut writer, &lifecycle_event(&epoch, 2)).await;

            let third = read_request(&mut reader).await;
            write_response(
                &mut writer,
                &replay_response(third.request_id, &epoch, 0, Vec::new()),
            )
            .await;
            write_event(&mut writer, &lifecycle_event(&epoch, 1)).await;
            write_event(&mut writer, &lifecycle_event(&epoch, 1)).await;

            let result = timeout(Duration::from_secs(2), read_frame(&mut reader))
                .await
                .expect("server drop timeout");
            assert!(matches!(result, Err(FrameError::Truncated)));
        });

        let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap();

        let mut receiver = timeout(Duration::from_secs(2), client.subscribe(None))
            .await
            .expect("first subscribe timeout")
            .unwrap();
        assert!(matches!(
            timeout(Duration::from_secs(2), receiver.recv())
                .await
                .expect("epoch reset timeout")
                .expect("epoch receiver closed"),
            SubscriptionMessage::Reset {
                reason: ResetReason::StreamMismatch,
                ..
            }
        ));
        assert!(timeout(Duration::from_secs(2), receiver.recv())
            .await
            .expect("epoch close timeout")
            .is_none());

        let mut receiver = timeout(Duration::from_secs(2), client.subscribe(None))
            .await
            .expect("second subscribe timeout")
            .unwrap();
        assert!(matches!(
            timeout(Duration::from_secs(2), receiver.recv())
                .await
                .expect("gap reset timeout")
                .expect("gap receiver closed"),
            SubscriptionMessage::Reset {
                reason: ResetReason::ReplayGap,
                ..
            }
        ));
        assert!(timeout(Duration::from_secs(2), receiver.recv())
            .await
            .expect("gap close timeout")
            .is_none());

        let mut receiver = timeout(Duration::from_secs(2), client.subscribe(None))
            .await
            .expect("third subscribe timeout")
            .unwrap();
        assert!(matches!(
            timeout(Duration::from_secs(2), receiver.recv())
                .await
                .expect("first event timeout")
                .expect("duplicate receiver closed"),
            SubscriptionMessage::Event(EventEnvelope { sequence: 1, .. })
        ));
        assert!(matches!(
            timeout(Duration::from_secs(2), receiver.recv())
                .await
                .expect("duplicate reset timeout")
                .expect("duplicate receiver closed"),
            SubscriptionMessage::Reset {
                reason: ResetReason::LegacyCursor,
                ..
            }
        ));
        assert!(timeout(Duration::from_secs(2), receiver.recv())
            .await
            .expect("duplicate close timeout")
            .is_none());

        drop(receiver);
        drop(client);
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn old_epoch_cursor_subscribe_observes_stream_mismatch_reset() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            let new_epoch = StreamEpoch::new("test-epoch").unwrap();
            write_response(&mut writer, &hello_response(hello.request_id)).await;

            let subscribe = read_request(&mut reader).await;
            let Request::Subscribe {
                cursor: Some(cursor),
            } = subscribe.request
            else {
                panic!("expected old cursor");
            };
            assert_eq!(cursor.epoch.as_str(), "old-epoch");
            write_response(
                &mut writer,
                &ResponseEnvelope::new(
                    subscribe.request_id,
                    Response::Subscribe(SubscribeResult::Reset {
                        cursor: StreamCursor::new(new_epoch, 0),
                        reason: ResetReason::StreamMismatch,
                    }),
                ),
            )
            .await;
            let result = timeout(Duration::from_secs(2), read_frame(&mut reader))
                .await
                .expect("server drop timeout");
            assert!(matches!(result, Err(FrameError::Truncated)));
        });

        let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap();
        let old_epoch = StreamEpoch::new("old-epoch").unwrap();
        let mut receiver = timeout(
            Duration::from_secs(2),
            client.subscribe(Some(StreamCursor::new(old_epoch, 4))),
        )
        .await
        .expect("old cursor subscribe timeout")
        .unwrap();
        assert!(matches!(
            timeout(Duration::from_secs(2), receiver.recv())
                .await
                .expect("old cursor reset timeout")
                .expect("old cursor receiver closed"),
            SubscriptionMessage::Reset {
                reason: ResetReason::StreamMismatch,
                cursor: StreamCursor { sequence: 0, .. },
            }
        ));
        assert!(timeout(Duration::from_secs(2), receiver.recv())
            .await
            .expect("old cursor close timeout")
            .is_none());
        drop(receiver);
        drop(client);
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn live_server_reset_is_typed_and_allows_resubscribe() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            let epoch = StreamEpoch::new("test-epoch").unwrap();
            write_response(&mut writer, &hello_response(hello.request_id)).await;

            let first = read_request(&mut reader).await;
            write_response(
                &mut writer,
                &replay_response(first.request_id, &epoch, 0, Vec::new()),
            )
            .await;
            write_event(
                &mut writer,
                &EventEnvelope::new(
                    epoch.clone(),
                    1,
                    TransportEvent::Reset {
                        reason: ResetReason::CursorAhead,
                        cursor: StreamCursor::new(epoch.clone(), 42),
                    },
                ),
            )
            .await;

            let second = read_request(&mut reader).await;
            write_response(
                &mut writer,
                &replay_response(second.request_id, &epoch, 42, Vec::new()),
            )
            .await;
            let result = timeout(Duration::from_secs(2), read_frame(&mut reader))
                .await
                .expect("server drop timeout");
            assert!(matches!(result, Err(FrameError::Truncated)));
        });

        let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap();
        let mut receiver = timeout(Duration::from_secs(2), client.subscribe(None))
            .await
            .expect("first subscribe timeout")
            .unwrap();
        assert!(matches!(
            timeout(Duration::from_secs(2), receiver.recv())
                .await
                .expect("server reset timeout")
                .expect("server reset receiver closed"),
            SubscriptionMessage::Reset {
                reason: ResetReason::CursorAhead,
                cursor: StreamCursor { sequence: 42, .. },
            }
        ));
        assert!(timeout(Duration::from_secs(2), receiver.recv())
            .await
            .expect("server reset close timeout")
            .is_none());

        let receiver = timeout(Duration::from_secs(2), client.subscribe(None))
            .await
            .expect("resubscribe timeout")
            .unwrap();
        drop(receiver);
        drop(client);
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn malicious_replay_start_and_maximum_cursor_are_rejected() {
        let epoch = StreamEpoch::new("test-epoch").unwrap();
        assert_invalid_replay(
            1,
            SubscribeResult::Replay {
                cursor: StreamCursor::new(epoch.clone(), 3),
                events: vec![lifecycle_event(&epoch, 3)],
            },
            "replay must start immediately",
        )
        .await;
        assert_invalid_replay(
            1,
            SubscribeResult::Replay {
                cursor: StreamCursor::new(epoch.clone(), 2),
                events: vec![lifecycle_event(&epoch, 1), lifecycle_event(&epoch, 2)],
            },
            "replay must start immediately",
        )
        .await;
        assert_invalid_replay(
            u64::MAX,
            SubscribeResult::Replay {
                cursor: StreamCursor::new(epoch.clone(), u64::MAX),
                events: vec![lifecycle_event(&epoch, u64::MAX)],
            },
            "maximum requested cursor",
        )
        .await;
    }

    #[tokio::test]
    async fn concurrent_registration_and_disconnect_wake_without_lock_deadlock() {
        for round in 0..4_u64 {
            let fixture = SocketFixture::new();
            let listener = fixture.listener();
            let server = tokio::spawn(async move {
                let (stream, _) = accept(listener).await;
                let (mut reader, mut writer) = stream.into_split();
                let hello = read_request(&mut reader).await;
                write_response(&mut writer, &hello_response(hello.request_id)).await;
                let _ = timeout(Duration::from_secs(2), read_frame(&mut reader)).await;
            });

            let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
                .await
                .expect("client connect timeout")
                .unwrap();
            let (subscribe_result, ping_result) = timeout(Duration::from_secs(2), async {
                tokio::join!(client.subscribe(None), client.ping(round))
            })
            .await
            .expect("concurrent registration timeout");
            assert!(subscribe_result.is_err() || ping_result.is_err());
            drop(client);
            timeout(Duration::from_secs(2), server)
                .await
                .expect("server task timeout")
                .expect("server task failed");
        }
    }

    #[tokio::test]
    async fn unsolicited_event_terminates_connection_and_fails_later_ping() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            let epoch = StreamEpoch::new("test-epoch").unwrap();
            write_response(&mut writer, &hello_response(hello.request_id)).await;
            write_event(&mut writer, &lifecycle_event(&epoch, 1)).await;
            let result = timeout(Duration::from_secs(2), read_frame(&mut reader))
                .await
                .expect("unsolicited close timeout");
            assert!(matches!(result, Err(FrameError::Truncated)));
        });

        let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap();
        let error = timeout(Duration::from_secs(2), client.ping(9))
            .await
            .expect("terminal ping timeout")
            .unwrap_err();
        assert!(matches!(error, ClientError::Subscription(_)));
        drop(client);
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn maximum_replay_fits_bounded_receiver_before_subscribe_resolves() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            let epoch = StreamEpoch::new("test-epoch").unwrap();
            write_response(&mut writer, &hello_response(hello.request_id)).await;
            let subscribe = read_request(&mut reader).await;
            let replay = (1..=MAX_REPLAY_EVENTS as u64)
                .map(|sequence| lifecycle_event(&epoch, sequence))
                .collect::<Vec<_>>();
            write_response(
                &mut writer,
                &replay_response(
                    subscribe.request_id,
                    &epoch,
                    MAX_REPLAY_EVENTS as u64,
                    replay,
                ),
            )
            .await;
            let result = timeout(Duration::from_secs(2), read_frame(&mut reader))
                .await
                .expect("replay close timeout");
            assert!(matches!(result, Err(FrameError::Truncated)));
        });

        let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap();
        let mut receiver = timeout(Duration::from_secs(2), client.subscribe(None))
            .await
            .expect("maximum replay subscribe timeout")
            .unwrap();
        for expected_sequence in 1..=MAX_REPLAY_EVENTS as u64 {
            let message = timeout(Duration::from_secs(2), receiver.recv())
                .await
                .expect("maximum replay receive timeout")
                .expect("maximum replay receiver closed");
            let SubscriptionMessage::Event(event) = message else {
                panic!("expected replay event");
            };
            assert_eq!(event.sequence, expected_sequence);
        }
        drop(receiver);
        drop(client);
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn wrong_response_id_fails_the_hello_and_closes_connection() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            write_response(&mut writer, &hello_response(hello.request_id + 1)).await;
        });

        let error = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap_err();
        assert!(matches!(error, ClientError::UnknownResponseId { .. }));
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn wrong_protocol_version_fails_the_hello() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            let mut response = hello_response(hello.request_id);
            response.protocol = PROTOCOL_VERSION + 1;
            write_response(&mut writer, &response).await;
        });

        let error = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap_err();
        assert!(
            matches!(error, ClientError::Envelope(message) if message.contains("unsupported protocol version"))
        );
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn wrong_hello_variant_fails_the_hello() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            write_response(
                &mut writer,
                &ResponseEnvelope::new(hello.request_id, Response::Pong { nonce: 7 }),
            )
            .await;
        });

        let error = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap_err();
        assert!(matches!(
            error,
            ClientError::UnexpectedResponse {
                expected: "hello",
                actual: "pong"
            }
        ));
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }

    #[tokio::test]
    async fn dropping_client_closes_socket_without_shutdown_request() {
        let fixture = SocketFixture::new();
        let listener = fixture.listener();
        let server = tokio::spawn(async move {
            let (stream, _) = accept(listener).await;
            let (mut reader, mut writer) = stream.into_split();
            let hello = read_request(&mut reader).await;
            write_response(&mut writer, &hello_response(hello.request_id)).await;
            let result = timeout(Duration::from_secs(2), read_frame(&mut reader))
                .await
                .expect("drop EOF timeout");
            assert!(matches!(result, Err(FrameError::Truncated)));
        });

        let client = timeout(Duration::from_secs(2), Client::connect(&fixture.socket))
            .await
            .expect("client connect timeout")
            .unwrap();
        drop(client);
        timeout(Duration::from_secs(2), server)
            .await
            .expect("server task timeout")
            .expect("server task failed");
    }
}
