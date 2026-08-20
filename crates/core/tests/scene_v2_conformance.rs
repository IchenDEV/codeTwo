use codetwo_core::{parse_scene_v2, SceneV2Origin, SCENE_V2_SCHEMA_ID};

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
