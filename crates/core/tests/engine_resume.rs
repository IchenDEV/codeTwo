//! Provider-native context resume across process restarts (the t3code `resumeCursor` pattern).
//!
//! A stored session's ACP session id is a resume cursor. When its provider is revived in a new
//! process and the agent advertises `loadSession`, the first prompt re-attaches via `session/load`
//! — the agent replays its history (which the engine drops: it's already in the store) and the
//! conversation continues with the agent's context intact. When the agent lacks the capability the
//! engine goes straight to `session/new`; when the load *fails*, it falls back to `session/new`
//! and says so — degrading loudly, never silently.
//!
//! Each mock echoes the ACP session id it was prompted under into its reply text, so which path
//! ran (`sess-old` vs `sess-new`) is observable from the event stream alone.

use std::sync::Arc;

use codetwo_core::event::Event;
use codetwo_core::provider::{LaunchSpec, Provider, ProviderId};
use codetwo_core::session::Session;
use codetwo_core::skill::{DocBlock, SkillLibrary};
use codetwo_core::{Engine, Op, Store};

/// A mock agent with `loadSession`: replays one chunk on `session/load`, then serves prompts,
/// echoing the prompted session id.
const RESUMING_AGENT: &str = r#"
import json, sys
def send(m): print(json.dumps(m), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    msg = json.loads(line)
    method, mid = msg.get("method"), msg.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":mid,"result":{"protocolVersion":1,
              "agentInfo":{"name":"mock-codex-acp","version":"1.6.2"},
              "agentCapabilities":{"loadSession":True,"sessionCapabilities":{"resume":{}}}}})
    elif method == "session/resume":
        send({"jsonrpc":"2.0","id":mid,"result":{}})
    elif method == "session/load":
        sid = msg["params"]["sessionId"]
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":sid,
              "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"replayed history"}}}})
        send({"jsonrpc":"2.0","id":mid,"result":{}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":mid,"result":{"sessionId":"sess-new"}})
    elif method == "session/prompt":
        sid = msg["params"]["sessionId"]
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":sid,
              "update":{"sessionUpdate":"tool_call","toolCallId":"agent-1","title":"spawn_agent",
                        "kind":"spawn_agent","status":"completed",
                        "rawInput":{"agent_type":"explorer","message":"compatibility canary"}}}})
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":sid,
              "update":{"sessionUpdate":"future_collaboration_status","secret":"not diagnostics"}}})
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":sid,
              "update":{"sessionUpdate":"tool_call","toolCallId":"terminal-1","title":"printf canary",
                        "kind":"execute","status":"completed"}}})
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":sid,
              "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"live:"+sid}}}})
        send({"jsonrpc":"2.0","id":mid,"result":{"stopReason":"end_turn"}})
"#;

