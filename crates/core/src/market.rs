//! Built-in skill market: a curated catalog of shareable skills the user can install into their
//! local library with one click. A [`MarketEntry`] is a [`Skill`] plus market metadata (author,
//! tags); installing = materialize it to a `Skill` and save it to the skills dir.
//!
//! The bundled [`builtin_catalog`] works fully offline. [`parse_catalog`] lets a remote/registry
//! catalog (fetched by the frontend) be merged in later without any change here.

use serde::{Deserialize, Serialize};

use crate::skill::{McpServer, McpTransport, Skill, SkillKind, SkillPayload};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MarketEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub icon: Option<String>,
    pub payload: SkillPayload,
}

impl MarketEntry {
    /// Materialize into a library [`Skill`] (drops market-only metadata).
    pub fn to_skill(&self) -> Skill {
        Skill {
            id: self.id.clone(),
            name: self.name.clone(),
            description: self.description.clone(),
            icon: self.icon.clone(),
            source: Some(format!("Market · {}", self.author)),
            payload: self.payload.clone(),
        }
    }

    pub fn kind(&self) -> SkillKind {
        self.payload.kind()
    }
}

/// Parse a catalog from JSON (an array of [`MarketEntry`]). For registry/remote catalogs.
pub fn parse_catalog(json: &str) -> serde_json::Result<Vec<MarketEntry>> {
    serde_json::from_str(json)
}

fn fragment(id: &str, name: &str, icon: &str, author: &str, tags: &[&str], desc: &str, text: &str) -> MarketEntry {
    MarketEntry {
        id: id.into(),
        name: name.into(),
        description: desc.into(),
        author: author.into(),
        tags: tags.iter().map(|t| t.to_string()).collect(),
        icon: Some(icon.into()),
        payload: SkillPayload::Fragment { text: text.into() },
    }
}

