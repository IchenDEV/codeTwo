//! Per-project actions and setup scripts (`.codetwo.json`), mirroring t3code's `t3.json`.
//!
//! A repo can declare scripts the app surfaces as one-click actions, and mark some to run
//! automatically when a new worktree is created (install deps, copy `.env`, etc.).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::process::Command;

pub const CONFIG_FILES: [&str; 2] = [".codetwo.json", "codetwo.json"];

/// A project's preferred workspace for newly created sessions.
///
/// The project row stores `Option<ProjectWorktreeMode>`: `None` follows the current draft/session
/// context, while these variants are explicit project defaults. `Local` is intentionally a real
/// value rather than another `None`, so a project can opt out after another project selected a
/// worktree default.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectWorktreeMode {
    Local,
    Current,
    OriginDefault,
}

impl ProjectWorktreeMode {
    pub(crate) fn as_db(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Current => "current",
            Self::OriginDefault => "origin_default",
        }
    }

    pub(crate) fn from_db(value: &str) -> Option<Self> {
        match value {
            "local" => Some(Self::Local),
            "current" => Some(Self::Current),
            "origin_default" => Some(Self::OriginDefault),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectActionKind {
    Command,
    Prompt,
}

impl Default for ProjectActionKind {
    fn default() -> Self {
        Self::Command
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectScript {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Existing configs omit this and remain command actions.
    #[serde(default)]
    pub kind: ProjectActionKind,
    /// Shell command, run with the platform shell in the project directory.
    #[serde(default)]
    pub command: String,
    /// Prompt submitted to the focused conversation without replacing its draft.
    #[serde(default)]
    pub prompt: String,
    /// Optional project-local shortcut in the shared canonical key syntax (`Mod+Shift+T`).
    #[serde(default)]
    pub keybinding: String,
    /// Optional HTTP(S) page to surface in C2's preview dock when this action runs.
    #[serde(default)]
    pub preview_url: String,
    /// Run automatically after `git worktree add` for a new session.
    #[serde(default)]
    pub run_on_worktree_create: bool,
    /// Open `preview_url` automatically when the action starts.
    #[serde(default)]
    pub open_preview: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectConfig {
    #[serde(default)]
    pub scripts: Vec<ProjectScript>,
}

/// Load `.codetwo.json` (or `codetwo.json`) from `cwd`. Missing/invalid → empty config.
pub fn load(cwd: &Path) -> ProjectConfig {
    for name in CONFIG_FILES {
        let path = cwd.join(name);
        if let Ok(text) = std::fs::read_to_string(&path) {
            match serde_json::from_str::<ProjectConfig>(&text) {
                Ok(cfg) => return cfg,
                Err(e) => tracing::warn!("project config {name}: {e}"),
            }
        }
    }
    ProjectConfig::default()
}

fn config_path(cwd: &Path) -> PathBuf {
    CONFIG_FILES
        .iter()
        .map(|name| cwd.join(name))
        .find(|path| path.is_file())
        .unwrap_or_else(|| cwd.join(CONFIG_FILES[0]))
}

fn invalid(message: impl Into<String>) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, message.into())
}

fn normalized_script(script: &ProjectScript) -> std::io::Result<ProjectScript> {
    let mut script = script.clone();
    script.id = script.id.trim().to_string();
    script.name = script.name.trim().to_string();
    script.command = script.command.trim().to_string();
    script.prompt = script.prompt.trim().to_string();
    script.keybinding = script.keybinding.trim().to_string();
    script.preview_url = script.preview_url.trim().to_string();
    let valid_id = !script.id.is_empty()
        && script.id.len() <= 64
        && script.id.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_lowercase()
                || byte.is_ascii_digit()
                || (index > 0 && (byte == b'-' || byte == b'_'))
        });
    if !valid_id {
        return Err(invalid(
            "action id must use lowercase letters, numbers, dash, or underscore",
        ));
    }
    if script.name.is_empty() || script.name.chars().count() > 80 {
        return Err(invalid("action name must be between 1 and 80 characters"));
    }
    match script.kind {
        ProjectActionKind::Command => {
            script.prompt.clear();
            if script.command.is_empty() || script.command.len() > 32_768 {
                return Err(invalid(
                    "action command must be between 1 and 32768 characters",
                ));
            }
        }
        ProjectActionKind::Prompt => {
            script.command.clear();
            script.preview_url.clear();
            script.run_on_worktree_create = false;
            script.open_preview = false;
            if script.prompt.is_empty() || script.prompt.len() > 32_768 {
                return Err(invalid(
                    "action prompt must be between 1 and 32768 characters",
                ));
            }
        }
    }
    if script.keybinding.len() > 128 {
        return Err(invalid("action keybinding is too long"));
    }
    if !script.preview_url.is_empty() {
        let url = url::Url::parse(&script.preview_url)
            .map_err(|_| invalid("action preview URL is invalid"))?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err(invalid("action preview URL must use http or https"));
        }
    } else {
        script.open_preview = false;
    }
    Ok(script)
}

