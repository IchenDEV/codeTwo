//! The Rust host adapter used by TUI/server must reach the real ACP session seam. Tool Broker
//! conformance is covered by `tool_broker_adapter`; these tests prove the returned MCP servers and
//! instructions reach new and loaded sessions. Codex receives stable instructions through its
//! developer config; other providers receive them on the first prompt only.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use codetwo_core::event::Event;
use codetwo_core::provider::{LaunchSpec, Provider, ProviderId, ProviderToolset};
use codetwo_core::session::Session;
use codetwo_core::skill::{DocBlock, McpServer, McpTransport, SkillLibrary};
use codetwo_core::{Engine, Op, Store};

const HOST_TOOL_AGENT: &str = r#"
import json, sys
attached = []
def send(message): print(json.dumps(message), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    message = json.loads(line)
    method, request_id = message.get("method"), message.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":request_id,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":True}}})
    elif method == "session/new":
        attached = [server.get("name") for server in message["params"].get("mcpServers", [])]
        send({"jsonrpc":"2.0","id":request_id,"result":{"sessionId":"sess-new"}})
    elif method == "session/load":
        attached = [server.get("name") for server in message["params"].get("mcpServers", [])]
        send({"jsonrpc":"2.0","id":request_id,"result":{}})
    elif method == "session/prompt":
        prompt = json.dumps(message["params"].get("prompt", []))
        text = "mcp=" + ",".join(attached) + ";instructions=" + str("HOST_TOOL_MARKER" in prompt).lower()
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":message["params"]["sessionId"],"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":text}}}})
        send({"jsonrpc":"2.0","id":request_id,"result":{"stopReason":"end_turn"}})
"#;

const CODEX_CONTEXT_AGENT: &str = r#"
import json, os, sys
config = json.loads(os.environ.get("CODEX_CONFIG", "{}"))
def send(message): print(json.dumps(message), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    message = json.loads(line)
    method, request_id = message.get("method"), message.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":request_id,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":True}}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":request_id,"result":{"sessionId":"codex-new"}})
    elif method == "session/load":
        send({"jsonrpc":"2.0","id":request_id,"result":{}})
    elif method == "session/prompt":
        prompt = json.dumps(message["params"].get("prompt", []))
        instructions = config.get("developer_instructions", "")
        text = ";".join([
            "config_host=" + str("HOST_TOOL_MARKER" in instructions).lower(),
            "config_sites=" + str("[C2 Sites routing and safety]" in instructions).lower(),
            "prompt_host=" + str("HOST_TOOL_MARKER" in prompt).lower(),
            "prompt_sites=" + str("[C2 Sites routing and safety]" in prompt).lower(),
        ])
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":message["params"]["sessionId"],"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":text}}}})
        send({"jsonrpc":"2.0","id":request_id,"result":{"stopReason":"end_turn"}})
"#;

const CODEX_BROWSER_GATE_AGENT: &str = r#"
import json, os, sys
config = json.loads(os.environ.get("CODEX_CONFIG", "{}"))
attached = []
def send(message): print(json.dumps(message), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    message = json.loads(line)
    method, request_id = message.get("method"), message.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":request_id,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":True}}})
    elif method == "session/new":
        attached = [server.get("name") for server in message["params"].get("mcpServers", [])]
        send({"jsonrpc":"2.0","id":request_id,"result":{"sessionId":"codex-gated"}})
    elif method == "session/load":
        attached = [server.get("name") for server in message["params"].get("mcpServers", [])]
        send({"jsonrpc":"2.0","id":request_id,"result":{}})
    elif method == "session/prompt":
        features = config.get("features", {})
        node_repl = config.get("mcp_servers", {}).get("node_repl", {})
        instructions = config.get("developer_instructions", "")
        text = ";".join([
            "browser=" + str(features.get("browser_use") is False).lower(),
            "external=" + str(features.get("browser_use_external") is False).lower(),
            "node_disabled=" + str(node_repl.get("enabled") is False).lower(),
            "filter=" + str(os.environ.get("DISABLE_MCP_CONFIG_FILTERING") == "true").lower(),
            "route=" + str("[C2 desktop browser routing]" in instructions).lower(),
            "mcp=" + ",".join(attached),
        ])
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":message["params"]["sessionId"],"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":text}}}})
        send({"jsonrpc":"2.0","id":request_id,"result":{"stopReason":"end_turn"}})
