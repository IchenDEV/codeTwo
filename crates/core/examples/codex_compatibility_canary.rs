//! Live compatibility gate for the reviewed Codex ACP adapter/CLI combination.
//!
//! This intentionally requires `--live`: it uses the signed-in Codex account, launches one
//! subagent, runs one harmless terminal command in a temporary Git repository, persists the
//! session, restarts the provider process, resumes it, and runs a second terminal command.
//!
//! ```sh
//! cargo run -p codetwo-core --example codex_compatibility_canary -- \
//!   --live --adapter-version 1.7.0 --report target/codex-compatibility-canary.json
//! ```

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use codetwo_core::elicitation::ElicitationAnswer;
use codetwo_core::event::Event;
use codetwo_core::provider::{
    default_registry, Provider, ProviderId, CODEX_ACP_PACKAGE, CODEX_ACP_VERSION,
};
use codetwo_core::provider_lifecycle::parse_provider_version;
use codetwo_core::skill::{DocBlock, SkillLibrary};
use codetwo_core::{Engine, Op, ProviderProtocolCompatibility, Store};
use serde::Serialize;
use tokio::process::Command;

const FIRST_PROMPT: &str = "Compatibility canary. Do not modify files. Delegate to exactly one \
subagent and ask it to return CODETWO_SUBAGENT_OK. After it finishes, reply with \
CODETWO_MULTI_AGENT_OK. Do not skip delegation.";
const SECOND_PROMPT: &str = "Compatibility canary after process restart. Run the terminal command \
printf 'CODETWO_TERMINAL_OK\\n' without modifying files, then reply CODETWO_RESUME_OK.";

struct Args {
    live: bool,
    adapter_version: String,
    adapter_codex: bool,
    report: Option<PathBuf>,
    timeout: Duration,
}

#[derive(Debug, Default, Serialize)]
struct PhaseReport {
    new_session: bool,
    multi_agent_turn: bool,
    persisted: bool,
    process_restart: bool,
    load_resume: bool,
    live_terminal: bool,
}

#[derive(Debug, Default, Serialize)]
struct TurnEvidence {
    tool_updates: u64,
    agent_tool_seen: bool,
    terminal_tool_seen: bool,
    expected_marker_seen: bool,
    fresh_memory_notice: bool,
}

#[derive(Debug, Serialize)]
struct CompatibilityFingerprint {
    core_version: &'static str,
    adapter_package: &'static str,
    adapter_pin: String,
    adapter_observed_version: Option<String>,
    codex_source: String,
    codex_observed_version: Option<String>,
}

#[derive(Debug, Serialize)]
struct CanaryReport {
    schema_version: u8,
    generated_at: String,
    passed: bool,
    fingerprint: CompatibilityFingerprint,
    phases: PhaseReport,
    first_turn: TurnEvidence,
    resumed_turn: TurnEvidence,
    before_restart: Option<ProviderProtocolCompatibility>,
    after_restart: Option<ProviderProtocolCompatibility>,
    failure_code: Option<String>,
}

const USAGE: &str = "\
Codex compatibility canary

USAGE:
  cargo run -p codetwo-core --example codex_compatibility_canary -- \\
    --live [--adapter-version <exact-version>] [--adapter-codex]
    [--report <json-path>] [--timeout <seconds>]

The run uses the signed-in Codex account and creates only a temporary Git repository. Candidate
adapter versions are tested without changing the reviewed repository pin.
";

fn parse_args() -> Result<Args, String> {
    let mut live = false;
    let mut adapter_version = CODEX_ACP_VERSION.to_string();
    let mut adapter_codex = false;
    let mut report = None;
    let mut timeout = Duration::from_secs(15 * 60);
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--live" => live = true,
            "--adapter-version" => {
                let value = args.next().ok_or("--adapter-version needs a version")?;
                adapter_version = exact_adapter_version(&value)?;
            }
            "--adapter-codex" => adapter_codex = true,
            "--report" => {
                report = Some(PathBuf::from(args.next().ok_or("--report needs a path")?));
            }
            "--timeout" => {
                let seconds = args
                    .next()
                    .ok_or("--timeout needs seconds")?
                    .parse::<u64>()
                    .map_err(|_| "--timeout must be an integer")?;
                if !(30..=3_600).contains(&seconds) {
                    return Err("--timeout must be between 30 and 3600 seconds".into());
                }
                timeout = Duration::from_secs(seconds);
            }
            "-h" | "--help" => return Err("help".into()),
            other => return Err(format!("unknown argument {other:?}")),
        }
    }
    Ok(Args {
        live,
        adapter_version,
        adapter_codex,
        report,
        timeout,
    })
}

