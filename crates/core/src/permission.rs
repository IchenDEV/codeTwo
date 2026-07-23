//! Permission engine.
//!
//! Model (from the plan): `(action ∈ ask|allow|deny) × (tool + input glob)`, layered, with a
//! per-session mode. This decides how to respond to an ACP `session/request_permission`:
//! auto-answer when a rule or the mode resolves it, otherwise surface it to the UI as an `Ask`.

use serde::{Deserialize, Serialize};

/// Per-session permission posture. Mirrors codex (`--full-auto`/bypass), opencode (ask/allow/deny),
/// and Claude Code (permission modes).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    /// Prompt for anything not explicitly allowed.
    Ask,
    /// Auto-approve edit-class tools in the working dir; still ask for the rest.
    AcceptEdits,
    /// Bypass everything. Gated in the UI behind an "isolated worktree/sandbox" warning.
    Yolo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Ask,
    Allow,
    Deny,
}

/// A single rule: for tool `tool` whose input matches `pattern`, apply `action`.
/// `tool` and `pattern` support a trailing/embedded `*` wildcard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub tool: String,
    pub pattern: String,
    pub action: Action,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionPolicy {
    pub mode: PermissionMode,
    /// Evaluated in order; an explicit `Deny` always wins over a later `Allow`.
    pub rules: Vec<Rule>,
}

impl Default for PermissionPolicy {
    fn default() -> Self {
        Self { mode: PermissionMode::Ask, rules: Vec::new() }
    }
}

impl PermissionPolicy {
    /// Resolve an action for a tool invocation. `tool_kind` is the ACP tool kind
    /// (e.g. "edit", "execute", "read"); `input` is a stringified summary of the call.
    pub fn decide(&self, tool_kind: &str, input: &str) -> Action {
        // Explicit rules first: any matching Deny short-circuits.
        let mut matched_allow = false;
        for rule in &self.rules {
            if glob_match(&rule.tool, tool_kind) && glob_match(&rule.pattern, input) {
                match rule.action {
                    Action::Deny => return Action::Deny,
                    Action::Allow => matched_allow = true,
                    Action::Ask => {}
                }
            }
        }
        if matched_allow {
            return Action::Allow;
        }
        // Fall back to the mode default.
        match self.mode {
            PermissionMode::Yolo => Action::Allow,
            PermissionMode::AcceptEdits if is_edit_kind(tool_kind) => Action::Allow,
            _ => Action::Ask,
        }
    }
}

fn is_edit_kind(kind: &str) -> bool {
    matches!(kind, "edit" | "delete" | "move")
}

/// Tiny glob: supports `*` as "match any run of characters". `"*"` alone matches everything.
/// Enough for rules like `execute` / `git *` / `*`; a fuller matcher can replace this later.
pub fn glob_match(pattern: &str, text: &str) -> bool {
    if pattern == "*" || pattern == text {
        return true;
    }
    if !pattern.contains('*') {
        return pattern == text;
    }
    let parts: Vec<&str> = pattern.split('*').collect();
    let mut idx = 0usize;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        match text[idx..].find(part) {
            Some(pos) => {
                // The first non-empty part must anchor at the start unless the pattern began with '*'.
                if i == 0 && !pattern.starts_with('*') && pos != 0 {
                    return false;
                }
                idx += pos + part.len();
            }
            None => return false,
        }
    }
    // The last non-empty part must anchor at the end unless the pattern ended with '*'.
    if let Some(last) = parts.iter().rev().find(|p| !p.is_empty()) {
        if !pattern.ends_with('*') && !text.ends_with(last) {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ask_mode_asks_by_default() {
        let p = PermissionPolicy::default();
        assert_eq!(p.decide("execute", "rm -rf /"), Action::Ask);
    }

    #[test]
    fn yolo_allows_everything() {
        let p = PermissionPolicy { mode: PermissionMode::Yolo, rules: vec![] };
        assert_eq!(p.decide("execute", "anything"), Action::Allow);
    }

    #[test]
    fn accept_edits_allows_edits_only() {
        let p = PermissionPolicy { mode: PermissionMode::AcceptEdits, rules: vec![] };
        assert_eq!(p.decide("edit", "src/main.rs"), Action::Allow);
        assert_eq!(p.decide("execute", "ls"), Action::Ask);
    }

    #[test]
    fn deny_rule_wins_over_mode() {
        let p = PermissionPolicy {
            mode: PermissionMode::Yolo,
            rules: vec![Rule { tool: "execute".into(), pattern: "git push*".into(), action: Action::Deny }],
        };
        assert_eq!(p.decide("execute", "git push origin main"), Action::Deny);
        assert_eq!(p.decide("execute", "git status"), Action::Allow);
    }

    #[test]
    fn glob_basics() {
        assert!(glob_match("*", "whatever"));
        assert!(glob_match("git *", "git commit -m x"));
        assert!(!glob_match("git *", "cargo build"));
        assert!(glob_match("*.rs", "src/main.rs"));
        assert!(!glob_match("*.rs", "src/main.py"));
    }
}
