//! Versioned, domain-free framing and envelopes for the local Code2 transport.

use std::collections::BTreeSet;
use std::io;

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use thiserror::Error;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub use codetwo_core::{
    AutomationSpec, BriefRevision, BriefSaveResult, Deliverable, Event, Op, ProviderId, Run,
    RunChange, Session, Skill, Task, TranscriptCursor, TranscriptPage, WorkPage, WorkVersioned,
    Workspace, WorkspaceKind, MAX_WORK_PAGE_SIZE,
};

pub const PROTOCOL_VERSION: u16 = 1;
pub const MAX_FRAME_SIZE: usize = 64 * 1024;
pub const MAX_EPOCH_LENGTH: usize = 64;
pub const MAX_REPLAY_EVENTS: usize = 128;

#[derive(Debug, Error)]
pub enum FrameError {
    #[error("transport I/O: {0}")]
    Io(#[from] io::Error),
    #[error("zero-length frame")]
    Empty,
    #[error("frame length {0} exceeds {MAX_FRAME_SIZE} bytes")]
    Oversized(u32),
    #[error("truncated frame")]
    Truncated,
    #[error("invalid JSON frame: {0}")]
    Json(#[from] serde_json::Error),
}

pub async fn read_frame<R: AsyncRead + Unpin>(reader: &mut R) -> Result<Vec<u8>, FrameError> {
    let mut prefix = [0u8; 4];
    reader
        .read_exact(&mut prefix)
        .await
        .map_err(|error| match error.kind() {
            io::ErrorKind::UnexpectedEof => FrameError::Truncated,
            _ => FrameError::Io(error),
        })?;
    let length = u32::from_be_bytes(prefix);
    if length == 0 {
        return Err(FrameError::Empty);
    }
    if length as usize > MAX_FRAME_SIZE {
        return Err(FrameError::Oversized(length));
    }
    let mut payload = vec![0u8; length as usize];
    reader
        .read_exact(&mut payload)
        .await
        .map_err(|error| match error.kind() {
            io::ErrorKind::UnexpectedEof => FrameError::Truncated,
            _ => FrameError::Io(error),
        })?;
    Ok(payload)
}

pub async fn read_json<R, T>(reader: &mut R) -> Result<T, FrameError>
where
    R: AsyncRead + Unpin,
    T: DeserializeOwned,
{
    Ok(serde_json::from_slice(&read_frame(reader).await?)?)
}

pub async fn write_json<W, T>(writer: &mut W, value: &T) -> Result<(), FrameError>
where
    W: AsyncWrite + Unpin,
    T: Serialize,
{
    let payload = serde_json::to_vec(value)?;
    if payload.is_empty() {
        return Err(FrameError::Empty);
    }
    if payload.len() > MAX_FRAME_SIZE {
        return Err(FrameError::Oversized(payload.len() as u32));
    }
    writer
        .write_all(&(payload.len() as u32).to_be_bytes())
        .await?;
    writer.write_all(&payload).await?;
    writer.flush().await?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct StreamEpoch(String);

impl StreamEpoch {
    pub fn new(value: impl Into<String>) -> Result<Self, EnvelopeError> {
        let value = value.into();
        validate_bounded_text(&value, MAX_EPOCH_LENGTH, "stream epoch")?;
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StreamCursor {
    pub epoch: StreamEpoch,
    pub sequence: u64,
}

impl StreamCursor {
    pub fn new(epoch: StreamEpoch, sequence: u64) -> Self {
        Self { epoch, sequence }
    }

    pub fn validate(&self) -> Result<(), EnvelopeError> {
        self.epoch.validate()
    }
}

impl StreamEpoch {
    fn validate(&self) -> Result<(), EnvelopeError> {
        validate_bounded_text(&self.0, MAX_EPOCH_LENGTH, "stream epoch")
    }
}

fn validate_bounded_text(value: &str, max: usize, field: &str) -> Result<(), EnvelopeError> {
    if value.is_empty()
        || value.len() > max
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(EnvelopeError::InvalidField(field.to_owned()));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResetReason {
    LegacyCursor,
    StreamMismatch,
    ReplayGap,
    CursorAhead,
    SubscriberLagged,
    InvalidRequest,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OwnerState {
    Ready,
    Stopping,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum TransportEvent {
    OwnerLifecycle {
        state: OwnerState,
    },
    Reset {
        reason: ResetReason,
        cursor: StreamCursor,
    },
    WorkspaceChanged {
        workspace: Workspace,
        revision: u64,
    },
    TaskChanged {
        task: Task,
        revision: u64,
    },
    BriefChanged {
        brief: BriefRevision,
        revision: u64,
    },
    Core {
        event: Event,
    },
    RunChanged {
        run: Run,
        revision: u64,
    },
    SnapshotPrepared {
        snapshot_id: String,
        task_id: String,
        run_id: String,
        file_count: u64,
        not_covered: u64,
        revision: u64,
    },
    ChangeSetPrepared {
        summary: ChangeSummary,
    },
    RollbackCompleted {
        receipt: RollbackReceipt,
    },
    DeliverableChanged {
        deliverable: Deliverable,
        revision: u64,
    },
    AutomationChanged {
        automation: AutomationSpec,
        revision: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub protocol: u16,
    pub epoch: StreamEpoch,
    pub sequence: u64,
    pub event: TransportEvent,
}

impl EventEnvelope {
    pub fn new(epoch: StreamEpoch, sequence: u64, event: TransportEvent) -> Self {
        Self {
            protocol: PROTOCOL_VERSION,
            epoch,
            sequence,
            event,
        }
    }

    pub fn cursor(&self) -> StreamCursor {
        StreamCursor::new(self.epoch.clone(), self.sequence)
    }

    pub fn validate(&self) -> Result<(), EnvelopeError> {
        if self.protocol != PROTOCOL_VERSION {
            return Err(EnvelopeError::UnsupportedVersion(self.protocol));
        }
        self.epoch.validate()?;
        if self.sequence == 0 {
            return Err(EnvelopeError::InvalidField("event sequence".to_owned()));
        }
        match &self.event {
            TransportEvent::Reset { cursor, .. } => {
                cursor.validate()?;
                if cursor.epoch != self.epoch {
                    return Err(EnvelopeError::InvalidField("reset cursor epoch".to_owned()));
                }
            }
            TransportEvent::WorkspaceChanged {
                workspace,
                revision,
            } => {
                workspace.validate().map_err(EnvelopeError::InvalidField)?;
                if *revision == 0 {
                    return Err(EnvelopeError::InvalidField("workspace revision".to_owned()));
                }
            }
            TransportEvent::TaskChanged { task, revision } => {
                task.validate().map_err(EnvelopeError::InvalidField)?;
                if *revision == 0 {
                    return Err(EnvelopeError::InvalidField("task revision".to_owned()));
                }
            }
            TransportEvent::BriefChanged { brief, revision } => {
                brief.validate().map_err(EnvelopeError::InvalidField)?;
                if *revision == 0 {
                    return Err(EnvelopeError::InvalidField("brief revision".to_owned()));
                }
            }
            TransportEvent::Core { .. } => {}
            TransportEvent::RunChanged { run, revision } => {
                run.validate().map_err(EnvelopeError::InvalidField)?;
                if *revision == 0 {
                    return Err(EnvelopeError::InvalidField("run revision".to_owned()));
                }
            }
            TransportEvent::SnapshotPrepared {
                snapshot_id,
                task_id,
                run_id,
                revision,
                ..
            } => {
                validate_bounded_text(snapshot_id, 256, "snapshot id")?;
                validate_bounded_text(task_id, 256, "task id")?;
                validate_bounded_text(run_id, 256, "run id")?;
                if *revision == 0 {
                    return Err(EnvelopeError::InvalidField("snapshot revision".to_owned()));
                }
            }
            TransportEvent::ChangeSetPrepared { summary } => summary.validate()?,
            TransportEvent::RollbackCompleted { receipt } => receipt.validate()?,
            TransportEvent::DeliverableChanged {
                deliverable,
                revision,
            } => {
                deliverable
                    .validate()
                    .map_err(EnvelopeError::InvalidField)?;
                if *revision == 0 {
                    return Err(EnvelopeError::InvalidField(
                        "deliverable revision".to_owned(),
                    ));
                }
            }
            TransportEvent::AutomationChanged {
                automation,
                revision,
            } => {
                automation
                    .validate()
                    .map_err(|error| EnvelopeError::InvalidField(error.to_string()))?;
                if *revision == 0 || u64::try_from(automation.revision) != Ok(*revision) {
                    return Err(EnvelopeError::InvalidField(
                        "automation revision".to_owned(),
                    ));
                }
            }
            TransportEvent::OwnerLifecycle { .. } => {}
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum WorkRequest {
    ListWorkspaces {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
        limit: usize,
    },
    SaveWorkspace {
        workspace: Workspace,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
    ListTasks {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        workspace_id: Option<String>,
        #[serde(default)]
        include_archived: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
        limit: usize,
    },
    SaveTask {
        task: Task,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
    SubmitForReview {
        task_id: String,
        expected_revision: u64,
    },
    AcceptTask {
        task_id: String,
        expected_revision: u64,
    },
    GetBrief {
        task_id: String,
    },
    SaveBrief {
        brief: BriefRevision,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
    ListRuns {
        task_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
        limit: usize,
    },
    InspectRunChanges {
        run_id: String,
    },
    ListChanges {
        snapshot_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
        limit: usize,
    },
    RollbackRun {
        run_id: String,
        snapshot_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        paths: Option<Vec<String>>,
    },
    StartRun {
        task_id: String,
        provider: ProviderId,
        #[serde(default)]
        allow_without_rollback: bool,
    },
    RegisterDeliverable {
        task_id: String,
        run_id: String,
        path: String,
    },
    ListDeliverables {
        task_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
        limit: usize,
    },
    ListAutomations {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        task_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
        limit: usize,
    },
    SaveAutomation {
        automation: AutomationSpec,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        expected_revision: Option<u64>,
    },
}

impl WorkRequest {
    fn validate(&self) -> Result<(), EnvelopeError> {
        match self {
            Self::ListWorkspaces { cursor, limit } => {
                if *limit == 0 || *limit > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page limit".to_owned()));
                }
                if let Some(cursor) = cursor {
                    validate_bounded_text(cursor, 256, "Work page cursor")?;
                }
            }
            Self::SaveWorkspace {
                workspace,
                expected_revision,
            } => {
                workspace.validate().map_err(EnvelopeError::InvalidField)?;
                if *expected_revision == Some(0) {
                    return Err(EnvelopeError::InvalidField(
                        "workspace expected revision".to_owned(),
                    ));
                }
            }
            Self::ListTasks {
                workspace_id,
                cursor,
                limit,
                ..
            } => {
                if *limit == 0 || *limit > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page limit".to_owned()));
                }
                if let Some(workspace_id) = workspace_id {
                    validate_bounded_text(workspace_id, 256, "workspace id")?;
                }
                if let Some(cursor) = cursor {
                    validate_bounded_text(cursor, 256, "Work page cursor")?;
                }
            }
            Self::SaveTask {
                task,
                expected_revision,
            } => {
                task.validate().map_err(EnvelopeError::InvalidField)?;
                if *expected_revision == Some(0) {
                    return Err(EnvelopeError::InvalidField(
                        "task expected revision".to_owned(),
                    ));
                }
            }
            Self::SubmitForReview {
                task_id,
                expected_revision,
            }
            | Self::AcceptTask {
                task_id,
                expected_revision,
            } => {
                validate_bounded_text(task_id, 256, "task id")?;
                if *expected_revision == 0 {
                    return Err(EnvelopeError::InvalidField(
                        "task expected revision".to_owned(),
                    ));
                }
            }
            Self::GetBrief { task_id } => {
                validate_bounded_text(task_id, 256, "task id")?;
            }
            Self::SaveBrief {
                brief,
                expected_revision,
            } => {
                brief.validate().map_err(EnvelopeError::InvalidField)?;
                if *expected_revision == Some(0) {
                    return Err(EnvelopeError::InvalidField(
                        "brief expected revision".to_owned(),
                    ));
                }
            }
            Self::ListRuns {
                task_id,
                cursor,
                limit,
            } => {
                validate_bounded_text(task_id, 256, "task id")?;
                if *limit == 0 || *limit > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page limit".to_owned()));
                }
                if let Some(cursor) = cursor {
                    validate_bounded_text(cursor, 256, "Run page cursor")?;
                }
            }
            Self::StartRun {
                task_id, provider, ..
            } => {
                validate_bounded_text(task_id, 256, "task id")?;
                validate_bounded_text(provider.as_str(), 256, "provider id")?;
            }
            Self::InspectRunChanges { run_id } => {
                validate_bounded_text(run_id, 256, "run id")?;
            }
            Self::ListChanges {
                snapshot_id,
                cursor,
                limit,
            } => {
                validate_bounded_text(snapshot_id, 256, "snapshot id")?;
                if *limit == 0 || *limit > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page limit".to_owned()));
                }
                if let Some(cursor) = cursor {
                    validate_bounded_text(cursor, 8192, "Change page cursor")?;
                }
            }
            Self::RollbackRun {
                run_id,
                snapshot_id,
                paths,
            } => {
                validate_bounded_text(run_id, 256, "run id")?;
                validate_bounded_text(snapshot_id, 256, "snapshot id")?;
                if let Some(paths) = paths {
                    if paths.is_empty() || paths.len() > MAX_WORK_PAGE_SIZE {
                        return Err(EnvelopeError::InvalidField("rollback paths".to_owned()));
                    }
                    let mut unique = BTreeSet::new();
                    for path in paths {
                        validate_bounded_text(path, 4096, "rollback path")?;
                        if !unique.insert(path) {
                            return Err(EnvelopeError::InvalidField("rollback paths".to_owned()));
                        }
                    }
                }
            }
            Self::RegisterDeliverable {
                task_id,
                run_id,
                path,
            } => {
                validate_bounded_text(task_id, 256, "task id")?;
                validate_bounded_text(run_id, 256, "run id")?;
                validate_bounded_text(path, 4096, "deliverable path")?;
            }
            Self::ListDeliverables {
                task_id,
                cursor,
                limit,
            } => {
                validate_bounded_text(task_id, 256, "task id")?;
                if *limit == 0 || *limit > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page limit".to_owned()));
                }
                if let Some(cursor) = cursor {
                    validate_bounded_text(cursor, 8192, "Deliverable page cursor")?;
                }
            }
            Self::ListAutomations {
                task_id,
                cursor,
                limit,
            } => {
                if *limit == 0 || *limit > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page limit".to_owned()));
                }
                if let Some(task_id) = task_id {
                    validate_bounded_text(task_id, 256, "task id")?;
                }
                if let Some(cursor) = cursor {
                    validate_bounded_text(cursor, 256, "Automation page cursor")?;
                }
            }
            Self::SaveAutomation {
                automation,
                expected_revision,
            } => {
                automation
                    .validate()
                    .map_err(|error| EnvelopeError::InvalidField(error.to_string()))?;
                if *expected_revision == Some(0) {
                    return Err(EnvelopeError::InvalidField(
                        "automation expected revision".to_owned(),
                    ));
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum Request {
    Hello {
        client_version: u16,
    },
    Subscribe {
        cursor: Option<StreamCursor>,
    },
    Ping {
        nonce: u64,
    },
    ListSessions {
        #[serde(default)]
        include_archived: bool,
    },
    TranscriptPage {
        session: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        before: Option<TranscriptCursor>,
        limit: usize,
    },
    ReplaceSkills {
        skills: Vec<Skill>,
    },
    Work {
        request: WorkRequest,
    },
    Core {
        op: Op,
    },
    Shutdown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RequestEnvelope {
    pub protocol: u16,
    pub request_id: u64,
    pub request: Request,
}

impl RequestEnvelope {
    pub fn new(request_id: u64, request: Request) -> Self {
        Self {
            protocol: PROTOCOL_VERSION,
            request_id,
            request,
        }
    }

    pub fn validate(&self) -> Result<(), EnvelopeError> {
        if self.protocol != PROTOCOL_VERSION {
            return Err(EnvelopeError::UnsupportedVersion(self.protocol));
        }
        if self.request_id == 0 {
            return Err(EnvelopeError::InvalidField("request id".to_owned()));
        }
        if let Request::Hello { client_version } = &self.request {
            if *client_version != PROTOCOL_VERSION {
                return Err(EnvelopeError::UnsupportedVersion(*client_version));
            }
        }
        if let Request::Subscribe {
            cursor: Some(cursor),
        } = &self.request
        {
            cursor.validate()?;
        }
        if let Request::Work { request } = &self.request {
            request.validate()?;
        }
        if let Request::TranscriptPage { session, limit, .. } = &self.request {
            validate_bounded_text(session, 256, "session id")?;
            if *limit == 0 || *limit > 100 {
                return Err(EnvelopeError::InvalidField(
                    "transcript page limit".to_owned(),
                ));
            }
        }
        if let Request::ReplaceSkills { skills } = &self.request {
            if skills.len() > 1_024 {
                return Err(EnvelopeError::InvalidField("skill list length".to_owned()));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
// Keep the nested discriminator distinct from `Response`'s `kind` field;
// Response::Subscribe is represented in the same JSON object.
#[serde(rename_all = "snake_case", tag = "result_kind")]
pub enum SubscribeResult {
    Replay {
        cursor: StreamCursor,
        events: Vec<EventEnvelope>,
    },
    Reset {
        cursor: StreamCursor,
        reason: ResetReason,
    },
}

impl SubscribeResult {
    pub fn cursor(&self) -> &StreamCursor {
        match self {
            Self::Replay { cursor, .. } | Self::Reset { cursor, .. } => cursor,
        }
    }

    fn validate(&self) -> Result<(), EnvelopeError> {
        let cursor = self.cursor();
        cursor.validate()?;
        match self {
            Self::Reset { .. } => Ok(()),
            Self::Replay { events, .. } => {
                if events.len() > MAX_REPLAY_EVENTS {
                    return Err(EnvelopeError::InvalidField("replay length".to_owned()));
                }
                let mut previous: Option<u64> = None;
                for event in events {
                    event.validate()?;
                    if matches!(event.event, TransportEvent::Reset { .. }) {
                        return Err(EnvelopeError::InvalidField("replay reset event".to_owned()));
                    }
                    if event.epoch != cursor.epoch {
                        return Err(EnvelopeError::InvalidField("replay epoch".to_owned()));
                    }
                    if let Some(previous) = previous {
                        let expected = previous.checked_add(1).ok_or_else(|| {
                            EnvelopeError::InvalidField("replay sequence overflow".to_owned())
                        })?;
                        if event.sequence != expected {
                            return Err(EnvelopeError::InvalidField("replay sequence".to_owned()));
                        }
                    }
                    previous = Some(event.sequence);
                }
                if previous.is_some_and(|last| last != cursor.sequence) {
                    return Err(EnvelopeError::InvalidField("replay cursor".to_owned()));
                }
                Ok(())
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    InvalidRequest,
    UnsupportedVersion,
    AlreadyRunning,
    ReplayGap,
    CursorAhead,
    StreamMismatch,
    SubscriberLagged,
    Internal,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkErrorKind {
    InvalidRequest,
    RevisionConflict,
    Store,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunStartReceipt {
    pub request_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot_id: Option<String>,
    pub rollback_available: bool,
    pub not_covered: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChangeSummary {
    pub snapshot_id: String,
    pub added: u64,
    pub modified: u64,
    pub deleted: u64,
    pub not_covered: u64,
}

impl ChangeSummary {
    fn validate(&self) -> Result<(), EnvelopeError> {
        validate_bounded_text(&self.snapshot_id, 256, "snapshot id")
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RollbackReceipt {
    pub snapshot_id: String,
    pub restored: u64,
    pub removed: u64,
    pub not_covered: u64,
    pub conflicts: u64,
}

impl RollbackReceipt {
    fn validate(&self) -> Result<(), EnvelopeError> {
        validate_bounded_text(&self.snapshot_id, 256, "snapshot id")
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum WorkResponse {
    Workspaces {
        page: WorkPage<Workspace>,
    },
    WorkspaceSaved {
        item: WorkVersioned<Workspace>,
    },
    Tasks {
        page: WorkPage<Task>,
    },
    TaskSaved {
        item: WorkVersioned<Task>,
    },
    TaskTransitioned {
        item: WorkVersioned<Task>,
    },
    Brief {
        brief: Option<WorkVersioned<BriefRevision>>,
    },
    BriefSaved {
        result: BriefSaveResult,
    },
    Runs {
        page: WorkPage<Run>,
    },
    RunStarted {
        receipt: RunStartReceipt,
    },
    ChangeSummary {
        summary: ChangeSummary,
    },
    Changes {
        page: WorkPage<RunChange>,
    },
    RollbackCompleted {
        receipt: RollbackReceipt,
    },
    DeliverableRegistered {
        item: WorkVersioned<Deliverable>,
    },
    Deliverables {
        page: WorkPage<Deliverable>,
    },
    Automations {
        page: WorkPage<AutomationSpec>,
    },
    AutomationSaved {
        item: WorkVersioned<AutomationSpec>,
    },
    Error {
        error: WorkErrorKind,
        message: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        current_revision: Option<u64>,
    },
}

impl WorkResponse {
    fn validate(&self) -> Result<(), EnvelopeError> {
        match self {
            Self::Workspaces { page } => {
                if page.items.len() > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page length".to_owned()));
                }
                if let Some(cursor) = &page.next_cursor {
                    validate_bounded_text(cursor, 256, "Work page cursor")?;
                }
                for item in &page.items {
                    item.entity
                        .validate()
                        .map_err(EnvelopeError::InvalidField)?;
                    if item.revision == 0 {
                        return Err(EnvelopeError::InvalidField("workspace revision".to_owned()));
                    }
                }
            }
            Self::WorkspaceSaved { item } => {
                item.entity
                    .validate()
                    .map_err(EnvelopeError::InvalidField)?;
                if item.revision == 0 {
                    return Err(EnvelopeError::InvalidField("workspace revision".to_owned()));
                }
            }
            Self::Tasks { page } => {
                if page.items.len() > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page length".to_owned()));
                }
                if let Some(cursor) = &page.next_cursor {
                    validate_bounded_text(cursor, 256, "Work page cursor")?;
                }
                for item in &page.items {
                    item.entity
                        .validate()
                        .map_err(EnvelopeError::InvalidField)?;
                    if item.revision == 0 {
                        return Err(EnvelopeError::InvalidField("task revision".to_owned()));
                    }
                }
            }
            Self::TaskSaved { item } | Self::TaskTransitioned { item } => {
                item.entity
                    .validate()
                    .map_err(EnvelopeError::InvalidField)?;
                if item.revision == 0 {
                    return Err(EnvelopeError::InvalidField("task revision".to_owned()));
                }
            }
            Self::Brief { brief } => {
                if let Some(brief) = brief {
                    brief
                        .entity
                        .validate()
                        .map_err(EnvelopeError::InvalidField)?;
                    if brief.revision == 0 {
                        return Err(EnvelopeError::InvalidField("brief revision".to_owned()));
                    }
                }
            }
            Self::BriefSaved { result } => {
                result
                    .brief
                    .entity
                    .validate()
                    .map_err(EnvelopeError::InvalidField)?;
                result
                    .task
                    .entity
                    .validate()
                    .map_err(EnvelopeError::InvalidField)?;
                if result.brief.revision == 0 || result.task.revision == 0 {
                    return Err(EnvelopeError::InvalidField(
                        "brief save revision".to_owned(),
                    ));
                }
            }
            Self::Runs { page } => {
                if page.items.len() > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page length".to_owned()));
                }
                if let Some(cursor) = &page.next_cursor {
                    validate_bounded_text(cursor, 256, "Run page cursor")?;
                }
                for item in &page.items {
                    item.entity
                        .validate()
                        .map_err(EnvelopeError::InvalidField)?;
                    if item.revision == 0 {
                        return Err(EnvelopeError::InvalidField("run revision".to_owned()));
                    }
                }
            }
            Self::RunStarted { receipt } => {
                validate_bounded_text(&receipt.request_id, 256, "run request id")?;
                if let Some(snapshot_id) = &receipt.snapshot_id {
                    validate_bounded_text(snapshot_id, 256, "snapshot id")?;
                }
                if receipt.rollback_available != receipt.snapshot_id.is_some() {
                    return Err(EnvelopeError::InvalidField(
                        "run rollback receipt".to_owned(),
                    ));
                }
            }
            Self::ChangeSummary { summary } => summary.validate()?,
            Self::Changes { page } => {
                if page.items.len() > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page length".to_owned()));
                }
                if let Some(cursor) = &page.next_cursor {
                    validate_bounded_text(cursor, 8192, "Change page cursor")?;
                }
                for item in &page.items {
                    item.entity
                        .validate()
                        .map_err(EnvelopeError::InvalidField)?;
                    if item.revision == 0 {
                        return Err(EnvelopeError::InvalidField("change revision".to_owned()));
                    }
                }
            }
            Self::RollbackCompleted { receipt } => receipt.validate()?,
            Self::DeliverableRegistered { item } => {
                item.entity
                    .validate()
                    .map_err(EnvelopeError::InvalidField)?;
                if item.revision == 0 {
                    return Err(EnvelopeError::InvalidField(
                        "deliverable revision".to_owned(),
                    ));
                }
            }
            Self::Deliverables { page } => {
                if page.items.len() > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page length".to_owned()));
                }
                if let Some(cursor) = &page.next_cursor {
                    validate_bounded_text(cursor, 8192, "Deliverable page cursor")?;
                }
                for item in &page.items {
                    item.entity
                        .validate()
                        .map_err(EnvelopeError::InvalidField)?;
                    if item.revision == 0 {
                        return Err(EnvelopeError::InvalidField(
                            "deliverable revision".to_owned(),
                        ));
                    }
                }
            }
            Self::Automations { page } => {
                if page.items.len() > MAX_WORK_PAGE_SIZE {
                    return Err(EnvelopeError::InvalidField("Work page length".to_owned()));
                }
                if let Some(cursor) = &page.next_cursor {
                    validate_bounded_text(cursor, 256, "Automation page cursor")?;
                }
                for item in &page.items {
                    item.entity
                        .validate()
                        .map_err(|error| EnvelopeError::InvalidField(error.to_string()))?;
                    if item.revision == 0
                        || u64::try_from(item.entity.revision) != Ok(item.revision)
                    {
                        return Err(EnvelopeError::InvalidField(
                            "automation revision".to_owned(),
                        ));
                    }
                }
            }
            Self::AutomationSaved { item } => {
                item.entity
                    .validate()
                    .map_err(|error| EnvelopeError::InvalidField(error.to_string()))?;
                if item.revision == 0 || u64::try_from(item.entity.revision) != Ok(item.revision) {
                    return Err(EnvelopeError::InvalidField(
                        "automation revision".to_owned(),
                    ));
                }
            }
            Self::Error { message, .. } => {
                validate_bounded_text(message, 256, "Work error message")?;
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum Response {
    Hello {
        epoch: StreamEpoch,
        cursor: StreamCursor,
    },
    Subscribe(SubscribeResult),
    Pong {
        nonce: u64,
    },
    Sessions {
        sessions: Vec<Session>,
    },
    TranscriptPage {
        page: TranscriptPage,
    },
    SkillsReplaced,
    Work {
        response: WorkResponse,
    },
    CoreAccepted,
    Shutdown,
    Error {
        error: ErrorKind,
        message: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResponseEnvelope {
    pub protocol: u16,
    pub request_id: u64,
    pub response: Response,
}

impl ResponseEnvelope {
    pub fn new(request_id: u64, response: Response) -> Self {
        Self {
            protocol: PROTOCOL_VERSION,
            request_id,
            response,
        }
    }

    pub fn validate(&self) -> Result<(), EnvelopeError> {
        if self.protocol != PROTOCOL_VERSION {
            return Err(EnvelopeError::UnsupportedVersion(self.protocol));
        }
        if self.request_id == 0 {
            return Err(EnvelopeError::InvalidField("request id".to_owned()));
        }
        match &self.response {
            Response::Hello { epoch, cursor } => {
                epoch.validate()?;
                cursor.validate()?;
                if cursor.epoch != *epoch {
                    return Err(EnvelopeError::InvalidField("hello cursor epoch".to_owned()));
                }
            }
            Response::Subscribe(result) => {
                result.validate()?;
            }
            Response::Error { message, .. } => {
                validate_bounded_text(message, 256, "error message")?;
            }
            Response::Work { response } => response.validate()?,
            Response::Sessions { sessions } => {
                if sessions.len() > 10_000 {
                    return Err(EnvelopeError::InvalidField(
                        "session list length".to_owned(),
                    ));
                }
            }
            Response::TranscriptPage { page } => {
                if page.entries.len() > 100 {
                    return Err(EnvelopeError::InvalidField(
                        "transcript page length".to_owned(),
                    ));
                }
            }
            Response::Pong { .. }
            | Response::SkillsReplaced
            | Response::CoreAccepted
            | Response::Shutdown => {}
        }
        Ok(())
    }
}

/// Typed server-to-client frames.  The explicit outer tag keeps response and
/// event directions unambiguous without falling back to untyped JSON values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "frame", content = "payload", rename_all = "snake_case")]
pub enum ServerFrame {
    Response(ResponseEnvelope),
    Event(EventEnvelope),
}

impl ServerFrame {
    pub fn response(response: ResponseEnvelope) -> Self {
        Self::Response(response)
    }

    pub fn event(event: EventEnvelope) -> Self {
        Self::Event(event)
    }

    pub fn validate(&self) -> Result<(), EnvelopeError> {
        match self {
            Self::Response(response) => response.validate(),
            Self::Event(event) => event.validate(),
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum EnvelopeError {
    #[error("unsupported protocol version {0}")]
    UnsupportedVersion(u16),
    #[error("invalid {0}")]
    InvalidField(String),
}

pub fn validate_replay(
    epoch: &StreamEpoch,
    after_sequence: u64,
    events: &[EventEnvelope],
) -> Result<StreamCursor, ResetReason> {
    if after_sequence == u64::MAX && !events.is_empty() {
        return Err(ResetReason::LegacyCursor);
    }
    let mut expected = after_sequence + 1;
    for event in events {
        if event.protocol != PROTOCOL_VERSION || event.epoch != *epoch || event.sequence == 0 {
            return Err(ResetReason::StreamMismatch);
        }
        if event.sequence != expected {
            return Err(if event.sequence > expected {
                ResetReason::ReplayGap
            } else {
                ResetReason::LegacyCursor
            });
        }
        if expected == u64::MAX {
            if !std::ptr::eq(event, events.last().expect("non-empty replay")) {
                return Err(ResetReason::LegacyCursor);
            }
        } else {
            expected += 1;
        }
    }
    Ok(StreamCursor::new(
        epoch.clone(),
        events.last().map_or(after_sequence, |event| event.sequence),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;

    #[tokio::test]
    async fn framed_json_round_trip_and_rejections() {
        let (mut writer, mut reader) = duplex(1024);
        let request = RequestEnvelope::new(7, Request::Ping { nonce: 42 });
        write_json(&mut writer, &request).await.unwrap();
        let decoded: RequestEnvelope = read_json(&mut reader).await.unwrap();
        assert_eq!(decoded, request);

        let (mut writer, mut reader) = duplex(128);
        writer.write_all(&0u32.to_be_bytes()).await.unwrap();
        drop(writer);
        assert!(matches!(
            read_frame(&mut reader).await,
            Err(FrameError::Empty)
        ));

        let (mut writer, mut reader) = duplex(128);
        writer
            .write_all(&((MAX_FRAME_SIZE as u32) + 1).to_be_bytes())
            .await
            .unwrap();
        drop(writer);
        assert!(matches!(
            read_frame(&mut reader).await,
            Err(FrameError::Oversized(_))
        ));

        let (mut writer, mut reader) = duplex(128);
        writer.write_all(&4u32.to_be_bytes()).await.unwrap();
        writer.write_all(b"x").await.unwrap();
        drop(writer);
        assert!(matches!(
            read_frame(&mut reader).await,
            Err(FrameError::Truncated)
        ));
    }

    #[test]
    fn envelope_correlation_and_version_validation_is_strict() {
        let mut request = RequestEnvelope::new(1, Request::Ping { nonce: 7 });
        assert!(request.validate().is_ok());
        request.request_id = 0;
        assert!(
            matches!(request.validate(), Err(EnvelopeError::InvalidField(field)) if field == "request id")
        );
        request.request_id = 1;
        request.protocol = PROTOCOL_VERSION + 1;
        assert!(
            matches!(request.validate(), Err(EnvelopeError::UnsupportedVersion(version)) if version == PROTOCOL_VERSION + 1)
        );

        let mut response = ResponseEnvelope::new(2, Response::Pong { nonce: 7 });
        assert!(response.validate().is_ok());
        response.request_id = 0;
        assert!(
            matches!(response.validate(), Err(EnvelopeError::InvalidField(field)) if field == "request id")
        );
        response.request_id = 2;
        response.protocol = PROTOCOL_VERSION + 1;
        assert!(
            matches!(response.validate(), Err(EnvelopeError::UnsupportedVersion(version)) if version == PROTOCOL_VERSION + 1)
        );
    }

    #[test]
    fn hello_requires_matching_cursor_epoch() {
        let epoch = StreamEpoch::new("epoch-a").unwrap();
        let other = StreamEpoch::new("epoch-b").unwrap();
        let response = ResponseEnvelope::new(
            1,
            Response::Hello {
                epoch,
                cursor: StreamCursor::new(other, 0),
            },
        );
        assert!(matches!(
            response.validate(),
            Err(EnvelopeError::InvalidField(field)) if field == "hello cursor epoch"
        ));
    }

    #[test]
    fn replay_validation_rejects_gap_order_epoch_and_bad_terminal_cursor() {
        let epoch = StreamEpoch::new("epoch").unwrap();
        let other = StreamEpoch::new("other").unwrap();
        let event = |sequence| {
            EventEnvelope::new(
                epoch.clone(),
                sequence,
                TransportEvent::OwnerLifecycle {
                    state: OwnerState::Ready,
                },
            )
        };
        assert_eq!(validate_replay(&epoch, 0, &[event(1)]).unwrap().sequence, 1);
        assert_eq!(
            validate_replay(&epoch, 0, &[event(2)]),
            Err(ResetReason::ReplayGap)
        );
        assert_eq!(
            validate_replay(&epoch, 0, &[event(1), event(3)]),
            Err(ResetReason::ReplayGap)
        );
        let wrong_epoch = EventEnvelope::new(
            other.clone(),
            1,
            TransportEvent::OwnerLifecycle {
                state: OwnerState::Ready,
            },
        );
        assert_eq!(
            validate_replay(&epoch, 0, &[wrong_epoch]),
            Err(ResetReason::StreamMismatch)
        );

        let invalid_terminal = ResponseEnvelope::new(
            1,
            Response::Subscribe(SubscribeResult::Replay {
                cursor: StreamCursor::new(epoch.clone(), 2),
                events: vec![event(1)],
            }),
        );
        assert!(matches!(
            invalid_terminal.validate(),
            Err(EnvelopeError::InvalidField(field)) if field == "replay cursor"
        ));
        let empty = ResponseEnvelope::new(
            1,
            Response::Subscribe(SubscribeResult::Replay {
                cursor: StreamCursor::new(epoch.clone(), 2),
                events: Vec::new(),
            }),
        );
        assert!(empty.validate().is_ok());

        let replay_reset = ResponseEnvelope::new(
            1,
            Response::Subscribe(SubscribeResult::Replay {
                cursor: StreamCursor::new(epoch.clone(), 1),
                events: vec![EventEnvelope::new(
                    epoch.clone(),
                    1,
                    TransportEvent::Reset {
                        reason: ResetReason::ReplayGap,
                        cursor: StreamCursor::new(epoch.clone(), 1),
                    },
                )],
            }),
        );
        assert!(matches!(
            replay_reset.validate(),
            Err(EnvelopeError::InvalidField(field)) if field == "replay reset event"
        ));
    }

    #[test]
    fn nested_reset_cursor_must_match_event_epoch() {
        let epoch = StreamEpoch::new("epoch").unwrap();
        let other = StreamEpoch::new("other").unwrap();
        let event = EventEnvelope::new(
            epoch,
            1,
            TransportEvent::Reset {
                reason: ResetReason::ReplayGap,
                cursor: StreamCursor::new(other, 0),
            },
        );
        assert!(matches!(
            event.validate(),
            Err(EnvelopeError::InvalidField(field)) if field == "reset cursor epoch"
        ));
    }

    #[test]
    fn max_sequence_is_terminal_and_not_saturating() {
        let epoch = StreamEpoch::new("epoch").unwrap();
        let event = |sequence| {
            EventEnvelope::new(
                epoch.clone(),
                sequence,
                TransportEvent::OwnerLifecycle {
                    state: OwnerState::Ready,
                },
            )
        };
        assert_eq!(
            validate_replay(&epoch, u64::MAX - 1, &[event(u64::MAX)])
                .unwrap()
                .sequence,
            u64::MAX
        );
        assert_eq!(
            validate_replay(&epoch, u64::MAX, &[event(u64::MAX)]),
            Err(ResetReason::LegacyCursor)
        );
        assert_eq!(
            validate_replay(&epoch, u64::MAX - 1, &[event(u64::MAX), event(u64::MAX)]),
            Err(ResetReason::LegacyCursor)
        );

        let terminal = ResponseEnvelope::new(
            1,
            Response::Subscribe(SubscribeResult::Replay {
                cursor: StreamCursor::new(epoch.clone(), u64::MAX),
                events: vec![event(u64::MAX)],
            }),
        );
        assert!(terminal.validate().is_ok());
    }

    #[test]
    fn envelopes_have_no_untyped_payload_escape() {
        let request = RequestEnvelope::new(1, Request::Ping { nonce: 7 });
        let json = serde_json::to_string(&request).unwrap();
        assert!(!json.contains("Value"));
        assert!(request.validate().is_ok());
    }

    #[test]
    fn partial_rollback_requires_a_unique_nonempty_path_selection() {
        let request = |paths| {
            RequestEnvelope::new(
                1,
                Request::Work {
                    request: WorkRequest::RollbackRun {
                        run_id: "run".to_owned(),
                        snapshot_id: "snapshot".to_owned(),
                        paths,
                    },
                },
            )
        };
        assert!(request(None).validate().is_ok());
        assert!(request(Some(vec!["one.txt".to_owned()])).validate().is_ok());
        assert!(matches!(
            request(Some(Vec::new())).validate(),
            Err(EnvelopeError::InvalidField(field)) if field == "rollback paths"
        ));
        assert!(matches!(
            request(Some(vec!["one.txt".to_owned(), "one.txt".to_owned()])).validate(),
            Err(EnvelopeError::InvalidField(field)) if field == "rollback paths"
        ));
    }

    #[test]
    fn task_lifecycle_requests_require_cas_revision() {
        let request = RequestEnvelope::new(
            1,
            Request::Work {
                request: WorkRequest::SubmitForReview {
                    task_id: "task".to_owned(),
                    expected_revision: 0,
                },
            },
        );
        assert!(matches!(
            request.validate(),
            Err(EnvelopeError::InvalidField(field)) if field == "task expected revision"
        ));
    }

    #[test]
    fn server_frame_wrapper_round_trips_and_validates_direction() {
        let epoch = StreamEpoch::new("epoch").unwrap();
        let response = ServerFrame::response(ResponseEnvelope::new(
            9,
            Response::Hello {
                epoch: epoch.clone(),
                cursor: StreamCursor::new(epoch.clone(), 0),
            },
        ));
        let encoded = serde_json::to_string(&response).unwrap();
        assert!(encoded.contains("\"frame\":\"response\""));
        assert!(!encoded.contains("Value"));
        assert_eq!(
            serde_json::from_str::<ServerFrame>(&encoded).unwrap(),
            response
        );
        assert!(response.validate().is_ok());

        let event = ServerFrame::event(EventEnvelope::new(
            epoch,
            1,
            TransportEvent::OwnerLifecycle {
                state: OwnerState::Ready,
            },
        ));
        assert!(event.validate().is_ok());
        let mut invalid = event.clone();
        if let ServerFrame::Event(event) = &mut invalid {
            event.protocol = PROTOCOL_VERSION + 1;
        }
        assert!(matches!(
            invalid.validate(),
            Err(EnvelopeError::UnsupportedVersion(version)) if version == PROTOCOL_VERSION + 1
        ));
    }
}
