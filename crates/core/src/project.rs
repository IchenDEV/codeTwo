//! Per-project configuration and setup scripts (`.codetwo.json`), mirroring t3code's `t3.json`.
//!
//! A repo can declare scripts the app surfaces as one-click actions, and mark some to run
//! automatically when a new worktree is created (install deps, copy `.env`, etc.).

use std::path::Path;

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
pub struct ProjectScript {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Shell command, run with `sh -c` in the project directory.
    pub command: String,
    /// Run automatically after `git worktree add` for a new session.
    #[serde(default)]
    pub run_on_worktree_create: bool,
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

/// Run one script in `cwd`, returning its combined output.
pub async fn run_script(cwd: &Path, script: &ProjectScript) -> std::io::Result<String> {
    let out = Command::new("sh")
        .arg("-c")
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
    for s in cfg.scripts.iter().filter(|s| s.run_on_worktree_create) {
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
            command: "exit 3".into(),
            run_on_worktree_create: false,
        };
        assert!(run_script(&dir, &bad).await.is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
