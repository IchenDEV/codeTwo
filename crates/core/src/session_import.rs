//! Import visible conversation text from provider-owned transcripts and message databases.

use crate::provider::ProviderId;
use crate::session::{
    initial_session_title, Part, Role, Session, SessionTitleOrigin, TranscriptEntry,
};
use crate::store::Store;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;
use std::time::Duration;

const MAX_IMPORT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_IMPORT_ENTRIES: usize = 50_000;
const MAX_MESSAGE_CHARS: usize = 1_048_576;
const MAX_DATABASE_SESSIONS: usize = 5_000;
const MAX_DATABASE_MESSAGES: usize = 500_000;
const MAX_DATABASE_VISIBLE_CHARS: usize = 512 * 1024 * 1024;
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

#[derive(Debug, Serialize)]
pub struct SessionImportReport {
    pub files: usize,
    pub imported: usize,
    pub skipped: usize,
    pub failed: usize,
    pub messages: usize,
    pub sessions: Vec<ImportedSessionSummary>,
    pub errors: Vec<SessionImportError>,
}

#[derive(Debug, Serialize)]
pub struct ImportedSessionSummary {
    pub id: String,
    pub title: String,
    pub source: &'static str,
    pub messages: usize,
    pub imported: bool,
    pub cwd: String,
    pub project_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SessionImportError {
    pub path: String,
    pub message: String,
}

struct ParsedSession {
    session: Session,
    source: ImportSource,
    entries: Vec<TranscriptEntry>,
}

#[derive(Clone, Copy)]
enum ImportSource {
    Codex,
    ClaudeCode,
    Cursor,
    T3Code,
}

impl ImportSource {
    fn label(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::ClaudeCode => "Claude Code",
            Self::Cursor => "Cursor",
            Self::T3Code => "T3 Code",
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claude-code",
            Self::Cursor => "cursor",
            Self::T3Code => "t3-code",
        }
    }
}

struct VisibleMessage {
    role: Role,
    text: String,
    created_at: Option<i64>,
}

/// Parse and import every selected file independently. One malformed file never rolls back a
/// different valid file, while each individual session is committed atomically.
pub fn import_session_files(
    store: &Store,
    paths: &[String],
    fallback_cwd: &str,
) -> SessionImportReport {
    let mut report = SessionImportReport {
        files: paths.len(),
        imported: 0,
        skipped: 0,
        failed: 0,
        messages: 0,
        sessions: Vec::new(),
        errors: Vec::new(),
    };

    for selected in paths {
        let path = Path::new(selected);
        match parse_session_file(path, fallback_cwd) {
            Ok(parsed_sessions) => {
                for parsed in parsed_sessions {
                    let imported = match store.import_session(&parsed.session, &parsed.entries) {
                        Ok(imported) => imported,
                        Err(error) => {
                            report.failed += 1;
                            report.errors.push(SessionImportError {
                                path: format!("{selected}#{}", parsed.session.id),
                                message: error.to_string(),
                            });
                            continue;
                        }
                    };
                    if imported {
                        report.imported += 1;
                        report.messages += parsed.entries.len();
                    } else {
                        report.skipped += 1;
                    }
                    report.sessions.push(ImportedSessionSummary {
                        id: parsed.session.id,
                        title: parsed.session.title,
                        source: parsed.source.label(),
                        messages: parsed.entries.len(),
                        imported,
                        cwd: parsed.session.cwd,
                        project_path: parsed.session.project_path,
                    });
                }
            }
            Err(message) => {
                report.failed += 1;
                report.errors.push(SessionImportError {
                    path: selected.clone(),
                    message,
                });
            }
        }
    }

    report
}

