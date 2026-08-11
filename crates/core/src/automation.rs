//! Pure Work automation domain rules.
//!
//! The daemon owns scheduling and filesystem watching.  This module deliberately contains only
//! deterministic validation and occurrence calculation so it can be used by the daemon, tests,
//! and database projection without starting threads or touching provider state.

use std::fmt;
use std::path::{Component, Path, PathBuf};
use std::str::FromStr;

use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use croner::Cron;
use serde::{Deserialize, Serialize};

use crate::provider::ProviderId;
use crate::skill::DocBlock;

pub const MAX_AUTOMATION_ID_LEN: usize = 256;
pub const MAX_AUTOMATION_TASK_ID_LEN: usize = 256;
pub const MAX_PROMPT_BLOCKS: usize = 256;
pub const MAX_CRON_LEN: usize = 256;
pub const MAX_TIMEZONE_LEN: usize = 128;
pub const MAX_FILESYSTEM_PATTERNS: usize = 64;
pub const MAX_PATTERN_LEN: usize = 512;
pub const MAX_RECURRING_INTERVAL_MS: i64 = 366 * 24 * 60 * 60 * 1_000;
pub const MIN_RECURRING_INTERVAL_MS: i64 = 1_000;
pub const MAX_DUE_WINDOW_MS: i64 = 366 * 24 * 60 * 60 * 1_000;
pub const MAX_DUE_OCCURRENCES: usize = 10_000;
pub const MAX_AUTOMATION_PAYLOAD_BYTES: usize = 256 * 1024;
pub const MAX_MODEL_LEN: usize = 256;

/// Marker for the additive automation schema migration.  The Work-v1 and Work-MCP-v1 markers
/// remain separate; this marker is written only after the v2 transaction commits.
pub const AUTOMATION_SCHEMA_MARKER: &str = "work_v2";

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AutomationError {
    #[error("automation {0} is invalid")]
    Invalid(String),
    #[error("automation path is invalid: {0}")]
    InvalidPath(String),
    #[error("automation cron expression is invalid: {0}")]
    InvalidCron(String),
    #[error("automation timezone is invalid: {0}")]
    InvalidTimezone(String),
    #[error("automation occurrence range is too large")]
    RangeTooLarge,
}