"#;

const NATIVE_COMPACT_AGENT: &str = r#"
import json, sys
def send(message): print(json.dumps(message), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    message = json.loads(line)
    method, request_id = message.get("method"), message.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":request_id,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":True}}})
    elif method == "session/new":
        send({"jsonrpc":"2.0","id":request_id,"result":{"sessionId":"native-compact"}})
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"native-compact","update":{"sessionUpdate":"available_commands_update","availableCommands":[{"name":"compact","description":"Compact context"}]}}})
    elif method == "session/prompt":
        prompt = message["params"].get("prompt", [])
        exact = prompt == [{"type":"text","text":"/compact"}]
        text = "raw_compact=" + str(exact).lower()
        send({"jsonrpc":"2.0","method":"session/update","params":{"sessionId":message["params"]["sessionId"],"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":text}}}})
        send({"jsonrpc":"2.0","id":request_id,"result":{"stopReason":"end_turn"}})
"#;

fn mock_provider() -> Provider {
    Provider {
        id: ProviderId::Grok,
        display_name: "Mock".into(),
        launch: LaunchSpec::new("python3", ["-c", HOST_TOOL_AGENT]),
        needs_node: false,
    }
}

fn mock_codex_provider() -> Provider {
    let mut launch = LaunchSpec::new("python3", ["-c", CODEX_CONTEXT_AGENT]);
    launch.env.push(("CODEX_CONFIG".into(), "{}".into()));
    Provider {
        id: ProviderId::Codex,
        display_name: "Mock Codex".into(),
        launch,
        needs_node: false,
    }
}

fn mock_codex_browser_gate_provider() -> Provider {
    Provider {
        id: ProviderId::Codex,
        display_name: "Mock gated Codex".into(),
        launch: LaunchSpec::new("python3", ["-c", CODEX_BROWSER_GATE_AGENT]),
        needs_node: false,
    }
}

fn mock_native_compact_provider() -> Provider {
    Provider {
        id: ProviderId::Grok,
        display_name: "Mock native compact".into(),
        launch: LaunchSpec::new("python3", ["-c", NATIVE_COMPACT_AGENT]),
        needs_node: false,
    }
}

fn provider_toolsets() -> HashMap<String, ProviderToolset> {
    HashMap::from([(
        ProviderId::Grok.as_str().to_string(),
        ProviderToolset {
            browser_access_enabled: true,
            capabilities: Vec::new(),
            native_capabilities: Vec::new(),
            mcp_servers: vec![McpServer {
                name: "computer-use".into(),
                cwd: Some("/verified/computer-use".into()),
                transport: McpTransport::Stdio {
                    command: "/verified/computer-use/mcp".into(),
                    args: vec!["mcp".into()],
                    env: Vec::new(),
                },
            }],
            instructions: vec!["Use HOST_TOOL_MARKER for provider-neutral app control.".into()],
        },
    )])
}

fn codex_toolsets() -> HashMap<String, ProviderToolset> {
    let mut toolsets = provider_toolsets();
    let toolset = toolsets
        .remove(ProviderId::Grok.as_str())
        .expect("mock toolset");
    HashMap::from([(ProviderId::Codex.as_str().to_string(), toolset)])
}

fn codex_denied_toolsets() -> HashMap<String, ProviderToolset> {
    HashMap::from([(
        ProviderId::Codex.as_str().to_string(),
        ProviderToolset {
            browser_access_enabled: false,
            capabilities: Vec::new(),
            native_capabilities: Vec::new(),
            mcp_servers: vec![McpServer {
                name: "node_repl".into(),
                cwd: None,
                transport: McpTransport::Stdio {
                    command: "/codetwo/tool-broker".into(),
                    args: vec!["--empty-mcp".into()],
                    env: Vec::new(),
                },
            }],
            instructions: Vec::new(),
        },
    )])
}

