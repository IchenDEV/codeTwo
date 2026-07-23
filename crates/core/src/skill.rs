//! Skills — the product differentiator.
//!
//! A "skill" is a reusable building block the user inserts into the document editor with the `/`
//! picker and combines inline. Per the locked decision, skills span four kinds:
//!   - `Fragment`   — a reusable markdown snippet (a role, constraints, an output format).
//!   - `AgentSkill` — a reference to a provider-native Agent Skill (Claude Code's SKILL.md), with an
//!                    optional inline fallback for providers that don't support native skills.
//!   - `Mcp`        — an MCP server to attach to the session (config, not prompt text).
//!   - `Macro`      — a saved, parameterized prompt template with `{{slot}}` variables.
//!
//! The [`compile`] function walks a document ([`DocBlock`]s) and lowers it into a [`CompiledPrompt`]:
//! the markdown prompt to send in ACP `session/prompt`, plus the MCP servers and agent-skills to
//! configure on `session/new`. Keeping the compiler in the Rust core means the TUI reuses it verbatim.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillKind {
    Fragment,
    AgentSkill,
    Mcp,
    Macro,
}

/// An MCP server definition attached by an `Mcp` skill and passed through in `session/new`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpServer {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<(String, String)>,
}

impl McpServer {
    /// Shape this server the way ACP `session/new` expects (`mcpServers[]`): stdio transport with
    /// `env` as `{name,value}` objects.
    pub fn to_acp_json(&self) -> serde_json::Value {
        serde_json::json!({
            "name": self.name,
            "command": self.command,
            "args": self.args,
            "env": self.env.iter()
                .map(|(k, v)| serde_json::json!({ "name": k, "value": v }))
                .collect::<Vec<_>>(),
        })
    }
}

/// Kind-specific payload for a skill.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SkillPayload {
    Fragment { text: String },
    AgentSkill { skill_ref: String, inline_text: Option<String> },
    Mcp { server: McpServer },
    Macro { template: String, slots: Vec<String> },
}

impl SkillPayload {
    pub fn kind(&self) -> SkillKind {
        match self {
            SkillPayload::Fragment { .. } => SkillKind::Fragment,
            SkillPayload::AgentSkill { .. } => SkillKind::AgentSkill,
            SkillPayload::Mcp { .. } => SkillKind::Mcp,
            SkillPayload::Macro { .. } => SkillKind::Macro,
        }
    }
}

/// A library entry. Stored on disk (`~/.config/codetwo/skills/`) in M1; in-memory here.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub payload: SkillPayload,
}

impl Skill {
    pub fn kind(&self) -> SkillKind {
        self.payload.kind()
    }
}

/// In-memory skill library with id lookup. Backed by the on-disk store in M1.
#[derive(Debug, Clone, Default)]
pub struct SkillLibrary {
    by_id: HashMap<String, Skill>,
}

impl SkillLibrary {
    pub fn new(skills: impl IntoIterator<Item = Skill>) -> Self {
        let mut by_id = HashMap::new();
        for s in skills {
            by_id.insert(s.id.clone(), s);
        }
        Self { by_id }
    }
    pub fn get(&self, id: &str) -> Option<&Skill> {
        self.by_id.get(id)
    }
    pub fn all(&self) -> impl Iterator<Item = &Skill> {
        self.by_id.values()
    }

    /// Load every `*.json` file in `dir` as a [`Skill`]. A missing directory yields an empty library
    /// (first run); a malformed file is logged and skipped rather than failing the whole load.
    pub fn load_dir(dir: &std::path::Path) -> std::io::Result<SkillLibrary> {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(SkillLibrary::default()),
            Err(e) => return Err(e),
        };
        let mut skills = Vec::new();
        for entry in entries {
            let path = entry?.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                let data = std::fs::read_to_string(&path)?;
                match serde_json::from_str::<Skill>(&data) {
                    Ok(skill) => skills.push(skill),
                    Err(e) => tracing::warn!("skill {path:?}: {e}"),
                }
            }
        }
        Ok(SkillLibrary::new(skills))
    }

    /// Write a skill to `dir/<id>.json` (creating `dir`). Used by the library-management UI.
    pub fn save_to_dir(dir: &std::path::Path, skill: &Skill) -> std::io::Result<()> {
        std::fs::create_dir_all(dir)?;
        let json = serde_json::to_string_pretty(skill)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        std::fs::write(dir.join(format!("{}.json", skill.id)), json)
    }

    /// Remove `dir/<id>.json`. Missing file is not an error.
    pub fn delete_from_dir(dir: &std::path::Path, id: &str) -> std::io::Result<()> {
        match std::fs::remove_file(dir.join(format!("{id}.json"))) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        }
    }
}

