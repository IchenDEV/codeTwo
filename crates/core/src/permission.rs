//! Permission engine.
//!
//! Model (from the plan): `(action ∈ ask|allow|deny) × (tool + input glob)`, layered, with a
//! per-session mode. This decides how to respond to an ACP `session/request_permission`:
//! auto-answer when a rule or the mode resolves it, otherwise surface it to the UI as an `Ask`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionContextKind {
    #[default]
    Acp,
    McpElicitation,
    WebsiteAccess,
    SensitiveWebAction,
    ComputerUseApplication,
    SitesMutation,
    SitesProduction,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionContext {
    #[serde(default)]
    pub kind: PermissionContextKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub risk: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub application: Option<String>,
}

/// Per-session permission posture. Mirrors codex (`--full-auto`/bypass), opencode (ask/allow/deny),
/// and Claude Code (permission modes).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    /// Prompt for anything not explicitly allowed.
    Ask,
    /// Auto-approve standardized edit-class ACP requests; still ask for the rest. This does not
    /// verify the request's filesystem path.
    AcceptEdits,
    /// Bypass approval for tool kinds permitted by the selected ceiling.
    Yolo,
}

/// The tool-kind ceiling enforced by C2's ACP permission mediation. Its compatibility values
/// (`read-only` / `workspace-write` / `danger-full-access`) are orthogonal to the approval mode:
/// this ceiling can veto an ACP permission request even when the mode would allow it.
///
/// This is not an OS/container sandbox. An agent that mutates state without sending an ACP
/// permission request is outside this module's enforcement; callers must not present this value as
/// filesystem or process isolation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxPolicy {
    /// Only standardized read/search/fetch/think tool kinds may pass permission mediation.
    ReadOnly,
    /// Standardized tool kinds may pass permission mediation; unknown kinds fail closed.
    /// Workspace path containment is not enforced by this enum.
    WorkspaceWrite,
    /// Unknown tool kinds may also proceed to rules/the approval mode. This still installs no
    /// operating-system sandbox and grants no capability by itself.
    DangerFullAccess,
}

impl Default for SandboxPolicy {
    fn default() -> Self {
        Self::WorkspaceWrite
    }
}

/// The two orthogonal controls that govern one session's ACP permission decisions.
///
/// Keeping them together at API boundaries prevents a frontend or persistence layer from
/// temporarily applying a permission mode with the wrong sandbox (or vice versa).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionPolicy {
    pub mode: PermissionMode,
    pub sandbox: SandboxPolicy,
}

impl Default for ExecutionPolicy {
    fn default() -> Self {
        Self {
            mode: PermissionMode::Ask,
            sandbox: SandboxPolicy::default(),
        }
    }
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
    /// ACP tool-kind ceiling. Vetoes before the mode is consulted, but does not install isolation.
    #[serde(default)]
    pub sandbox: SandboxPolicy,
    /// Evaluated in order; an explicit `Deny` always wins over a later `Allow`.
    pub rules: Vec<Rule>,
}

