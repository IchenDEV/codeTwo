//! Independent integration checks for the process extension resource boundaries.
use codetwo_kernel::{async_trait, App, PluginError};
use codetwo_plugins::bundle::PluginRuntimeSpec;
use codetwo_plugins::protocol::{
    Channel, HostHandler, Peer, ProtocolError, ProtocolPlugin, Transport,
};
use serde_json::{json, Value};
use std::future::{pending, poll_fn, Future};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::task::Poll;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, DuplexStream};

#[derive(Default)]
struct Host;

#[async_trait]
impl HostHandler for Host {
    async fn call(&self, _: &str, _: Value) -> Result<Value, String> {
        pending().await
    }
    async fn emit(&self, _: &str, _: Value) {}
    fn log(&self, _: &str, _: &str) {}
}

fn peer_pair() -> (Arc<Peer>, DuplexStream) {
    let (host, child) = tokio::io::duplex(4096);
    let (reader, writer) = tokio::io::split(host);
    (Peer::new(reader, writer, Arc::new(Host)), child)
}

async fn start_pending<F: Future>(future: std::pin::Pin<&mut F>) {
    let mut future = future;
    poll_fn(|cx| {
        assert!(future.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
}

#[tokio::test]
async fn cancelling_one_sent_call_fails_other_calls_and_rejects_retry() {
    let (peer, _child) = peer_pair();
    let mut first = Box::pin(peer.request::<_, Value>("first", Value::Null));
    let mut second = Box::pin(peer.request::<_, Value>("second", Value::Null));
    start_pending(first.as_mut()).await;
    start_pending(second.as_mut()).await;
    drop(first);
    assert!(second.await.unwrap_err().to_string().contains("cancelled"));
    assert!(peer
        .request::<_, Value>("retry", Value::Null)
        .await
        .unwrap_err()
        .to_string()
        .contains("cancelled"));
}

#[tokio::test]
async fn pending_request_limit_rejects_only_the_excess_call() {
    let (peer, _child) = peer_pair();
    let mut calls = Vec::new();
    for _ in 0..64 {
        let mut call = Box::pin(peer.request::<_, Value>("wait", Value::Null));
        start_pending(call.as_mut()).await;
        calls.push(call);
    }
    assert!(matches!(
        peer.request::<_, Value>("excess", Value::Null).await,
        Err(ProtocolError::Overloaded("pending requests"))
    ));
    // Rejection of a request that was never sent must not cancel the admitted calls.
    start_pending(calls[0].as_mut()).await;
}

#[tokio::test]
async fn outbound_notification_flood_closes_the_peer_without_waiting_for_writer() {
    let (peer, _child) = peer_pair();
    // No yield: the blocked writer cannot drain this burst before the configured queue fills.
    for _ in 0..65 {
        peer.notify("event/emit", Value::Null);
    }
    assert!(peer
        .request::<_, Value>("later", Value::Null)
        .await
        .unwrap_err()
        .to_string()
        .contains("outbound queue"));
}

#[tokio::test]
async fn oversized_outbound_request_is_rejected_without_poisoning_the_connection() {
    let (peer, child) = peer_pair();
    assert!(matches!(
        peer.request::<_, Value>("large", "x".repeat(1024 * 1024))
            .await,
        Err(ProtocolError::MessageTooLarge)
    ));
    let child_task = tokio::spawn(async move {
        let (reader, mut writer) = tokio::io::split(child);
        let line = BufReader::new(reader)
            .lines()
            .next_line()
            .await
            .unwrap()
            .unwrap();
        let request: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(request["method"], "healthy");
        writer
            .write_all(
                format!(
                    "{}\n",
                    json!({"jsonrpc":"2.0", "id":request["id"], "result":42})
                )
                .as_bytes(),
            )
            .await
            .unwrap();
    });
    assert_eq!(
        peer.request::<_, Value>("healthy", Value::Null)
            .await
            .unwrap(),
        json!(42)
    );
    child_task.await.unwrap();
}

#[tokio::test]
async fn oversized_unterminated_input_fails_waiters_and_closes_transport() {
    let (peer, mut child) = peer_pair();
    let child_task = tokio::spawn(async move {
        let _ = child.write_all(&vec![b'x'; 1024 * 1024 + 1]).await;
    });
    let error = tokio::time::timeout(
        Duration::from_secs(2),
        peer.request::<_, Value>("wait", Value::Null),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert!(error.to_string().contains("1 MiB"));
    child_task.await.unwrap();
}

#[tokio::test]
async fn host_callback_flood_fails_waiters_instead_of_spawning_unbounded_tasks() {
    let (peer, mut child) = peer_pair();
    let child_task = tokio::spawn(async move {
        for id in 0..17 {
            let request = json!({"jsonrpc":"2.0", "id":id, "method":"command/call", "params":{"name":"blocked", "args":null}});
            child
                .write_all(format!("{request}\n").as_bytes())
                .await
                .unwrap();
        }
        pending::<()>().await;
    });
    let error = tokio::time::timeout(
        Duration::from_secs(2),
        peer.request::<_, Value>("wait", Value::Null),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert!(error.to_string().contains("host callbacks"));
    child_task.abort();
}

struct SilentCommands {
    shutdowns: Arc<AtomicUsize>,
    handshake_delay: Duration,
}

#[async_trait]
impl Transport for SilentCommands {
    async fn start(&self) -> Result<Channel, PluginError> {
        let (host, child) = tokio::io::duplex(4096);
        let (reader, writer) = tokio::io::split(host);
        let delay = self.handshake_delay;
        let task = tokio::spawn(async move {
            let (reader, mut writer) = tokio::io::split(child);
            let mut lines = BufReader::new(reader).lines();
            let request: Value =
                serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
            tokio::time::sleep(delay).await;
            let response = json!({"jsonrpc":"2.0", "id":request["id"], "result":{"protocolVersion":"1.0.0", "commands":[{"name":"silent.wait"}]}});
            if writer
                .write_all(format!("{response}\n").as_bytes())
                .await
                .is_err()
            {
                return;
            }
            while let Ok(Some(_)) = lines.next_line().await {}
        });
        let shutdowns = self.shutdowns.clone();
        Ok(Channel {
            reader: Box::new(reader),
            writer: Box::new(writer),
            shutdown: Box::new(move || {
                shutdowns.fetch_add(1, Ordering::SeqCst);
                task.abort();
            }),
        })
    }
}

#[tokio::test]
async fn command_deadline_stops_transport_and_unload_does_not_shutdown_twice() {
    let shutdowns = Arc::new(AtomicUsize::new(0));
    let app = App::new();
    let fork = app.ctx().plugin(
        ProtocolPlugin::new(
            "silent",
            Arc::new(SilentCommands {
                shutdowns: shutdowns.clone(),
                handshake_delay: Duration::ZERO,
            }),
        )
        .with_command_timeout(Duration::from_millis(50)),
        Value::Null,
    );
    app.flush().await;
    let error = app
        .ctx()
        .call("silent.wait", Value::Null)
        .await
        .unwrap_err();
    assert!(error.to_string().contains("timed out"));
    assert_eq!(shutdowns.load(Ordering::SeqCst), 1);
    assert!(app
        .ctx()
        .call("silent.wait", Value::Null)
        .await
        .unwrap_err()
        .to_string()
        .contains("reload"));
    fork.dispose();
    app.flush().await;
    assert_eq!(shutdowns.load(Ordering::SeqCst), 1);
}

#[test]
fn command_timeout_manifest_is_optional_finite_and_bounded() {
    let legacy: PluginRuntimeSpec = serde_json::from_value(json!({"command":"fixture"})).unwrap();
    assert_eq!(legacy.command_timeout_ms, None);
    for milliseconds in [1, 60_000, 3_600_000] {
        let spec: PluginRuntimeSpec =
            serde_json::from_value(json!({"command":"fixture", "commandTimeoutMs":milliseconds}))
                .unwrap();
        assert_eq!(spec.command_timeout_ms, Some(milliseconds));
    }
    for invalid in [
        json!(0),
        json!(-1),
        json!(3_600_001),
        json!(1.5),
        json!("60"),
        Value::Null,
    ] {
        assert!(serde_json::from_value::<PluginRuntimeSpec>(
            json!({"command":"fixture", "commandTimeoutMs":invalid})
        )
        .is_err());
    }
}

#[tokio::test]
async fn a_short_command_deadline_does_not_shorten_the_handshake_deadline() {
    let shutdowns = Arc::new(AtomicUsize::new(0));
    let app = App::new();
    let fork = app.ctx().plugin(
        ProtocolPlugin::new(
            "slow-start",
            Arc::new(SilentCommands {
                shutdowns: shutdowns.clone(),
                handshake_delay: Duration::from_millis(80),
            }),
        )
        .with_command_timeout(Duration::from_millis(20))
        .with_handshake_timeout(Duration::from_secs(1)),
        Value::Null,
    );
    app.flush().await;
    assert_eq!(fork.status(), codetwo_kernel::Status::Active);
    assert_eq!(shutdowns.load(Ordering::SeqCst), 0);
    assert!(app
        .ctx()
        .call("silent.wait", Value::Null)
        .await
        .unwrap_err()
        .to_string()
        .contains("timed out"));
    assert_eq!(shutdowns.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn cancelling_an_active_command_stops_its_transport_once() {
    let shutdowns = Arc::new(AtomicUsize::new(0));
    let app = App::new();
    let fork = app.ctx().plugin(
        ProtocolPlugin::new(
            "silent",
            Arc::new(SilentCommands {
                shutdowns: shutdowns.clone(),
                handshake_delay: Duration::ZERO,
            }),
        ),
        Value::Null,
    );
    app.flush().await;
    let context = app.ctx();
    let mut call = Box::pin(context.call("silent.wait", Value::Null));
    start_pending(call.as_mut()).await;
    drop(call);
    assert_eq!(shutdowns.load(Ordering::SeqCst), 1);
    fork.dispose();
    app.flush().await;
    assert_eq!(shutdowns.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn unloading_an_active_command_resolves_the_waiter_and_stops_transport_once() {
    let shutdowns = Arc::new(AtomicUsize::new(0));
    let app = App::new();
    let fork = app.ctx().plugin(
        ProtocolPlugin::new(
            "silent",
            Arc::new(SilentCommands {
                shutdowns: shutdowns.clone(),
                handshake_delay: Duration::ZERO,
            }),
        ),
        Value::Null,
    );
    app.flush().await;
    let context = app.ctx();
    let mut call = Box::pin(context.call("silent.wait", Value::Null));
    start_pending(call.as_mut()).await;
    fork.dispose();
    app.flush().await;
    let error = tokio::time::timeout(Duration::from_secs(1), call)
        .await
        .unwrap()
        .unwrap_err();
    assert!(error.to_string().contains("unloaded"));
    assert_eq!(shutdowns.load(Ordering::SeqCst), 1);
}

struct CountingHost(Arc<AtomicUsize>);
struct ActiveCallback(Arc<AtomicUsize>);
impl Drop for ActiveCallback {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

#[async_trait]
impl HostHandler for CountingHost {
    async fn call(&self, _: &str, _: Value) -> Result<Value, String> {
        self.0.fetch_add(1, Ordering::SeqCst);
        let _active = ActiveCallback(self.0.clone());
        pending().await
    }
    async fn emit(&self, _: &str, _: Value) {}
    fn log(&self, _: &str, _: &str) {}
}

#[tokio::test]
async fn closing_the_peer_cancels_every_running_host_callback() {
    let active = Arc::new(AtomicUsize::new(0));
    let (host, mut child) = tokio::io::duplex(4096);
    let (reader, writer) = tokio::io::split(host);
    let peer = Peer::new(reader, writer, Arc::new(CountingHost(active.clone())));
    for id in 1..=16 {
        let request = json!({"jsonrpc":"2.0", "id":id, "method":"command/call", "params":{"name":"blocked", "args":null}});
        child
            .write_all(format!("{request}\n").as_bytes())
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(1), async {
            while active.load(Ordering::SeqCst) < id {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
    }
    let mut call = Box::pin(peer.request::<_, Value>("cancel", Value::Null));
    start_pending(call.as_mut()).await;
    drop(call);
    tokio::time::timeout(Duration::from_secs(1), async {
        while active.load(Ordering::SeqCst) != 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("peer teardown left host work running");
}