fn parse_session_file(path: &Path, fallback_cwd: &str) -> Result<Vec<ParsedSession>, String> {
    if !path.is_absolute() {
        return Err("the selected path is not absolute".into());
    }
    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("could not inspect the selected file: {error}"))?;
    if !metadata.is_file() {
        return Err("the selected path is not a file".into());
    }
    let mut header = [0_u8; SQLITE_HEADER.len()];
    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("could not open the selected file: {error}"))?;
    let header_len = file
        .read(&mut header)
        .map_err(|error| format!("could not inspect the selected file header: {error}"))?;
    if header_len == SQLITE_HEADER.len() && &header == SQLITE_HEADER {
        return parse_sqlite_database(path, fallback_cwd);
    }

    if metadata.len() > MAX_IMPORT_BYTES {
        return Err("non-database imports must be 64 MB or smaller".into());
    }
    let content = std::fs::read_to_string(path)
        .map_err(|error| format!("could not read the selected file as UTF-8: {error}"))?;
    let mut records = Vec::new();
    for (index, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        records.push(
            serde_json::from_str::<Value>(line)
                .map_err(|error| format!("line {} is not valid JSON: {error}", index + 1))?,
        );
    }
    if records.is_empty() {
        return Err("the selected file contains no JSONL records".into());
    }

    let source = detect_source(&records).ok_or_else(|| {
        "the file is not a supported Codex or Claude Code JSONL session".to_string()
    })?;
    let parsed = match source {
        ImportSource::Codex => parse_codex(records, fallback_cwd),
        ImportSource::ClaudeCode => parse_claude(records, fallback_cwd),
        ImportSource::Cursor | ImportSource::T3Code => unreachable!("SQLite-only source"),
    }?;
    Ok(vec![parsed])
}

fn parse_sqlite_database(path: &Path, fallback_cwd: &str) -> Result<Vec<ParsedSession>, String> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("could not open the selected SQLite database read-only: {error}"))?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| format!("could not configure the SQLite read timeout: {error}"))?;

    if table_exists(&connection, "composerHeaders")? && table_exists(&connection, "cursorDiskKV")? {
        return parse_cursor_database(&connection, fallback_cwd);
    }
    if table_exists(&connection, "projection_threads")?
        && table_exists(&connection, "projection_thread_messages")?
        && table_exists(&connection, "projection_projects")?
    {
        return parse_t3_database(&connection, fallback_cwd);
    }
    Err("the SQLite database is not a supported Cursor or T3 Code message store".into())
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [table],
            |row| row.get(0),
        )
        .map_err(|error| format!("could not inspect the SQLite schema: {error}"))
}

