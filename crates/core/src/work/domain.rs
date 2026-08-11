use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::skill::DocBlock;

pub const MAX_WORK_PAGE_SIZE: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkVersioned<T> {
    pub entity: T,
    pub revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkPage<T> {
    pub items: Vec<WorkVersioned<T>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    pub high_water: u64,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(0)
}

fn validate_text(field: &str, value: &str, max: usize) -> Result<(), String> {
    if value.is_empty()
        || value.len() > max
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(format!("invalid Work {field}"));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceKind {
    External,
    Managed,
}

impl WorkspaceKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::External => "external",
            Self::Managed => "managed",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "external" => Some(Self::External),
            "managed" => Some(Self::Managed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub root_path: Option<String>,
    pub kind: WorkspaceKind,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Workspace {
    pub fn new(name: impl Into<String>, root_path: Option<String>, kind: WorkspaceKind) -> Self {
        let now = now_millis();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            root_path,
            kind,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        validate_text("workspace id", &self.id, 256)?;
        validate_text("workspace name", &self.name, 256)?;
        if let Some(root_path) = &self.root_path {
            validate_text("workspace root path", root_path, 4096)?;
        }
        if self.created_at < 0 || self.updated_at < self.created_at {
            return Err("invalid Work workspace timestamps".to_owned());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskExperience {
    Code,
    Work,
}

impl TaskExperience {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Code => "code",
            Self::Work => "work",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "code" => Some(Self::Code),
            "work" => Some(Self::Work),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Draft,
    Active,
    Waiting,
    Review,
    Completed,
    Failed,
    Cancelled,
}

impl TaskStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Active => "active",
            Self::Waiting => "waiting",
            Self::Review => "review",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "draft" => Some(Self::Draft),
            "active" => Some(Self::Active),
            "waiting" => Some(Self::Waiting),
            "review" => Some(Self::Review),
            "completed" => Some(Self::Completed),
            "failed" => Some(Self::Failed),
            "cancelled" => Some(Self::Cancelled),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub experience: TaskExperience,
    pub status: TaskStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_brief_revision: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub archived: bool,
}

impl Task {
    pub fn new(workspace_id: impl Into<String>, experience: TaskExperience) -> Self {
        Self::named(workspace_id, "Untitled task", experience)
    }

    pub fn named(
        workspace_id: impl Into<String>,
        title: impl Into<String>,
        experience: TaskExperience,
    ) -> Self {
        let title = title.into();
        let title = if title.trim().is_empty() {
            "Untitled task".to_owned()
        } else {
            title
        };
        let now = now_millis();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            workspace_id: workspace_id.into(),
            title,
            experience,
            status: TaskStatus::Draft,
            current_brief_revision: None,
            created_at: now,
            updated_at: now,
            archived: false,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        validate_text("task id", &self.id, 256)?;
        validate_text("task workspace id", &self.workspace_id, 256)?;
        validate_text("task title", &self.title, 512)?;
        if self
            .current_brief_revision
            .is_some_and(|revision| revision < 1)
        {
            return Err("invalid Work brief revision pointer".to_owned());
        }
        if self.created_at < 0 || self.updated_at < self.created_at {
            return Err("invalid Work task timestamps".to_owned());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BriefRevision {
    pub id: String,
    pub task_id: String,
    pub revision: i64,
    pub blocks: Vec<DocBlock>,
    pub source: String,
    pub created_at: i64,
}

impl BriefRevision {
    pub fn new(
        task_id: impl Into<String>,
        revision: i64,
        blocks: Vec<DocBlock>,
        source: impl Into<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            task_id: task_id.into(),
            revision,
            blocks,
            source: source.into(),
            created_at: now_millis(),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        validate_text("brief id", &self.id, 256)?;
        validate_text("brief task id", &self.task_id, 256)?;
        validate_text("brief source", &self.source, 160)?;
        if self.revision < 1 || self.created_at < 0 {
            return Err("invalid Work brief revision".to_owned());
        }
        Ok(())
    }
}
