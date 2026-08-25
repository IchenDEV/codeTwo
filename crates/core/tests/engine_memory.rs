//! End-to-end memory wiring: the provider sees recalled context, the app transcript does not, and
//! a successful turn is captured into the provider-neutral store.

use std::sync::Arc;

use codetwo_core::event::Event;
use codetwo_core::memory::{MemoryCapability, MemorySettings};
use codetwo_core::provider::{LaunchSpec, Provider, ProviderId};
use codetwo_core::session::{Part, Role, Session};
use codetwo_core::skill::{DocBlock, SkillLibrary};
use codetwo_core::{Engine, Op, Store};

const MEMORY_AGENT: &str = r#"
import json, sys
def send(message): print(json.dumps(message), flush=True)
for line in sys.stdin:
    if not line.strip(): continue
    message = json.loads(line)
    method, mid = message.get("method"), message.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":mid,"result":{"protocolVersion":1}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":mid,"result":{"sessionId":"memory-session"}})
    elif method == "session/prompt":
        prompt = message["params"]["prompt"][0]["text"]
        answer = "memory-seen" if "frobnicator" in prompt else "memory-missing"
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"memory-session",
              "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":answer}}}})
        send({"jsonrpc":"2.0","id":mid,"result":{"stopReason":"end_turn"}})
"#;

const SLOW_MEMORY_AGENT: &str = r#"
import json, sys, time
def send(message): print(json.dumps(message), flush=True)
for line in sys.stdin:
    if not line.strip(): continue
    message = json.loads(line)
    method, mid = message.get("method"), message.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":mid,"result":{"protocolVersion":1}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":mid,"result":{"sessionId":"slow-memory-session"}})
    elif method == "session/prompt":
        time.sleep(0.25)
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"slow-memory-session",
              "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"done"}}}})
        send({"jsonrpc":"2.0","id":mid,"result":{"stopReason":"end_turn"}})
"#;

const SLOW_INITIALIZE_AGENT: &str = r#"
import json, sys, time
for line in sys.stdin:
    if not line.strip(): continue
    message = json.loads(line)
    if message.get("method") == "initialize":
        time.sleep(5)
        print(json.dumps({"jsonrpc":"2.0","id":message.get("id"),"result":{"protocolVersion":1}}), flush=True)
"#;

async fn run_memory_turn(
    engine: &Engine,
    events: &mut tokio::sync::mpsc::UnboundedReceiver<Event>,
    session: &str,
    prompt: &str,
) -> (String, usize) {
    engine
        .submit(Op::Prompt {
            session: session.into(),
            doc: vec![DocBlock::Text {
                text: prompt.into(),
            }],
            request_id: None,
        })
        .await
        .unwrap();

    let mut agent_text = String::new();
    let mut receipt_items = 0;
    loop {
        let event = tokio::time::timeout(std::time::Duration::from_secs(10), events.recv())
            .await
            .expect("event before timeout")
            .expect("event stream open");
        match event {
            Event::AgentText { text, .. } => agent_text.push_str(&text),
            Event::MemoryContext { receipt, .. } => receipt_items += receipt.items.len(),
            Event::TurnEnded { .. } => return (agent_text, receipt_items),
            Event::Error { message, .. } => panic!("unexpected engine error: {message}"),
            _ => {}
        }
    }
}

#[tokio::test]
async fn recall_only_sends_new_memory_items_to_a_live_provider_context() {
    let project = std::env::temp_dir().to_string_lossy().to_string();
    let provider = Provider {
        id: ProviderId::Grok,
        display_name: "Memory mock".into(),
        launch: LaunchSpec::new("python3", ["-c", MEMORY_AGENT]),
        needs_node: false,
    };
    let store = Arc::new(Store::open_in_memory().unwrap());
    store
        .set_memory_settings(MemorySettings {
            enabled: true,
            capture: false,
            inject: true,
            include_external_context: true,
        })
        .unwrap();
    store
        .add_memory(
            &project,
            "constraint",
            "Always use frobnicator for releases",
            true,
        )
        .unwrap();
    let session = Session::new(ProviderId::Grok, project);
    let session_id = session.id.clone();
    store.upsert_session(&session).unwrap();

    let (engine, mut events) =
        Engine::with_store(vec![provider], SkillLibrary::new(vec![]), store.clone());
    let first = run_memory_turn(&engine, &mut events, &session_id, "How should we release?").await;
    let second = run_memory_turn(&engine, &mut events, &session_id, "How should we release?").await;

    assert_eq!(first, ("memory-seen".into(), 1));
    assert_eq!(second, ("memory-missing".into(), 0));
    assert_eq!(store.list_memory_receipts(&session_id).unwrap().len(), 1);
}

