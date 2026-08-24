//! The structured-question path end to end, through the real Engine and ACP stdio transport.
//!
//! This is what makes Claude Code's `AskUserQuestion` render as a question instead of a bare
//! "Tool call — AskUserQuestion" approval: its adapter only sends `elicitation/create` when the
//! client advertises `elicitation.form`, so the mock agent here refuses to ask unless we did.

use std::sync::Arc;
use std::time::Duration;

use codetwo_core::elicitation::{ElicitationAnswer, ElicitationFieldKind};
use codetwo_core::event::Event;
use codetwo_core::provider::{LaunchSpec, Provider, ProviderId};
use codetwo_core::skill::{DocBlock, SkillLibrary};
use codetwo_core::{Engine, Op, PendingInputKind, SessionRunState, Store};
use serde_json::{json, Map, Value};

/// Asks one AskUserQuestion-shaped question, then reports back exactly what the client answered.
/// The question is only asked when `elicitation.form` was advertised; otherwise the agent says so,
/// which is the regression this file exists to catch.
const QUESTION_AGENT: &str = r#"
import json, sys

def send(message):
    print(json.dumps(message), flush=True)

form_capable = False
prompt_id = None
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    message = json.loads(line)
    method = message.get("method")
    mid = message.get("id")
    if method == "initialize":
        caps = message.get("params", {}).get("clientCapabilities") or {}
        form_capable = isinstance(caps.get("elicitation", {}).get("form"), dict)
        send({"jsonrpc":"2.0","id":mid,"result":{"protocolVersion":1}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":mid,"result":{"sessionId":"agent-session"}})
    elif method == "session/prompt":
        prompt_id = mid
        if not form_capable:
            send({"jsonrpc":"2.0","method":"session/update","params":{
                "sessionId":"agent-session",
                "update":{"sessionUpdate":"agent_message_chunk",
                          "content":{"type":"text","text":"no form capability"}}}})
            send({"jsonrpc":"2.0","id":prompt_id,"result":{"stopReason":"end_turn"}})
            prompt_id = None
            continue
        send({"jsonrpc":"2.0","id":3000,"method":"elicitation/create","params":{
            "mode":"form",
            "sessionId":"agent-session",
            "toolCallId":"toolu_ask",
            "message":"Which auth method should we use?",
            "requestedSchema":{
                "type":"object",
                "properties":{
                    "question_0":{
                        "type":"string",
                        "title":"Auth method",
                        "oneOf":[
                            {"const":"OAuth","title":"OAuth","description":"Redirect flow"},
                            {"const":"API key","title":"API key"}
                        ]
                    },
                    "question_0_custom":{
                        "type":"string",
                        "title":"Other",
                        "_meta":{"_askUserQuestionCustomAnswer":{"questionId":"question_0",
                                                                 "isCustomAnswer":True}}
                    }
                }
            }}})
    elif method is None and mid == 3000:
        send({"jsonrpc":"2.0","method":"session/update","params":{
            "sessionId":"agent-session",
            "update":{"sessionUpdate":"agent_message_chunk",
                      "content":{"type":"text","text":json.dumps(message.get("result"))}}}})
        if prompt_id is not None:
            send({"jsonrpc":"2.0","id":prompt_id,"result":{"stopReason":"end_turn"}})
            prompt_id = None
"#;

fn provider() -> Provider {
    Provider {
        id: ProviderId::Grok,
        display_name: "Question mock".into(),
        launch: LaunchSpec::new("python3", ["-c", QUESTION_AGENT]),
        needs_node: false,
    }
}

async fn next_event(rx: &mut tokio::sync::mpsc::UnboundedReceiver<Event>) -> Event {
    tokio::time::timeout(Duration::from_secs(10), rx.recv())
        .await
        .expect("event before timeout")
        .expect("event stream remains open")
}

async fn start(store: Arc<Store>) -> (Engine, tokio::sync::mpsc::UnboundedReceiver<Event>, String) {
    let (engine, mut rx) = Engine::with_store(vec![provider()], SkillLibrary::new(vec![]), store);
    engine
        .submit(Op::NewSession {
            provider: ProviderId::Grok,
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("create-elicitation-test".into()),
            model: None,
            initial_policy: None,
        })
        .await
        .unwrap();
    let session = loop {
        if let Event::SessionCreated { session, .. } = next_event(&mut rx).await {
            break session;
        }
    };
    engine
        .submit(Op::Prompt {
            session: session.clone(),
            doc: vec![DocBlock::Text {
                text: "ask me something".into(),
            }],
            request_id: Some("question-prompt".into()),
        })
        .await
        .unwrap();
    (engine, rx, session)
}

/// The question, and the parked pending input the UI renders it from.
async fn await_question(
    rx: &mut tokio::sync::mpsc::UnboundedReceiver<Event>,
) -> (String, codetwo_core::elicitation::ElicitationForm) {
    loop {
        match next_event(rx).await {
            Event::ElicitationRequest {
                request_id, form, ..
            } => return (request_id, form),
            Event::AgentText { text, .. } => panic!("agent never asked: {text}"),
            Event::Error { message, .. } => panic!("unexpected error: {message}"),
            _ => {}
        }
    }
}

/// The agent echoes the client's response back as its message, so the turn's text *is* the answer
/// that reached it.
async fn answer_seen_by_agent(rx: &mut tokio::sync::mpsc::UnboundedReceiver<Event>) -> Value {
    loop {
        match next_event(rx).await {
            Event::AgentText { text, .. } => {
                return serde_json::from_str(&text).expect("the agent echoes its received response")
            }
            Event::Error { message, .. } => panic!("unexpected error: {message}"),
            _ => {}
        }
    }
}

#[tokio::test]
async fn a_form_question_is_parked_and_answered_with_content() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (engine, mut rx, session) = start(store.clone()).await;
    let (request_id, form) = await_question(&mut rx).await;

    assert_eq!(form.message, "Which auth method should we use?");
    assert_eq!(form.tool_call_id.as_deref(), Some("toolu_ask"));
    let question = form.questions().next().expect("one question");
    assert_eq!(question.kind, ElicitationFieldKind::Select);
    assert_eq!(question.title.as_deref(), Some("Auth method"));
    assert_eq!(
        question
            .options
            .iter()
            .map(|option| option.label.as_str())
            .collect::<Vec<_>>(),
        ["OAuth", "API key"]
    );

    // The turn is blocked on the user, and the pending input carries the form so any client can
    // render the question rather than an approval prompt.
    let awaiting = engine
        .list_sessions()
        .unwrap()
        .into_iter()
        .find(|candidate| candidate.id == session)
        .expect("session remains listed")
        .activity;
    let SessionRunState::AwaitingInput { pending, .. } = &awaiting.state else {
        panic!("a parked question must project AwaitingInput");
    };
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].kind, PendingInputKind::Elicitation);
    assert_eq!(pending[0].input_id, request_id);
    assert_eq!(pending[0].form.as_ref(), Some(&form));

    // Answer with one offered value and one the agent never listed.
    let mut content = Map::new();
    content.insert("question_0".into(), json!("OAuth"));
    content.insert("question_9".into(), json!("smuggled"));
    engine
        .submit(Op::AnswerElicitation {
            session: session.clone(),
            request_id,
            answer: ElicitationAnswer::Accept { content },
        })
        .await
        .unwrap();

    assert_eq!(
        answer_seen_by_agent(&mut rx).await,
        json!({"action": "accept", "content": {"question_0": "OAuth"}}),
    );
}