fn table_has_column(connection: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| format!("could not inspect the {table} schema: {error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("could not read the {table} schema: {error}"))?;
    for candidate in columns {
        if candidate.map_err(|error| error.to_string())? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

struct CursorSessionMeta {
    id: String,
    title: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    created_at: Option<i64>,
    messages: Vec<VisibleMessage>,
}

fn parse_cursor_database(
    connection: &Connection,
    fallback_cwd: &str,
) -> Result<Vec<ParsedSession>, String> {
    let has_subagent = table_has_column(connection, "composerHeaders", "isSubagent")?;
    let query = if has_subagent {
        "SELECT composerId, createdAt, value, COALESCE(isSubagent, 0)
         FROM composerHeaders ORDER BY createdAt, composerId"
    } else {
        "SELECT composerId, createdAt, value, 0
         FROM composerHeaders ORDER BY createdAt, composerId"
    };
    let mut statement = connection
        .prepare(query)
        .map_err(|error| format!("could not prepare the Cursor session query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|error| format!("could not read Cursor session headers: {error}"))?;

    let mut sessions = Vec::new();
    for row in rows {
        let (id, created_at, header_json, is_subagent) =
            row.map_err(|error| format!("could not decode a Cursor session header: {error}"))?;
        if is_subagent != 0 {
            continue;
        }
        let header = header_json
            .as_deref()
            .and_then(|value| serde_json::from_str::<Value>(value).ok())
            .unwrap_or(Value::Null);
        let cwd = string_at(&header, &["workspaceIdentifier", "uri", "fsPath"])
            .or_else(|| string_at(&header, &["agentLocation", "environment", "uri", "fsPath"]));
        sessions.push(CursorSessionMeta {
            id,
            title: string_at(&header, &["name"]),
            cwd,
            model: None,
            created_at: created_at.and_then(|value| timestamp_ms(Some(&Value::from(value)))),
            messages: Vec::new(),
        });
        if sessions.len() > MAX_DATABASE_SESSIONS {
            return Err(format!(
                "the Cursor database contains more than {MAX_DATABASE_SESSIONS} top-level sessions"
            ));
        }
    }
    if sessions.is_empty() {
        return Err("the Cursor database contains no top-level session headers".into());
    }

    let indexes: HashMap<String, usize> = sessions
        .iter()
        .enumerate()
        .map(|(index, session)| (session.id.clone(), index))
        .collect();
    let mut statement = connection
        .prepare(
            "SELECT key, CAST(value AS TEXT)
             FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' ORDER BY rowid",
        )
        .map_err(|error| format!("could not prepare the Cursor message query: {error}"))?;
    let mut rows = statement
        .query([])
        .map_err(|error| format!("could not read Cursor messages: {error}"))?;
    let mut message_count = 0_usize;
    let mut visible_chars = 0_usize;
    while let Some(row) = rows
        .next()
        .map_err(|error| format!("could not decode a Cursor message row: {error}"))?
    {
        let key: String = row
            .get(0)
            .map_err(|error| format!("could not read a Cursor message key: {error}"))?;
        let Some((composer_id, _)) = key
            .strip_prefix("bubbleId:")
            .and_then(|value| value.split_once(':'))
        else {
            continue;
        };
        let Some(index) = indexes.get(composer_id).copied() else {
            continue;
        };
        let encoded: Option<String> = row
            .get(1)
            .map_err(|error| format!("could not read Cursor message {key}: {error}"))?;
        let Some(encoded) = encoded else {
            continue;
        };
        let message: Value = serde_json::from_str(&encoded)
            .map_err(|error| format!("Cursor message {key} is not valid JSON: {error}"))?;
        let role = match message.get("type") {
            Some(Value::Number(value)) if value.as_i64() == Some(1) => Role::User,
            Some(Value::Number(value)) if value.as_i64() == Some(2) => Role::Agent,
            Some(Value::String(value)) if value == "user" => Role::User,
            Some(Value::String(value)) if value == "assistant" => Role::Agent,
            _ => continue,
        };
        let text = message
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if text.trim().is_empty() {
            continue;
        }
        message_count += 1;
        visible_chars = visible_chars.saturating_add(text.chars().count());
        enforce_database_limits(message_count, visible_chars, "Cursor")?;
        sessions[index].model = sessions[index]
            .model
            .take()
            .or_else(|| string_at(&message, &["modelInfo", "modelName"]));
        push_message(
            &mut sessions[index].messages,
            role,
            text,
            timestamp_ms(message.get("createdAt")),
        )?;
    }

    let mut parsed = Vec::new();
    for session in sessions {
        if session.messages.is_empty() {
            continue;
        }
        parsed.push(build_session(
            ImportSource::Cursor,
            ProviderId::Cursor,
            Some(session.id),
            None,
            session.title,
            session.cwd,
            session.model,
            session.created_at,
            session.messages,
            fallback_cwd,
        )?);
    }
    if parsed.is_empty() {
        return Err("the Cursor database contains no visible user or assistant messages".into());
    }
    Ok(parsed)
}

struct T3SessionMeta {
    id: String,
    title: Option<String>,
    cwd: Option<String>,
    provider: ProviderId,
    provider_session_id: Option<String>,
    model: Option<String>,
    created_at: Option<i64>,
}

fn parse_t3_database(
    connection: &Connection,
    fallback_cwd: &str,
) -> Result<Vec<ParsedSession>, String> {
    let mut statement = connection
        .prepare(
            "SELECT t.thread_id, t.title, p.workspace_root, t.created_at,
                    s.provider_name, s.provider_session_id, t.model_selection_json
             FROM projection_threads t
             LEFT JOIN projection_projects p ON p.project_id=t.project_id
             LEFT JOIN projection_thread_sessions s ON s.thread_id=t.thread_id
             WHERE t.deleted_at IS NULL
             ORDER BY t.created_at, t.thread_id",
        )
        .map_err(|error| format!("could not prepare the T3 Code thread query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|error| format!("could not read T3 Code threads: {error}"))?;
    let mut sessions = Vec::new();
    for row in rows {
        let (id, title, cwd, created_at, provider_name, provider_session_id, selection_json) =
            row.map_err(|error| format!("could not decode a T3 Code thread: {error}"))?;
        let selection = selection_json
            .as_deref()
            .and_then(|value| serde_json::from_str::<Value>(value).ok())
            .unwrap_or(Value::Null);
        let provider_name = provider_name
            .or_else(|| string_at(&selection, &["instanceId"]))
            .unwrap_or_else(|| "t3".into());
        sessions.push(T3SessionMeta {
            id,
            title,
            cwd,
            provider: provider_from_slug(&provider_name),
            provider_session_id,
            model: string_at(&selection, &["model"]),
            created_at: created_at
                .as_deref()
                .and_then(|value| timestamp_ms(Some(&Value::from(value)))),
        });
        if sessions.len() > MAX_DATABASE_SESSIONS {
            return Err(format!(
                "the T3 Code database contains more than {MAX_DATABASE_SESSIONS} sessions"
            ));
        }
    }

    let mut message_statement = connection
        .prepare(
            "SELECT role, text, created_at
             FROM projection_thread_messages
             WHERE thread_id=?1 ORDER BY created_at, message_id",
        )
        .map_err(|error| format!("could not prepare the T3 Code message query: {error}"))?;
    let mut parsed = Vec::new();
    let mut message_count = 0_usize;
    let mut visible_chars = 0_usize;
    for session in sessions {
        let rows = message_statement
            .query_map([&session.id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|error| format!("could not read T3 Code thread {}: {error}", session.id))?;
        let mut messages = Vec::new();
        for row in rows {
            let (role, text, created_at) = row.map_err(|error| {
                format!("could not decode T3 Code thread {}: {error}", session.id)
            })?;
            let role = match role.as_str() {
                "user" => Role::User,
                "assistant" => Role::Agent,
                _ => continue,
            };
            if text.trim().is_empty() {
                continue;
            }
            message_count += 1;
            visible_chars = visible_chars.saturating_add(text.chars().count());
            enforce_database_limits(message_count, visible_chars, "T3 Code")?;
            push_message(
                &mut messages,
                role,
                text,
                created_at
                    .as_deref()
                    .and_then(|value| timestamp_ms(Some(&Value::from(value)))),
            )?;
        }
        if messages.is_empty() {
            continue;
        }
        parsed.push(build_session(
            ImportSource::T3Code,
            session.provider,
            Some(session.id),
            session.provider_session_id,
            session.title,
            session.cwd,
            session.model,
            session.created_at,
            messages,
            fallback_cwd,
        )?);
    }
    if parsed.is_empty() {
        return Err("the T3 Code database contains no visible user or assistant messages".into());
    }
    Ok(parsed)
}

fn enforce_database_limits(
    messages: usize,
    visible_chars: usize,
    source: &str,
) -> Result<(), String> {
    if messages > MAX_DATABASE_MESSAGES {
        return Err(format!(
            "the {source} database contains more than {MAX_DATABASE_MESSAGES} visible messages"
        ));
    }
    if visible_chars > MAX_DATABASE_VISIBLE_CHARS {
        return Err(format!(
            "the {source} database contains more than 512 MB of visible message text"
        ));
    }
    Ok(())
}

fn provider_from_slug(value: &str) -> ProviderId {
    match value {
        "claudeAgent" | "claude_code" => ProviderId::ClaudeCode,
        "codex" => ProviderId::Codex,
        "grok" => ProviderId::Grok,
        "cursor" => ProviderId::Cursor,
        "opencode" => ProviderId::OpenCode,
        "opencode2" => ProviderId::OpenCode2,
        "pi" => ProviderId::Pi,
        "kimi" => ProviderId::Kimi,
        "zcode" => ProviderId::ZCode,
        "amp" => ProviderId::Amp,
        "droid" => ProviderId::Droid,
        other => ProviderId::Custom(other.to_string()),
    }
}

fn detect_source(records: &[Value]) -> Option<ImportSource> {
    if records.iter().any(|record| {
        matches!(
            record.get("type").and_then(Value::as_str),
            Some("session_meta" | "response_item")
        )
    }) {
        return Some(ImportSource::Codex);
    }
    records
        .iter()
        .any(|record| {
            matches!(
                record.get("type").and_then(Value::as_str),
                Some("user" | "assistant")
            ) && (record.get("sessionId").is_some() || record.get("message").is_some())
        })
        .then_some(ImportSource::ClaudeCode)
}

fn parse_codex(records: Vec<Value>, fallback_cwd: &str) -> Result<ParsedSession, String> {
    let mut external_id = None;
    let mut cwd = None;
    let mut model = None;
    let mut created_at = None;
    let mut messages = Vec::new();

    for record in &records {
        let timestamp = timestamp_ms(record.get("timestamp"));
        created_at = earliest(created_at, timestamp);
        match record.get("type").and_then(Value::as_str) {
            Some("session_meta") => {
                let payload = record.get("payload").unwrap_or(&Value::Null);
                external_id = external_id.or_else(|| string_at(payload, &["id"]));
                cwd = cwd.or_else(|| string_at(payload, &["cwd"]));
                created_at = earliest(created_at, timestamp_ms(payload.get("timestamp")));
            }
            Some("turn_context") => {
                let payload = record.get("payload").unwrap_or(&Value::Null);
                model = model
                    .or_else(|| string_at(payload, &["model"]))
                    .or_else(|| string_at(payload, &["turn_context", "model"]));
                cwd = cwd.or_else(|| string_at(payload, &["cwd"]));
            }
            Some("response_item") => {
                let payload = record.get("payload").unwrap_or(&Value::Null);
                if payload.get("type").and_then(Value::as_str) != Some("message") {
                    continue;
                }
                let role = match payload.get("role").and_then(Value::as_str) {
                    Some("user") => Role::User,
                    Some("assistant") => Role::Agent,
                    _ => continue,
                };
                let text = codex_message_text(payload.get("content"), role);
                push_message(&mut messages, role, text, timestamp)?;
            }
            _ => {}
        }
    }

    build_session(
        ImportSource::Codex,
        ProviderId::Codex,
        external_id.clone(),
        external_id,
        None,
        cwd,
        model,
        created_at,
        messages,
        fallback_cwd,
    )
}

fn parse_claude(records: Vec<Value>, fallback_cwd: &str) -> Result<ParsedSession, String> {
    let mut external_id = None;
    let mut cwd = None;
    let mut model = None;
    let mut created_at = None;
    let mut messages = Vec::new();
    let mut seen = HashSet::new();

    for record in &records {
        external_id = external_id
            .or_else(|| string_at(record, &["sessionId"]))
            .or_else(|| string_at(record, &["session_id"]));
        cwd = cwd.or_else(|| string_at(record, &["cwd"]));
        let timestamp = timestamp_ms(record.get("timestamp"));
        created_at = earliest(created_at, timestamp);

        let role = match record.get("type").and_then(Value::as_str) {
            Some("user") if record.get("isMeta").and_then(Value::as_bool) != Some(true) => {
                Role::User
            }
            Some("assistant") => Role::Agent,
            _ => continue,
        };
        let message = record.get("message").unwrap_or(&Value::Null);
        model = model.or_else(|| string_at(message, &["model"]));
        if let Some(key) = string_at(record, &["uuid"]).or_else(|| string_at(message, &["id"])) {
            let role_key = match role {
                Role::User => "user",
                Role::Agent => "agent",
            };
            if !seen.insert(format!("{role_key}:{key}")) {
                continue;
            }
        }
        let text = claude_message_text(message.get("content"));
        push_message(&mut messages, role, text, timestamp)?;
    }

    build_session(
        ImportSource::ClaudeCode,
        ProviderId::ClaudeCode,
        external_id.clone(),
        external_id,
        None,
        cwd,
        model,
        created_at,
        messages,
        fallback_cwd,
    )
}

fn build_session(
    source: ImportSource,
    provider: ProviderId,
    external_id: Option<String>,
    resume_id: Option<String>,
    explicit_title: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    created_at: Option<i64>,
    messages: Vec<VisibleMessage>,
    fallback_cwd: &str,
) -> Result<ParsedSession, String> {
    let external_id = external_id.ok_or_else(|| "the session ID is missing".to_string())?;
    if messages.is_empty() {
        return Err("the session contains no visible user or assistant text".into());
    }
    if messages.len() > MAX_IMPORT_ENTRIES {
        return Err(format!(
            "the session contains more than {MAX_IMPORT_ENTRIES} messages"
        ));
    }
    let cwd = cwd
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| fallback_cwd.to_string());
    if cwd.trim().is_empty() {
        return Err("the session working directory is missing".into());
    }

    let first_user = messages
        .iter()
        .find(|message| message.role == Role::User)
        .map(|message| message.text.as_str());
    let title = explicit_title
        .filter(|value| !value.trim().is_empty())
        .or_else(|| first_user.and_then(initial_session_title))
        .unwrap_or_else(|| format!("Imported {} session", source.label()));
    let digest = blake3::hash(format!("{}\0{external_id}", source.key()).as_bytes())
        .to_hex()
        .to_string();
    let mut session = Session::new(provider, cwd);
    session.id = format!("import-{}-{}", source.key(), &digest[..32]);
    session.title = title;
    session.title_origin = SessionTitleOrigin::Automatic;
    session.model = model;
    session.acp_session_id = resume_id;
    session.created_at = created_at.unwrap_or_else(now_millis);

    let entries = messages
        .into_iter()
        .enumerate()
        .map(|(seq, message)| TranscriptEntry {
            seq: seq as i64,
            role: message.role,
            part: match message.role {
                Role::User => Part::Prompt {
                    text: message.text.clone(),
                    display: message.text,
                },
                Role::Agent => Part::Text { text: message.text },
            },
            created_at: message
                .created_at
                .unwrap_or(session.created_at.saturating_add(seq as i64)),
            started_at: None,
        })
        .collect();

    Ok(ParsedSession {
        session,
        source,
        entries,
    })
}

fn push_message(
    messages: &mut Vec<VisibleMessage>,
    role: Role,
    text: String,
    created_at: Option<i64>,
) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(());
    }
    if text.chars().count() > MAX_MESSAGE_CHARS {
        return Err("one visible message is larger than 1,048,576 characters".into());
    }
    // Codex may persist commentary and the final answer as adjacent assistant message items. One
    // C2 agent part per user turn keeps transcript paging and full-text search turn-aligned.
    if role == Role::Agent {
        if let Some(previous) = messages
            .last_mut()
            .filter(|message| message.role == Role::Agent)
        {
            previous.text.push_str("\n\n");
            previous.text.push_str(&text);
            return Ok(());
        }
    }
    messages.push(VisibleMessage {
        role,
        text,
        created_at,
    });
    Ok(())
}

fn codex_message_text(content: Option<&Value>, role: Role) -> String {
    let expected = match role {
        Role::User => "input_text",
        Role::Agent => "output_text",
    };
    content
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|item| {
            matches!(item.get("type").and_then(Value::as_str), Some(kind) if kind == expected || kind == "text")
        })
        .filter_map(|item| item.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n")
}

fn claude_message_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .filter(|item| item.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn string_at(value: &Value, path: &[&str]) -> Option<String> {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
}

fn timestamp_ms(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(number) => number.as_i64().map(|value| {
            if value.abs() < 10_000_000_000 {
                value.saturating_mul(1000)
            } else {
                value
            }
        }),
        Value::String(value) => chrono::DateTime::parse_from_rfc3339(value)
            .ok()
            .map(|date| date.timestamp_millis()),
        _ => None,
    }
}

fn earliest(current: Option<i64>, candidate: Option<i64>) -> Option<i64> {
    match (current, candidate) {
        (Some(current), Some(candidate)) => Some(current.min(candidate)),
        (current, candidate) => current.or(candidate),
    }
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_jsonl(lines: &[Value]) -> tempfile::NamedTempFile {
        let mut file = tempfile::Builder::new()
            .suffix(".jsonl")
            .tempfile()
            .unwrap();
        for line in lines {
            writeln!(file, "{line}").unwrap();
        }
        file
    }

    fn sqlite_file() -> (tempfile::NamedTempFile, Connection) {
        let file = tempfile::Builder::new()
            .suffix(".sqlite")
            .tempfile()
            .unwrap();
        let connection = Connection::open(file.path()).unwrap();
        (file, connection)
    }

    #[test]
    fn imports_codex_visible_messages_and_skips_the_same_source_session_twice() {
        let file = write_jsonl(&[
            serde_json::json!({
                "timestamp": "2026-08-27T10:00:00Z",
                "type": "session_meta",
                "payload": { "id": "codex-source-1", "cwd": "/work/demo" }
            }),
            serde_json::json!({
                "timestamp": "2026-08-27T10:00:01Z",
                "type": "response_item",
                "payload": { "type": "message", "role": "user", "content": [
                    { "type": "input_text", "text": "Add session import support" }
                ] }
            }),
            serde_json::json!({
                "timestamp": "2026-08-27T10:00:02Z",
                "type": "response_item",
                "payload": { "type": "message", "role": "assistant", "content": [
                    { "type": "output_text", "text": "Inspecting the store." }
                ] }
            }),
            serde_json::json!({
                "timestamp": "2026-08-27T10:00:03Z",
                "type": "response_item",
                "payload": { "type": "message", "role": "assistant", "content": [
                    { "type": "output_text", "text": "Import is ready." }
                ] }
            }),
        ]);
        let store = Store::open_in_memory().unwrap();
        let paths = vec![file.path().to_string_lossy().into_owned()];

        // An embedded cwd is sufficient even when no project is selected in C2.
        let first = import_session_files(&store, &paths, "");
        let second = import_session_files(&store, &paths, "");

        assert_eq!((first.imported, first.skipped, first.messages), (1, 0, 2));
        assert_eq!((second.imported, second.skipped), (0, 1));
        let session = store.list_sessions().unwrap().pop().unwrap();
        assert_eq!(session.title, "Add session import support");
        assert_eq!(session.cwd, "/work/demo");
        assert_eq!(session.acp_session_id.as_deref(), Some("codex-source-1"));
        let transcript = store.transcript(&session.id).unwrap();
        assert_eq!(transcript.len(), 2);
        let Part::Text { text } = &transcript[1].1 else {
            panic!("expected agent text")
        };
        assert_eq!(text, "Inspecting the store.\n\nImport is ready.");
    }

    #[test]
    fn imports_claude_text_but_not_thinking_tools_or_meta_messages() {
        let file = write_jsonl(&[
            serde_json::json!({
                "type": "user", "sessionId": "claude-source-1", "uuid": "u1",
                "timestamp": "2026-08-27T11:00:00Z", "cwd": "/work/claude",
                "message": { "role": "user", "content": "修复设置页" }
            }),
            serde_json::json!({
                "type": "assistant", "sessionId": "claude-source-1", "uuid": "a1",
                "timestamp": "2026-08-27T11:00:01Z",
                "message": { "role": "assistant", "model": "claude-sonnet", "content": [
                    { "type": "thinking", "thinking": "private" },
                    { "type": "text", "text": "已经修复。" },
                    { "type": "tool_use", "name": "Edit" }
                ] }
            }),
            serde_json::json!({
                "type": "user", "sessionId": "claude-source-1", "uuid": "meta",
                "isMeta": true, "message": { "role": "user", "content": "hidden metadata" }
            }),
        ]);
        let store = Store::open_in_memory().unwrap();
        let report = import_session_files(
            &store,
            &[file.path().to_string_lossy().into_owned()],
            "/fallback",
        );

        assert_eq!((report.imported, report.messages, report.failed), (1, 2, 0));
        let session = store.list_sessions().unwrap().pop().unwrap();
        assert_eq!(session.title, "修复设置页");
        assert_eq!(session.model.as_deref(), Some("claude-sonnet"));
        assert_eq!(store.transcript(&session.id).unwrap().len(), 2);
    }

    #[test]
    fn imports_cursor_composer_messages_from_the_read_only_sqlite_shape() {
        let (file, connection) = sqlite_file();
        connection
            .execute_batch(
                "CREATE TABLE composerHeaders (
                    composerId TEXT PRIMARY KEY,
                    createdAt INTEGER,
                    value TEXT,
                    isSubagent INTEGER
                 );
                 CREATE TABLE cursorDiskKV (key TEXT, value BLOB);",
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO composerHeaders (composerId,createdAt,value,isSubagent)
                 VALUES (?1,?2,?3,0)",
                rusqlite::params![
                    "cursor-session-1",
                    1_788_000_000_000_i64,
                    serde_json::json!({
                        "name": "Cursor import",
                        "workspaceIdentifier": { "uri": { "fsPath": "/work/cursor" } }
                    })
                    .to_string(),
                ],
            )
            .unwrap();
        for (id, message) in [
            (
                "user-1",
                serde_json::json!({
                    "type": 1, "text": "Import this Cursor chat",
                    "createdAt": "2026-08-27T12:00:00Z"
                }),
            ),
            (
                "assistant-1",
                serde_json::json!({
                    "type": 2, "text": "Cursor history imported.",
                    "createdAt": "2026-08-27T12:00:01Z",
                    "modelInfo": { "modelName": "cursor-model" }
                }),
            ),
            (
                "tool-1",
                serde_json::json!({
                    "type": 2, "text": "", "toolResults": [{ "output": "hidden" }]
                }),
            ),
        ] {
            connection
                .execute(
                    "INSERT INTO cursorDiskKV (key,value) VALUES (?1,?2)",
                    rusqlite::params![
                        format!("bubbleId:cursor-session-1:{id}"),
                        message.to_string()
                    ],
                )
                .unwrap();
        }
        drop(connection);
        let store = Store::open_in_memory().unwrap();
        let report =
            import_session_files(&store, &[file.path().to_string_lossy().into_owned()], "");

        assert_eq!((report.files, report.imported, report.messages), (1, 1, 2));
        assert_eq!(report.sessions[0].source, "Cursor");
        let session = store.list_sessions().unwrap().pop().unwrap();
        assert_eq!(session.title, "Cursor import");
        assert_eq!(session.cwd, "/work/cursor");
        assert_eq!(session.provider, ProviderId::Cursor);
        assert_eq!(session.model.as_deref(), Some("cursor-model"));
        assert!(session.acp_session_id.is_none());
        assert_eq!(store.transcript(&session.id).unwrap().len(), 2);
    }

    #[test]
    fn imports_multiple_t3_threads_and_preserves_the_underlying_provider() {
        let (file, connection) = sqlite_file();
        connection
            .execute_batch(
                "CREATE TABLE projection_projects (
                    project_id TEXT PRIMARY KEY, workspace_root TEXT
                 );
                 CREATE TABLE projection_threads (
                    thread_id TEXT PRIMARY KEY, project_id TEXT, title TEXT, created_at TEXT,
                    deleted_at TEXT, model_selection_json TEXT
                 );
                 CREATE TABLE projection_thread_sessions (
                    thread_id TEXT PRIMARY KEY, provider_name TEXT, provider_session_id TEXT
                 );
                 CREATE TABLE projection_thread_messages (
                    message_id TEXT PRIMARY KEY, thread_id TEXT, role TEXT, text TEXT, created_at TEXT
                 );
                 INSERT INTO projection_projects VALUES ('project-1','/work/t3');
                 INSERT INTO projection_threads VALUES
                    ('thread-1','project-1','T3 Codex','2026-08-27T13:00:00Z',NULL,
                     '{\"instanceId\":\"codex\",\"model\":\"gpt-test\"}'),
                    ('thread-2','project-1','T3 OpenCode','2026-08-27T14:00:00Z',NULL,
                     '{\"instanceId\":\"opencode\",\"model\":\"open-test\"}');
                 INSERT INTO projection_thread_sessions VALUES
                    ('thread-1','codex','codex-resume-1'),
                    ('thread-2','opencode','opencode-resume-2');
                 INSERT INTO projection_thread_messages VALUES
                    ('m1','thread-1','user','First T3 prompt','2026-08-27T13:00:01Z'),
                    ('m2','thread-1','assistant','First T3 answer','2026-08-27T13:00:02Z'),
                    ('m3','thread-2','user','Second T3 prompt','2026-08-27T14:00:01Z'),
                    ('m4','thread-2','assistant','Second T3 answer','2026-08-27T14:00:02Z');",
            )
            .unwrap();
        drop(connection);
        let store = Store::open_in_memory().unwrap();
        let report =
            import_session_files(&store, &[file.path().to_string_lossy().into_owned()], "");

        assert_eq!((report.files, report.imported, report.messages), (1, 2, 4));
        assert!(report
            .sessions
            .iter()
            .all(|session| session.source == "T3 Code"));
        let sessions = store.list_sessions().unwrap();
        assert!(sessions.iter().any(|session| {
            session.provider == ProviderId::Codex
                && session.acp_session_id.as_deref() == Some("codex-resume-1")
        }));
        assert!(sessions.iter().any(|session| {
            session.provider == ProviderId::OpenCode
                && session.acp_session_id.as_deref() == Some("opencode-resume-2")
        }));
    }

    #[test]
    fn rejects_unknown_or_malformed_jsonl_without_writing_a_session() {
        let file = write_jsonl(&[serde_json::json!({ "type": "chat", "messages": [] })]);
        let store = Store::open_in_memory().unwrap();
        let report = import_session_files(
            &store,
            &[file.path().to_string_lossy().into_owned()],
            "/fallback",
        );

        assert_eq!((report.imported, report.failed), (0, 1));
        assert!(report.errors[0]
            .message
            .contains("supported Codex or Claude Code"));
        assert!(store.list_sessions().unwrap().is_empty());
    }
}
