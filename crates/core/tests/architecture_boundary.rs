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

#[test]
fn core_does_not_depend_on_plugin_runtime() {
    let core_dependencies = dependencies(include_str!("../Cargo.toml"));

    for forbidden in ["codetwo-kernel", "codetwo-plugins"] {
        assert!(
            !core_dependencies.contains(forbidden),
            "codetwo-core must not depend on {forbidden}"
        );
    }

    let core_root = include_str!("../src/lib.rs");
    for moved_module in [
        "pub mod app;",
        "pub mod plugin;",
        "pub mod plugin_marketplace;",
    ] {
        assert!(
            !core_root.lines().any(|line| line.trim() == moved_module),
            "{moved_module} belongs in codetwo-plugins"
        );
    }
}

#[test]
fn plugins_is_the_composition_root() {
    let plugin_dependencies = dependencies(include_str!("../../plugins/Cargo.toml"));

    for required in ["codetwo-core", "codetwo-kernel"] {
        assert!(
            plugin_dependencies.contains(required),
            "codetwo-plugins must compose {required}"
        );
    }
}