async fn run_turn(
    engine: &Engine,
    events: &mut tokio::sync::mpsc::UnboundedReceiver<Event>,
    session: String,
) -> Vec<String> {
    engine
        .submit(Op::Prompt {
            session,
            doc: vec![DocBlock::Text { text: "go".into() }],
            request_id: Some("provider-tool-turn".into()),
        })
        .await
        .unwrap();

    let mut texts = Vec::new();
    loop {
        let event = tokio::time::timeout(std::time::Duration::from_secs(10), events.recv())
            .await
            .expect("provider event before timeout")
            .expect("provider event stream open");
        match event {
            Event::AgentText { text, .. } => texts.push(text),
            Event::TurnEnded { .. } => return texts,
            Event::Error {
                message,
                terminal: true,
                ..
            } => panic!("unexpected provider error: {message}"),
            _ => {}
        }
    }
}

async fn run_compact_turn(
    engine: &Engine,
    events: &mut tokio::sync::mpsc::UnboundedReceiver<Event>,
    session: String,
) -> Vec<String> {
    engine
        .submit(Op::Prompt {
            session,
            doc: vec![DocBlock::Text {
                text: "/compact".into(),
            }],
            request_id: Some("provider-native-compact".into()),
        })
        .await
        .unwrap();

    let mut texts = Vec::new();
    loop {
        let event = tokio::time::timeout(std::time::Duration::from_secs(10), events.recv())
            .await
            .expect("provider event before timeout")
            .expect("provider event stream open");
        match event {
            Event::AgentText { text, .. } => texts.push(text),
            Event::TurnEnded { .. } => return texts,
            Event::Error {
                message,
                terminal: true,
                ..
            } => panic!("unexpected provider error: {message}"),
            _ => {}
        }
    }
}

#[tokio::test]
async fn projected_tools_reach_session_new_and_the_prompt() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (engine, mut events) = Engine::with_store_memory_and_provider_tools(
        vec![mock_provider()],
        SkillLibrary::default(),
        store,
        None,
        provider_toolsets(),
    );
    engine
        .submit(Op::NewSession {
            provider: ProviderId::Grok,
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("provider-tool-session".into()),
            model: None,
            initial_policy: None,
        })
        .await
        .unwrap();

    let session = loop {
        match events.recv().await.expect("session event") {
            Event::SessionCreated { session, .. } => break session,
            Event::Error { message, .. } => panic!("unexpected session error: {message}"),
            _ => {}
        }
    };
    let texts = run_turn(&engine, &mut events, session.clone()).await;
    assert_eq!(texts, ["mcp=computer-use;instructions=true"]);
    let texts = run_turn(&engine, &mut events, session).await;
    assert_eq!(texts, ["mcp=computer-use;instructions=false"]);
}

#[tokio::test]
async fn advertised_native_compaction_reaches_acp_as_the_exact_raw_command() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (engine, mut events) = Engine::with_store_memory_and_provider_tools(
        vec![mock_native_compact_provider()],
        SkillLibrary::default(),
        store,
        None,
        provider_toolsets(),
    );
    engine
        .submit(Op::NewSession {
            provider: ProviderId::Grok,
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("native-compact-session".into()),
            model: None,
            initial_policy: None,
        })
        .await
        .unwrap();

    let session = loop {
        match events.recv().await.expect("session event") {
            Event::SessionCreated { session, .. } => break session,
            Event::Error { message, .. } => panic!("unexpected session error: {message}"),
            _ => {}
        }
    };
    assert_eq!(
        run_turn(&engine, &mut events, session.clone()).await,
        ["raw_compact=false"]
    );
    assert_eq!(
        run_compact_turn(&engine, &mut events, session).await,
        ["raw_compact=true"]
    );
}

#[tokio::test]
async fn codex_stable_context_uses_developer_config_instead_of_the_user_prompt() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (engine, mut events) = Engine::with_store_memory_and_provider_tools(
        vec![mock_codex_provider()],
        SkillLibrary::default(),
        store,
        None,
        codex_toolsets(),
    );
    engine
        .submit(Op::NewSession {
            provider: ProviderId::Codex,
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("codex-hidden-context-session".into()),
            model: None,
            initial_policy: None,
        })
        .await
        .unwrap();

    let session = loop {
        match events.recv().await.expect("session event") {
            Event::SessionCreated { session, .. } => break session,
            Event::Error { message, .. } => panic!("unexpected session error: {message}"),
            _ => {}
        }
    };
    let expected = ["config_host=true;config_sites=true;prompt_host=false;prompt_sites=false"];
    assert_eq!(
        run_turn(&engine, &mut events, session.clone()).await,
        expected
    );
    assert_eq!(run_turn(&engine, &mut events, session).await, expected);
}

