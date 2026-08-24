use std::collections::BTreeSet;

use codetwo_core::app::plugins::{builtin_registry, BUILTIN};
use codetwo_kernel::{PluginCategory, PluginOrigin, PluginScopeSupport};

#[test]
fn builtins_have_complete_catalog_metadata() {
    let registry = builtin_registry();
    let expected_categories = [
        (
            PluginCategory::Foundation,
            [
                "bus",
                "engine",
                "kernel",
                "memory",
                "paths",
                "providers",
                "store",
            ]
            .as_slice(),
        ),
        (
            PluginCategory::Workspace,
            [
                "artifacts",
                "issues",
                "projects",
                "workspace",
                "workspace-search",
            ]
            .as_slice(),
        ),
        (
            PluginCategory::Automation,
            ["scene-commands", "scene-runtime", "scenes"].as_slice(),
        ),
        (
            PluginCategory::DeveloperTools,
            ["cost", "git", "terminal"].as_slice(),
        ),
        (
            PluginCategory::Interface,
            [
                "canvas",
                "document",
                "keymap",
                "plugin-hub",
                "usage",
                "voice",
            ]
            .as_slice(),
        ),
        (
            PluginCategory::Integration,
            ["extensions", "handoff", "market", "skills"].as_slice(),
        ),
    ];
    let project_scoped = BTreeSet::from([
        "artifacts",
        "git",
        "issues",
        "terminal",
        "workspace",
        "workspace-search",
    ]);

    assert_eq!(registry.names().len(), BUILTIN.len());
    for name in BUILTIN {
        let metadata = &registry.get(name).expect("built-in factory").metadata;
        assert_eq!(metadata.origin, PluginOrigin::BuiltIn, "{name}");
        assert!(metadata.default_enabled, "{name}");
        assert_eq!(metadata.essential, *name == "kernel", "{name}");
        assert_ne!(metadata.category, PluginCategory::Other, "{name}");

        let expected_scopes = if project_scoped.contains(name) {
            vec![PluginScopeSupport::User, PluginScopeSupport::Project]
        } else {
            vec![PluginScopeSupport::User]
        };
        assert_eq!(metadata.scope_support, expected_scopes, "{name}");
    }

    for (category, names) in expected_categories {
        let actual: Vec<&str> = registry
            .factories()
            .filter(|factory| factory.metadata.category == category)
            .map(|factory| factory.name.as_str())
            .collect();
        assert_eq!(actual, names, "{category:?}");
    }
}
