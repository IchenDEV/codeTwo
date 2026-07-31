//! `codetwo-exec` — headless, non-interactive prompt runner (Codex `codex exec` parity).
//!
//! Runs one prompt against a provider in a working directory and streams the result, then exits.
//! Intended for CI and scripting.
//!
//! ```sh
//! cargo run -p codetwo-core --example exec -- --provider grok --cwd . "Summarize the README"
//! cargo run -p codetwo-core --example exec -- --json "Fix the failing test"
//! ```
//!
//! Flags: `--provider <id>` (default grok), `--cwd <dir>` (default .), `--yolo` (auto-approve),
//! `--json` (emit one JSON event per line), `--timeout <secs>` (default 600).

use std::sync::Arc;
use std::time::Duration;

use codetwo_core::event::Event;
use codetwo_core::permission::PermissionMode;
use codetwo_core::provider::{default_registry, ProviderId};
use codetwo_core::skill::{builtin_skills, DocBlock, SkillLibrary};
use codetwo_core::{Engine, Op};

struct Args {
    provider: String,
    cwd: String,
    prompt: String,
    yolo: bool,
    json: bool,
    timeout: u64,
}

fn parse_args() -> Result<Args, String> {
    let mut provider = "grok".to_string();
    let mut cwd = ".".to_string();
    let mut yolo = false;
    let mut json = false;
    let mut timeout = 600u64;
    let mut rest: Vec<String> = Vec::new();

    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--provider" | "-p" => provider = it.next().ok_or("--provider needs a value")?,
            "--cwd" | "-C" => cwd = it.next().ok_or("--cwd needs a value")?,
            "--timeout" => {
                timeout = it.next().ok_or("--timeout needs a value")?.parse().map_err(|_| "bad --timeout")?
            }
            "--yolo" => yolo = true,
            "--json" => json = true,
            "-h" | "--help" => return Err("help".into()),
            other => rest.push(other.to_string()),
        }
    }
    let prompt = rest.join(" ").trim().to_string();
    if prompt.is_empty() {
        return Err("no prompt given".into());
    }
    Ok(Args { provider, cwd, prompt, yolo, json, timeout })
}

fn parse_provider(s: &str) -> ProviderId {
    match s {
        "claude_code" | "claude" => ProviderId::ClaudeCode,
        "codex" => ProviderId::Codex,
        "grok" => ProviderId::Grok,
        "cursor" => ProviderId::Cursor,
        "opencode" => ProviderId::OpenCode,
        "pi" => ProviderId::Pi,
        "kimi" => ProviderId::Kimi,
        "zcode" => ProviderId::ZCode,
        other => ProviderId::Custom(other.to_string()),
    }
}

const USAGE: &str = "\
codetwo-exec — run one prompt headlessly

USAGE:
  exec [--provider <id>] [--cwd <dir>] [--yolo] [--json] [--timeout <secs>] <prompt...>

PROVIDERS: claude_code | codex | grok | cursor | opencode | pi | kimi | zcode | <custom>
";

#[tokio::main]
async fn main() -> std::process::ExitCode {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            if e == "help" {
                println!("{USAGE}");
                return std::process::ExitCode::SUCCESS;
            }
            eprintln!("error: {e}\n\n{USAGE}");
            return std::process::ExitCode::FAILURE;
        }
    };

    let skills = SkillLibrary::new(builtin_skills());
    let (engine, mut rx) = Engine::new(default_registry(), skills);
    let engine = Arc::new(engine);

    if let Err(e) = engine
        .submit(Op::NewSession {
            provider: parse_provider(&args.provider),
            cwd: args.cwd.clone(),
            use_worktree: false,
        })
        .await
    {
        eprintln!("failed to start session: {e}");
        return std::process::ExitCode::FAILURE;
    }

    let mut failed = false;
    let drive = async {
        while let Some(ev) = rx.recv().await {
            if args.json {
                println!("{}", serde_json::to_string(&ev).unwrap_or_default());
            }
            match &ev {
                Event::SessionCreated { session } => {
                    if args.yolo {
                        let _ = engine
                            .submit(Op::SetPermissionMode {
                                session: session.clone(),
                                mode: PermissionMode::Yolo,
                            })
                            .await;
                    }
                    let doc = vec![DocBlock::Text { text: args.prompt.clone() }];
                    let _ = engine.submit(Op::Prompt { session: session.clone(), doc }).await;
                }
                Event::AgentText { text, .. } => {
                    if !args.json {
                        print!("{text}");
                        use std::io::Write;
                        let _ = std::io::stdout().flush();
                    }
                }
                Event::ToolCall { title, status, .. } => {
                    if !args.json {
                        eprintln!("[tool] {title} — {status}");
                    }
                }
                Event::PermissionRequest { session, request_id, title, options } => {
                    // Headless: approve when --yolo, otherwise decline and keep going.
                    let option_id = if args.yolo {
                        options.iter().find(|(id, _)| id.contains("allow")).map(|(id, _)| id.clone())
                    } else {
                        eprintln!("[permission denied — rerun with --yolo] {title}");
                        None
                    };
                    let _ = engine
                        .submit(Op::AnswerPermission {
                            session: session.clone(),
                            request_id: request_id.clone(),
                            option_id,
                        })
                        .await;
                }
                Event::TurnEnded { .. } => break,
                Event::Error { message, .. } => {
                    eprintln!("error: {message}");
                    failed = true;
                    break;
                }
                _ => {}
            }
        }
    };

    if tokio::time::timeout(Duration::from_secs(args.timeout), drive).await.is_err() {
        eprintln!("timed out after {}s", args.timeout);
        return std::process::ExitCode::FAILURE;
    }
    if !args.json {
        println!();
    }
    if failed {
        std::process::ExitCode::FAILURE
    } else {
        std::process::ExitCode::SUCCESS
    }
}
