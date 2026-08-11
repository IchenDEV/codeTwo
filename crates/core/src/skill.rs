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

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

use crate::canvas::{
    resolve_prompt_payload, CanvasFeatureGate, CanvasPixelPolicy, CanvasPromptPayload,
    CanvasProviderImageCapability, CanvasRef,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillKind {
    Fragment,
    AgentSkill,
    Subagent,
    Mcp,
    Macro,
}

/// An MCP server definition attached by an `Mcp` skill and passed through in `session/new`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpServer {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(flatten)]
    pub transport: McpTransport,
}

/// `untagged` preserves the legacy saved stdio shape while adding remote HTTP/SSE servers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum McpTransport {
    Stdio {
        command: String,
        args: Vec<String>,
        env: Vec<(String, String)>,
    },
    Http {
        url: String,
        headers: Vec<(String, String)>,
    },
    Sse {
        url: String,
        headers: Vec<(String, String)>,
    },
}

impl Serialize for McpTransport {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        #[derive(Serialize)]
        struct Stdio<'a> {
            command: &'a str,
            args: &'a [String],
            env: &'a [(String, String)],
        }
        #[derive(Serialize)]
        struct Remote<'a> {
            #[serde(rename = "type")]
            transport: &'a str,
            url: &'a str,
            headers: &'a [(String, String)],
        }

        match self {
            McpTransport::Stdio { command, args, env } => {
                Stdio { command, args, env }.serialize(serializer)
            }
            McpTransport::Http { url, headers } => Remote {
                transport: "http",
                url,
                headers,
            }
            .serialize(serializer),
            McpTransport::Sse { url, headers } => Remote {
                transport: "sse",
                url,
                headers,
            }
            .serialize(serializer),
        }
    }
}

impl<'de> Deserialize<'de> for McpTransport {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Stored {
            Stdio {
                command: String,
                #[serde(default)]
                args: Vec<String>,
                #[serde(default)]
                env: Vec<(String, String)>,
            },
            Remote {
                #[serde(rename = "type", default = "default_http_transport")]
                transport: String,
                url: String,
                #[serde(default)]
                headers: Vec<(String, String)>,
            },
        }

        match Stored::deserialize(deserializer)? {
            Stored::Stdio { command, args, env } => Ok(McpTransport::Stdio { command, args, env }),
            Stored::Remote {
                transport,
                url,
                headers,
            } => match transport.as_str() {
                "http" | "streamable-http" => Ok(McpTransport::Http { url, headers }),
                "sse" => Ok(McpTransport::Sse { url, headers }),
                other => Err(serde::de::Error::custom(format!(
                    "unsupported MCP transport {other}"
                ))),
            },
        }
    }
}

fn default_http_transport() -> String {
    "http".into()
}

impl McpServer {
    /// Shape this server the way ACP `session/new` expects (`mcpServers[]`).
    pub fn to_acp_json(&self) -> serde_json::Value {
        let mut value = match &self.transport {
            McpTransport::Stdio { command, args, env } => serde_json::json!({
                "name": self.name,
                "command": command,
                "args": args,
                "env": env.iter()
                    .map(|(k, v)| serde_json::json!({ "name": k, "value": v }))
                    .collect::<Vec<_>>(),
            }),
            McpTransport::Http { url, headers } => serde_json::json!({
                "name": self.name,
                "type": "http",
                "url": url,
                "headers": headers.iter()
                    .map(|(k, v)| serde_json::json!({ "name": k, "value": v }))
                    .collect::<Vec<_>>(),
            }),
            McpTransport::Sse { url, headers } => serde_json::json!({
                "name": self.name,
                "type": "sse",
                "url": url,
                "headers": headers.iter()
                    .map(|(k, v)| serde_json::json!({ "name": k, "value": v }))
                    .collect::<Vec<_>>(),
            }),
        };
        if let (Some(cwd), Some(object)) = (&self.cwd, value.as_object_mut()) {
            object.insert("cwd".into(), serde_json::Value::String(cwd.clone()));
        }
        value
    }
}

/// A reusable specialist supplied by a plugin. ACP does not standardize provider-native subagent
/// registration, so Code2 also keeps a deterministic inline delegation fallback.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubagentDefinition {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub tools: Vec<String>,
}

/// Kind-specific payload for a skill.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SkillPayload {
    Fragment {
        text: String,
    },
    AgentSkill {
        skill_ref: String,
        inline_text: Option<String>,
    },
    Subagent {
        agent: SubagentDefinition,
    },
    Mcp {
        server: McpServer,
    },
    Macro {
        template: String,
        slots: Vec<String>,
    },
}