#[tokio::test]
async fn skipping_declines_without_aborting_the_tool() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (engine, mut rx, session) = start(store).await;
    let (request_id, _) = await_question(&mut rx).await;

    engine
        .submit(Op::AnswerElicitation {
            session,
            request_id,
            answer: ElicitationAnswer::Decline,
        })
        .await
        .unwrap();

    assert_eq!(
        answer_seen_by_agent(&mut rx).await,
        json!({"action": "decline"}),
    );
}

/// A client that only knows how to answer permissions can still answer a single-question form:
/// the pending input projects the agent's own options as permission options.
#[tokio::test]
async fn a_permission_shaped_answer_resolves_a_single_question_form() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (engine, mut rx, session) = start(store).await;
    let (request_id, form) = await_question(&mut rx).await;

    let options = form.legacy_options();
    assert_eq!(
        options
            .iter()
            .map(|(_, label)| label.as_str())
            .collect::<Vec<_>>(),
        ["OAuth", "API key", "Skip"]
    );
    engine
        .submit(Op::AnswerPermission {
            session,
            request_id,
            option_id: Some(options[1].0.clone()),
        })
        .await
        .unwrap();

    assert_eq!(
        answer_seen_by_agent(&mut rx).await,
        json!({"action": "accept", "content": {"question_0": "API key"}}),
    );
}
