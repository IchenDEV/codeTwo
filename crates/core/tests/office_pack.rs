//! R13 office starter pack conformance: the pack at `packs/office-starter/` must load as a
//! plugin scene source, resolve through pinned and bare references, keep its zh-CN
//! localizations, and wire its pipeline into the builtin develop/test scenes by precedence.

use std::path::PathBuf;

use codetwo_core::scene::{outgoing_edges, SceneLibrary, SceneSource, TransitionTrigger};

fn pack_scenes_dir() -> PathBuf {
    // Integration tests run from the crate root; the pack lives at the repo root.
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/office-starter/scenes")
}

fn load_pack() -> SceneLibrary {
    let dir = pack_scenes_dir();
    assert!(dir.is_dir(), "missing pack dir {dir:?}");
    SceneLibrary::load(None, None, &[("office-starter".to_string(), dir)])
}

#[test]
fn office_pack_loads_three_scenes_and_one_pipeline() {
    let lib = load_pack();
    let plugin_scenes: Vec<_> = lib
        .scenes()
        .iter()
        .filter(|s| matches!(&s.source, SceneSource::Plugin { plugin_id } if plugin_id == "office-starter"))
        .map(|s| s.scene.name.as_str())
        .collect();
    assert_eq!(
        plugin_scenes,
        vec!["design-review", "incident-retro", "release-notes"],
        "three pack scenes, loaded in sorted file order"
    );
    let plugin_pipelines: Vec<_> = lib
        .pipelines()
        .iter()
        .filter(|p| matches!(&p.source, SceneSource::Plugin { plugin_id } if plugin_id == "office-starter"))
        .map(|p| p.pipeline.name.as_str())
        .collect();
    assert_eq!(plugin_pipelines, vec!["office-delivery"]);
}

#[test]
fn office_pack_pinned_references_resolve() {
    let lib = load_pack();
    let retro = lib
        .resolve("office-starter:scene:incident-retro")
        .expect("pinned scene reference must resolve");
    assert_eq!(retro.scene.name, "incident-retro");
    assert_eq!(
        SceneLibrary::reference_for(retro),
        "office-starter:scene:incident-retro"
    );
    let delivery = lib
        .resolve_pipeline("office-starter:pipeline:office-delivery")
        .expect("pinned pipeline reference must resolve");
    assert_eq!(delivery.pipeline.name, "office-delivery");
    assert_eq!(
        SceneLibrary::pipeline_reference_for(delivery),
        "office-starter:pipeline:office-delivery"
    );
}

#[test]
fn office_pack_scenes_carry_zh_cn_localizations() {
    let lib = load_pack();
    for (name, zh_title) in [
        ("incident-retro", "事故复盘"),
        ("release-notes", "发布说明"),
        ("design-review", "技术方案评审"),
    ] {
        let entry = lib
            .resolve(&format!("office-starter:scene:{name}"))
            .unwrap_or_else(|| panic!("scene {name} must resolve"));
        let localization = entry
            .scene
            .localizations
            .get("zh-CN")
            .unwrap_or_else(|| panic!("scene {name} must localize zh-CN"));
        assert_eq!(localization.title.as_deref(), Some(zh_title));
        assert!(localization.description.is_some(), "{name} zh-CN description");
        assert_eq!(entry.scene.localized_title("zh-CN"), zh_title);
    }
    let delivery = lib
        .resolve_pipeline("office-starter:pipeline:office-delivery")
        .unwrap();
    assert_eq!(
        delivery
            .pipeline
            .localizations
            .get("zh-CN")
            .and_then(|l| l.title.as_deref()),
        Some("办公交付")
    );
}

#[test]
fn office_delivery_design_review_stage_flows_into_develop() {
    let lib = load_pack();
    let delivery = lib
        .resolve_pipeline("office-starter:pipeline:office-delivery")
        .unwrap();
    let edges = outgoing_edges(&delivery.pipeline, "design-review");
    assert_eq!(edges.len(), 1);
    assert_eq!(edges[0].to, "develop");
    assert_eq!(edges[0].when, TransitionTrigger::ExitCriteriaMet);

    // The develop stage's bare `develop` reference deliberately crosses packs: with no project,
    // user, or plugin scene of that name, precedence resolves it to the BUILTIN develop scene.
    let develop_stage = delivery
        .pipeline
        .stages
        .iter()
        .find(|stage| stage.id == "develop")
        .expect("develop stage declared");
    let develop = lib
        .resolve(&develop_stage.scene)
        .expect("bare develop reference must resolve");
    assert_eq!(develop.source, SceneSource::Builtin);
    // It carries the review notes produced by the design-review stage.
    assert!(develop_stage
        .carry
        .iter()
        .any(|carry| carry.from == "design-review" && carry.artifact == "review-notes"));
}