/// Add or update one project action while preserving unrelated top-level configuration keys.
pub fn save_script(cwd: &Path, script: &ProjectScript) -> std::io::Result<ProjectScript> {
    let script = normalized_script(script)?;
    let path = config_path(cwd);
    let mut document = if path.is_file() {
        let text = std::fs::read_to_string(&path)?;
        let value: serde_json::Value = serde_json::from_str(&text)
            .map_err(|error| invalid(format!("invalid project config: {error}")))?;
        if !value.is_object() {
            return Err(invalid("project config must contain a JSON object"));
        }
        value
    } else {
        serde_json::json!({})
    };
    let mut scripts = document
        .get("scripts")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let encoded = serde_json::to_value(&script).map_err(std::io::Error::other)?;
    if let Some(existing) = scripts.iter_mut().find(|value| {
        value.get("id").and_then(serde_json::Value::as_str) == Some(script.id.as_str())
    }) {
        *existing = encoded;
    } else {
        scripts.push(encoded);
    }
    document
        .as_object_mut()
        .expect("object checked above")
        .insert("scripts".into(), serde_json::Value::Array(scripts));
    let json = serde_json::to_string_pretty(&document).map_err(std::io::Error::other)?;
    std::fs::write(path, format!("{json}\n"))?;
    Ok(script)
}

/// Run one script in `cwd`, returning its combined output.
pub async fn run_script(cwd: &Path, script: &ProjectScript) -> std::io::Result<String> {
    if script.kind != ProjectActionKind::Command {
        return Err(invalid("only command actions can run as scripts"));
    }
    #[cfg(windows)]
    let mut command = {
        let mut command = Command::new("cmd.exe");
        command.args(["/D", "/S", "/C"]);
        command
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut command = Command::new("sh");
        command.arg("-c");
        command
    };
    let out = command
        .arg(&script.command)
        .current_dir(cwd)
        .output()
        .await?;
    let mut text = String::from_utf8_lossy(&out.stdout).to_string();
    let err = String::from_utf8_lossy(&out.stderr);
    if !err.trim().is_empty() {
        text.push_str(&err);
    }
    if !out.status.success() {
        return Err(std::io::Error::new(std::io::ErrorKind::Other, text));
    }
    Ok(text)
}

