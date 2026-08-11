use std::sync::Arc;
use std::time::Duration;

use codetwo_core::{
    InMemorySecretStore, McpCredentialState, McpGatewayBroker, McpSecretBinding, McpServer,
    McpTransport,
};
use codetwo_daemon::{ToolGateway, DEFAULT_LEASE_TTL};
use codetwo_protocol::mcp_gateway::{write_handshake, GatewayHandshake, HANDSHAKE_VERSION};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn echo_server(reference: codetwo_core::SecretRef) -> McpServer {
    McpServer {
        name: "echo".into(),
        cwd: None,
        credential_state: McpCredentialState::Ready,
        transport: McpTransport::Stdio {
            command: "/bin/sh".into(),
            args: vec!["-c".into(), "printf '%s' \"$TOKEN\"; cat".into()],
            env: vec![McpSecretBinding::new("TOKEN", reference)],
            launch_env: vec![],
        },
    }
}

async fn connect(binding: &codetwo_core::McpGatewayBinding, run_id: &str) -> Vec<u8> {
    let mut stream = tokio::net::UnixStream::connect(binding.proxy_socket.as_ref().unwrap())
        .await
        .unwrap();
    write_handshake(
        &mut stream,
        &GatewayHandshake {
            version: HANDSHAKE_VERSION,
            lease_ref: binding.lease_ref.as_str().into(),
            run_id: run_id.into(),
            server_id: binding.server_id.clone(),
        },
    )
    .await
    .unwrap();
    stream.shutdown().await.unwrap();
    let mut output = Vec::new();
    stream.read_to_end(&mut output).await.unwrap();
    output
}

#[tokio::test]
async fn stdio_gateway_injects_secret_but_redacts_echoed_values() {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(InMemorySecretStore::default());
    let reference = store.put("gateway-sentinel-secret").unwrap();
    let gateway = Arc::new(ToolGateway::new(dir.path(), store, DEFAULT_LEASE_TTL));
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    let server_task = tokio::spawn(Arc::clone(&gateway).serve(shutdown_rx));
    gateway.wait_until_ready().await.unwrap();

    let bindings = gateway
        .issue_bindings("run-1", &[echo_server(reference)], Default::default())
        .await
        .unwrap();
    let output = connect(&bindings[0], "run-1").await;
    assert_eq!(output, b"[REDACTED]");
    assert!(!String::from_utf8_lossy(&output).contains("gateway-sentinel-secret"));

    shutdown_tx.send(true).unwrap();
    server_task.await.unwrap().unwrap();
}

#[tokio::test]
async fn lease_is_single_use_and_exact_run_scoped() {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(InMemorySecretStore::default());
    let reference = store.put("scope-secret").unwrap();
    let gateway = Arc::new(ToolGateway::new(dir.path(), store, Duration::from_secs(60)));
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    let server_task = tokio::spawn(Arc::clone(&gateway).serve(shutdown_rx));
    gateway.wait_until_ready().await.unwrap();

    let bindings = gateway
        .issue_bindings("run-1", &[echo_server(reference)], Default::default())
        .await
        .unwrap();
    assert!(connect(&bindings[0], "wrong-run").await.is_empty());
    assert_eq!(connect(&bindings[0], "run-1").await, b"[REDACTED]");
    assert!(connect(&bindings[0], "run-1").await.is_empty());

    shutdown_tx.send(true).unwrap();
    server_task.await.unwrap().unwrap();
}