/// One block of the document the user composed. This is the neutral shape the BlockNote editor
/// serializes into (text blocks + skill blocks) and the shape the TUI composer produces too.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DocBlock {
    Text { text: String },
    Skill {
        skill_id: String,
        #[serde(default)]
        params: HashMap<String, String>,
    },
    /// An `@`-mentioned workspace file; its contents are inlined as context at compile time.
    File { path: String },
}

/// The result of compiling a document: what to send and how to configure the session.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CompiledPrompt {
    /// Markdown prompt for ACP `session/prompt` (as a single text content block).
    pub prompt: String,
    /// MCP servers to attach in `session/new` (from `Mcp` skills).
    pub mcp_servers: Vec<McpServer>,
    /// Provider-native Agent Skills referenced (from `AgentSkill` skills).
    pub agent_skills: Vec<String>,
    /// Workspace files inlined via `@`-mentions.
    pub files: Vec<String>,
    /// Skill ids (or `file:<path>`) that could not be resolved — surfaced to the user as warnings.
    pub unresolved: Vec<String>,
}

/// Lower a document into a [`CompiledPrompt`]. Provider-agnostic: `AgentSkill` blocks contribute a
/// reference (and inline fallback text when present) so a provider without native skills still gets
/// the intent as prose.
pub fn compile(doc: &[DocBlock], library: &SkillLibrary) -> CompiledPrompt {
    compile_with_context(doc, library, None)
}

/// Like [`compile`], but with a workspace: project rules (AGENTS.md / .cursorrules / CLAUDE.md …)
/// are prepended and `@`-mentioned files are inlined from disk.
pub fn compile_with_context(
    doc: &[DocBlock],
    library: &SkillLibrary,
    cwd: Option<&std::path::Path>,
) -> CompiledPrompt {
    let mut out = CompiledPrompt::default();
    let mut parts: Vec<String> = Vec::new();

    // Project rules travel with every prompt, regardless of provider.
    if let Some(dir) = cwd {
        let ctx = crate::rules::to_context(&crate::rules::load(dir));
        if !ctx.is_empty() {
            parts.push(ctx);
        }
    }

    for block in doc {
        match block {
            DocBlock::File { path } => {
                out.files.push(path.clone());
                match cwd.map(|c| crate::workspace::read_file(c, path)) {
                    Some(Ok(content)) => {
                        let lang = crate::workspace::lang_for(path);
                        parts.push(format!(
                            "**File** `{path}`\n\n```{lang}\n{}\n```",
                            content.trim_end()
                        ));
                    }
                    _ => out.unresolved.push(format!("file:{path}")),
                }
            }
            DocBlock::Text { text } => {
                let t = text.trim_end();
                if !t.is_empty() {
                    parts.push(t.to_string());
                }
            }
            DocBlock::Skill { skill_id, params } => {
                let Some(skill) = library.get(skill_id) else {
                    out.unresolved.push(skill_id.clone());
                    continue;
                };
                match &skill.payload {
                    SkillPayload::Fragment { text } => parts.push(text.trim().to_string()),
                    SkillPayload::Macro { template, .. } => parts.push(substitute(template, params).trim().to_string()),
                    SkillPayload::AgentSkill { skill_ref, inline_text } => {
                        out.agent_skills.push(skill_ref.clone());
                        match inline_text {
                            Some(t) => parts.push(t.trim().to_string()),
                            None => parts.push(format!("Use the **{}** skill.", skill.name)),
                        }
                    }
                    SkillPayload::Mcp { server } => {
                        if !out.mcp_servers.iter().any(|m| m.name == server.name) {
                            out.mcp_servers.push(server.clone());
                        }
                    }
                }
            }
        }
    }

    out.prompt = parts.join("\n\n");
    out
}