/// Same surface, but `session/load` always fails — a dead cursor.
const DEAD_CURSOR_AGENT: &str = r#"
import json, sys
def send(m): print(json.dumps(m), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    msg = json.loads(line)
    method, mid = msg.get("method"), msg.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":mid,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":True}}})
    elif method == "session/load":
        send({"jsonrpc":"2.0","id":mid,"error":{"code":-32000,"message":"unknown session"}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":mid,"result":{"sessionId":"sess-new"}})
    elif method == "session/prompt":
        sid = msg["params"]["sessionId"]
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":sid,
              "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"live:"+sid}}}})
        send({"jsonrpc":"2.0","id":mid,"result":{"stopReason":"end_turn"}})
"#;

/// No `loadSession` capability: `session/load` would error, `session/new` works.
const AMNESIC_AGENT: &str = r#"
import json, sys
def send(m): print(json.dumps(m), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    msg = json.loads(line)
    method, mid = msg.get("method"), msg.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":mid,"result":{"protocolVersion":1}})
    elif method == "session/load":
        send({"jsonrpc":"2.0","id":mid,"error":{"code":-32601,"message":"method not found"}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":mid,"result":{"sessionId":"sess-new"}})
    elif method == "session/prompt":
        sid = msg["params"]["sessionId"]
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":sid,
              "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"live:"+sid}}}})
        send({"jsonrpc":"2.0","id":mid,"result":{"stopReason":"end_turn"}})
"#;

/// Build an engine over `script`, with a stored session that carries `sess-old` as its resume
/// cursor — i.e. exactly what a restart leaves behind.
fn engine_with_stored_session(
    script: &'static str,
) -> (
    Engine,
    tokio::sync::mpsc::UnboundedReceiver<Event>,
    Arc<Store>,
    String,
) {
    let provider = Provider {
        id: ProviderId::Grok,
        display_name: "Mock".into(),
        launch: LaunchSpec::new("python3", ["-c", script]),
        needs_node: false,
    };
    let store = Arc::new(Store::open_in_memory().unwrap());
    let mut sess = Session::new(
        ProviderId::Grok,
        std::env::temp_dir().to_string_lossy().to_string(),
    );
    sess.acp_session_id = Some("sess-old".into());
    store.upsert_session(&sess).unwrap();
    let id = sess.id.clone();
    let (engine, rx) = Engine::with_store(vec![provider], SkillLibrary::new(vec![]), store.clone());
    (engine, rx, store, id)
}

/// Drive one prompt and collect events until the turn ends (or errors out).
async fn run_turn(
    engine: &Engine,
    rx: &mut tokio::sync::mpsc::UnboundedReceiver<Event>,
    id: &str,
) -> Vec<Event> {
    engine
        .submit(Op::Prompt {
            session: id.to_string(),
            doc: vec![DocBlock::Text { text: "go".into() }],
            request_id: Some("resume-turn".into()),
        })
        .await
        .unwrap();
    let mut seen = Vec::new();
    loop {
        let ev = tokio::time::timeout(std::time::Duration::from_secs(10), rx.recv())
            .await
            .expect("event before timeout")
            .expect("event stream open");
        let done = matches!(ev, Event::TurnEnded { .. });
        seen.push(ev);
        if done {
            break;
        }
    }
    seen
}

fn agent_texts(events: &[Event]) -> Vec<String> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::AgentText { text, .. } => Some(text.clone()),
            _ => None,
        })
        .collect()
}

#[tokio::test]
async fn a_revived_session_prefers_native_resume_without_replaying_history() {
    let (engine, mut rx, store, id) = engine_with_stored_session(RESUMING_AGENT);
    let events = run_turn(&engine, &mut rx, &id).await;

    // The live turn ran under the *old* ACP session id: context carried across the restart.
    let texts = agent_texts(&events);
    assert!(
        texts.contains(&"live:sess-old".to_string()),
        "expected a resumed turn, got {texts:?}"
    );
    // The replayed history was dropped, not re-rendered…
    assert!(
        !texts.contains(&"replayed history".to_string()),
        "replay leaked into events: {texts:?}"
    );
    // …and not re-persisted either.
    let transcript = store.transcript(&id).unwrap();
    assert!(
        !transcript.iter().any(|(_, p)| matches!(p, codetwo_core::session::Part::Text { text } if text == "replayed history")),
        "replay leaked into the store: {transcript:?}",
    );
    assert!(
        !events.iter().any(|e| matches!(e, Event::Error { .. })),
        "resume should be quiet"
    );

    let compatibility = engine
        .provider_protocol_compatibility(&id)
        .expect("live compatibility snapshot");
    assert_eq!(
        compatibility.adapter_name.as_deref(),
        Some("mock-codex-acp")
    );
    assert_eq!(compatibility.adapter_version.as_deref(), Some("1.6.2"));
    assert!(compatibility.load_session);
    assert!(compatibility.resume_session);
    assert_eq!(compatibility.diagnostics.unhandled_session_updates, 1);
    assert_eq!(
        compatibility.diagnostics.unhandled_session_update_kinds[0].category,
        "future_collaboration_status"
    );
    let diagnostic_json = serde_json::to_string(&compatibility).unwrap();
    assert!(!diagnostic_json.contains("not diagnostics"));
    assert!(events.iter().any(|event| {
        matches!(event, Event::ToolCall { kind: Some(kind), .. } if kind == "spawn_agent")
    }));
    assert!(events.iter().any(|event| {
        matches!(event, Event::ToolCall { kind: Some(kind), .. } if kind == "execute")
    }));
}

#[tokio::test]
async fn a_dead_cursor_falls_back_to_a_fresh_session_and_says_so() {
    let (engine, mut rx, _store, id) = engine_with_stored_session(DEAD_CURSOR_AGENT);
    let events = run_turn(&engine, &mut rx, &id).await;

    // The turn still ran — on a fresh ACP session.
    let texts = agent_texts(&events);
    assert!(
        texts.contains(&"live:sess-new".to_string()),
        "expected fallback turn, got {texts:?}"
    );
    // And the degradation was surfaced, not swallowed.
    assert!(
        events
            .iter()
            .any(|e| matches!(e, Event::Error { message, .. } if message.contains("fresh memory"))),
        "expected an honest fallback notice, got {events:?}",
    );
}

#[tokio::test]
async fn an_agent_without_load_session_goes_straight_to_session_new() {
    let (engine, mut rx, _store, id) = engine_with_stored_session(AMNESIC_AGENT);
    let events = run_turn(&engine, &mut rx, &id).await;

    let texts = agent_texts(&events);
    assert!(
        texts.contains(&"live:sess-new".to_string()),
        "expected a fresh session, got {texts:?}"
    );
    // No load was attempted (the mock would have answered with an error event's worth of noise);
    // the quiet path is the correct path for agents that never advertised the capability.
    assert!(
        !events.iter().any(|e| matches!(e, Event::Error { .. })),
        "no errors expected: {events:?}"
    );
}
