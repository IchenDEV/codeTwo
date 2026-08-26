//! Deterministic, transport-neutral device synchronization.
//!
//! The document and merge policy live in Core because SQLite is authoritative. Desktop hosts may
//! supply iCloud, paired-device, or future transports, but none of them owns a second data model.

use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{params, Connection};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::permission::{PermissionMode, SandboxPolicy};
use crate::provider::ProviderId;
use crate::session::now_millis;
use crate::session::{Part, Role};
use crate::store::{Store, StoreError};

pub const DEVICE_SYNC_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceSyncProject {
    pub path: String,
    pub name: String,
    pub last_opened_at: i64,
    pub added_at: i64,
    pub default_worktree_mode: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceSyncSession {
    pub id: String,
    pub title: String,
    pub title_origin: String,
    pub pinned: bool,
    pub archived: bool,
    /// Provider wire value (for example `codex`). Imports also accept the legacy DB JSON spelling.
    pub provider: String,
    pub model: Option<String>,
    pub cwd: String,
    pub project_path: Option<String>,
    pub permission_mode: String,
    pub sandbox_policy: String,
    pub memory_read: String,
    pub memory_write: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceSyncPart {
    pub sync_id: String,
    pub session_id: String,
    pub seq: i64,
    pub role: String,
    pub part_json: String,
    pub search_text: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceSyncMemory {
    pub id: String,
    pub project_path: String,
    pub session_id: Option<String>,
    pub layer: String,
    pub category: String,
    pub content: String,
    pub keywords_json: String,
    pub confidence: f64,
    pub pinned: bool,
    pub active: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub origin: String,
    pub forgotten_at: Option<i64>,
    pub supersedes_id: Option<String>,
    pub conflict_with_id: Option<String>,
    pub conflict_reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceSyncEntity {
    Project,
    Memory,
}

impl DeviceSyncEntity {
    fn as_db(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Memory => "memory",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceSyncTombstone {
    pub entity: DeviceSyncEntity,
    pub id: String,
    pub deleted_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceSyncDocument {
    pub schema_version: u32,
    pub revision: u64,
    pub generated_at: i64,
    pub writer_device_id: String,
    #[serde(default)]
    pub projects: Vec<DeviceSyncProject>,
    #[serde(default)]
    pub sessions: Vec<DeviceSyncSession>,
    #[serde(default)]
    pub parts: Vec<DeviceSyncPart>,
    #[serde(default)]
    pub memories: Vec<DeviceSyncMemory>,
    #[serde(default)]
    pub tombstones: Vec<DeviceSyncTombstone>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceSyncCounts {
    pub projects: usize,
    pub sessions: usize,
    pub parts: usize,
    pub memories: usize,
}

impl DeviceSyncDocument {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != DEVICE_SYNC_SCHEMA_VERSION {
            return Err("unsupported device sync document".into());
        }
        if self.writer_device_id.trim().is_empty() {
            return Err("device sync writer id is missing".into());
        }
        const MAX_ROWS: usize = 1_000_000;
        if self.projects.len() > MAX_ROWS
            || self.sessions.len() > MAX_ROWS
            || self.parts.len() > MAX_ROWS
            || self.memories.len() > MAX_ROWS
            || self.tombstones.len() > MAX_ROWS
        {
            return Err("device sync document contains too many rows".into());
        }
        if self
            .projects
            .iter()
            .any(|row| row.path.is_empty() || row.name.is_empty())
        {
            return Err("invalid project in device sync document".into());
        }
        for row in &self.sessions {
            if row.id.is_empty()
                || row.title.is_empty()
                || row.cwd.is_empty()
                || !matches!(
                    row.title_origin.as_str(),
                    "default" | "automatic" | "manual"
                )
                || normalize_json_enum::<ProviderId>(&row.provider).is_err()
                || normalize_json_enum::<PermissionMode>(&row.permission_mode).is_err()
                || normalize_json_enum::<SandboxPolicy>(&row.sandbox_policy).is_err()
                || !matches!(row.memory_read.as_str(), "inherit" | "allow" | "deny")
                || !matches!(row.memory_write.as_str(), "inherit" | "allow" | "deny")
            {
                return Err("invalid session in device sync document".into());
            }
        }
        for row in &self.parts {
            if row.sync_id.is_empty()
                || row.session_id.is_empty()
                || row.part_json.is_empty()
                || normalize_json_enum::<Role>(&row.role).is_err()
                || normalize_part_json(&row.part_json).is_err()
            {
                return Err("invalid transcript part in device sync document".into());
            }
        }
        for row in &self.memories {
            if row.id.is_empty()
                || row.project_path.is_empty()
                || row.content.trim().is_empty()
                || !matches!(row.layer.as_str(), "L1" | "L2")
                || !matches!(
                    row.category.as_str(),
                    "constraint" | "preference" | "fact" | "relationship" | "event" | "episode"
                )
                || !row.confidence.is_finite()
                || !(0.0..=1.0).contains(&row.confidence)
                || serde_json::from_str::<Vec<String>>(&row.keywords_json).is_err()
            {
                return Err("invalid memory in device sync document".into());
            }
        }
        if self.tombstones.iter().any(|row| row.id.is_empty()) {
            return Err("invalid tombstone in device sync document".into());
        }
        Ok(())
    }
}

fn normalize_json_enum<T>(value: &str) -> Result<String, String>
where
    T: DeserializeOwned + Serialize,
{
    let parsed = serde_json::from_str::<T>(value)
        .or_else(|_| serde_json::from_value::<T>(Value::String(value.to_string())))
        .map_err(|_| "invalid enum wire value".to_string())?;
    serde_json::to_string(&parsed).map_err(|error| error.to_string())
}

fn wire_string_from_db(value: String) -> String {
    serde_json::from_str::<String>(&value).unwrap_or(value)
}

fn normalize_part_json(value: &str) -> Result<String, String> {
    let mut value: Value = serde_json::from_str(value).map_err(|error| error.to_string())?;
    if let Some(object) = value.as_object_mut() {
        if object.get("kind").and_then(Value::as_str) == Some("prompt")
            && !object.contains_key("display")
        {
            let display = object
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            object.insert("display".into(), Value::String(display));
        }
    }
    let part = serde_json::from_value::<Part>(value).map_err(|error| error.to_string())?;
    serde_json::to_string(&part).map_err(|error| error.to_string())
}

fn canonical_value(value: &Value, output: &mut String) {
    match value {
        Value::Null => output.push_str("null"),
        Value::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        Value::Number(value) => output.push_str(&value.to_string()),
        Value::String(value) => output.push_str(&serde_json::to_string(value).unwrap_or_default()),
        Value::Array(values) => {
            output.push('[');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                canonical_value(value, output);
            }
            output.push(']');
        }
        Value::Object(values) => {
            output.push('{');
            let mut entries: Vec<_> = values.iter().collect();
            entries.sort_by(|(left, _), (right, _)| left.cmp(right));
            for (index, (key, value)) in entries.into_iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                output.push_str(&serde_json::to_string(key).unwrap_or_default());
                output.push(':');
                canonical_value(value, output);
            }
            output.push('}');
        }
    }
}

pub fn stable_device_sync_value<T: Serialize>(value: &T) -> String {
    let value = serde_json::to_value(value).unwrap_or(Value::Null);
    let mut output = String::new();
    canonical_value(&value, &mut output);
    output
}

/// Content address used by paired-device transports for optimistic writes.
///
/// Replica metadata is intentionally excluded: taking a fresh snapshot must not manufacture a
/// conflict when the synchronized rows did not change. Every collection is sorted by its stable
/// identity so SQLite row order cannot affect the version.
pub fn device_sync_snapshot_version(document: &DeviceSyncDocument) -> String {
    let mut projects = document.projects.clone();
    projects.sort_by(|left, right| left.path.cmp(&right.path));
    let mut sessions = document.sessions.clone();
    sessions.sort_by(|left, right| left.id.cmp(&right.id));
    let mut parts = document.parts.clone();
    parts.sort_by(|left, right| left.sync_id.cmp(&right.sync_id));
    let mut memories = document.memories.clone();
    memories.sort_by(|left, right| left.id.cmp(&right.id));
    let mut tombstones = document.tombstones.clone();
    tombstones.sort_by(|left, right| left.entity.cmp(&right.entity).then(left.id.cmp(&right.id)));

    let content = serde_json::json!({
        "schema_version": document.schema_version,
        "projects": projects,
        "sessions": sessions,
        "parts": parts,
        "memories": memories,
        "tombstones": tombstones,
    });
    let digest = Sha256::digest(stable_device_sync_value(&content).as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn select_latest<T, F, K>(
    documents: &[DeviceSyncDocument],
    select: F,
    key: K,
) -> BTreeMap<String, T>
where
    T: Clone + Serialize,
    F: Fn(&DeviceSyncDocument) -> &[T],
    K: Fn(&T) -> (&str, i64),
{
    let mut merged = BTreeMap::new();
    for document in documents {
        for item in select(document) {
            let (id, updated_at) = key(item);
            let replace = merged.get(id).is_none_or(|current| {
                let (_, current_updated_at) = key(current);
                updated_at > current_updated_at
                    || (updated_at == current_updated_at
                        && stable_device_sync_value(item) > stable_device_sync_value(current))
            });
            if replace {
                merged.insert(id.to_string(), item.clone());
            }
        }
    }
    merged
}

/// Deterministic last-write-wins merge for mutable rows plus an append-only transcript set.
pub fn merge_device_sync_documents(
    documents: &[DeviceSyncDocument],
    writer_device_id: &str,
    now: i64,
) -> Result<DeviceSyncDocument, String> {
    if documents.is_empty() {
        return Err("device sync merge requires at least one document".into());
    }
    for document in documents {
        document.validate()?;
    }

    let mut projects = select_latest(
        documents,
        |document| &document.projects,
        |item| (&item.path, item.updated_at),
    );
    let sessions = select_latest(
        documents,
        |document| &document.sessions,
        |item| (&item.id, item.updated_at),
    );
    let mut memories = select_latest(
        documents,
        |document| &document.memories,
        |item| (&item.id, item.updated_at),
    );

    let mut tombstones: BTreeMap<(DeviceSyncEntity, String), DeviceSyncTombstone> = BTreeMap::new();
    for document in documents {
        for tombstone in &document.tombstones {
            let key = (tombstone.entity, tombstone.id.clone());
            if tombstones
                .get(&key)
                .is_none_or(|current| tombstone.deleted_at > current.deleted_at)
            {
                tombstones.insert(key, tombstone.clone());
            }
        }
    }
    for tombstone in tombstones.values() {
        match tombstone.entity {
            DeviceSyncEntity::Project => {
                if projects
                    .get(&tombstone.id)
                    .is_none_or(|project| tombstone.deleted_at >= project.updated_at)
                {
                    projects.remove(&tombstone.id);
                }
            }
            DeviceSyncEntity::Memory => {
                if memories
                    .get(&tombstone.id)
                    .is_none_or(|memory| tombstone.deleted_at >= memory.updated_at)
                {
                    memories.remove(&tombstone.id);
                }
            }
        }
    }

    let session_ids: BTreeSet<_> = sessions.keys().cloned().collect();
    let mut parts: BTreeMap<String, DeviceSyncPart> = BTreeMap::new();
    for document in documents {
        for part in &document.parts {
            if !session_ids.contains(&part.session_id) {
                continue;
            }
            if parts.get(&part.sync_id).is_none_or(|current| {
                stable_device_sync_value(part) > stable_device_sync_value(current)
            }) {
                parts.insert(part.sync_id.clone(), part.clone());
            }
        }
    }
    let mut parts: Vec<_> = parts.into_values().collect();
    parts.sort_by(|left, right| {
        left.session_id
            .cmp(&right.session_id)
            .then(left.seq.cmp(&right.seq))
            .then(left.sync_id.cmp(&right.sync_id))
    });

    Ok(DeviceSyncDocument {
        schema_version: DEVICE_SYNC_SCHEMA_VERSION,
        revision: documents
            .iter()
            .map(|document| document.revision)
            .max()
            .unwrap_or(0)
            .saturating_add(1),
        generated_at: now,
        writer_device_id: writer_device_id.to_string(),
        projects: projects.into_values().collect(),
        sessions: sessions.into_values().collect(),
        parts,
        memories: memories.into_values().collect(),
        tombstones: tombstones.into_values().collect(),
    })
}

fn bool_from_i64(value: i64) -> bool {
    value != 0
}

fn snapshot_on(conn: &Connection, device_id: &str) -> Result<DeviceSyncDocument, StoreError> {
    let projects = {
        let mut statement = conn.prepare(
            "SELECT p.path,p.name,p.last_opened_at,p.added_at,p.default_worktree_mode,p.updated_at
             FROM projects p
             WHERE NOT EXISTS (
               SELECT 1 FROM sessions s
               WHERE s.worktree_path=p.path AND s.worktree_discarded=0
             )",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(DeviceSyncProject {
                path: row.get(0)?,
                name: row.get(1)?,
                last_opened_at: row.get(2)?,
                added_at: row.get(3)?,
                default_worktree_mode: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    let sessions = {
        let mut statement = conn.prepare(
            "SELECT id,title,title_origin,pinned,archived,provider,model,cwd,project_path,
                    permission_mode,sandbox_policy,memory_read,memory_write,created_at,updated_at
             FROM sessions WHERE transient=0",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(DeviceSyncSession {
                id: row.get(0)?,
                title: row.get(1)?,
                title_origin: row.get(2)?,
                pinned: bool_from_i64(row.get(3)?),
                archived: bool_from_i64(row.get(4)?),
                provider: wire_string_from_db(row.get(5)?),
                model: row.get(6)?,
                cwd: row.get(7)?,
                project_path: row.get(8)?,
                permission_mode: wire_string_from_db(row.get(9)?),
                sandbox_policy: wire_string_from_db(row.get(10)?),
                memory_read: row.get(11)?,
                memory_write: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    let parts = {
        let mut statement = conn.prepare(
            "SELECT p.sync_id,p.session_id,p.seq,p.role,p.part_json,p.search_text,p.created_at
             FROM parts p JOIN sessions s ON s.id=p.session_id WHERE s.transient=0",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(DeviceSyncPart {
                sync_id: row.get(0)?,
                session_id: row.get(1)?,
                seq: row.get(2)?,
                role: wire_string_from_db(row.get(3)?),
                part_json: row.get(4)?,
                search_text: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    let memories = {
        let mut statement = conn.prepare(
            "SELECT id,project_path,session_id,layer,category,content,keywords_json,confidence,
                    pinned,active,created_at,updated_at,origin,forgotten_at,supersedes_id,
                    conflict_with_id,conflict_reason
             FROM memories WHERE layer!='L3' AND (
               session_id IS NULL OR session_id IN (SELECT id FROM sessions WHERE transient=0)
             )",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(DeviceSyncMemory {
                id: row.get(0)?,
                project_path: row.get(1)?,
                session_id: row.get(2)?,
                layer: row.get(3)?,
                category: row.get(4)?,
                content: row.get(5)?,
                keywords_json: row.get(6)?,
                confidence: row.get(7)?,
                pinned: bool_from_i64(row.get(8)?),
                active: bool_from_i64(row.get(9)?),
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                origin: row.get(12)?,
                forgotten_at: row.get(13)?,
                supersedes_id: row.get(14)?,
                conflict_with_id: row.get(15)?,
                conflict_reason: row.get(16)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    let tombstones = {
        let mut statement = conn.prepare(
            "SELECT entity,entity_id,deleted_at FROM sync_tombstones ORDER BY entity,entity_id",
        )?;
        let rows = statement.query_map([], |row| {
            let entity: String = row.get(0)?;
            Ok(DeviceSyncTombstone {
                entity: if entity == "project" {
                    DeviceSyncEntity::Project
                } else {
                    DeviceSyncEntity::Memory
                },
                id: row.get(1)?,
                deleted_at: row.get(2)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    Ok(DeviceSyncDocument {
        schema_version: DEVICE_SYNC_SCHEMA_VERSION,
        revision: 0,
        generated_at: now_millis(),
        writer_device_id: device_id.to_string(),
        projects,
        sessions,
        parts,
        memories,
        tombstones,
    })
}

fn should_replace<T: Serialize>(
    current_updated_at: i64,
    current: &T,
    incoming_updated_at: i64,
    incoming: &T,
) -> bool {
    incoming_updated_at > current_updated_at
        || (incoming_updated_at == current_updated_at
            && stable_device_sync_value(incoming) > stable_device_sync_value(current))
}

impl Store {
    pub fn device_sync_snapshot(&self, device_id: &str) -> Result<DeviceSyncDocument, StoreError> {
        let connection = self.conn.lock().unwrap();
        snapshot_on(&connection, device_id)
    }

    pub fn import_device_sync_document(
        &self,
        document: &DeviceSyncDocument,
    ) -> Result<DeviceSyncCounts, StoreError> {
        document.validate().map_err(StoreError::InvalidDeviceSync)?;
        let mut connection = self.conn.lock().unwrap();
        let current = snapshot_on(&connection, &document.writer_device_id)?;
        let mut effective_tombstones: BTreeMap<(DeviceSyncEntity, String), i64> = current
            .tombstones
            .iter()
            .map(|row| ((row.entity, row.id.clone()), row.deleted_at))
            .collect();
        for row in &document.tombstones {
            let key = (row.entity, row.id.clone());
            effective_tombstones
                .entry(key)
                .and_modify(|deleted_at| *deleted_at = (*deleted_at).max(row.deleted_at))
                .or_insert(row.deleted_at);
        }
        let current_projects: BTreeMap<_, _> = current
            .projects
            .into_iter()
            .map(|row| (row.path.clone(), row))
            .collect();
        let current_sessions: BTreeMap<_, _> = current
            .sessions
            .into_iter()
            .map(|row| (row.id.clone(), row))
            .collect();
        let current_memories: BTreeMap<_, _> = current
            .memories
            .into_iter()
            .map(|row| (row.id.clone(), row))
            .collect();
        let transaction = connection.transaction()?;
        let mut counts = DeviceSyncCounts::default();

        for tombstone in &document.tombstones {
            transaction.execute(
                "INSERT INTO sync_tombstones(entity,entity_id,deleted_at) VALUES(?1,?2,?3)
                 ON CONFLICT(entity,entity_id) DO UPDATE SET deleted_at=MAX(deleted_at,excluded.deleted_at)",
                params![tombstone.entity.as_db(), tombstone.id, tombstone.deleted_at],
            )?;
            match tombstone.entity {
                DeviceSyncEntity::Project => {
                    transaction.execute(
                        "DELETE FROM projects WHERE path=?1 AND updated_at<=?2",
                        params![tombstone.id, tombstone.deleted_at],
                    )?;
                }
                DeviceSyncEntity::Memory => {
                    transaction.execute(
                        "DELETE FROM memories WHERE id=?1 AND updated_at<=?2",
                        params![tombstone.id, tombstone.deleted_at],
                    )?;
                }
            }
        }

        for project in &document.projects {
            if effective_tombstones
                .get(&(DeviceSyncEntity::Project, project.path.clone()))
                .is_some_and(|deleted_at| *deleted_at >= project.updated_at)
            {
                continue;
            }
            if current_projects.get(&project.path).is_some_and(|current| {
                !should_replace(current.updated_at, current, project.updated_at, project)
            }) {
                continue;
            }
            transaction.execute(
                "INSERT INTO projects(path,name,last_opened_at,added_at,default_worktree_mode,updated_at)
                 VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(path) DO UPDATE SET
                   name=excluded.name,last_opened_at=excluded.last_opened_at,
                   added_at=excluded.added_at,default_worktree_mode=excluded.default_worktree_mode,
                   updated_at=excluded.updated_at",
                params![
                    project.path,
                    project.name,
                    project.last_opened_at,
                    project.added_at,
                    project.default_worktree_mode,
                    project.updated_at,
                ],
            )?;
            transaction.execute(
                "DELETE FROM sync_tombstones WHERE entity='project' AND entity_id=?1 AND deleted_at<?2",
                params![project.path, project.updated_at],
            )?;
            counts.projects += 1;
        }

        for session in &document.sessions {
            if current_sessions.get(&session.id).is_some_and(|current| {
                !should_replace(current.updated_at, current, session.updated_at, session)
            }) {
                continue;
            }
            let provider = normalize_json_enum::<ProviderId>(&session.provider)
                .map_err(StoreError::InvalidDeviceSync)?;
            let permission_mode = normalize_json_enum::<PermissionMode>(&session.permission_mode)
                .map_err(StoreError::InvalidDeviceSync)?;
            let sandbox_policy = normalize_json_enum::<SandboxPolicy>(&session.sandbox_policy)
                .map_err(StoreError::InvalidDeviceSync)?;
            if current_sessions.contains_key(&session.id) {
                transaction.execute(
                    "UPDATE sessions SET title=?2,title_origin=?3,pinned=?4,archived=?5,
                       provider=?6,model=?7,cwd=?8,project_path=?9,permission_mode=?10,
                       sandbox_policy=?11,memory_read=?12,memory_write=?13,created_at=?14,
                       updated_at=?15 WHERE id=?1",
                    params![
                        session.id,
                        session.title,
                        session.title_origin,
                        session.pinned,
                        session.archived,
                        provider,
                        session.model,
                        session.cwd,
                        session.project_path,
                        permission_mode,
                        sandbox_policy,
                        session.memory_read,
                        session.memory_write,
                        session.created_at,
                        session.updated_at,
                    ],
                )?;
            } else {
                transaction.execute(
                    "INSERT INTO sessions(
                       id,title,title_origin,pinned,archived,transient,activity_json,provider,model,
                       cwd,project_path,worktree_path,worktree_discarded,permission_mode,
                       sandbox_policy,acp_session_id,memory_read,memory_write,created_at,updated_at
                     ) VALUES(?1,?2,?3,?4,?5,0,'{\"revision\":0,\"state\":{\"kind\":\"idle\"}}',
                       ?6,?7,?8,?9,NULL,0,?10,?11,NULL,?12,?13,?14,?15)",
                    params![
                        session.id,
                        session.title,
                        session.title_origin,
                        session.pinned,
                        session.archived,
                        provider,
                        session.model,
                        session.cwd,
                        session.project_path,
                        permission_mode,
                        sandbox_policy,
                        session.memory_read,
                        session.memory_write,
                        session.created_at,
                        session.updated_at,
                    ],
                )?;
            }
            counts.sessions += 1;
        }

        for part in &document.parts {
            let exists: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM parts WHERE sync_id=?1)",
                [&part.sync_id],
                |row| row.get(0),
            )?;
            if exists {
                continue;
            }
            let session_exists: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1)",
                [&part.session_id],
                |row| row.get(0),
            )?;
            if !session_exists {
                continue;
            }
            let sequence: i64 = transaction.query_row(
                "SELECT COALESCE(MAX(seq),-1)+1 FROM parts WHERE session_id=?1",
                [&part.session_id],
                |row| row.get(0),
            )?;
            let role =
                normalize_json_enum::<Role>(&part.role).map_err(StoreError::InvalidDeviceSync)?;
            let part_json =
                normalize_part_json(&part.part_json).map_err(StoreError::InvalidDeviceSync)?;
            transaction.execute(
                "INSERT INTO parts(session_id,seq,sync_id,role,part_json,search_text,created_at)
                 VALUES(?1,?2,?3,?4,?5,?6,?7)",
                params![
                    part.session_id,
                    sequence,
                    part.sync_id,
                    role,
                    part_json,
                    part.search_text,
                    part.created_at,
                ],
            )?;
            counts.parts += 1;
        }

        for memory in &document.memories {
            if effective_tombstones
                .get(&(DeviceSyncEntity::Memory, memory.id.clone()))
                .is_some_and(|deleted_at| *deleted_at >= memory.updated_at)
            {
                continue;
            }
            if current_memories.get(&memory.id).is_some_and(|current| {
                !should_replace(current.updated_at, current, memory.updated_at, memory)
            }) {
                continue;
            }
            transaction.execute(
                "INSERT INTO memories(
                   id,project_path,session_id,layer,category,content,keywords_json,confidence,
                   sources_json,pinned,active,created_at,updated_at,access_count,origin,forgotten_at,
                   supersedes_id,conflict_with_id,conflict_reason
                 ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'[]',?9,?10,?11,?12,0,?13,?14,?15,?16,?17)
                 ON CONFLICT(id) DO UPDATE SET
                   project_path=excluded.project_path,session_id=excluded.session_id,
                   layer=excluded.layer,category=excluded.category,content=excluded.content,
                   keywords_json=excluded.keywords_json,confidence=excluded.confidence,
                   pinned=excluded.pinned,active=excluded.active,created_at=excluded.created_at,
                   updated_at=excluded.updated_at,origin=excluded.origin,
                   forgotten_at=excluded.forgotten_at,supersedes_id=excluded.supersedes_id,
                   conflict_with_id=excluded.conflict_with_id,conflict_reason=excluded.conflict_reason",
                params![
                    memory.id,
                    memory.project_path,
                    memory.session_id,
                    memory.layer,
                    memory.category,
                    memory.content,
                    memory.keywords_json,
                    memory.confidence,
                    memory.pinned,
                    memory.active,
                    memory.created_at,
                    memory.updated_at,
                    memory.origin,
                    memory.forgotten_at,
                    memory.supersedes_id,
                    memory.conflict_with_id,
                    memory.conflict_reason,
                ],
            )?;
            transaction.execute(
                "DELETE FROM sync_tombstones WHERE entity='memory' AND entity_id=?1 AND deleted_at<?2",
                params![memory.id, memory.updated_at],
            )?;
            counts.memories += 1;
        }

        transaction.commit()?;
        Ok(counts)
    }

    pub fn device_sync_record_tombstone(
        &self,
        entity: DeviceSyncEntity,
        id: &str,
        deleted_at: i64,
    ) -> Result<(), StoreError> {
        let connection = self.conn.lock().unwrap();
        connection.execute(
            "INSERT INTO sync_tombstones(entity,entity_id,deleted_at) VALUES(?1,?2,?3)
             ON CONFLICT(entity,entity_id) DO UPDATE SET deleted_at=MAX(deleted_at,excluded.deleted_at)",
            params![entity.as_db(), id, deleted_at],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::ProviderId;
    use crate::session::{Part, Role, Session};

    #[test]
    fn concurrent_transcript_rows_merge_and_memory_tombstones_win() {
        let first = Store::open_in_memory().unwrap();
        let second = Store::open_in_memory().unwrap();
        let mut session = Session::new(ProviderId::Codex, "/workspace");
        session.id = "shared-session".into();
        first.upsert_session(&session).unwrap();
        first
            .append_part(
                &session.id,
                Role::User,
                &Part::Prompt {
                    text: "hello".into(),
                    display: "hello".into(),
                },
            )
            .unwrap();
        let memory = first
            .add_memory("/workspace", "constraint", "Use paired sync", true)
            .unwrap();

        let initial = first.device_sync_snapshot("first").unwrap();
        second.import_device_sync_document(&initial).unwrap();
        first
            .append_part(
                &session.id,
                Role::Agent,
                &Part::Text {
                    text: "first".into(),
                },
            )
            .unwrap();
        second
            .append_part(
                &session.id,
                Role::Agent,
                &Part::Text {
                    text: "second".into(),
                },
            )
            .unwrap();
        first.delete_memory(&memory.id).unwrap();

        let merged = merge_device_sync_documents(
            &[
                first.device_sync_snapshot("first").unwrap(),
                second.device_sync_snapshot("second").unwrap(),
            ],
            "first",
            now_millis(),
        )
        .unwrap();
        first.import_device_sync_document(&merged).unwrap();
        second.import_device_sync_document(&merged).unwrap();

        for store in [&first, &second] {
            let snapshot = store.device_sync_snapshot("check").unwrap();
            let text: BTreeSet<_> = snapshot
                .parts
                .iter()
                .filter_map(|part| serde_json::from_str::<Part>(&part.part_json).ok())
                .filter_map(|part| match part {
                    Part::Text { text } | Part::Prompt { text, .. } => Some(text),
                    _ => None,
                })
                .collect();
            assert!(text.contains("hello"));
            assert!(text.contains("first"));
            assert!(text.contains("second"));
            assert!(!snapshot.memories.iter().any(|item| item.id == memory.id));
        }
    }

    #[test]
    fn malformed_documents_are_rejected_before_sql() {
        let store = Store::open_in_memory().unwrap();
        let document = DeviceSyncDocument {
            schema_version: 99,
            revision: 0,
            generated_at: 0,
            writer_device_id: "peer".into(),
            projects: vec![],
            sessions: vec![],
            parts: vec![],
            memories: vec![],
            tombstones: vec![],
        };
        assert!(store.import_device_sync_document(&document).is_err());
    }

    #[test]
    fn bun_wire_enums_and_legacy_prompt_shape_import_as_core_rows() {
        let source = Store::open_in_memory().unwrap();
        let target = Store::open_in_memory().unwrap();
        let mut session = Session::new(ProviderId::Codex, "/workspace");
        session.id = "bun-compatible".into();
        source.upsert_session(&session).unwrap();
        source
            .append_part(
                &session.id,
                Role::User,
                &Part::Prompt {
                    text: "hello".into(),
                    display: "hello".into(),
                },
            )
            .unwrap();
        let mut document = source.device_sync_snapshot("source").unwrap();
        assert_eq!(document.sessions[0].provider, "codex");
        assert_eq!(document.sessions[0].permission_mode, "ask");
        assert_eq!(document.parts[0].role, "user");
        document.parts[0].part_json = r#"{"kind":"prompt","text":"hello"}"#.into();

        target.import_device_sync_document(&document).unwrap();
        let restored = target.get_session(&session.id).unwrap().unwrap();
        assert_eq!(restored.provider, ProviderId::Codex);
        let transcript = target.transcript(&session.id).unwrap();
        assert_eq!(transcript.len(), 1);
        assert_eq!(transcript[0].0, Role::User);
        assert!(matches!(
            &transcript[0].1,
            Part::Prompt { text, display } if text == "hello" && display == "hello"
        ));
    }

    #[test]
    fn importing_a_stale_row_cannot_resurrect_a_local_tombstone() {
        let store = Store::open_in_memory().unwrap();
        store.add_project("/deleted", Some("Deleted"), 100).unwrap();
        let stale = store.device_sync_snapshot("peer").unwrap();
        store.remove_project("/deleted").unwrap();

        let imported = store.import_device_sync_document(&stale).unwrap();
        assert_eq!(imported.projects, 0);
        assert!(store.list_projects().unwrap().is_empty());
        let snapshot = store.device_sync_snapshot("check").unwrap();
        assert!(snapshot.projects.is_empty());
        assert!(snapshot
            .tombstones
            .iter()
            .any(|row| row.entity == DeviceSyncEntity::Project && row.id == "/deleted"));
    }
}