/// A few built-in skills so the `/` picker has resolvable content on first run. Shared by the GUI
/// and the TUI; merged with any user skills loaded from disk.
pub fn builtin_skills() -> Vec<Skill> {
    vec![
        Skill {
            id: "plan-first".into(),
            name: "Plan first".into(),
            description: "Propose a plan and wait for approval before editing".into(),
            icon: Some("🗺️".into()),
            payload: SkillPayload::Fragment {
                text: "Before changing anything, produce a short numbered plan of the steps you \
                       intend to take, and wait for my approval. Do not edit files or run \
                       destructive commands until I approve the plan."
                    .into(),
            },
        },
        Skill {
            id: "reviewer".into(),
            name: "Code Reviewer".into(),
            description: "Meticulous senior reviewer persona".into(),
            icon: Some("🔍".into()),
            payload: SkillPayload::Fragment {
                text: "Act as a meticulous senior code reviewer. Flag bugs, unsafe patterns, and \
                       missing tests. Explain the risk of each finding."
                    .into(),
            },
        },
        Skill {
            id: "test-writer".into(),
            name: "Test Writer".into(),
            description: "Write thorough tests".into(),
            icon: Some("🧪".into()),
            payload: SkillPayload::Fragment {
                text: "Write thorough, isolated unit tests covering happy paths and edge cases. \
                       Prefer deterministic tests with no network."
                    .into(),
            },
        },
        Skill {
            id: "security-audit".into(),
            name: "Security Audit".into(),
            description: "Audit for vulnerabilities".into(),
            icon: Some("🛡️".into()),
            payload: SkillPayload::Fragment {
                text: "Audit the code for security vulnerabilities: injection, auth gaps, unsafe \
                       deserialization, secrets in code. Rank findings by severity."
                    .into(),
            },
        },
        Skill {
            id: "commit-macro".into(),
            name: "Commit Message".into(),
            description: "Parameterized commit message".into(),
            icon: Some("📝".into()),
            payload: SkillPayload::Macro {
                template: "Write a {{style}} commit message for changes to {{scope}}.".into(),
                slots: vec!["style".into(), "scope".into()],
            },
        },
    ]
}

