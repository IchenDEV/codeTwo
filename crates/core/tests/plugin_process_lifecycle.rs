//! Real process lifecycle coverage for protocol plugins.

#![cfg(unix)]

use codetwo_core::app::protocol::{ProcessTransport, ProtocolPlugin};
use codetwo_core::plugin::PluginRuntimeCommand;
use codetwo_kernel::{App, Status};
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

const SIGKILL: i32 = 9;

unsafe extern "C" {
    fn kill(pid: i32, signal: i32) -> i32;
}

fn process_exists(pid: i32) -> bool {
    // Signal 0 observes both live and unreaped zombie processes without changing either.
    unsafe { kill(pid, 0) == 0 }
}

fn process_is_running(pid: i32) -> bool {
    let output = std::process::Command::new("ps")
        .args(["-o", "stat=", "-p", &pid.to_string()])
        .output()
        .unwrap();
    let state = String::from_utf8_lossy(&output.stdout);
    let state = state.trim();
    !state.is_empty() && !state.starts_with('Z')
}

struct ProcessCleanup(Vec<i32>);

impl Drop for ProcessCleanup {
    fn drop(&mut self) {
        for pid in &self.0 {
            unsafe {
                kill(*pid, SIGKILL);
            }
        }
    }
}

fn write_protocol_process(root: &Path) -> std::path::PathBuf {
    let script = root.join("protocol-process.sh");
    std::fs::write(
        &script,
        r#"#!/bin/sh
sleep 300 &
worker_pid=$!
printf '%s %s\n' "$$" "$worker_pid" > "$PID_FILE"
IFS= read -r initialize || exit 1
initialize_id=$(printf '%s' "$initialize" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
printf '{"jsonrpc":"2.0","id":%s,"result":{"protocolVersion":"1.0.0","commands":[{"name":"fixture.ping"}]}}\n' "$initialize_id"
while IFS= read -r request; do
  request_id=$(printf '%s' "$request" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
  printf '{"jsonrpc":"2.0","id":%s,"result":null}\n' "$request_id"
done
"#,
    )
    .unwrap();
    script
}

#[tokio::test]
async fn dormant_process_is_started_on_command_and_reaped_on_unload() {
    let root = tempfile::tempdir().unwrap();
    let pid_file = root.path().join("lazy-pids");
    let script = write_protocol_process(root.path());
    let transport = ProcessTransport {
        command: "/bin/sh".into(),
        args: vec![script.to_string_lossy().into_owned()],
        env: vec![("PID_FILE".into(), pid_file.to_string_lossy().into_owned())],
        cwd: Some(root.path().to_path_buf()),
        label: "lazy-lifecycle-fixture".into(),
    };

    let app = App::new();
    let fork = app.ctx().plugin(
        ProtocolPlugin::new("lazy-lifecycle-fixture", Arc::new(transport))
            .with_handshake_timeout(Duration::from_secs(2))
            .with_declared_commands(vec![PluginRuntimeCommand {
                id: "fixture.ping".into(),
                title: "Ping".into(),
                description: String::new(),
                args_schema: None,
            }]),
        Value::Null,
    );
    app.flush().await;
    assert_eq!(fork.status(), Status::Active);
    assert!(
        !pid_file.exists(),
        "loading the adapter must not start the child"
    );

    app.ctx().call("fixture.ping", Value::Null).await.unwrap();
    let pids = std::fs::read_to_string(&pid_file).unwrap();
    let mut pids = pids
        .split_whitespace()
        .map(|pid| pid.parse::<i32>().unwrap());
    let direct_pid = pids.next().unwrap();
    let worker_pid = pids.next().unwrap();
    let _cleanup = ProcessCleanup(vec![direct_pid, worker_pid]);

    fork.dispose();
    app.flush().await;
    assert!(!process_exists(direct_pid));
    assert!(!process_is_running(worker_pid));
}

#[tokio::test]
async fn unload_waits_for_the_direct_process_and_stops_its_process_group() {
    let root = tempfile::tempdir().unwrap();
    let pid_file = root.path().join("pids");
    let script = write_protocol_process(root.path());
    let transport = ProcessTransport {
        command: "/bin/sh".into(),
        args: vec![script.to_string_lossy().into_owned()],
        env: vec![("PID_FILE".into(), pid_file.to_string_lossy().into_owned())],
        cwd: Some(root.path().to_path_buf()),
        label: "lifecycle-fixture".into(),
    };

    let app = App::new();
    let fork = app.ctx().plugin(
        ProtocolPlugin::new("lifecycle-fixture", Arc::new(transport))
            .with_handshake_timeout(Duration::from_secs(2)),
        Value::Null,
    );
    app.flush().await;
    assert_eq!(fork.status(), Status::Active);

    let pids = std::fs::read_to_string(&pid_file).unwrap();
    let mut pids = pids
        .split_whitespace()
        .map(|pid| pid.parse::<i32>().unwrap());
    let direct_pid = pids.next().unwrap();
    let worker_pid = pids.next().unwrap();
    let _cleanup = ProcessCleanup(vec![direct_pid, worker_pid]);
    assert!(process_exists(direct_pid));
    assert!(process_exists(worker_pid));

    fork.dispose();
    app.flush().await;

    assert!(
        !process_exists(direct_pid),
        "flush returned before the direct plugin process exited and was reaped"
    );
    assert!(
        !process_is_running(worker_pid),
        "unloading left a descendant from the plugin process group running"
    );
}
