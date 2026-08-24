//! A provider that reports no models of its own still gives the user something to pick from: the
//! engine offers the provider's built-in list as soon as the session exists, before any prompt has
//! been sent — which is also the only moment an agent would ever report its own.
//!
//! The mock agent here answers `initialize` and nothing else, which is all `session/new` (the Op,
//! not the ACP call — that one is deferred to the first prompt) needs.

use codetwo_core::event::Event;
use codetwo_core::models::builtin_models;
use codetwo_core::provider::{LaunchSpec, Provider, ProviderId};
use codetwo_core::skill::SkillLibrary;
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
            model: Some("grok-code-fast-1".into()),
            initial_policy: None,
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
    // A desktop choice made before the session exists remains authoritative until ACP starts.
    assert_eq!(current, "grok-code-fast-1");
}
