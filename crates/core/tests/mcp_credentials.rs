use std::path::Path;

use codetwo_core::{
    migrate_json_file, InMemorySecretStore, McpCredentialState, McpSecretBinding, McpServer,
    McpTransport, SecretRef,
};
use serde_json::{json, Value};

const SENTINEL: &str = "sentinel-mcp-secret-9e4b";

fn contains_sentinel(value: &Value) -> bool {
    match value {
        Value::String(value) => value == SENTINEL,
        Value::Array(values) => values.iter().any(contains_sentinel),
        Value::Object(values) => values.values().any(contains_sentinel),
        _ => false,
    }
}

fn assert_no_sentinel_on_disk(root: &Path) {
    for entry in std::fs::read_dir(root).unwrap() {
        let path = entry.unwrap().path();
        if path.is_file() {
            assert!(!String::from_utf8_lossy(&std::fs::read(path).unwrap()).contains(SENTINEL));
        }
    }
}

#[test]
fn legacy_skill_migration_rewrites_plaintext_to_secret_refs() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("mcp.json");
    std::fs::write(
        &path,
        serde_json::to_vec_pretty(&json!({
            "id": "mcp",
            "name": "MCP",
            "payload": {
                "kind": "mcp",
                "server": {
                    "name": "server",
                    "command": "mcp-server",
                    "env": {"TOKEN": SENTINEL}
                }
            }
        }))
        .unwrap(),
    )
    .unwrap();

    let store = InMemorySecretStore::default();
    let migrated = migrate_json_file(&path, &store);
    assert!(migrated.rewritten);
    assert!(migrated.backup_removed);
    assert_eq!(store.len(), 1);

    let rewritten: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert!(!contains_sentinel(&rewritten));
    assert!(rewritten.to_string().contains("secret_ref"));
    assert_no_sentinel_on_disk(dir.path());

    let second = migrate_json_file(&path, &store);
    assert!(second.already_migrated);
    assert_eq!(store.len(), 1, "migration must be idempotent");
}

#[test]
fn ordinary_mcp_serde_rejects_legacy_plaintext_forms() {
    for (label, legacy) in [
        ("map", json!({"command":"mcp", "env":{"TOKEN":SENTINEL}})),
        (
            "value",
            json!({"command":"mcp", "env":[{"name":"TOKEN", "value":SENTINEL}]}),
        ),
        (
            "tuple",
            json!({"command":"mcp", "env":[["TOKEN", SENTINEL]]}),
        ),
    ] {
        assert!(
            serde_json::from_value::<McpTransport>(legacy).is_err(),
            "ordinary serde accepted legacy {label} credentials"
        );
    }
}

#[test]
fn persisted_server_contains_only_opaque_refs() {
    let store = InMemorySecretStore::default();
    let reference = store.put(SENTINEL).unwrap();
    let server = McpServer {
        name: "remote".into(),
        cwd: None,
        credential_state: McpCredentialState::Ready,
        transport: McpTransport::Http {
            url: "https://example.invalid/mcp".into(),
            headers: vec![McpSecretBinding::new("Authorization", reference.clone())],
        },
    };

    let encoded = serde_json::to_value(&server).unwrap();
    assert!(!contains_sentinel(&encoded));
    assert_eq!(encoded["headers"][0]["secret_ref"], reference.as_str());
    assert!(!format!("{store:?}").contains(SENTINEL));
    assert!(!format!("{reference:?}").contains(reference.as_str()));
    assert!(!format!("{reference}").contains(reference.as_str()));
}

#[test]
fn secret_values_never_enter_provider_wire_without_gateway() {
    let store = InMemorySecretStore::default();
    let reference = store.put(SENTINEL).unwrap();
    let server = McpServer {
        name: "remote".into(),
        cwd: None,
        credential_state: McpCredentialState::Ready,
        transport: McpTransport::Http {
            url: "https://example.invalid/mcp".into(),
            headers: vec![McpSecretBinding::new("Authorization", reference)],
        },
    };

    let error = server.to_gateway_acp_json(None).unwrap_err();
    assert!(!error.to_string().contains(SENTINEL));
}

#[test]
fn missing_refs_require_reauthentication() {
    let store = InMemorySecretStore::default();
    let mut server = McpServer {
        name: "local".into(),
        cwd: None,
        credential_state: McpCredentialState::Ready,
        transport: McpTransport::Stdio {
            command: "mcp".into(),
            args: vec![],
            env: vec![McpSecretBinding::new("TOKEN", SecretRef::new())],
            launch_env: vec![],
        },
    };

    assert!(!server.validate_credentials(&store).is_ready());
    assert!(matches!(
        server.credential_state,
        McpCredentialState::ReauthRequired { .. }
    ));
}
