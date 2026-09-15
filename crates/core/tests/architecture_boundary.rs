use std::collections::BTreeSet;

fn dependencies(manifest: &str) -> BTreeSet<String> {
    fn collect(value: &toml::Value, names: &mut BTreeSet<String>) {
        let Some(table) = value.as_table() else {
            return;
        };
        for (name, value) in table {
            if matches!(
                name.as_str(),
                "dependencies" | "dev-dependencies" | "build-dependencies"
            ) {
                if let Some(dependencies) = value.as_table() {
                    names.extend(dependencies.keys().cloned());
                }
            } else {
                collect(value, names);
            }
        }
    }

    let document = manifest
        .parse::<toml::Value>()
        .expect("valid Cargo manifest");
    let mut names = BTreeSet::new();
    collect(&document, &mut names);
    names
}

/// Crates removed by the architecture simplification. Core absorbed the kernel and the plugin
/// composition, so nothing may depend on them again.
const REMOVED_CRATES: [&str; 3] = ["codetwo-kernel", "codetwo-plugins", "codetwo-tui"];

#[test]
fn core_is_the_single_composition_root() {
    let core_dependencies = dependencies(include_str!("../Cargo.toml"));
    for removed in REMOVED_CRATES {
        assert!(
            !core_dependencies.contains(removed),
            "codetwo-core must not depend on the removed {removed}"
        );
    }

    let core_root = include_str!("../src/lib.rs");
    for owned in ["pub mod kernel;", "pub mod plugins;"] {
        assert!(
            core_root.lines().any(|line| line.trim() == owned),
            "codetwo-core must expose the merged runtime as {owned}"
        );
    }
    // These were top-level modules of the removed plugin crate; they must not reappear in core's
    // root, or the pre-merge split has silently come back.
    for moved in ["pub mod app;", "pub mod plugin;", "pub mod plugin_marketplace;"] {
        assert!(
            !core_root.lines().any(|line| line.trim() == moved),
            "{moved} belongs inside core::plugins, not in core's root"
        );
    }
}

#[test]
fn hosts_depend_only_on_core() {
    for (label, manifest) in [
        ("codetwo-server", include_str!("../../server/Cargo.toml")),
        (
            "codetwo-desktop-host",
            include_str!("../../../apps/desktop/src-host/Cargo.toml"),
        ),
        ("codetwo-napi", include_str!("../../napi/Cargo.toml")),
    ] {
        let dependencies = dependencies(manifest);
        assert!(
            dependencies.contains("codetwo-core"),
            "{label} must compose codetwo-core"
        );
        for removed in REMOVED_CRATES {
            assert!(
                !dependencies.contains(removed),
                "{label} must not depend on the removed {removed}"
            );
        }
    }
}