/// Run every script marked `run_on_worktree_create`, in order. Returns (script id, result) pairs.
pub async fn run_worktree_hooks(cwd: &Path) -> Vec<(String, Result<String, String>)> {
    let cfg = load(cwd);
    let mut out = Vec::new();
    for s in cfg
        .scripts
        .iter()
        .filter(|s| s.kind == ProjectActionKind::Command && s.run_on_worktree_create)
    {
        let res = run_script(cwd, s).await.map_err(|e| e.to_string());
        out.push((s.id.clone(), res));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_cfg(dir: &Path, json: &str) {
        std::fs::write(dir.join(".codetwo.json"), json).unwrap();
    }

    #[test]
    fn project_worktree_modes_have_stable_database_values() {
        assert_eq!(ProjectWorktreeMode::Local.as_db(), "local");
        assert_eq!(ProjectWorktreeMode::Current.as_db(), "current");
        assert_eq!(ProjectWorktreeMode::OriginDefault.as_db(), "origin_default");
        assert_eq!(
            ProjectWorktreeMode::from_db("origin_default"),
            Some(ProjectWorktreeMode::OriginDefault)
        );
        assert_eq!(ProjectWorktreeMode::from_db("future"), None);
    }

    #[test]
    fn loads_config_and_defaults_when_missing() {
        let dir = std::env::temp_dir().join(format!("codetwo-proj-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(load(&dir), ProjectConfig::default());

        write_cfg(
            &dir,
            r#"{"scripts":[
                {"id":"install","name":"Install","command":"echo installing","run_on_worktree_create":true},
                {"id":"test","command":"echo testing"}
            ]}"#,
        );
        let cfg = load(&dir);
        assert_eq!(cfg.scripts.len(), 2);
        assert!(cfg.scripts[0].run_on_worktree_create);
        assert!(!cfg.scripts[1].run_on_worktree_create);

        // Malformed config degrades to empty rather than exploding.
        write_cfg(&dir, "{ not json");
        assert_eq!(load(&dir), ProjectConfig::default());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn runs_scripts_and_worktree_hooks() {
        let dir = std::env::temp_dir().join(format!("codetwo-proj-run-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        write_cfg(
            &dir,
            r#"{"scripts":[
                {"id":"hello","command":"echo hello-from-script","run_on_worktree_create":true},
                {"id":"manual","command":"echo not-run"}
            ]}"#,
        );

        let cfg = load(&dir);
        let out = run_script(&dir, &cfg.scripts[0]).await.unwrap();
        assert!(out.contains("hello-from-script"));

        let hooks = run_worktree_hooks(&dir).await;
        assert_eq!(hooks.len(), 1, "only run_on_worktree_create scripts run");
        assert_eq!(hooks[0].0, "hello");
        assert!(hooks[0].1.as_ref().unwrap().contains("hello-from-script"));

        // A failing script surfaces as an error.
        let bad = ProjectScript {
            id: "bad".into(),
            name: String::new(),
            kind: ProjectActionKind::Command,
            command: "exit 3".into(),
            prompt: String::new(),
            keybinding: String::new(),
            preview_url: String::new(),
            run_on_worktree_create: false,
            open_preview: false,
        };
        assert!(run_script(&dir, &bad).await.is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saves_action_fields_without_dropping_unrelated_config() {
        let dir = std::env::temp_dir().join(format!("codetwo-proj-save-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        write_cfg(&dir, r#"{"future":{"keep":true},"scripts":[]}"#);
        let saved = save_script(
            &dir,
            &ProjectScript {
                id: "test".into(),
                name: " Test ".into(),
                kind: ProjectActionKind::Command,
                command: " bun test ".into(),
                prompt: String::new(),
                keybinding: "Mod+Shift+T".into(),
                preview_url: "http://localhost:5173".into(),
                run_on_worktree_create: true,
                open_preview: true,
            },
        )
        .unwrap();
        assert_eq!(saved.name, "Test");
        let document: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join(".codetwo.json")).unwrap())
                .unwrap();
        assert_eq!(document["future"]["keep"], true);
        assert_eq!(document["scripts"][0]["keybinding"], "Mod+Shift+T");
        assert_eq!(document["scripts"][0]["open_preview"], true);
        assert_eq!(document["scripts"][0]["kind"], "command");
        assert!(save_script(
            &dir,
            &ProjectScript {
                preview_url: "javascript:alert(1)".into(),
                ..saved
            }
        )
        .is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saves_prompt_actions_and_keeps_legacy_commands_compatible() {
        let dir =
            std::env::temp_dir().join(format!("codetwo-prompt-save-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        write_cfg(
            &dir,
            r#"{"scripts":[{"id":"legacy","name":"Legacy","command":"bun test"}]}"#,
        );
        assert_eq!(load(&dir).scripts[0].kind, ProjectActionKind::Command);

        let saved = save_script(
            &dir,
            &ProjectScript {
                id: "review".into(),
                name: " Review ".into(),
                kind: ProjectActionKind::Prompt,
                command: "ignored".into(),
                prompt: " Review the current changes. ".into(),
                keybinding: String::new(),
                preview_url: "http://localhost:5173".into(),
                run_on_worktree_create: true,
                open_preview: true,
            },
        )
        .unwrap();
        assert_eq!(saved.prompt, "Review the current changes.");
        assert!(saved.command.is_empty());
        assert!(saved.preview_url.is_empty());
        assert!(!saved.run_on_worktree_create);
        assert!(!saved.open_preview);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn prompt_actions_cannot_run_as_scripts_or_worktree_hooks() {
        let dir = std::env::temp_dir().join(format!("codetwo-prompt-run-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        write_cfg(
            &dir,
            r#"{"scripts":[{"id":"review","name":"Review","kind":"prompt","command":"exit 99","prompt":"Review this","run_on_worktree_create":true}]}"#,
        );
        let script = load(&dir).scripts.remove(0);

        assert!(run_script(&dir, &script).await.is_err());
        assert!(run_worktree_hooks(&dir).await.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
