//! Cross-host conformance: the Rust core must consume the Bun broker's ToolPlan, not calculate one.

use codetwo_core::{HostToolDiscovery, ProviderCapabilityId, ProviderId};

#[test]
fn rust_adapter_consumes_the_bun_broker_plan() {
    let directory = tempfile::tempdir().unwrap();
    let executable = std::env::current_exe().unwrap();
    std::fs::write(
        directory.path().join("host-tools.json"),
        serde_json::to_vec(&serde_json::json!({
            "schema_version": 1,
            "computer_use_selection": { "*": "cua" },
            "computer_use": [{
                "id": "cua",
                "enabled": false,
                "display_name": "Cua Driver",
                "providers": ["claude_code"],
                "server": { "name": "cua-driver", "command": executable },
            }],
            "browser_use_selection": { "*": "playwright" },
            "browser_use": [{
                "id": "playwright",
                "enabled": false,
                "display_name": "Playwright MCP",
                "providers": ["claude_code"],
                "server": { "name": "playwright", "command": executable },
            }],
        }))
        .unwrap(),
    )
    .unwrap();

    let discovery = HostToolDiscovery::detect(directory.path());
    let plan = discovery.toolset(&ProviderId::ClaudeCode);
    let names = plan
        .mcp_servers
        .iter()
        .map(|server| server.name.as_str())
        .collect::<Vec<_>>();

    assert_eq!(names, vec!["cua-driver", "playwright"]);
    assert!(plan.browser_access_enabled);
    assert!(plan.native_capabilities.is_empty());
    assert!(!names.contains(&"node_repl"));
    assert_eq!(
        plan.capabilities
            .iter()
            .find(|capability| capability.id == ProviderCapabilityId::ChromeBrowser)
            .and_then(|capability| capability.reason.as_deref()),
        Some("Configured browser-use MCP backend(s) attached: Playwright MCP. Connectivity is verified on the first real call.")
    );
}

#[tokio::test]
async fn core_app_accepts_the_desktop_global_computer_use_selection() {
    let directory = tempfile::tempdir().unwrap();
    let app = codetwo_core::app::CoreApp::boot(codetwo_core::app::AppConfig::new(directory.path()))
        .await
        .unwrap();

    let settings = app
        .call(
            "computer_use.select",
            serde_json::json!({ "backend": "automatic" }),
        )
        .await
        .unwrap();

    assert_eq!(settings["selections"]["*"], "automatic");
}

#[tokio::test]
async fn core_app_persists_fail_closed_agent_browser_access() {
    let directory = tempfile::tempdir().unwrap();
    let app = codetwo_core::app::CoreApp::boot(codetwo_core::app::AppConfig::new(directory.path()))
        .await
        .unwrap();

    let settings = app
        .call(
            "browser_use.set_access",
            serde_json::json!({ "enabled": false }),
        )
        .await
        .unwrap();
    assert_eq!(settings["access_enabled"], false);

    let document: serde_json::Value =
        serde_json::from_slice(&std::fs::read(directory.path().join("host-tools.json")).unwrap())
            .unwrap();
    assert_eq!(document["agent_browser_access"], false);

    let plan = HostToolDiscovery::detect(directory.path()).toolset(&ProviderId::Codex);
    assert!(!plan.browser_access_enabled);
    assert_eq!(
        plan.mcp_servers
            .iter()
            .map(|server| server.name.as_str())
            .collect::<Vec<_>>(),
        vec!["node_repl"]
    );
}
