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
            "computer_use_selection": { "claude_code": "cua" },
            "computer_use": [{
                "id": "cua",
                "enabled": false,
                "display_name": "Cua Driver",
                "providers": ["claude_code"],
                "server": { "name": "cua-driver", "command": executable },
            }],
            "browser_use_selection": { "claude_code": "playwright" },
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
