//! A provider that reports no models of its own still gives the user something to pick from: the
//! engine offers the provider's built-in list as soon as the session exists, before any prompt has
//! been sent — which is also the only moment an agent would ever report its own.
//!
//! The mock agent here answers `initialize` and nothing else, which is all `session/new` (the Op,
//! not the ACP call — that one is deferred to the first prompt) needs.

use codetwo_core::event::Event;
use codetwo_core::models::builtin_models;
use codetwo_core::provider::{LaunchSpec, Provider, ProviderId};
use codetwo_core::skill::{DocBlock, SkillLibrary};
use codetwo_core::{Engine, Op};

/// A minimal ACP agent: replies to `initialize`, ignores the rest.
const MOCK_AGENT: &str = r#"
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)
    if msg.get("method") == "initialize":
        print(json.dumps({"jsonrpc": "2.0", "id": msg["id"], "result": {"protocolVersion": 1}}), flush=True)
"#;

/// Reproduces the model-selection mismatch behind the picker regression: the user selects a model
/// before the first prompt, then `session/new` reports the adapter's configured default. The prompt
/// succeeds only if the engine reapplies the pending selection through the model config option.
const CODEX_CONFIG_AGENT: &str = r#"
import json, sys

current_model = "gpt-5.6-sol"

def send(message):
    print(json.dumps(message), flush=True)

def options():
    return [{
        "id": "model",
        "name": "Model",
        "type": "select",
        "category": "model",
        "currentValue": current_model,
        "options": [
            {"value": "gpt-5.6-sol", "name": "GPT-5.6 Sol"},
            {"value": "gpt-5.5", "name": "GPT-5.5"},
            {"value": "gpt-5.4", "name": "GPT-5.4"}
        ]
    }]

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    message = json.loads(line)
    method = message.get("method")
    mid = message.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":mid,"result":{"protocolVersion":1}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":mid,"result":{
            "sessionId":"agent-session",
            "configOptions": options()
        }})
    elif method == "session/set_config_option":
        if message["params"]["configId"] == "model":
            current_model = message["params"]["value"]
        send({"jsonrpc":"2.0","id":mid,"result":{"configOptions":options()}})
    elif method == "session/prompt":
        if current_model == "gpt-5.5":
            send({"jsonrpc":"2.0","id":mid,"result":{"stopReason":"end_turn"}})
        else:
            send({"jsonrpc":"2.0","id":mid,"error":{
                "code":-32000,
                "message":"prompt ran on unsupported " + current_model
            }})
"#;

#[tokio::test]
async fn a_silent_provider_still_gets_a_model_list() {
    let provider = Provider {
        id: ProviderId::Grok,
        display_name: "Mock".into(),
        launch: LaunchSpec::new("python3", ["-c", MOCK_AGENT]),
        needs_node: false,
    };
    let (engine, mut rx) = Engine::new(vec![provider], SkillLibrary::new(vec![]));

    engine
        .submit(Op::NewSession {
            provider: ProviderId::Grok,
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("desktop-request".into()),
            initial_policy: None,
            initial_model: None,
            task_id: None,
        })
        .await
        .unwrap();

    let mut created_request = None;
    let mut listed: Option<(Vec<String>, String)> = None;
    while let Some(ev) = rx.recv().await {
        match ev {
            Event::SessionCreated { request_id, .. } => created_request = request_id,
            Event::Models {
                available, current, ..
            } => {
                listed = Some((available.into_iter().map(|m| m.id).collect(), current));
                break;
            }
            Event::Error { message, .. } => panic!("unexpected error: {message}"),
            _ => {}
        }
    }

    assert_eq!(created_request.as_deref(), Some("desktop-request"));
    let (ids, current) = listed.expect("a models event");
    let expected: Vec<String> = builtin_models(&ProviderId::Grok)
        .into_iter()
        .map(|m| m.id)
        .collect();
    assert_eq!(ids, expected);
    // Nothing has been chosen yet, and the CLI's own default isn't ours to guess.
    assert_eq!(current, "");
}

#[tokio::test]
async fn a_draft_codex_selection_overrides_the_adapters_default_on_the_first_prompt() {
    let provider = Provider {
        id: ProviderId::Codex,
        display_name: "Mock Codex".into(),
        launch: LaunchSpec::new("python3", ["-c", CODEX_CONFIG_AGENT]),
        needs_node: false,
    };
    let (engine, mut rx) = Engine::new(vec![provider], SkillLibrary::new(vec![]));

    engine
        .submit(Op::NewSession {
            provider: ProviderId::Codex,
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: None,
            initial_policy: None,
            initial_model: Some("gpt-5.5".into()),
            task_id: None,
        })
        .await
        .unwrap();

    let session = loop {
        match rx.recv().await.expect("session event") {
            Event::SessionCreated { session, .. } => break session,
            Event::Error { message, .. } => panic!("unexpected error: {message}"),
            _ => {}
        }
    };

    engine
        .submit(Op::Prompt {
            session: session.clone(),
            doc: vec![DocBlock::Text {
                text: "hello".into(),
            }],
            request_id: Some("first-prompt".into()),
        })
        .await
        .unwrap();

    let mut configured_model = None;
    let mut configured_choices = Vec::new();
    loop {
        let event = tokio::time::timeout(std::time::Duration::from_secs(10), rx.recv())
            .await
            .expect("turn event before timeout")
            .expect("event stream remains open");
        match event {
            Event::ConfigOptions { options, .. } => {
                if let Some(option) = options
                    .iter()
                    .find(|option| option.category.as_deref() == Some("model"))
                {
                    configured_model = Some(option.current.clone());
                    configured_choices = option
                        .choices
                        .iter()
                        .map(|choice| choice.id.clone())
                        .collect();
                }
            }
            Event::TurnEnded { .. } => break,
            Event::Error {
                message,
                terminal: true,
                ..
            } => panic!("first prompt failed: {message}"),
            _ => {}
        }
    }

    assert_eq!(configured_model.as_deref(), Some("gpt-5.5"));
    assert_eq!(configured_choices, ["gpt-5.6-sol", "gpt-5.5", "gpt-5.4"]);
}