impl SkillPayload {
    pub fn kind(&self) -> SkillKind {
        match self {
            SkillPayload::Fragment { .. } => SkillKind::Fragment,
            SkillPayload::AgentSkill { .. } => SkillKind::AgentSkill,
            SkillPayload::Subagent { .. } => SkillKind::Subagent,
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
    /// Where this skill came from (for example `GitHub · owner/repo`). Old on-disk skills omit it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
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
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok(SkillLibrary::default())
            }
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DocBlock {
    Text {
        text: String,
    },
    Skill {
        skill_id: String,
        #[serde(default)]
        params: HashMap<String, String>,
    },
    /// An `@`-mentioned workspace file; its contents are inlined as context at compile time.
    File {
        path: String,
    },
    /// An attached image; sent to the agent as an ACP image content block.
    Image {
        path: String,
    },
    /// A frozen app-owned Canvas revision.  Only the immutable reference and explicit image
    /// policy cross the document boundary; scene JSON and pixels remain in the core store.
    Canvas {
        id: String,
        frozen_revision: u64,
        #[serde(default)]
        pixel_policy: CanvasPixelPolicy,
    },
    /// An `@`-mentioned past chat; its transcript is inlined as context at compile time, so a
    /// planning conversation can be referenced from the document that implements it.
    Session {
        session_id: String,
    },
}

/// Plain, user-authored representation of a composed document.
///
/// This is the durable/searchable prompt record. It intentionally excludes project rules, skill
/// expansion, file contents and referenced-chat contents that are added only while compiling for
/// the agent. Keeping the two forms separate prevents search results and transcript replay from
/// surfacing hidden context as if the user had typed it.
pub fn canonical_doc_text(doc: &[DocBlock]) -> String {
    doc.iter()
        .map(|block| match block {
            DocBlock::Text { text } => text.clone(),
            DocBlock::Skill { skill_id, .. } => format!("[skill:{skill_id}]"),
            DocBlock::File { path } => format!("[@{path}]"),
            DocBlock::Image { path } => format!("[img:{path}]"),
            DocBlock::Canvas {
                id,
                frozen_revision,
                ..
            } => format!("[canvas:{id}@{frozen_revision}]"),
            DocBlock::Session { session_id } => {
                format!("[chat:{}]", session_id.chars().take(8).collect::<String>())
            }
        })
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
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
    /// Plugin-supplied specialists requested by this document.
    #[serde(default)]
    pub subagents: Vec<String>,
    /// Workspace files inlined via `@`-mentions.
    pub files: Vec<String>,
    /// Attached image paths, sent as ACP image content blocks alongside the prompt.
    pub images: Vec<String>,
    /// Resolved immutable Canvas payloads.  This is intentionally separate from workspace image
    /// paths so a provider cannot mistake an app-private asset for a workspace file.
    #[serde(default)]
    pub canvases: Vec<CompiledCanvas>,
    /// Past chats inlined via `@`-mentions (session ids).
    #[serde(default)]
    pub sessions: Vec<String>,
    /// Skill ids (or `file:<path>`) that could not be resolved — surfaced to the user as warnings.
    pub unresolved: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompiledCanvas {
    pub reference: CanvasRef,
    pub payload: CanvasPromptPayload,
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
    compile_with_sessions(doc, library, cwd, None)
}

/// Compile with an explicit Canvas resolver, feature gate, and provider image capability.  A
/// A known-unsupported provider fails closed; unknown capability still attempts every ordered
/// image and surfaces a provider failure. Callers must choose `StructureOnly` when a summary-only
/// send is intended.
pub fn compile_with_canvas(
    doc: &[DocBlock],
    library: &SkillLibrary,
    cwd: Option<&std::path::Path>,
    resolve_session: Option<&dyn Fn(&str) -> Option<String>>,
    gate: CanvasFeatureGate,
    capability: CanvasProviderImageCapability,
    resolve_canvas: &dyn Fn(&str, u64) -> Result<CanvasPromptPayload, crate::canvas::CanvasError>,
) -> Result<CompiledPrompt, crate::canvas::CanvasError> {
    let mut out = compile_with_sessions(doc, library, cwd, resolve_session);
    for block in doc {
        let DocBlock::Canvas {
            id,
            frozen_revision,
            pixel_policy,
        } = block
        else {
            continue;
        };
        let reference = CanvasRef {
            id: id.clone(),
            frozen_revision: *frozen_revision,
            pixel_policy: *pixel_policy,
        };
        let marker = format!("canvas:{id}@{frozen_revision}");
        out.unresolved.retain(|item| item != &marker);
        let payload =
            resolve_prompt_payload(&reference, gate, capability, |canvas_id, revision| {
                resolve_canvas(canvas_id, revision)
            })?;
        out.prompt.push_str("\n\n");
        out.prompt.push_str(&format!(
            "**Canvas {} (revision {}) structural summary:**\n{}",
            payload.title, payload.revision, payload.summary
        ));
        out.canvases.push(CompiledCanvas { reference, payload });
    }
    Ok(out)
}

/// Like [`compile_with_context`], but able to resolve `@`-mentioned past chats: `resolve_session`
/// maps a session id to its rendered transcript context (`None` for an unknown id). The compiler
/// stays store-agnostic — callers with a [`crate::store::Store`] pass a closure over it.
pub fn compile_with_sessions(
    doc: &[DocBlock],
    library: &SkillLibrary,
    cwd: Option<&std::path::Path>,
    resolve_session: Option<&dyn Fn(&str) -> Option<String>>,
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
            DocBlock::Image { path } => {
                // Validate now so a bad path surfaces in the preview rather than mid-turn.
                match cwd.map(|c| crate::workspace::read_image_base64(c, path)) {
                    Some(Ok(_)) => {
                        out.images.push(path.clone());
                        // The image block lets the model see the pixels. The path hint lets an
                        // agent use file tools to copy, edit, or include that same image in work.
                        // JSON quoting keeps unusual filenames on one unambiguous prompt line.
                        let quoted = serde_json::to_string(path)
                            .unwrap_or_else(|_| "\"unavailable\"".to_string());
                        parts.push(format!("**Attached image workspace path:** {quoted}"));
                    }
                    _ => out.unresolved.push(format!("image:{path}")),
                }
            }
            DocBlock::Canvas {
                id,
                frozen_revision,
                ..
            } => out
                .unresolved
                .push(format!("canvas:{id}@{frozen_revision}")),
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
            DocBlock::Session { session_id } => {
                match resolve_session.and_then(|resolve| resolve(session_id)) {
                    Some(ctx) if !ctx.trim().is_empty() => {
                        out.sessions.push(session_id.clone());
                        parts.push(ctx);
                    }
                    _ => out.unresolved.push(format!("session:{session_id}")),
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
                    SkillPayload::Macro { template, .. } => {
                        parts.push(substitute(template, params).trim().to_string())
                    }
                    SkillPayload::AgentSkill {
                        skill_ref,
                        inline_text,
                    } => {
                        out.agent_skills.push(skill_ref.clone());
                        match inline_text {
                            Some(t) => parts.push(t.trim().to_string()),
                            None => parts.push(format!("Use the **{}** skill.", skill.name)),
                        }
                    }
                    SkillPayload::Subagent { agent } => {
                        out.subagents.push(agent.name.clone());
                        let mut contract = format!(
                            "## Subagent: {}\n\nDelegate a focused subtask to this specialist when the provider supports delegation. Otherwise, follow the specialist instructions directly.\n\n{}",
                            agent.name,
                            agent.prompt.trim()
                        );
                        if !agent.tools.is_empty() {
                            contract.push_str(&format!(
                                "\n\nAllowed tools: {}",
                                agent.tools.join(", ")
                            ));
                        }
                        if let Some(model) = &agent.model {
                            contract.push_str(&format!("\nPreferred model: {model}"));
                        }
                        parts.push(contract);
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
            source: None,
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
            source: None,
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
            source: None,
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
            source: None,
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
            source: None,
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
                source: None,
                payload: SkillPayload::Fragment {
                    text: "Act as a meticulous code reviewer. Flag bugs and unsafe patterns."
                        .into(),
                },
            },
            Skill {
                id: "commit".into(),
                name: "Commit Macro".into(),
                description: String::new(),
                icon: None,
                source: None,
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
                source: None,
                payload: SkillPayload::Mcp {
                    server: McpServer {
                        name: "filesystem".into(),
                        cwd: None,
                        transport: McpTransport::Stdio {
                            command: "mcp-fs".into(),
                            args: vec![],
                            env: vec![],
                        },
                    },
                },
            },
        ])
    }

    #[test]
    fn compiles_text_and_fragment() {
        let lib = sample_library();
        let doc = vec![
            DocBlock::Text {
                text: "# Refactor auth".into(),
            },
            DocBlock::Skill {
                skill_id: "reviewer".into(),
                params: HashMap::new(),
            },
            DocBlock::Text {
                text: "Focus on the token path.".into(),
            },
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
        let doc = vec![DocBlock::Skill {
            skill_id: "commit".into(),
            params,
        }];
        let compiled = compile(&doc, &lib);
        assert_eq!(
            compiled.prompt,
            "Write a commit message for auth module in conventional style."
        );
    }

    #[test]
    fn mcp_skill_adds_server_not_prompt_text() {
        let lib = sample_library();
        let doc = vec![DocBlock::Skill {
            skill_id: "fs-mcp".into(),
            params: HashMap::new(),
        }];
        let compiled = compile(&doc, &lib);
        assert_eq!(compiled.mcp_servers.len(), 1);
        assert_eq!(compiled.mcp_servers[0].name, "filesystem");
        assert!(compiled.prompt.is_empty());
    }

    #[test]
    fn subagent_compiles_to_delegation_contract_and_preview_metadata() {
        let lib = SkillLibrary::new([Skill {
            id: "researcher".into(),
            name: "Researcher".into(),
            description: "Find primary evidence".into(),
            icon: None,
            source: Some("Plugin · Research".into()),
            payload: SkillPayload::Subagent {
                agent: SubagentDefinition {
                    name: "Researcher".into(),
                    description: "Find primary evidence".into(),
                    prompt: "Use primary sources and separate facts from inference.".into(),
                    model: Some("fast".into()),
                    tools: vec!["web".into(), "files".into()],
                },
            },
        }]);
        let compiled = compile(
            &[DocBlock::Skill {
                skill_id: "researcher".into(),
                params: HashMap::new(),
            }],
            &lib,
        );
        assert_eq!(compiled.subagents, vec!["Researcher"]);
        assert!(compiled.prompt.contains("## Subagent: Researcher"));
        assert!(compiled.prompt.contains("Allowed tools: web, files"));
        assert!(compiled.prompt.contains("Preferred model: fast"));
    }

    #[test]
    fn unknown_skill_is_reported() {
        let lib = sample_library();
        let doc = vec![DocBlock::Skill {
            skill_id: "nope".into(),
            params: HashMap::new(),
        }];
        let compiled = compile(&doc, &lib);
        assert_eq!(compiled.unresolved, vec!["nope".to_string()]);
    }

    #[test]
    fn session_mention_inlines_resolved_transcript() {
        let lib = sample_library();
        let doc = vec![
            DocBlock::Session {
                session_id: "abc".into(),
            },
            DocBlock::Text {
                text: "Implement what we planned.".into(),
            },
        ];
        let resolve = |id: &str| -> Option<String> {
            (id == "abc").then(|| "**Referenced chat** — Plan\n\n**User:**\nhello".to_string())
        };
        let compiled = compile_with_sessions(&doc, &lib, None, Some(&resolve));
        assert_eq!(compiled.sessions, vec!["abc".to_string()]);
        assert!(compiled.prompt.contains("Referenced chat"));
        assert!(compiled.prompt.contains("Implement what we planned."));
        assert!(compiled.unresolved.is_empty());
    }

    #[test]
    fn session_mention_without_resolver_is_unresolved() {
        let lib = sample_library();
        let doc = vec![DocBlock::Session {
            session_id: "ghost".into(),
        }];
        let compiled = compile(&doc, &lib);
        assert!(compiled.sessions.is_empty());
        assert_eq!(compiled.unresolved, vec!["session:ghost".to_string()]);
    }

    #[test]
    fn canonical_doc_keeps_user_text_but_not_expanded_context() {
        let doc = vec![
            DocBlock::Text {
                text: "First line\n  indented line".into(),
            },
            DocBlock::Skill {
                skill_id: "review".into(),
                params: HashMap::from([("private".into(), "not persisted".into())]),
            },
            DocBlock::File {
                path: "src/main.rs".into(),
            },
            DocBlock::Session {
                session_id: "1234567890abcdef".into(),
            },
        ];

        assert_eq!(
            canonical_doc_text(&doc),
            "First line\n  indented line\n\n[skill:review]\n\n[@src/main.rs]\n\n[chat:12345678]",
        );
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
            source: None,
            payload: SkillPayload::Fragment {
                text: "Make a plan before coding.".into(),
            },
        };
        std::fs::write(
            dir.join("planner.json"),
            serde_json::to_string(&skill).unwrap(),
        )
        .unwrap();
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
            source: None,
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
            DocBlock::Text {
                text: "Fix the bug.".into(),
            },
            DocBlock::File {
                path: "src/a.rs".into(),
            },
        ];
        let c = compile_with_context(&doc, &lib, Some(&dir));
        assert!(
            c.prompt.contains("## Project rules"),
            "rules prepended: {}",
            c.prompt
        );
        assert!(c.prompt.contains("Use tabs."));
        assert!(c.prompt.contains("**File** `src/a.rs`"));
        assert!(c.prompt.contains("fn a() {}"));
        assert!(c.prompt.contains("```rust"));
        assert_eq!(c.files, vec!["src/a.rs".to_string()]);
        assert!(c.unresolved.is_empty());

        // A missing file is reported, not silently dropped.
        let c2 = compile_with_context(
            &[DocBlock::File {
                path: "nope.rs".into(),
            }],
            &lib,
            Some(&dir),
        );
        assert_eq!(c2.unresolved, vec!["file:nope.rs".to_string()]);

        // Without a workspace, no rules and files can't be read.
        let c3 = compile(&doc, &lib);
        assert!(!c3.prompt.contains("Project rules"));
        assert_eq!(c3.unresolved, vec!["file:src/a.rs".to_string()]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn image_context_keeps_pixels_and_an_actionable_workspace_path_together() {
        let dir =
            std::env::temp_dir().join(format!("codetwo-image-context-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("screens")).unwrap();
        let tiny_png = [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x00,
            0x00, 0xb5, 0x1c, 0x0c, 0x02, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41, 0x54, 0x78,
            0xda, 0x63, 0x64, 0xf8, 0x0f, 0x00, 0x01, 0x05, 0x01, 0x01, 0x27, 0x18, 0xe3, 0x66,
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ];
        std::fs::write(dir.join("screens/result.png"), tiny_png).unwrap();
        let doc = vec![
            DocBlock::Text {
                text: "Include this result in the report.".into(),
            },
            DocBlock::Image {
                path: "screens/result.png".into(),
            },
        ];

        let compiled = compile_with_context(&doc, &sample_library(), Some(&dir));
        assert_eq!(compiled.images, vec!["screens/result.png".to_string()]);
        assert!(compiled
            .prompt
            .contains("**Attached image workspace path:** \"screens/result.png\""));
        assert!(compiled.unresolved.is_empty());
        assert_eq!(
            canonical_doc_text(&doc),
            "Include this result in the report.\n\n[img:screens/result.png]",
            "provider-only path context must not replace the user's canonical document"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn mcp_to_acp_json_shape() {
        let server = McpServer {
            name: "fs".into(),
            cwd: None,
            transport: McpTransport::Stdio {
                command: "mcp-fs".into(),
                args: vec!["--root".into(), "/tmp".into()],
                env: vec![("TOKEN".into(), "abc".into())],
            },
        };
        let v = server.to_acp_json();
        assert_eq!(v["name"], "fs");
        assert_eq!(v["command"], "mcp-fs");
        assert_eq!(v["args"][0], "--root");
        assert_eq!(v["env"][0]["name"], "TOKEN");
        assert_eq!(v["env"][0]["value"], "abc");

        let remote = McpServer {
            name: "remote".into(),
            cwd: None,
            transport: McpTransport::Http {
                url: "https://mcp.example.test".into(),
                headers: vec![("Authorization".into(), "Bearer token".into())],
            },
        };
        let v = remote.to_acp_json();
        assert_eq!(v["type"], "http");
        assert_eq!(v["url"], "https://mcp.example.test");
        assert_eq!(v["headers"][0]["name"], "Authorization");

        let events = McpServer {
            name: "events".into(),
            cwd: None,
            transport: McpTransport::Sse {
                url: "https://mcp.example.test/sse".into(),
                headers: Vec::new(),
            },
        };
        let v = events.to_acp_json();
        assert_eq!(v["type"], "sse");
        assert_eq!(v["url"], "https://mcp.example.test/sse");

        let stored = serde_json::to_string(&events).unwrap();
        assert!(stored.contains(r#""type":"sse""#));
        let round_trip: McpServer = serde_json::from_str(&stored).unwrap();
        assert!(matches!(round_trip.transport, McpTransport::Sse { .. }));

        // Records written before remote transports were tagged remain readable as HTTP.
        let legacy: McpServer = serde_json::from_str(
            r#"{"name":"legacy","url":"https://mcp.example.test","headers":[]}"#,
        )
        .unwrap();
        assert!(matches!(legacy.transport, McpTransport::Http { .. }));
    }
}