#[tokio::test]
async fn recall_is_transient_and_completed_turn_is_captured() {
    let project = std::env::temp_dir().to_string_lossy().to_string();
    let provider = Provider {
        id: ProviderId::Grok,
        display_name: "Memory mock".into(),
        launch: LaunchSpec::new("python3", ["-c", MEMORY_AGENT]),
        needs_node: false,
    };
    let store = Arc::new(Store::open_in_memory().unwrap());
    store
        .add_memory(
            &project,
            "constraint",
            "Always use frobnicator for releases",
            true,
        )
        .unwrap();
    let session = Session::new(ProviderId::Grok, project.clone());
    let session_id = session.id.clone();
    store.upsert_session(&session).unwrap();

    let (engine, mut events) =
        Engine::with_store(vec![provider], SkillLibrary::new(vec![]), store.clone());
    let prompt = "Always use dry-run mode for deploys.";
    engine
        .submit(Op::Prompt {
            session: session_id.clone(),
            doc: vec![DocBlock::Text {
                text: prompt.into(),
            }],
            request_id: None,
        })
        .await
        .unwrap();

    let mut agent_text = String::new();
    let mut receipt_items = 0;
    loop {
        let event = tokio::time::timeout(std::time::Duration::from_secs(10), events.recv())
            .await
            .expect("event before timeout")
            .expect("event stream open");
        match event {
            Event::AgentText { text, .. } => agent_text.push_str(&text),
            Event::MemoryContext { receipt, .. } => receipt_items = receipt.items.len(),
            Event::TurnEnded { .. } => break,
            Event::Error { message, .. } => panic!("unexpected engine error: {message}"),
            _ => {}
        }
    }
    assert_eq!(
        agent_text, "memory-seen",
        "provider should receive pinned memory"
    );
    assert_eq!(
        receipt_items, 1,
        "the turn should disclose the injected item"
    );

    let transcript = store.transcript(&session_id).unwrap();
    let user_texts: Vec<_> = transcript
        .iter()
        .filter_map(|(role, part)| match (role, part) {
            (Role::User, Part::Prompt { text, .. }) => Some(text.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(user_texts, vec![prompt]);
    assert!(!user_texts.iter().any(|text| text.contains("frobnicator")));

    assert_eq!(store.list_memory_receipts(&session_id).unwrap().len(), 1);
    let user_seq = store
        .transcript_with_seq(&session_id)
        .unwrap()
        .into_iter()
        .find_map(|(seq, role, part)| {
            matches!((role, part), (Role::User, Part::Prompt { .. })).then_some(seq)
        })
        .unwrap();
    assert!(
        store
            .memory_turn_audit(&session_id, user_seq)
            .unwrap()
            .unwrap()
            .provenance
            .used_recalled_memory
    );
    store.run_memory_maintenance_at(i64::MAX).unwrap();
    let stats = store.memory_stats(&project).unwrap();
    assert_eq!(stats.l1, 2, "manual and newly captured stable notes");
    assert_eq!(stats.l2, 1, "one completed work episode");
}

#[tokio::test]
async fn engine_without_memory_keeps_store_but_neither_recalls_nor_captures() {
    let project = std::env::temp_dir().to_string_lossy().to_string();
    let provider = Provider {
        id: ProviderId::Grok,
        display_name: "No-memory mock".into(),
        launch: LaunchSpec::new("python3", ["-c", MEMORY_AGENT]),
        needs_node: false,
    };
    let store = Arc::new(Store::open_in_memory().unwrap());
    store
        .add_memory(
            &project,
            "constraint",
            "Always use frobnicator for releases",
            true,
        )
        .unwrap();
    let session = Session::new(ProviderId::Grok, project.clone());
    let session_id = session.id.clone();
    store.upsert_session(&session).unwrap();

    let (engine, mut events) = Engine::with_store_and_memory(
        vec![provider],
        SkillLibrary::new(vec![]),
        store.clone(),
        None,
    );
    engine
        .submit(Op::Prompt {
            session: session_id.clone(),
            doc: vec![DocBlock::Text {
                text: "Always use dry-run mode for deploys.".into(),
            }],
            request_id: None,
        })
        .await
        .unwrap();

    let mut agent_text = String::new();
    let mut disclosed_memory = false;
    loop {
        let event = tokio::time::timeout(std::time::Duration::from_secs(10), events.recv())
            .await
            .expect("event before timeout")
            .expect("event stream open");
        match event {
            Event::AgentText { text, .. } => agent_text.push_str(&text),
            Event::MemoryContext { .. } => disclosed_memory = true,
            Event::TurnEnded { .. } => break,
            Event::Error { message, .. } => panic!("unexpected engine error: {message}"),
            _ => {}
        }
    }

    assert_eq!(agent_text, "memory-missing");
    assert!(!disclosed_memory);
    assert!(store.list_memory_receipts(&session_id).unwrap().is_empty());
    assert_eq!(store.memory_stats(&project).unwrap().l2, 0);
}

#[tokio::test]
async fn deactivating_memory_during_provider_turn_prevents_late_capture() {
    let project = std::env::temp_dir().to_string_lossy().to_string();
    let provider = Provider {
        id: ProviderId::Grok,
        display_name: "Slow memory mock".into(),
        launch: LaunchSpec::new("python3", ["-c", SLOW_MEMORY_AGENT]),
        needs_node: false,
    };
    let store = Arc::new(Store::open_in_memory().unwrap());
    let session = Session::new(ProviderId::Grok, project.clone());
    let session_id = session.id.clone();
    store.upsert_session(&session).unwrap();
    let memory = MemoryCapability::new(store.clone());

    let (engine, mut events) = Engine::with_store_and_memory(
        vec![provider],
        SkillLibrary::new(vec![]),
        store.clone(),
        Some(memory.clone()),
    );
    engine
        .submit(Op::Prompt {
            session: session_id.clone(),
            doc: vec![DocBlock::Text {
                text: "I prefer compact status updates.".into(),
            }],
            request_id: None,
        })
        .await
        .unwrap();
    memory.deactivate();

    loop {
        let event = tokio::time::timeout(std::time::Duration::from_secs(10), events.recv())
            .await
            .expect("event before timeout")
            .expect("event stream open");
        match event {
            Event::TurnEnded { .. } => break,
            Event::Error { message, .. } => panic!("unexpected engine error: {message}"),
            _ => {}
        }
    }

    let user_seq = store
        .transcript_with_seq(&session_id)
        .unwrap()
        .into_iter()
        .find_map(|(seq, role, part)| {
            matches!((role, part), (Role::User, Part::Prompt { .. })).then_some(seq)
        })
        .unwrap();
    assert!(store
        .memory_turn_audit(&session_id, user_seq)
        .unwrap()
        .is_none());
    assert_eq!(store.memory_stats(&project).unwrap().l2, 0);
}

#[tokio::test]
async fn engine_shutdown_terminates_an_in_flight_provider() {
    let project = std::env::temp_dir().to_string_lossy().to_string();
    let provider = Provider {
        id: ProviderId::Grok,
        display_name: "Shutdown mock".into(),
        launch: LaunchSpec::new("python3", ["-c", SLOW_MEMORY_AGENT]),
        needs_node: false,
    };
    let store = Arc::new(Store::open_in_memory().unwrap());
    let session = Session::new(ProviderId::Grok, project);
    let session_id = session.id.clone();
    store.upsert_session(&session).unwrap();
    let (engine, mut events) =
        Engine::with_store_and_memory(vec![provider], SkillLibrary::new(vec![]), store, None);
    engine
        .submit(Op::Prompt {
            session: session_id,
            doc: vec![DocBlock::Text {
                text: "Keep this turn running briefly.".into(),
            }],
            request_id: None,
        })
        .await
        .unwrap();

    engine.shutdown();
    engine.shutdown();

    loop {
        let event = tokio::time::timeout(std::time::Duration::from_secs(3), events.recv())
            .await
            .expect("provider termination should end the turn")
            .expect("event stream open");
        if let Event::Error { terminal: true, .. } = event {
            break;
        }
        if matches!(event, Event::TurnEnded { .. }) {
            panic!("terminated provider must not report a successful turn");
        }
    }
}

#[tokio::test]
async fn engine_shutdown_terminates_a_provider_that_is_still_starting() {
    let provider = Provider {
        id: ProviderId::Grok,
        display_name: "Slow startup mock".into(),
        launch: LaunchSpec::new("python3", ["-c", SLOW_INITIALIZE_AGENT]),
        needs_node: false,
    };
    let (engine, _events) = Engine::new(vec![provider], SkillLibrary::new(vec![]));
    let engine = Arc::new(engine);
    let starting = {
        let engine = engine.clone();
        tokio::spawn(async move {
            engine
                .submit(Op::NewSession {
                    provider: ProviderId::Grok,
                    cwd: std::env::temp_dir().to_string_lossy().into_owned(),
                    use_worktree: false,
                    worktree_base: None,
                    worktree_base_sha: None,
                    request_id: Some("starting-shutdown".into()),
                    model: None,
                    initial_policy: None,
                })
                .await
        })
    };

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    engine.shutdown();

    let result = tokio::time::timeout(std::time::Duration::from_secs(2), starting)
        .await
        .expect("shutdown must terminate a provider before initialize returns")
        .unwrap();
    assert!(result.is_err());
}