/// The bundled catalog. Curated, offline, and merged with any user registry on top.
pub fn builtin_catalog() -> Vec<MarketEntry> {
    vec![
        fragment(
            "architect",
            "System Architect",
            "🏛️",
            "codetwo",
            &["design", "planning"],
            "Design before coding: propose a component breakdown, data flow, and trade-offs.",
            "Act as a system architect. Before writing code, propose a component breakdown, the data \
             flow between them, and the key trade-offs of each option. Recommend one approach.",
        ),
        fragment(
            "test-suite",
            "Test Suite Author",
            "🧪",
            "codetwo",
            &["testing", "quality"],
            "Generate a thorough, deterministic test suite.",
            "Write a thorough test suite: unit tests for each public function (happy path + edge \
             cases), plus one integration test for the main flow. Deterministic, no network.",
        ),
        fragment(
            "doc-writer",
            "Docs Writer",
            "📚",
            "codetwo",
            &["docs"],
            "Write clear docstrings and a concise README section.",
            "Write clear, example-driven documentation: docstrings for public items and a concise \
             README section covering install, usage, and one worked example.",
        ),
        fragment(
            "refactor-guru",
            "Refactor Guru",
            "🧹",
            "codetwo",
            &["refactor", "quality"],
            "Improve clarity and structure with behavior-preserving refactors.",
            "Refactor for clarity and structure without changing behavior. Prefer small, named \
             functions; remove duplication; keep the public API stable. List each change and why.",
        ),
        fragment(
            "sql-optimizer",
            "SQL Optimizer",
            "🗄️",
            "community",
            &["database", "performance"],
            "Analyze and speed up SQL queries.",
            "Analyze the SQL for performance: explain the query plan, suggest indexes, and rewrite \
             hot queries. Call out N+1 patterns and unbounded scans.",
        ),
        fragment(
            "rustacean",
            "Rust Expert",
            "🦀",
            "community",
            &["rust", "language"],
            "Idiomatic, safe Rust with clear ownership.",
            "Act as a Rust expert. Prefer idiomatic, safe Rust; make ownership and lifetimes clear; \
             avoid needless clones and unwraps; suggest the right error type.",
        ),
        fragment(
            "a11y-audit",
            "Accessibility Audit",
            "♿",
            "community",
            &["frontend", "a11y"],
            "Audit UI for accessibility issues.",
            "Audit the UI for accessibility: semantic elements, ARIA where needed, keyboard nav, \
             focus order, contrast. Rank issues by user impact.",
        ),
        MarketEntry {
            id: "commit-conventional".into(),
            name: "Conventional Commit".into(),
            description: "Generate a Conventional Commits message.".into(),
            author: "codetwo".into(),
            tags: vec!["git".into(), "workflow".into()],
            icon: Some("📝".into()),
            payload: SkillPayload::Macro {
                template: "Write a Conventional Commits message ({{type}}) for changes to {{scope}}, \
                           with a concise body explaining the why."
                    .into(),
                slots: vec!["type".into(), "scope".into()],
            },
        },
        MarketEntry {
            id: "pr-description".into(),
            name: "PR Description".into(),
            description: "Draft a pull-request description.".into(),
            author: "codetwo".into(),
            tags: vec!["git".into(), "workflow".into()],
            icon: Some("🔀".into()),
            payload: SkillPayload::Macro {
                template: "Draft a pull-request description for {{branch}}: summary, motivation, key \
                           changes, and a test plan."
                    .into(),
                slots: vec!["branch".into()],
            },
        },
        MarketEntry {
            id: "browser-tool".into(),
            name: "Browser Tool (MCP)".into(),
            description: "Give the agent a browser via an MCP server.".into(),
            author: "codetwo".into(),
            tags: vec!["mcp", "browser", "tools"].iter().map(|s| s.to_string()).collect(),
            icon: Some("🌐".into()),
            payload: SkillPayload::Mcp {
                server: McpServer {
                    name: "browser".into(),
                    cwd: None,
                    transport: McpTransport::Stdio {
                        command: "codetwo-browser-mcp".into(),
                        args: vec![],
                        env: vec![],
                    },
                },
            },
        },
        MarketEntry {
            id: "web-search".into(),
            name: "Web Search (MCP)".into(),
            description: "Let the agent search the web for docs and answers.".into(),
            author: "codetwo".into(),
            tags: vec!["mcp".into(), "search".into(), "tools".into()],
            icon: Some("🔎".into()),
            payload: SkillPayload::Mcp {
                server: McpServer {
                    name: "web-search".into(),
                    cwd: None,
                    transport: McpTransport::Stdio {
                        command: "mcp-server-web-search".into(),
                        args: vec![],
                        env: vec![],
                    },
                },
            },
        },
        MarketEntry {
            id: "filesystem-mcp".into(),
            name: "Filesystem Tool (MCP)".into(),
            description: "Scoped filesystem access via an MCP server.".into(),
            author: "community".into(),
            tags: vec!["mcp".into(), "tools".into()],
            icon: Some("📂".into()),
            payload: SkillPayload::Mcp {
                server: McpServer {
                    name: "filesystem".into(),
                    cwd: None,
                    transport: McpTransport::Stdio {
                        command: "mcp-server-filesystem".into(),
                        args: vec![".".into()],
                        env: vec![],
                    },
                },
            },
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn catalog_is_nonempty_with_unique_ids() {
        let cat = builtin_catalog();
        assert!(cat.len() >= 8);
        let ids: HashSet<_> = cat.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids.len(), cat.len(), "market ids must be unique");
    }

    #[test]
    fn entry_materializes_to_skill() {
        let entry = &builtin_catalog()[0];
        let skill = entry.to_skill();
        assert_eq!(skill.id, entry.id);
        assert_eq!(skill.kind(), entry.kind());
    }

    #[test]
    fn catalog_round_trips_through_json() {
        let cat = builtin_catalog();
        let json = serde_json::to_string(&cat).unwrap();
        let parsed = parse_catalog(&json).unwrap();
        assert_eq!(parsed, cat);
    }

    #[test]
    fn includes_a_browser_tool_entry() {
        assert!(builtin_catalog().iter().any(|e| e.id == "browser-tool" && e.kind() == SkillKind::Mcp));
    }
}