fn bounded(value: &str, max: usize, field: &str) -> Result<(), AutomationError> {
    if value.is_empty() || value.len() > max || value.contains('\0') {
        return Err(AutomationError::Invalid(format!(
            "{field} is empty or too long"
        )));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScheduleTrigger {
    /// UTC instant in milliseconds since the Unix epoch.
    pub at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RecurringTrigger {
    pub every_ms: i64,
    pub anchor_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CronTrigger {
    pub expression: String,
    pub timezone: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FilesystemTrigger {
    pub patterns: Vec<String>,
    pub debounce_ms: i64,
    pub settle_ms: i64,
}

/// Trigger configuration is closed and serde tagged so malformed provider payloads fail closed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AutomationTrigger {
    Schedule(ScheduleTrigger),
    Recurring(RecurringTrigger),
    Cron(CronTrigger),
    Filesystem(FilesystemTrigger),
}

pub type AutomationTriggerConfig = AutomationTrigger;
pub type OneShotTrigger = ScheduleTrigger;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutomationValidation {
    Valid,
    Invalid { reason: String },
}

impl Default for AutomationValidation {
    fn default() -> Self {
        Self::Valid
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationSpec {
    pub id: String,
    pub task_id: String,
    /// `None` represents a legacy providerless row. Such rows are always disabled and invalid;
    /// callers may not infer a provider from workspace or global defaults.
    pub provider: Option<ProviderId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub prompt: Vec<DocBlock>,
    pub trigger: AutomationTrigger,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub revision: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_evaluated_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_due_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor_ms: Option<i64>,
    #[serde(default)]
    pub validation: AutomationValidation,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<i64>,
    #[serde(default)]
    pub tombstoned: bool,
}

fn default_enabled() -> bool {
    true
}

impl AutomationSpec {
    pub fn new(
        id: impl Into<String>,
        task_id: impl Into<String>,
        provider: ProviderId,
        trigger: AutomationTrigger,
        prompt: Vec<DocBlock>,
    ) -> Self {
        Self {
            id: id.into(),
            task_id: task_id.into(),
            provider: Some(provider),
            model: None,
            prompt,
            trigger,
            enabled: true,
            revision: 1,
            last_evaluated_at: None,
            next_due_at: None,
            cursor_ms: None,
            validation: AutomationValidation::Valid,
            created_at: None,
            updated_at: None,
            tombstoned: false,
        }
    }

    pub fn validate(&self) -> Result<(), AutomationError> {
        if let AutomationValidation::Invalid { reason } = &self.validation {
            return Err(AutomationError::Invalid(reason.clone()));
        }
        bounded(&self.id, MAX_AUTOMATION_ID_LEN, "id")?;
        bounded(&self.task_id, MAX_AUTOMATION_TASK_ID_LEN, "task_id")?;
        let provider = self
            .provider
            .as_ref()
            .ok_or_else(|| AutomationError::Invalid("provider is required".into()))?;
        if let ProviderId::Custom(value) = provider {
            bounded(value, 128, "provider")?;
        }
        if self.prompt.len() > MAX_PROMPT_BLOCKS {
            return Err(AutomationError::Invalid("prompt is too large".into()));
        }
        if let Some(model) = self.model.as_deref() {
            bounded(model, MAX_MODEL_LEN, "model")?;
        }
        for value in [
            serde_json::to_vec(&self.prompt),
            serde_json::to_vec(&self.trigger),
            serde_json::to_vec(&self.provider),
        ] {
            let value = value.map_err(|error| AutomationError::Invalid(error.to_string()))?;
            if value.len() > MAX_AUTOMATION_PAYLOAD_BYTES {
                return Err(AutomationError::Invalid(
                    "automation payload is too large".into(),
                ));
            }
        }
        if self.revision < 1 {
            return Err(AutomationError::Invalid("revision must be positive".into()));
        }
        self.trigger.validate()?;
        Ok(())
    }

    pub fn due_occurrences(
        &self,
        from_exclusive_ms: i64,
        to_inclusive_ms: i64,
    ) -> Result<Vec<DueOccurrence>, AutomationError> {
        self.validate()?;
        self.trigger
            .due_occurrences(from_exclusive_ms, to_inclusive_ms)
    }

    pub fn due_summary(
        &self,
        from_exclusive_ms: i64,
        to_inclusive_ms: i64,
    ) -> Result<Option<DueSummary>, AutomationError> {
        self.validate()?;
        self.trigger.due_summary(from_exclusive_ms, to_inclusive_ms)
    }
}

impl AutomationTrigger {
    pub fn validate(&self) -> Result<(), AutomationError> {
        match self {
            Self::Schedule(config) => {
                if config.at_ms < 0 {
                    return Err(AutomationError::Invalid(
                        "schedule instant must be non-negative".into(),
                    ));
                }
            }
            Self::Recurring(config) => {
                if !(MIN_RECURRING_INTERVAL_MS..=MAX_RECURRING_INTERVAL_MS)
                    .contains(&config.every_ms)
                {
                    return Err(AutomationError::Invalid(
                        "recurring interval is out of bounds".into(),
                    ));
                }
                if config.anchor_ms < 0 {
                    return Err(AutomationError::Invalid(
                        "recurring anchor must be non-negative".into(),
                    ));
                }
            }
            Self::Cron(config) => {
                bounded(&config.expression, MAX_CRON_LEN, "cron expression")?;
                bounded(&config.timezone, MAX_TIMEZONE_LEN, "timezone")?;
                // Persisted automation cron uses standard five-field minute cadence.  Reject
                // croner's optional seconds field so a provider cannot create an unbounded
                // one-second catch-up window; minute cadence still permits a full-year summary
                // using constant memory.
                if config.expression.split_whitespace().count() != 5 {
                    return Err(AutomationError::InvalidCron(
                        "cron expressions must use five minute fields".into(),
                    ));
                }
                config.parse_timezone()?;
                Cron::from_str(&config.expression)
                    .map_err(|error| AutomationError::InvalidCron(error.to_string()))?;
            }
            Self::Filesystem(config) => {
                if config.patterns.is_empty() || config.patterns.len() > MAX_FILESYSTEM_PATTERNS {
                    return Err(AutomationError::Invalid(
                        "filesystem patterns are out of bounds".into(),
                    ));
                }
                if config.debounce_ms < 0 || config.debounce_ms > 24 * 60 * 60 * 1_000 {
                    return Err(AutomationError::Invalid(
                        "filesystem debounce is out of bounds".into(),
                    ));
                }
                if config.settle_ms < 0 || config.settle_ms > 24 * 60 * 60 * 1_000 {
                    return Err(AutomationError::Invalid(
                        "filesystem settle is out of bounds".into(),
                    ));
                }
                for pattern in &config.patterns {
                    AutomationPathPolicy::validate_pattern(pattern)?;
                }
            }
        }
        Ok(())
    }

    pub fn due_occurrences(
        &self,
        from_exclusive_ms: i64,
        to_inclusive_ms: i64,
    ) -> Result<Vec<DueOccurrence>, AutomationError> {
        self.validate()?;
        if from_exclusive_ms >= to_inclusive_ms {
            return Ok(Vec::new());
        }
        if to_inclusive_ms.saturating_sub(from_exclusive_ms) > MAX_DUE_WINDOW_MS {
            return Err(AutomationError::RangeTooLarge);
        }
        match self {
            Self::Schedule(config) => {
                if config.at_ms > from_exclusive_ms && config.at_ms <= to_inclusive_ms {
                    Ok(vec![DueOccurrence::new(config.at_ms)])
                } else {
                    Ok(Vec::new())
                }
            }
            Self::Recurring(config) => {
                let first = if from_exclusive_ms < config.anchor_ms {
                    config.anchor_ms
                } else {
                    let elapsed = from_exclusive_ms - config.anchor_ms;
                    let steps = elapsed
                        .checked_div(config.every_ms)
                        .unwrap_or(0)
                        .saturating_add(1);
                    config
                        .anchor_ms
                        .checked_add(steps.saturating_mul(config.every_ms))
                        .ok_or_else(|| {
                            AutomationError::Invalid("recurring instant overflow".into())
                        })?
                };
                let mut values = Vec::new();
                let mut current = first;
                while current <= to_inclusive_ms {
                    if values.len() >= MAX_DUE_OCCURRENCES {
                        return Err(AutomationError::Invalid("too many due occurrences".into()));
                    }
                    values.push(DueOccurrence::new(current));
                    current = current.checked_add(config.every_ms).ok_or_else(|| {
                        AutomationError::Invalid("recurring instant overflow".into())
                    })?;
                }
                Ok(values)
            }
            Self::Cron(config) => cron_due_occurrences(config, from_exclusive_ms, to_inclusive_ms),
            Self::Filesystem(_) => Ok(Vec::new()),
        }
    }

    pub fn due_summary(
        &self,
        from_exclusive_ms: i64,
        to_inclusive_ms: i64,
    ) -> Result<Option<DueSummary>, AutomationError> {
        self.validate()?;
        if from_exclusive_ms >= to_inclusive_ms {
            return Ok(None);
        }
        if to_inclusive_ms.saturating_sub(from_exclusive_ms) > MAX_DUE_WINDOW_MS {
            return Err(AutomationError::RangeTooLarge);
        }
        match self {
            Self::Schedule(config)
                if config.at_ms > from_exclusive_ms && config.at_ms <= to_inclusive_ms =>
            {
                Ok(Some(DueSummary {
                    first_ms: config.at_ms,
                    last_ms: config.at_ms,
                    count: 1,
                }))
            }
            Self::Schedule(_) | Self::Filesystem(_) => Ok(None),
            Self::Recurring(config) => {
                let first = if from_exclusive_ms < config.anchor_ms {
                    config.anchor_ms
                } else {
                    let elapsed = from_exclusive_ms - config.anchor_ms;
                    let steps = elapsed
                        .checked_div(config.every_ms)
                        .unwrap_or(0)
                        .saturating_add(1);
                    config
                        .anchor_ms
                        .checked_add(steps.saturating_mul(config.every_ms))
                        .ok_or_else(|| {
                            AutomationError::Invalid("recurring instant overflow".into())
                        })?
                };
                if first > to_inclusive_ms {
                    return Ok(None);
                }
                let count = ((to_inclusive_ms - first) / config.every_ms) as u64 + 1;
                let last = first
                    .checked_add((count.saturating_sub(1) as i64).saturating_mul(config.every_ms))
                    .ok_or_else(|| AutomationError::Invalid("recurring instant overflow".into()))?;
                Ok(Some(DueSummary {
                    first_ms: first,
                    last_ms: last,
                    count,
                }))
            }
            Self::Cron(config) => cron_due_summary(config, from_exclusive_ms, to_inclusive_ms),
        }
    }
}

impl CronTrigger {
    fn parse_timezone(&self) -> Result<Tz, AutomationError> {
        self.timezone
            .parse::<Tz>()
            .map_err(|_| AutomationError::InvalidTimezone(self.timezone.clone()))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DueOccurrence {
    /// Stable key derived solely from the UTC instant. The database namespaces it by automation.
    pub occurrence_key: String,
    pub scheduled_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DueSummary {
    pub first_ms: i64,
    pub last_ms: i64,
    pub count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationPage<T> {
    pub items: Vec<T>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutomationRunStatus {
    Queued,
    Running,
    Waiting,
    Completed,
    Failed,
    Skipped,
}

impl AutomationRunStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Waiting => "waiting",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Skipped => "skipped",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "queued" => Self::Queued,
            "running" => Self::Running,
            "waiting" => Self::Waiting,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "skipped" => Self::Skipped,
            _ => return None,
        })
    }

    pub const fn is_active(self) -> bool {
        matches!(self, Self::Queued | Self::Running | Self::Waiting)
    }

    pub const fn can_transition_to(self, target: Self) -> bool {
        matches!(
            (self, target),
            (
                Self::Queued,
                Self::Running | Self::Waiting | Self::Failed | Self::Skipped
            ) | (
                Self::Running,
                Self::Waiting | Self::Completed | Self::Failed
            ) | (
                Self::Waiting,
                Self::Queued | Self::Running | Self::Failed | Self::Skipped
            )
        )
    }
}

/// Immutable execution inputs plus the mutable lifecycle of one claimed automation occurrence.
/// `coalesced_missed` records how many older due instants were folded into this one run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationRun {
    pub id: String,
    pub automation_id: String,
    pub occurrence_key: String,
    pub status: AutomationRunStatus,
    pub scheduled_at: i64,
    pub provider: ProviderId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub prompt: Vec<DocBlock>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub work_run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wait: Option<AutomationWait>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<AutomationFailure>,
    pub coalesced_missed: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub missed_start: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub missed_end: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl AutomationRun {
    pub fn validate(&self) -> Result<(), AutomationError> {
        bounded(&self.id, MAX_AUTOMATION_ID_LEN, "run id")?;
        bounded(
            &self.automation_id,
            MAX_AUTOMATION_ID_LEN,
            "run automation id",
        )?;
        bounded(
            &self.occurrence_key,
            MAX_AUTOMATION_ID_LEN,
            "occurrence key",
        )?;
        if self.scheduled_at < 0
            || self.created_at < 0
            || self.updated_at < self.created_at
            || self.started_at.is_some_and(|value| value < self.created_at)
            || self
                .finished_at
                .is_some_and(|value| value < self.created_at)
        {
            return Err(AutomationError::Invalid("run metadata".to_owned()));
        }
        if self.status == AutomationRunStatus::Running && self.started_at.is_none() {
            return Err(AutomationError::Invalid(
                "running occurrence needs started_at".to_owned(),
            ));
        }
        if matches!(
            self.status,
            AutomationRunStatus::Completed
                | AutomationRunStatus::Failed
                | AutomationRunStatus::Skipped
        ) && self.finished_at.is_none()
        {
            return Err(AutomationError::Invalid(
                "terminal occurrence needs finished_at".to_owned(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutomationWaitCode {
    ProviderUnavailable,
    CredentialUnavailable,
    KeychainLocked,
    RollbackDecision,
    WatcherUnavailable,
    Permission,
    Capacity,
    ManualReview,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationWait {
    pub code: AutomationWaitCode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutomationFailureCode {
    InvalidDefinition,
    InvalidPrompt,
    CredentialMissing,
    CredentialFailed,
    ProviderSpawn,
    ProviderUnavailable,
    ProviderFailed,
    Interrupted,
    Cancelled,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationFailure {
    pub code: AutomationFailureCode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutomationNotificationKind {
    Queued,
    Started,
    Waiting,
    Completed,
    Failed,
    Coalesced,
}

impl Default for AutomationNotificationKind {
    fn default() -> Self {
        Self::Queued
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AutomationNotification {
    #[serde(default = "default_notification_kind")]
    pub kind: AutomationNotificationKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
}

fn default_notification_kind() -> AutomationNotificationKind {
    AutomationNotificationKind::Queued
}

impl DueOccurrence {
    fn new(scheduled_at_ms: i64) -> Self {
        Self {
            occurrence_key: scheduled_at_ms.to_string(),
            scheduled_at_ms,
        }
    }
}

fn cron_due_occurrences(
    config: &CronTrigger,
    from_exclusive_ms: i64,
    to_inclusive_ms: i64,
) -> Result<Vec<DueOccurrence>, AutomationError> {
    let timezone = config.parse_timezone()?;
    let cron = Cron::from_str(&config.expression)
        .map_err(|error| AutomationError::InvalidCron(error.to_string()))?;
    let first = DateTime::<Utc>::from_timestamp_millis(from_exclusive_ms)
        .ok_or_else(|| AutomationError::Invalid("cron timestamp is out of range".into()))?
        .with_timezone(&timezone);
    let mut output = Vec::new();
    for next in cron.iter_after(first) {
        let instant = next.with_timezone(&Utc).timestamp_millis();
        if instant > to_inclusive_ms {
            break;
        }
        if output.len() >= MAX_DUE_OCCURRENCES {
            return Err(AutomationError::Invalid("too many due occurrences".into()));
        }
        output.push(DueOccurrence::new(instant));
    }
    Ok(output)
}

fn cron_due_summary(
    config: &CronTrigger,
    from_exclusive_ms: i64,
    to_inclusive_ms: i64,
) -> Result<Option<DueSummary>, AutomationError> {
    let timezone = config.parse_timezone()?;
    let cron = Cron::from_str(&config.expression)
        .map_err(|error| AutomationError::InvalidCron(error.to_string()))?;
    let first = DateTime::<Utc>::from_timestamp_millis(from_exclusive_ms)
        .ok_or_else(|| AutomationError::Invalid("cron timestamp is out of range".into()))?
        .with_timezone(&timezone);
    let mut summary: Option<DueSummary> = None;
    for next in cron.iter_after(first) {
        let instant = next.with_timezone(&Utc).timestamp_millis();
        if instant > to_inclusive_ms {
            break;
        }
        if let Some(current) = summary.as_mut() {
            current.last_ms = instant;
            current.count = current.count.saturating_add(1);
        } else {
            summary = Some(DueSummary {
                first_ms: instant,
                last_ms: instant,
                count: 1,
            });
        }
    }
    Ok(summary)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutomationPathPolicy {
    workspace_root: PathBuf,
}

impl AutomationPathPolicy {
    pub fn new(workspace_root: impl Into<PathBuf>) -> Self {
        Self {
            workspace_root: workspace_root.into(),
        }
    }

    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }

    /// Validate a relative path without touching the filesystem.
    pub fn validate_relative(path: &str) -> Result<PathBuf, AutomationError> {
        if path.is_empty() || path.len() > 4096 || path.contains('\0') || path.contains('\\') {
            return Err(AutomationError::InvalidPath(path.to_owned()));
        }
        let candidate = Path::new(path);
        if candidate.is_absolute() || has_drive_prefix(path) {
            return Err(AutomationError::InvalidPath(path.to_owned()));
        }
        let mut normalized = PathBuf::new();
        for (index, component) in candidate.components().enumerate() {
            match component {
                Component::Normal(segment) => {
                    let segment = segment.to_string_lossy();
                    if segment.is_empty() || segment == "." || segment == ".." {
                        return Err(AutomationError::InvalidPath(path.to_owned()));
                    }
                    if is_excluded_component(&segment, index == 0) {
                        return Err(AutomationError::InvalidPath(path.to_owned()));
                    }
                    normalized.push(segment.as_ref());
                }
                Component::CurDir
                | Component::ParentDir
                | Component::RootDir
                | Component::Prefix(_) => {
                    return Err(AutomationError::InvalidPath(path.to_owned()));
                }
            }
        }
        if normalized.as_os_str().is_empty() {
            return Err(AutomationError::InvalidPath(path.to_owned()));
        }
        Ok(normalized)
    }

    pub fn validate_pattern(pattern: &str) -> Result<(), AutomationError> {
        bounded(pattern, MAX_PATTERN_LEN, "filesystem pattern")?;
        if pattern.contains('\\') || pattern.starts_with('/') || has_drive_prefix(pattern) {
            return Err(AutomationError::InvalidPath(pattern.to_owned()));
        }
        for (index, component) in pattern.split('/').enumerate() {
            if component.is_empty() || component == "." || component == ".." {
                return Err(AutomationError::InvalidPath(pattern.to_owned()));
            }
            if is_excluded_component(component, index == 0) {
                return Err(AutomationError::InvalidPath(pattern.to_owned()));
            }
        }
        Ok(())
    }

    /// Validate the relative path and then re-check every existing component for symlinks and
    /// canonical containment. A missing final file is allowed because the watcher may evaluate a
    /// create event before the file is opened; callers that need an existing file can require it.
    pub fn validate(&self, path: &str) -> Result<PathBuf, AutomationError> {
        let relative = Self::validate_relative(path)?;
        let root = self
            .workspace_root
            .canonicalize()
            .map_err(|_| AutomationError::InvalidPath(path.to_owned()))?;
        let mut current = root.clone();
        for component in relative.components() {
            let Component::Normal(segment) = component else {
                return Err(AutomationError::InvalidPath(path.to_owned()));
            };
            current.push(segment);
            if let Ok(metadata) = std::fs::symlink_metadata(&current) {
                if metadata.file_type().is_symlink() {
                    return Err(AutomationError::InvalidPath(path.to_owned()));
                }
            }
        }
        let target = root.join(&relative);
        if target.exists() {
            let canonical = target
                .canonicalize()
                .map_err(|_| AutomationError::InvalidPath(path.to_owned()))?;
            if !canonical.starts_with(&root) {
                return Err(AutomationError::InvalidPath(path.to_owned()));
            }
        }
        Ok(relative)
    }

    pub fn is_eligible(&self, path: &str) -> bool {
        self.validate(path).is_ok()
    }
}

fn has_drive_prefix(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn is_excluded_component(component: &str, root_component: bool) -> bool {
    let value = component.to_ascii_lowercase();
    matches!(
        value.as_str(),
        "deliverables"
            | "attachments"
            | ".git"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".next"
            | ".cache"
            | ".codetwo"
    ) || (root_component
        && matches!(
            value.as_str(),
            "snapshots" | "snapshot" | "cache" | "output" | "outputs" | ".codetwo"
        ))
}

impl fmt::Display for AutomationValidation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Valid => formatter.write_str("valid"),
            Self::Invalid { reason } => write!(formatter, "invalid: {reason}"),
        }
    }
}

// Keep these imports in the module's dependency surface explicit. They also ensure the chrono
// versions used for UTC arithmetic remain stable when feature resolution changes.