fn exact_adapter_version(value: &str) -> Result<String, String> {
    let value = value.strip_prefix('v').unwrap_or(value);
    let parsed = (value.len() <= 40
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '+')
        }))
    .then(|| parse_provider_version(value))
    .flatten();
    match parsed.as_deref() {
        Some(parsed) if parsed == value => Ok(value.to_string()),
        _ => Err("--adapter-version must be one exact semver-like version".into()),
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(args) if args.live => args,
        Ok(_) => {
            eprintln!(
                "--live is required because this probe consumes a real Codex turn.\n\n{USAGE}"
            );
            return ExitCode::from(2);
        }
        Err(error) if error == "help" => {
            println!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Err(error) => {
            eprintln!("{error}\n\n{USAGE}");
            return ExitCode::from(2);
        }
    };

    let mut provider = default_registry()
        .into_iter()
        .find(|provider| provider.id == ProviderId::Codex)
        .expect("built-in Codex provider");
    let package_arg = provider
        .launch
        .args
        .iter_mut()
        .find(|argument| argument.starts_with(&format!("{CODEX_ACP_PACKAGE}@")))
        .expect("built-in Codex adapter package argument");
    *package_arg = format!("{CODEX_ACP_PACKAGE}@{}", args.adapter_version);
    if args.adapter_codex {
        provider.launch.env.retain(|(key, _)| key != "CODEX_PATH");
    }
    let fingerprint = compatibility_fingerprint(&provider, &args.adapter_version).await;
    let mut report = CanaryReport {
        schema_version: 1,
        generated_at: chrono::Utc::now().to_rfc3339(),
        passed: false,
        fingerprint,
        phases: PhaseReport::default(),
        first_turn: TurnEvidence::default(),
        resumed_turn: TurnEvidence::default(),
        before_restart: None,
        after_restart: None,
        failure_code: None,
    };

    if let Err(error) = run_canary(&args, provider, &mut report).await {
        eprintln!("canary failed: {error}");
        report.failure_code = Some(
            error
                .split_once(':')
                .map(|(code, _)| code)
                .unwrap_or(&error)
                .chars()
                .take(80)
                .collect(),
        );
    }
    report.passed = report.phases.new_session
        && report.phases.multi_agent_turn
        && report.phases.persisted
        && report.phases.process_restart
        && report.phases.load_resume
        && report.phases.live_terminal
        && protocol_is_clean(report.before_restart.as_ref())
        && protocol_is_clean(report.after_restart.as_ref());

    let mut json = serde_json::to_string_pretty(&report).expect("serialize report");
    json.push('\n');
    print!("{json}");
    if let Some(path) = &args.report {
        if let Err(error) = std::fs::write(path, &json) {
            eprintln!("could not write report: {error}");
            return ExitCode::FAILURE;
        }
    }
    if report.passed {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

fn protocol_is_clean(snapshot: Option<&ProviderProtocolCompatibility>) -> bool {
    snapshot.is_some_and(|snapshot| {
        (snapshot.resume_session || snapshot.load_session)
            && snapshot.diagnostics.malformed_json_lines == 0
            && snapshot.diagnostics.unhandled_session_updates == 0
    })
}

async fn compatibility_fingerprint(
    provider: &Provider,
    adapter_version: &str,
) -> CompatibilityFingerprint {
    let mut adapter_args = provider.launch.args.clone();
    adapter_args.push("--version".into());
    let adapter_observed_version = command_version(&provider.launch.command, &adapter_args).await;

    let configured_codex = provider
        .launch
        .env
        .iter()
        .find(|(key, _)| key == "CODEX_PATH")
        .map(|(_, value)| value.clone());
    let (codex_source, codex_observed_version) = if let Some(path) = configured_codex {
        (
            "verified_chatgpt_bundle".to_string(),
            command_version(&path, &["--version".into()]).await,
        )
    } else {
        let args = vec![
            "-y".into(),
            "--package".into(),
            format!("{CODEX_ACP_PACKAGE}@{adapter_version}"),
            "--".into(),
            "codex".into(),
            "--version".into(),
        ];
        (
            "adapter_dependency".to_string(),
            command_version("npx", &args).await,
        )
    };
    CompatibilityFingerprint {
        core_version: env!("CARGO_PKG_VERSION"),
        adapter_package: CODEX_ACP_PACKAGE,
        adapter_pin: adapter_version.to_string(),
        adapter_observed_version,
        codex_source,
        codex_observed_version,
    }
}

async fn command_version(program: &str, args: &[String]) -> Option<String> {
    let output = tokio::time::timeout(
        Duration::from_secs(20),
        Command::new(program).args(args).output(),
    )
    .await
    .ok()?
    .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    parse_provider_version(&text)
}

async fn run_canary(
    args: &Args,
    provider: Provider,
    report: &mut CanaryReport,
) -> Result<(), String> {
    let directory = tempfile::tempdir().map_err(|error| format!("workspace:{error}"))?;
    let workspace = directory.path().join("workspace");
    std::fs::create_dir(&workspace).map_err(|error| format!("workspace:{error}"))?;
    let git = codetwo_core::provider::which("git").ok_or("workspace:git is unavailable")?;
    let initialized = Command::new(git)
        .args(["init", "--quiet"])
        .current_dir(&workspace)
        .status()
        .await
        .map_err(|error| format!("workspace:{error}"))?;
    if !initialized.success() {
        return Err("workspace:git init failed".into());
    }
    let database = directory.path().join("canary.sqlite3");
    let store = Arc::new(
        Store::open(database.to_string_lossy().as_ref())
            .map_err(|error| format!("store:{error}"))?,
    );
    let skills = SkillLibrary::new(Vec::new());
    let (engine, mut events) =
        Engine::with_store(vec![provider.clone()], skills.clone(), store.clone());
    let session = create_session(&engine, &mut events, &workspace, args.timeout).await?;
    report.phases.new_session = true;

    report.first_turn = run_turn(
        &engine,
        &mut events,
        &session,
        FIRST_PROMPT,
        "CODETWO_MULTI_AGENT_OK",
        args.timeout,
    )
    .await?;
    report.phases.multi_agent_turn = report.first_turn.agent_tool_seen
        && report.first_turn.expected_marker_seen
        && !report.first_turn.fresh_memory_notice;
    report.before_restart = engine.provider_protocol_compatibility(&session);

    let stored = store
        .get_session(&session)
        .map_err(|error| format!("persist:{error}"))?
        .ok_or("persist:session disappeared")?;
    let original_acp_session = stored
        .acp_session_id
        .clone()
        .ok_or("persist:provider session id missing")?;
    let persisted_parts = store
        .transcript(&session)
        .map_err(|error| format!("persist:{error}"))?;
    report.phases.persisted = persisted_parts
        .iter()
        .any(|(role, _)| *role == codetwo_core::session::Role::User)
        && persisted_parts
            .iter()
            .any(|(role, _)| *role == codetwo_core::session::Role::Agent);
    if !report.phases.multi_agent_turn || !report.phases.persisted {
        return Err("first_turn:multi-agent or persistence evidence missing".into());
    }

    engine.shutdown();
    drop(engine);
    drop(events);
    drop(store);
    report.phases.process_restart = true;

    let reopened = Arc::new(
        Store::open(database.to_string_lossy().as_ref())
            .map_err(|error| format!("restart:{error}"))?,
    );
    let (engine, mut events) = Engine::with_store(vec![provider], skills, reopened.clone());
    report.resumed_turn = run_turn(
        &engine,
        &mut events,
        &session,
        SECOND_PROMPT,
        "CODETWO_RESUME_OK",
        args.timeout,
    )
    .await?;
    report.after_restart = engine.provider_protocol_compatibility(&session);
    let resumed = reopened
        .get_session(&session)
        .map_err(|error| format!("resume:{error}"))?
        .ok_or("resume:session disappeared")?;
    report.phases.load_resume = resumed.acp_session_id.as_deref()
        == Some(original_acp_session.as_str())
        && !report.resumed_turn.fresh_memory_notice
        && report
            .after_restart
            .as_ref()
            .is_some_and(|snapshot| snapshot.resume_session || snapshot.load_session);
    report.phases.live_terminal =
        report.resumed_turn.terminal_tool_seen && report.resumed_turn.expected_marker_seen;
    if !report.phases.load_resume || !report.phases.live_terminal {
        return Err("resume:load/resume or terminal evidence missing".into());
    }
    Ok(())
}

async fn create_session(
    engine: &Engine,
    events: &mut tokio::sync::mpsc::UnboundedReceiver<Event>,
    workspace: &std::path::Path,
    timeout: Duration,
) -> Result<String, String> {
    engine
        .submit(Op::NewSession {
            provider: ProviderId::Codex,
            cwd: workspace.to_string_lossy().into_owned(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("codex-canary-new".into()),
            model: None,
            initial_policy: None,
        })
        .await
        .map_err(|error| format!("new_session:{error}"))?;
    tokio::time::timeout(timeout, async {
        while let Some(event) = events.recv().await {
            match event {
                Event::SessionCreated { session, .. } => return Ok(session),
                Event::Error {
                    message,
                    terminal: true,
                    ..
                } => return Err(format!("new_session:{message}")),
                _ => {}
            }
        }
        Err("new_session:event stream closed".into())
    })
    .await
    .map_err(|_| "new_session:timed out".to_string())?
}

async fn run_turn(
    engine: &Engine,
    events: &mut tokio::sync::mpsc::UnboundedReceiver<Event>,
    session: &str,
    prompt: &str,
    expected_marker: &str,
    timeout: Duration,
) -> Result<TurnEvidence, String> {
    engine
        .submit(Op::Prompt {
            session: session.to_string(),
            doc: vec![DocBlock::Text {
                text: prompt.to_string(),
            }],
            request_id: Some(format!("codex-canary-{expected_marker}")),
        })
        .await
        .map_err(|error| format!("turn:{error}"))?;
    tokio::time::timeout(timeout, async {
        let mut evidence = TurnEvidence::default();
        let mut agent_text = String::new();
        while let Some(event) = events.recv().await {
            match event {
                Event::PermissionRequest {
                    session,
                    request_id,
                    options,
                    ..
                } => {
                    let option_id = options
                        .iter()
                        .find(|(id, label)| {
                            id.to_ascii_lowercase().contains("allow")
                                || label.to_ascii_lowercase().contains("allow")
                        })
                        .or_else(|| options.first())
                        .map(|(id, _)| id.clone());
                    engine
                        .submit(Op::AnswerPermission {
                            session,
                            request_id,
                            option_id,
                        })
                        .await
                        .map_err(|error| format!("turn:{error}"))?;
                }
                Event::ElicitationRequest {
                    session,
                    request_id,
                    ..
                } => {
                    engine
                        .submit(Op::AnswerElicitation {
                            session,
                            request_id,
                            answer: ElicitationAnswer::Decline,
                        })
                        .await
                        .map_err(|error| format!("turn:{error}"))?;
                }
                Event::ToolCall {
                    title,
                    kind,
                    agent_input,
                    outputs,
                    ..
                } => {
                    evidence.tool_updates = evidence.tool_updates.saturating_add(1);
                    let signal =
                        format!("{} {title} {agent_input:?}", kind.as_deref().unwrap_or(""))
                            .to_ascii_lowercase();
                    evidence.agent_tool_seen |= ["spawn_agent", "subagent", "delegate", "collab"]
                        .iter()
                        .any(|needle| signal.contains(needle));
                    evidence.terminal_tool_seen |= kind.as_deref() == Some("execute")
                        || ["terminal", "shell", "printf"]
                            .iter()
                            .any(|needle| signal.contains(needle));
                    let output = format!("{outputs:?}");
                    evidence.expected_marker_seen |= output.contains(expected_marker);
                }
                Event::AgentText { text, .. } => {
                    if agent_text.len() < 8_192 {
                        agent_text.push_str(&text);
                    }
                    evidence.expected_marker_seen |= agent_text.contains(expected_marker);
                }
                Event::Error {
                    message, terminal, ..
                } => {
                    evidence.fresh_memory_notice |= message.contains("fresh memory");
                    if terminal {
                        return Err(format!("turn:{message}"));
                    }
                }
                Event::TurnEnded { session: ended, .. } if ended == session => return Ok(evidence),
                _ => {}
            }
        }
        Err("turn:event stream closed".into())
    })
    .await
    .map_err(|_| "turn:timed out".to_string())?
}

#[cfg(test)]
mod tests {
    use super::exact_adapter_version;

    #[test]
    fn candidate_adapter_version_must_be_exact() {
        assert_eq!(exact_adapter_version("1.7.0").unwrap(), "1.7.0");
        assert_eq!(
            exact_adapter_version("v1.7.0-beta.1").unwrap(),
            "1.7.0-beta.1"
        );
        for invalid in ["latest", "1", "1.7.0 --package other", "1.7.0/other"] {
            assert!(
                exact_adapter_version(invalid).is_err(),
                "accepted {invalid}"
            );
        }
    }
}