impl Default for PermissionPolicy {
    fn default() -> Self {
        Self {
            mode: PermissionMode::Ask,
            sandbox: SandboxPolicy::default(),
            rules: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolKindClass {
    ReadOnly,
    Mutating,
    Unknown,
}

/// Classify only ACP's standardized tool kinds. `other`, an absent kind (normalized to `other` by
/// the handler), and future provider-specific strings stay unknown so restrictive ceilings fail
/// closed instead of guessing that they are reads.
fn classify_tool_kind(kind: &str) -> ToolKindClass {
    match kind {
        "read" | "search" | "fetch" | "think" => ToolKindClass::ReadOnly,
        "edit" | "delete" | "move" | "execute" | "switch_mode" => ToolKindClass::Mutating,
        _ => ToolKindClass::Unknown,
    }
}

impl PermissionPolicy {
    /// Resolve an action for a tool invocation. `tool_kind` is the ACP tool kind
    /// (e.g. "edit", "execute", "read"); `input` is a stringified summary of the call.
    pub fn decide(&self, tool_kind: &str, input: &str) -> Action {
        // The ceiling vetoes before rules or mode. Restrictive policies never allow an explicit
        // rule or YOLO to turn an unknown provider kind into an assumed-safe operation.
        match (self.sandbox, classify_tool_kind(tool_kind)) {
            (SandboxPolicy::ReadOnly, ToolKindClass::Mutating | ToolKindClass::Unknown)
            | (SandboxPolicy::WorkspaceWrite, ToolKindClass::Unknown) => return Action::Deny,
            _ => {}
        }

        // Explicit rules next: any matching Deny short-circuits.
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
    fn yolo_allows_known_execution_under_the_default_ceiling() {
        let p = PermissionPolicy {
            mode: PermissionMode::Yolo,
            ..Default::default()
        };
        assert_eq!(p.decide("execute", "anything"), Action::Allow);
    }

    #[test]
    fn accept_edits_allows_edits_only() {
        let p = PermissionPolicy {
            mode: PermissionMode::AcceptEdits,
            ..Default::default()
        };
        assert_eq!(p.decide("edit", "src/main.rs"), Action::Allow);
        assert_eq!(p.decide("execute", "ls"), Action::Ask);
    }

    #[test]
    fn deny_rule_wins_over_mode() {
        let p = PermissionPolicy {
            mode: PermissionMode::Yolo,
            rules: vec![Rule {
                tool: "execute".into(),
                pattern: "git push*".into(),
                action: Action::Deny,
            }],
            ..Default::default()
        };
        assert_eq!(p.decide("execute", "git push origin main"), Action::Deny);
        assert_eq!(p.decide("execute", "git status"), Action::Allow);
    }

    #[test]
    fn read_only_ceiling_vetoes_mutation_even_in_yolo() {
        let p = PermissionPolicy {
            mode: PermissionMode::Yolo,
            sandbox: SandboxPolicy::ReadOnly,
            rules: vec![],
        };
        // Mutations are denied outright…
        assert_eq!(p.decide("edit", "src/main.rs"), Action::Deny);
        assert_eq!(p.decide("execute", "rm -rf /"), Action::Deny);
        assert_eq!(p.decide("delete", "x"), Action::Deny);
        assert_eq!(p.decide("switch_mode", "agent"), Action::Deny);
        // …while reads still follow the mode.
        assert_eq!(p.decide("read", "src/main.rs"), Action::Allow);
        assert_eq!(p.decide("search", "needle"), Action::Allow);
        assert_eq!(p.decide("fetch", "https://example.test"), Action::Allow);
        assert_eq!(p.decide("think", "plan"), Action::Allow);
    }

    #[test]
    fn restrictive_sandboxes_fail_closed_for_missing_or_unknown_kinds() {
        for sandbox in [SandboxPolicy::ReadOnly, SandboxPolicy::WorkspaceWrite] {
            let policy = PermissionPolicy {
                mode: PermissionMode::Yolo,
                sandbox,
                rules: vec![Rule {
                    tool: "*".into(),
                    pattern: "*".into(),
                    action: Action::Allow,
                }],
            };

            // ACP's `other`, the handler's missing-kind normalization, and provider extensions
            // cannot bypass the restrictive ceiling through YOLO or an explicit allow rule.
            assert_eq!(policy.decide("other", "opaque call"), Action::Deny);
            assert_eq!(policy.decide("", "missing kind"), Action::Deny);
            assert_eq!(policy.decide("provider_magic", "opaque call"), Action::Deny);
        }
    }

    #[test]
    fn danger_full_access_defers_unknown_kinds_to_rules_and_mode() {
        let yolo = PermissionPolicy {
            mode: PermissionMode::Yolo,
            sandbox: SandboxPolicy::DangerFullAccess,
            rules: vec![],
        };
        assert_eq!(yolo.decide("other", "opaque call"), Action::Allow);

        let ask = PermissionPolicy {
            mode: PermissionMode::Ask,
            sandbox: SandboxPolicy::DangerFullAccess,
            rules: vec![],
        };
        assert_eq!(ask.decide("provider_magic", "opaque call"), Action::Ask);
    }

    #[test]
    fn workspace_write_and_danger_preserve_known_tool_behavior() {
        let ws = PermissionPolicy {
            mode: PermissionMode::AcceptEdits,
            sandbox: SandboxPolicy::WorkspaceWrite,
            rules: vec![],
        };
        assert_eq!(ws.decide("edit", "src/main.rs"), Action::Allow);
        assert_eq!(ws.decide("execute", "ls"), Action::Ask);

        let ws_yolo = PermissionPolicy {
            mode: PermissionMode::Yolo,
            sandbox: SandboxPolicy::WorkspaceWrite,
            rules: vec![],
        };
        assert_eq!(ws_yolo.decide("switch_mode", "agent"), Action::Allow);

        let danger = PermissionPolicy {
            mode: PermissionMode::Yolo,
            sandbox: SandboxPolicy::DangerFullAccess,
            rules: vec![],
        };
        assert_eq!(danger.decide("execute", "anything"), Action::Allow);
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
