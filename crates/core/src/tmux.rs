//! Optional tmux integration for persistent, attachable terminals.
//!
//! When tmux is available, the embedded terminal can run inside a named tmux session
//! (`codetwo-<id>`), so it survives app restarts and can be attached from any real terminal with
//! `tmux attach -t <name>`. Everything degrades gracefully when tmux is absent — callers fall back
//! to a plain shell.

use std::path::Path;

use tokio::process::Command;

/// Is `tmux` on the `PATH`?
pub fn is_available() -> bool {
    crate::provider::which("tmux").is_some()
}

/// A tmux-safe session name for a C2 session id (tmux names can't contain `.` or `:`).
pub fn session_name(session_id: &str) -> String {
    let safe: String = session_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    format!("codetwo-{safe}")
}

async fn run(args: &[&str]) -> std::io::Result<String> {
    let out = Command::new("tmux").args(args).output().await?;
    if !out.status.success() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub async fn has_session(name: &str) -> bool {
    Command::new("tmux")
        .args(["has-session", "-t", name])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Create a detached session if it doesn't already exist, starting in `cwd`.
pub async fn ensure_session(name: &str, cwd: Option<&Path>) -> std::io::Result<()> {
    if has_session(name).await {
        return Ok(());
    }
    let mut args: Vec<String> = vec!["new-session".into(), "-d".into(), "-s".into(), name.into()];
    if let Some(c) = cwd {
        args.push("-c".into());
        args.push(c.to_string_lossy().to_string());
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run(&refs).await.map(|_| ())
}

/// C2-owned tmux sessions (names starting `codetwo-`), newest activity first.
pub async fn list_sessions() -> Vec<String> {
    run(&["list-sessions", "-F", "#{session_name}"])
        .await
        .map(|s| s.lines().filter(|l| l.starts_with("codetwo-")).map(str::to_string).collect())
        .unwrap_or_default()
}

pub async fn kill_session(name: &str) -> std::io::Result<()> {
    run(&["kill-session", "-t", name]).await.map(|_| ())
}

/// The command a real terminal would run to attach to a session.
pub fn attach_command(name: &str) -> String {
    format!("tmux attach -t {name}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_name_is_sanitized() {
        assert_eq!(session_name("ab.cd:ef/gh"), "codetwo-ab-cd-ef-gh");
        assert_eq!(attach_command("codetwo-x"), "tmux attach -t codetwo-x");
    }

    #[tokio::test]
    async fn ensure_list_kill_session() {
        if !is_available() {
            eprintln!("tmux not found; skipping");
            return;
        }
        let name = session_name(&format!("test-{}", uuid::Uuid::new_v4().simple()));
        ensure_session(&name, None).await.unwrap();
        assert!(has_session(&name).await);
        assert!(list_sessions().await.iter().any(|s| s == &name));
        kill_session(&name).await.unwrap();
        assert!(!has_session(&name).await);
    }
}