/// Replace `{{slot}}` occurrences in a macro template with provided params (missing → left as-is).
fn substitute(template: &str, params: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in params {
        result = result.replace(&format!("{{{{{key}}}}}"), value);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_library() -> SkillLibrary {
        SkillLibrary::new([
            Skill {
                id: "reviewer".into(),
                name: "Code Reviewer".into(),
                description: "Careful review persona".into(),
                icon: None,
                payload: SkillPayload::Fragment {
                    text: "Act as a meticulous code reviewer. Flag bugs and unsafe patterns.".into(),
                },
            },
            Skill {
                id: "commit".into(),
                name: "Commit Macro".into(),
                description: String::new(),
                icon: None,
                payload: SkillPayload::Macro {
                    template: "Write a commit message for {{scope}} in {{style}} style.".into(),
                    slots: vec!["scope".into(), "style".into()],
                },
            },
            Skill {
                id: "fs-mcp".into(),
                name: "Filesystem MCP".into(),
                description: String::new(),
                icon: None,
                payload: SkillPayload::Mcp {
                    server: McpServer {
                        name: "filesystem".into(),
                        command: "mcp-fs".into(),
                        args: vec![],
                        env: vec![],
                    },
                },
            },
        ])
    }

    #[test]
    fn compiles_text_and_fragment() {
        let lib = sample_library();
        let doc = vec![
            DocBlock::Text { text: "# Refactor auth".into() },
            DocBlock::Skill { skill_id: "reviewer".into(), params: HashMap::new() },
            DocBlock::Text { text: "Focus on the token path.".into() },
        ];
        let compiled = compile(&doc, &lib);
        assert!(compiled.prompt.contains("# Refactor auth"));
        assert!(compiled.prompt.contains("meticulous code reviewer"));
        assert!(compiled.prompt.contains("token path"));
        assert!(compiled.unresolved.is_empty());
    }

    #[test]
    fn macro_substitutes_params() {
        let lib = sample_library();
        let mut params = HashMap::new();
        params.insert("scope".into(), "auth module".into());
        params.insert("style".into(), "conventional".into());
        let doc = vec![DocBlock::Skill { skill_id: "commit".into(), params }];
        let compiled = compile(&doc, &lib);
        assert_eq!(compiled.prompt, "Write a commit message for auth module in conventional style.");
    }

    #[test]
    fn mcp_skill_adds_server_not_prompt_text() {
        let lib = sample_library();
        let doc = vec![DocBlock::Skill { skill_id: "fs-mcp".into(), params: HashMap::new() }];
        let compiled = compile(&doc, &lib);
        assert_eq!(compiled.mcp_servers.len(), 1);
        assert_eq!(compiled.mcp_servers[0].name, "filesystem");
        assert!(compiled.prompt.is_empty());
    }

    #[test]
    fn unknown_skill_is_reported() {
        let lib = sample_library();
        let doc = vec![DocBlock::Skill { skill_id: "nope".into(), params: HashMap::new() }];
        let compiled = compile(&doc, &lib);
        assert_eq!(compiled.unresolved, vec!["nope".to_string()]);
    }

    #[test]
    fn load_dir_reads_json_skills() {
        let dir = std::env::temp_dir().join(format!("codetwo-skills-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let skill = Skill {
            id: "planner".into(),
            name: "Planner".into(),
            description: "Plan first".into(),
            icon: None,
            payload: SkillPayload::Fragment { text: "Make a plan before coding.".into() },
        };
        std::fs::write(dir.join("planner.json"), serde_json::to_string(&skill).unwrap()).unwrap();
        std::fs::write(dir.join("notes.txt"), "ignored").unwrap();

        let lib = SkillLibrary::load_dir(&dir).unwrap();
        assert!(lib.get("planner").is_some());
        assert_eq!(lib.all().count(), 1);

        // Missing dir → empty, not an error.
        let empty = SkillLibrary::load_dir(&dir.join("nope")).unwrap();
        assert_eq!(empty.all().count(), 0);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_and_delete_round_trip() {
        let dir = std::env::temp_dir().join(format!("codetwo-skills-rw-{}", uuid::Uuid::new_v4()));
        let skill = Skill {
            id: "mine".into(),
            name: "Mine".into(),
            description: String::new(),
            icon: None,
            payload: SkillPayload::Fragment { text: "x".into() },
        };
        SkillLibrary::save_to_dir(&dir, &skill).unwrap();
        assert!(SkillLibrary::load_dir(&dir).unwrap().get("mine").is_some());

        SkillLibrary::delete_from_dir(&dir, "mine").unwrap();
        assert!(SkillLibrary::load_dir(&dir).unwrap().get("mine").is_none());
        // Deleting again is a no-op.
        SkillLibrary::delete_from_dir(&dir, "mine").unwrap();

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn compile_with_context_inlines_rules_and_files() {
        let dir = std::env::temp_dir().join(format!("codetwo-ctx-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(dir.join("AGENTS.md"), "Use tabs.").unwrap();
        std::fs::write(dir.join("src/a.rs"), "fn a() {}").unwrap();
        let lib = sample_library();

        let doc = vec![
            DocBlock::Text { text: "Fix the bug.".into() },
            DocBlock::File { path: "src/a.rs".into() },
        ];
        let c = compile_with_context(&doc, &lib, Some(&dir));
        assert!(c.prompt.contains("## Project rules"), "rules prepended: {}", c.prompt);
        assert!(c.prompt.contains("Use tabs."));
        assert!(c.prompt.contains("**File** `src/a.rs`"));
        assert!(c.prompt.contains("fn a() {}"));
        assert!(c.prompt.contains("```rust"));
        assert_eq!(c.files, vec!["src/a.rs".to_string()]);
        assert!(c.unresolved.is_empty());

        // A missing file is reported, not silently dropped.
        let c2 = compile_with_context(&[DocBlock::File { path: "nope.rs".into() }], &lib, Some(&dir));
        assert_eq!(c2.unresolved, vec!["file:nope.rs".to_string()]);

        // Without a workspace, no rules and files can't be read.
        let c3 = compile(&doc, &lib);
        assert!(!c3.prompt.contains("Project rules"));
        assert_eq!(c3.unresolved, vec!["file:src/a.rs".to_string()]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn mcp_to_acp_json_shape() {
        let server = McpServer {
            name: "fs".into(),
            command: "mcp-fs".into(),
            args: vec!["--root".into(), "/tmp".into()],
            env: vec![("TOKEN".into(), "abc".into())],
        };
        let v = server.to_acp_json();
        assert_eq!(v["name"], "fs");
        assert_eq!(v["command"], "mcp-fs");
        assert_eq!(v["args"][0], "--root");
        assert_eq!(v["env"][0]["name"], "TOKEN");
        assert_eq!(v["env"][0]["value"], "abc");
    }
}
