//! Verifies the ACP client forwards `mcpServers` to the agent at `session/new`. The mock replies
//! with a session id that encodes whether it received any servers, so the client-visible result
//! proves the passthrough.

use std::sync::Arc;

use codetwo_core::acp::{AcpClient, Connection, RecordingHandler};
use codetwo_core::skill::{McpServer, McpTransport};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader};

async fn write_line<W: AsyncWrite + Unpin>(w: &mut W, v: Value) {
    let mut s = v.to_string();
    s.push('\n');
    w.write_all(s.as_bytes()).await.unwrap();
    w.flush().await.unwrap();
}

async fn mock_agent<R, W>(reader: R, mut writer: W)
where
    R: tokio::io::AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        let v: Value = serde_json::from_str(&line).unwrap();
        match v.get("method").and_then(|m| m.as_str()) {
            Some("initialize") => {
                write_line(&mut writer, json!({"jsonrpc":"2.0","id":v["id"],"result":{"protocolVersion":1}})).await;
            }
            Some("session/new") => {
                let count = v["params"]["mcpServers"].as_array().map(|a| a.len()).unwrap_or(0);
                let id = if count > 0 { "with-mcp" } else { "no-mcp" };
                write_line(&mut writer, json!({"jsonrpc":"2.0","id":v["id"],"result":{"sessionId":id}})).await;
            }
            _ => {}
        }
    }
}

#[tokio::test]
async fn new_session_forwards_mcp_servers() {
    let (client_end, agent_end) = tokio::io::duplex(64 * 1024);
    let (cr, cw) = tokio::io::split(client_end);
    let (ar, aw) = tokio::io::split(agent_end);
    tokio::spawn(mock_agent(ar, aw));

    let conn = Connection::new(cr, cw, Arc::new(RecordingHandler::default()));
    let client = AcpClient::new(conn, None);
    client.initialize(json!({})).await.unwrap();

    let server = McpServer {
        name: "fs".into(),
        cwd: None,
        transport: McpTransport::Stdio {
            command: "mcp-fs".into(),
            args: vec![],
            env: vec![],
        },
    };
    let sid = client.new_session("/tmp", vec![server.to_acp_json()]).await.unwrap();
    assert_eq!(sid, "with-mcp");
}
