//! Scenes 2.0 domain-environment definitions.
//!
//! This module is intentionally isolated from [`crate::scene`], the frozen Agent Scenes 1.0
//! runtime. A 2.0 definition describes discovery context only; serde rejects execution posture,
//! artifacts, hooks, completion rules, stages, and pipelines as unknown fields.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

pub const SCENE_V2_SCHEMA_ID: &str = "https://codetwo.app/schemas/scenes/2.0.0/scene.schema.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SceneV2Localization {
    pub title: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SceneV2Author {
    pub name: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum SceneV2Origin {
    Official,
    Personal,
    Project,
    Plugin {
        plugin_id: String,
        publisher: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SceneDefinitionV2 {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub id: String,
    pub version: String,
    pub title: String,
    pub description: String,
    pub domain: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<SceneV2Author>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub localizations: BTreeMap<String, SceneV2Localization>,
    pub provenance: SceneV2Origin,
    pub agent_skill_selectors: Vec<String>,
    pub capability_namespaces: Vec<String>,
    pub extensions: BTreeMap<String, Value>,
}

#[derive(Debug, Error)]
pub enum SceneV2Error {
    #[error("invalid Scenes 2.0 JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid Scenes 2.0 definition: {0}")]
    Validation(String),
}

pub fn parse_scene_v2(json: &str) -> Result<SceneDefinitionV2, SceneV2Error> {
    let scene: SceneDefinitionV2 = serde_json::from_str(json)?;
    validate_scene_v2(&scene)?;
    Ok(scene)
}

pub fn validate_scene_v2(scene: &SceneDefinitionV2) -> Result<(), SceneV2Error> {
    if scene.schema != SCENE_V2_SCHEMA_ID {
        return Err(validation(format!(
            "unsupported $schema `{}`",
            scene.schema
        )));
    }
    validate_identifier("id", &scene.id, true)?;
    validate_identifier("domain", &scene.domain, false)?;
    validate_text("version", &scene.version, 64)?;
    validate_text("title", &scene.title, 80)?;
    if scene.description.chars().count() > 512 {
        return Err(validation("description exceeds 512 characters"));
    }
    validate_unique_identifiers("agent_skill_selectors", &scene.agent_skill_selectors, true)?;
    validate_unique_identifiers("capability_namespaces", &scene.capability_namespaces, true)?;
    for locale in scene.localizations.keys() {
        validate_identifier("localization key", locale, false)?;
    }
    if let SceneV2Origin::Plugin {
        plugin_id,
        publisher,
    } = &scene.provenance
    {
        validate_identifier("plugin_id", plugin_id, true)?;
        validate_text("publisher", publisher, 120)?;
    }
    Ok(())
}

fn validate_unique_identifiers(
    field: &str,
    values: &[String],
    allow_colon: bool,
) -> Result<(), SceneV2Error> {
    let mut seen = BTreeSet::new();
    for value in values {
        validate_identifier(field, value, allow_colon)?;
        if !seen.insert(value) {
            return Err(validation(format!("{field} contains duplicate `{value}`")));
        }
    }
    Ok(())
}

fn validate_text(field: &str, value: &str, max_chars: usize) -> Result<(), SceneV2Error> {
    let chars = value.chars().count();
    if chars == 0 {
        return Err(validation(format!("{field} must not be empty")));
    }
    if chars > max_chars {
        return Err(validation(format!(
            "{field} exceeds {max_chars} characters"
        )));
    }
    Ok(())
}

fn validate_identifier(field: &str, value: &str, allow_colon: bool) -> Result<(), SceneV2Error> {
    if value.is_empty() || value.len() > 128 {
        return Err(validation(format!(
            "{field} must contain between 1 and 128 bytes"
        )));
    }
    let valid = value.bytes().all(|byte| {
        byte.is_ascii_alphanumeric()
            || matches!(byte, b'-' | b'_' | b'.')
            || (allow_colon && byte == b':')
    });
    if !valid {
        return Err(validation(format!(
            "{field} contains unsupported characters"
        )));
    }
    Ok(())
}

fn validation(message: impl Into<String>) -> SceneV2Error {
    SceneV2Error::Validation(message.into())
}