#[tokio::test]
async fn codex_browser_gate_withholds_config_routing_and_native_mcp() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (engine, mut events) = Engine::with_store_memory_and_provider_tools(
        vec![mock_codex_browser_gate_provider()],
        SkillLibrary::default(),
        store,
        None,
        codex_denied_toolsets(),
    );
    engine
        .submit(Op::NewSession {
            provider: ProviderId::Codex,
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("codex-browser-gate-session".into()),
            model: None,
            initial_policy: None,
        })
        .await
        .unwrap();

    let session = loop {
        match events.recv().await.expect("session event") {
            Event::SessionCreated { session, .. } => break session,
            Event::Error { message, .. } => panic!("unexpected session error: {message}"),
            _ => {}
        }
    };
    assert_eq!(
        run_turn(&engine, &mut events, session).await,
        ["browser=true;external=true;node_disabled=true;filter=true;route=false;mcp=node_repl"]
    );
}

#[tokio::test]
async fn revived_codex_session_restores_hidden_static_context() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let mut session = Session::new(
        ProviderId::Codex,
        std::env::temp_dir().to_string_lossy().to_string(),
    );
    session.acp_session_id = Some("codex-old".into());
    store.upsert_session(&session).unwrap();
    let id = session.id.clone();
    let (engine, mut events) = Engine::with_store_memory_and_provider_tools(
        vec![mock_codex_provider()],
        SkillLibrary::default(),
        store,
        None,
        codex_toolsets(),
    );

    assert_eq!(
        run_turn(&engine, &mut events, id).await,
        ["config_host=true;config_sites=true;prompt_host=false;prompt_sites=false"]
    );
}

#[tokio::test]
async fn projected_tools_reach_session_load_and_the_prompt() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let mut session = Session::new(
        ProviderId::Grok,
        std::env::temp_dir().to_string_lossy().to_string(),
    );
    session.acp_session_id = Some("sess-old".into());
    store.upsert_session(&session).unwrap();
    let id = session.id.clone();
    let (engine, mut events) = Engine::with_store_memory_and_provider_tools(
        vec![mock_provider()],
        SkillLibrary::default(),
        store,
        None,
        provider_toolsets(),
    );

    let texts = run_turn(&engine, &mut events, id.clone()).await;
    assert_eq!(texts, ["mcp=computer-use;instructions=true"]);
    let texts = run_turn(&engine, &mut events, id).await;
    assert_eq!(texts, ["mcp=computer-use;instructions=false"]);
}

#[tokio::test]
async fn live_tool_changes_only_affect_sessions_created_after_the_change() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let shared = Arc::new(RwLock::new(provider_toolsets()));
    let (engine, mut events) = Engine::with_store_memory_and_shared_provider_tools(
        vec![mock_provider()],
        SkillLibrary::default(),
        store,
        None,
        shared.clone(),
    );

    engine
        .submit(Op::NewSession {
            provider: ProviderId::Grok,
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("before-tool-change".into()),
            model: None,
            initial_policy: None,
        })
        .await
        .unwrap();
    let before = loop {
        match events.recv().await.expect("session event") {
            Event::SessionCreated { session, .. } => break session,
            Event::Error { message, .. } => panic!("unexpected session error: {message}"),
            _ => {}
        }
    };

    shared.write().unwrap().clear();
    let before_texts = run_turn(&engine, &mut events, before).await;
    assert_eq!(
        before_texts,
        ["mcp=computer-use;instructions=true"],
        "the running session keeps its creation-time tool snapshot"
    );

    engine
        .submit(Op::NewSession {
            provider: ProviderId::Grok,
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("after-tool-change".into()),
            model: None,
            initial_policy: None,
        })
        .await
        .unwrap();
    let after = loop {
        match events.recv().await.expect("session event") {
            Event::SessionCreated { session, .. } => break session,
            Event::Error { message, .. } => panic!("unexpected session error: {message}"),
            _ => {}
        }
    };
    let after_texts = run_turn(&engine, &mut events, after).await;
    assert_eq!(after_texts, ["mcp=;instructions=false"]);
}
