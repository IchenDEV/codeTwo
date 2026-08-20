use codetwo_core::{parse_scene_v2, SceneCatalogV2, SceneV2Origin, SCENE_V2_SCHEMA_ID};

const SOFTWARE_DEVELOPMENT: &str =
    include_str!("../schemas/scenes/2.0.0/examples/software-development.scene.json");

#[test]
fn official_scene_fixture_is_a_minimal_domain_environment() {
    let scene = parse_scene_v2(SOFTWARE_DEVELOPMENT).unwrap();

    assert_eq!(scene.schema, SCENE_V2_SCHEMA_ID);
    assert_eq!(scene.id, "official:software-development");
    assert_eq!(scene.domain, "software-development");
    assert_eq!(scene.provenance, SceneV2Origin::Official);
    assert_eq!(scene.agent_skill_selectors, ["software-development"]);
    assert_eq!(scene.capability_namespaces, ["source-control", "workspace"]);
}

#[test]
fn scene_v2_rejects_legacy_execution_fields() {
    let mut value: serde_json::Value = serde_json::from_str(SOFTWARE_DEVELOPMENT).unwrap();
    value["execution"] = serde_json::json!({ "model": "gpt-5.6-sol" });

    let result = parse_scene_v2(&serde_json::to_string(&value).unwrap());

    assert!(result.is_err());
}

#[test]
fn official_catalog_contains_only_the_eight_domain_environments() {
    let catalog = SceneCatalogV2::builtin();
    let ids: Vec<&str> = catalog
        .scenes()
        .iter()
        .map(|entry| entry.definition.id.as_str())
        .collect();

    assert_eq!(
        ids,
        [
            "official:software-development",
            "official:testing-quality",
            "official:operations-reliability",
            "official:product-research",
            "official:ux-design",
            "official:data-analysis",
            "official:content-growth",
            "official:office-collaboration",
        ]
    );
    assert!(catalog.resolve("software-development").is_none());
    assert!(catalog.resolve("official:software-development").is_some());
}

#[test]
fn catalog_loads_pinned_sources_and_isolates_an_invalid_sibling() {
    let personal = tempfile::tempdir().unwrap();
    let valid = serde_json::json!({
        "$schema": SCENE_V2_SCHEMA_ID,
        "id": "personal:release-engineering",
        "version": "1.0.0",
        "title": "Release Engineering",
        "description": "Personal release domain context.",
        "domain": "release-engineering",
        "provenance": { "kind": "personal" },
        "agent_skill_selectors": [],
        "capability_namespaces": ["source-control"],
        "extensions": {}
    });
    std::fs::write(
        personal.path().join("release-engineering.scene.json"),
        serde_json::to_vec_pretty(&valid).unwrap(),
    )
    .unwrap();
    let mut invalid = valid;
    invalid["id"] = serde_json::json!("personal:invalid-stage");
    invalid["pipeline"] = serde_json::json!("rnd-lifecycle");
    std::fs::write(
        personal.path().join("invalid-stage.scene.json"),
        serde_json::to_vec_pretty(&invalid).unwrap(),
    )
    .unwrap();

    let catalog = SceneCatalogV2::load(Some(personal.path()), None, &[]);

    assert!(catalog
        .resolve("personal:release-engineering")
        .is_some_and(|entry| entry.path.is_some()));
    assert!(catalog.resolve("personal:invalid-stage").is_none());
    assert_eq!(catalog.diagnostics().len(), 1);
}
