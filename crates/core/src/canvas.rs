//! Core-owned Canvas Input V1 model, validation, immutable snapshots, and media normalization.
//!
//! Canvas deliberately lives below the UI.  A [`CanvasRef`](CanvasRef) is the only shape that is
//! allowed in a document block: scene JSON and pixels stay in the app-private store and are
//! resolved only at send time.  The module is intentionally conservative.  Unknown scene fields
//! are retained in the exact engine envelope for round-tripping, but the normalized manifest and
//! provider payload are built from a closed allow-list.

use std::collections::BTreeSet;
use std::fmt::Write as _;

use image::{DynamicImage, ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

pub const CANVAS_FEATURE_GATE: &str = "CODETWO_CANVAS_INPUT_V1";
pub const EXCALIDRAW_ENGINE: &str = "@excalidraw/excalidraw";
pub const EXCALIDRAW_ENGINE_VERSION: &str = "0.18.1";
pub const CANVAS_SCHEMA_VERSION: u32 = 1;
pub const MAX_CANVAS_DIMENSION: u32 = 8_192;
pub const MAX_CANVAS_DECODED_PIXELS: u64 = 16_777_216;
pub const MAX_CANVAS_INPUT_BYTES: usize = 16 * 1_000_000;
pub const MAX_CANVAS_OUTPUT_BYTES: usize = 16 * 1_000_000;
pub const MAX_CANVAS_EXPORTS: usize = 16;
pub const MAX_CANVAS_EXPORT_BYTES: usize = 8 * 1_000_000;
pub const MAX_CANVAS_EXPORT_PIXELS: u64 = 8_000_000;
pub const MAX_CANVAS_TOTAL_BYTES: usize = 32 * 1_000_000;
pub const MAX_CANVAS_TOTAL_PIXELS: u64 = 32_000_000;
pub const MAX_CANVAS_TOMBSTONE_AGE_MS: i64 = 24 * 60 * 60 * 1_000;
/// Bounds applied before a scene can become a persisted normalized manifest.  These are kept
/// deliberately separate from export/media budgets so a caller can split a very large board
/// instead of relying on a renderer to silently discard content.
pub const MAX_CANVAS_VISIBLE_OBJECTS: usize = 4_096;
pub const MAX_CANVAS_SCENE_ELEMENTS: usize = 16_384;
pub const MAX_CANVAS_SCENE_BYTES: usize = 8 * 1_000_000;
pub const MAX_CANVAS_POINT_SAMPLES: usize = 100_000;
pub const MAX_CANVAS_TEXT_BYTES: usize = 100_000;
pub const MAX_CANVAS_TOTAL_TEXT_BYTES: usize = 1_000_000;
pub const MAX_CANVAS_ASSETS: usize = 256;
pub const MAX_CANVAS_TOTAL_ASSET_BYTES: usize = 32 * 1_000_000;
pub const MAX_CANVAS_TOTAL_ASSET_PIXELS: u64 = 32_000_000;
pub const MAX_CANVAS_HISTORY_TITLE_CHARS: usize = 200;
pub const MAX_CANVAS_HISTORY_TEXT_CHARS: usize = 2_000;
pub const MAX_CANVAS_HISTORY_TEXTS: usize = 64;

/// The feature gate is closed by default.  The test constructor is deliberately named so that a
/// production caller cannot accidentally present it as a user-facing setting before physical QA.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CanvasFeatureGate {
    enabled: bool,
}

impl Default for CanvasFeatureGate {
    fn default() -> Self {
        Self { enabled: false }
    }
}

impl CanvasFeatureGate {
    pub const fn disabled() -> Self {
        Self { enabled: false }
    }

    /// Construct an enabled gate for deterministic integration tests and trusted physical-QA
    /// harnesses.  There is no environment-variable or persisted user setting that enables it.
    #[doc(hidden)]
    pub const fn enabled_for_tests() -> Self {
        Self { enabled: true }
    }

    pub const fn is_enabled(self) -> bool {
        self.enabled
    }

    pub fn require(self) -> Result<(), CanvasError> {
        self.enabled
            .then_some(())
            .ok_or(CanvasError::GateDisabled)
    }
}

pub type CanvasId = String;
pub type CanvasRevision = u64;

/// A document-level reference.  No scene, manifest, image bytes, data URLs, or workspace paths
/// are embedded here.  A reference is valid only after its immutable revision has been frozen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanvasRef {
    pub id: CanvasId,
    pub frozen_revision: CanvasRevision,
    #[serde(default)]
    pub pixel_policy: CanvasPixelPolicy,
}

impl CanvasRef {
    pub fn new(id: impl Into<String>, frozen_revision: CanvasRevision) -> Self {
        Self {
            id: id.into(),
            frozen_revision,
            pixel_policy: CanvasPixelPolicy::Required,
        }
    }

    pub fn structure_only(mut self) -> Self {
        self.pixel_policy = CanvasPixelPolicy::StructureOnly;
        self
    }
}

/// Pixels are an explicit policy, never an implicit provider fallback.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CanvasPixelPolicy {
    #[default]
    Required,
    StructureOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CanvasProviderImageCapability {
    Supported,
    Unsupported,
    Unknown,
}

impl CanvasProviderImageCapability {
    pub const fn permits_pixels(self, policy: CanvasPixelPolicy) -> bool {
        matches!(policy, CanvasPixelPolicy::StructureOnly)
            || matches!(self, Self::Supported | Self::Unknown)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CanvasTheme {
    Light,
    Dark,
}

impl Default for CanvasTheme {
    fn default() -> Self {
        Self::Light
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CanvasTool {
    Select,
    Hand,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CanvasObjectKind {
    Pen,
    Text,
    Rectangle,
    Ellipse,
    Line,
    Arrow,
    Image,
}

impl CanvasObjectKind {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "freedraw" => Some(Self::Pen),
            "text" => Some(Self::Text),
            "rectangle" => Some(Self::Rectangle),
            "ellipse" => Some(Self::Ellipse),
            "line" => Some(Self::Line),
            "arrow" => Some(Self::Arrow),
            "image" => Some(Self::Image),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Pen => "pen",
            Self::Text => "text",
            Self::Rectangle => "rectangle",
            Self::Ellipse => "ellipse",
            Self::Line => "line",
            Self::Arrow => "arrow",
            Self::Image => "image",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CanvasPoint {
    pub x: f64,
    pub y: f64,
}

impl CanvasPoint {
    fn validate(self) -> Result<(), CanvasError> {
        if self.x.is_finite() && self.y.is_finite() {
            Ok(())
        } else {
            Err(CanvasError::InvalidGeometry("non-finite point".into()))
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CanvasRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl CanvasRect {
    fn validate(self) -> Result<(), CanvasError> {
        if !self.x.is_finite()
            || !self.y.is_finite()
            || !self.width.is_finite()
            || !self.height.is_finite()
            || self.width < 0.0
            || self.height < 0.0
        {
            return Err(CanvasError::InvalidGeometry(
                "rectangle has non-finite or negative dimensions".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanvasObject {
    pub id: String,
    pub kind: CanvasObjectKind,
    #[serde(default)]
    pub original_text: String,
    pub bounds: CanvasRect,
    pub layer: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arrow_start: Option<CanvasPoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arrow_end: Option<CanvasPoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
}

impl CanvasObject {
    pub fn new(
        id: impl Into<String>,
        kind: CanvasObjectKind,
        bounds: CanvasRect,
        layer: i64,
    ) -> Self {
        Self {
            id: id.into(),
            kind,
            original_text: String::new(),
            bounds,
            layer,
            arrow_start: None,
            arrow_end: None,
            asset_id: None,
        }
    }

    fn validate(&self, assets: &BTreeSet<String>) -> Result<(), CanvasError> {
        if self.id.trim().is_empty() {
            return Err(CanvasError::InvalidManifest("empty object id".into()));
        }
        self.bounds.validate()?;
        if let Some(point) = self.arrow_start {
            point.validate()?;
        }
        if let Some(point) = self.arrow_end {
            point.validate()?;
        }
        if self.kind == CanvasObjectKind::Arrow
            && (self.arrow_start.is_none() || self.arrow_end.is_none())
        {
            return Err(CanvasError::InvalidManifest(format!(
                "arrow '{}' is missing endpoints",
                self.id
            )));
        }
        if self.kind == CanvasObjectKind::Image {
            let asset = self.asset_id.as_deref().ok_or_else(|| {
                CanvasError::InvalidManifest(format!("image '{}' is missing asset", self.id))
            })?;
            if !assets.contains(asset) {
                return Err(CanvasError::InvalidManifest(format!(
                    "image '{}' references unknown asset '{}',",
                    self.id, asset
                )));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanvasAssetRef {
    pub id: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
}

impl CanvasAssetRef {
    fn validate(&self) -> Result<(), CanvasError> {
        if self.id.trim().is_empty() {
            return Err(CanvasError::InvalidAssets("empty asset id".into()));
        }
        let lower_id = self.id.to_ascii_lowercase();
        if self.id.len() > 160
            || self.id.contains('/')
            || self.id.contains('\\')
            || lower_id.contains("data:")
            || lower_id.contains("http:")
            || lower_id.contains("https:")
            || lower_id.contains("javascript:")
        {
            return Err(CanvasError::InvalidAssets(format!(
                "asset '{}' is not an opaque id",
                self.id
            )));
        }
        if !matches!(self.mime_type.as_str(), "image/png" | "image/webp") {
            return Err(CanvasError::InvalidAssets(format!(
                "asset '{}' has non-static MIME {}",
                self.id, self.mime_type
            )));
        }
        if let Some(source_name) = &self.source_name {
            let lower = source_name.to_ascii_lowercase();
            if ["data:", "http:", "https:", "file:", "/", "\\"]
                .iter()
                .any(|needle| lower.contains(needle))
            {
                return Err(CanvasError::InvalidAssets(format!(
                    "asset '{}' has an external source reference",
                    self.id
                )));
            }
        }
        validate_dimensions(self.width, self.height)
    }
}

/// Exact engine envelope.  `scene` is retained only in app-private storage and never copied into
/// a [`CanvasRef`] or transcript.  Validation rejects active/external asset references recursively.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanvasSceneEnvelope {
    pub engine: String,
    pub engine_version: String,
    pub schema_version: u32,
    pub revision: CanvasRevision,
    pub theme: CanvasTheme,
    #[serde(default)]
    pub assets: Vec<CanvasAssetRef>,
    pub scene: Value,
}

impl CanvasSceneEnvelope {
    pub fn new(revision: CanvasRevision, theme: CanvasTheme, scene: Value) -> Self {
        Self {
            engine: EXCALIDRAW_ENGINE.into(),
            engine_version: EXCALIDRAW_ENGINE_VERSION.into(),
            schema_version: CANVAS_SCHEMA_VERSION,
            revision,
            theme,
            assets: Vec::new(),
            scene,
        }
    }

    pub fn validate(&self) -> Result<(), CanvasError> {
        if self.engine != EXCALIDRAW_ENGINE {
            return Err(CanvasError::InvalidEnvelope(format!(
                "unsupported canvas engine '{}'",
                self.engine
            )));
        }
        if self.engine_version != EXCALIDRAW_ENGINE_VERSION {
            return Err(CanvasError::InvalidEnvelope(format!(
                "unsupported Excalidraw version '{}'",
                self.engine_version
            )));
        }
        if self.schema_version != CANVAS_SCHEMA_VERSION {
            return Err(CanvasError::InvalidEnvelope(format!(
                "unsupported canvas schema {}",
                self.schema_version
            )));
        }
        if self.revision == 0 {
            return Err(CanvasError::InvalidEnvelope(
                "canvas revision must be positive".into(),
            ));
        }
        let scene_bytes = serde_json::to_vec(&self.scene)
            .map_err(|error| CanvasError::InvalidEnvelope(format!("scene JSON: {error}")))?;
        if scene_bytes.len() > MAX_CANVAS_SCENE_BYTES {
            return Err(CanvasError::InvalidEnvelope(format!(
                "scene JSON is {} bytes; reduce or split the canvas",
                scene_bytes.len()
            )));
        }
        if self.assets.len() > MAX_CANVAS_ASSETS {
            return Err(CanvasError::InvalidAssets(format!(
                "{} assets exceeds {}; reduce or split the canvas",
                self.assets.len(),
                MAX_CANVAS_ASSETS
            )));
        }
        let mut ids = BTreeSet::new();
        for asset in &self.assets {
            asset.validate()?;
            if !ids.insert(asset.id.clone()) {
                return Err(CanvasError::InvalidAssets(format!(
                    "duplicate asset id '{}'",
                    asset.id
                )));
            }
        }
        reject_active_or_external(&self.scene, "scene")?;
        derive_manifest_from_scene(&self.scene, &ids)?;
        Ok(())
    }

    /// Derive the only normalized manifest accepted for this exact engine scene.
    pub fn derive_manifest(&self) -> Result<CanvasManifest, CanvasError> {
        let asset_ids = self
            .assets
            .iter()
            .map(|asset| asset.id.clone())
            .collect::<BTreeSet<_>>();
        derive_manifest_from_scene(&self.scene, &asset_ids)
    }
}

#[derive(Debug)]
struct RawCanvasObject {
    object: CanvasObject,
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
    arrow_start: Option<CanvasPoint>,
    arrow_end: Option<CanvasPoint>,
}

fn scene_object<'a>(
    element: &'a Value,
    index: usize,
) -> Result<&'a serde_json::Map<String, Value>, CanvasError> {
    element.as_object().ok_or_else(|| {
        CanvasError::InvalidManifest(format!(
            "scene element {index} is not an object; reduce or split malformed input"
        ))
    })
}

fn required_scene_string(
    object: &serde_json::Map<String, Value>,
    key: &str,
    index: usize,
) -> Result<String, CanvasError> {
    let value = object.get(key).ok_or_else(|| {
        CanvasError::InvalidManifest(format!(
            "scene element {index} is missing string field '{key}'"
        ))
    })?;
    let value = value.as_str().ok_or_else(|| {
        CanvasError::InvalidManifest(format!(
            "scene element {index} field '{key}' must be a string"
        ))
    })?;
    if value.trim().is_empty() {
        return Err(CanvasError::InvalidManifest(format!(
            "scene element {index} field '{key}' is empty"
        )));
    }
    Ok(value.to_string())
}

fn optional_scene_bool(
    object: &serde_json::Map<String, Value>,
    key: &str,
    default: bool,
    index: usize,
) -> Result<bool, CanvasError> {
    let Some(value) = object.get(key) else { return Ok(default) };
    value.as_bool().ok_or_else(|| {
        CanvasError::InvalidManifest(format!(
            "scene element {index} field '{key}' must be a boolean"
        ))
    })
}

fn optional_scene_number(
    object: &serde_json::Map<String, Value>,
    key: &str,
    default: f64,
    index: usize,
) -> Result<f64, CanvasError> {
    let Some(value) = object.get(key) else { return Ok(default) };
    let number = value.as_f64().ok_or_else(|| {
        CanvasError::InvalidManifest(format!(
            "scene element {index} field '{key}' must be a finite number"
        ))
    })?;
    if !number.is_finite() {
        return Err(CanvasError::InvalidGeometry(format!(
            "scene element {index} field '{key}' is non-finite"
        )));
    }
    Ok(number)
}

fn required_scene_number(
    object: &serde_json::Map<String, Value>,
    key: &str,
    index: usize,
) -> Result<f64, CanvasError> {
    let Some(value) = object.get(key) else {
        return Err(CanvasError::InvalidManifest(format!(
            "scene element {index} is missing numeric field '{key}'"
        )));
    };
    let number = value.as_f64().ok_or_else(|| {
        CanvasError::InvalidManifest(format!(
            "scene element {index} field '{key}' must be a finite number"
        ))
    })?;
    if !number.is_finite() {
        return Err(CanvasError::InvalidGeometry(format!(
            "scene element {index} field '{key}' is non-finite"
        )));
    }
    Ok(number)
}

fn rounded3(value: f64) -> Result<f64, CanvasError> {
    if !value.is_finite() || value.abs() > f64::MAX / 1_000.0 {
        return Err(CanvasError::InvalidGeometry(
            "canvas coordinate cannot be represented safely".into(),
        ));
    }
    let rounded = (value * 1_000.0).round() / 1_000.0;
    Ok(if rounded == 0.0 { 0.0 } else { rounded })
}

fn opaque_scene_id(value: String, field: &str, index: usize) -> Result<String, CanvasError> {
    if value.len() > 160
        || value.contains('/')
        || value.contains('\\')
        || value.to_ascii_lowercase().contains("data:")
        || value.to_ascii_lowercase().contains("http:")
        || value.to_ascii_lowercase().contains("https:")
        || value.to_ascii_lowercase().contains("javascript:")
    {
        return Err(CanvasError::InvalidManifest(format!(
            "scene element {index} field '{field}' is not an opaque id"
        )));
    }
    Ok(value)
}

fn scene_points(
    object: &serde_json::Map<String, Value>,
    index: usize,
    kind: CanvasObjectKind,
    point_samples: &mut usize,
) -> Result<Vec<CanvasPoint>, CanvasError> {
    let points = object.get("points").ok_or_else(|| {
        CanvasError::InvalidManifest(format!(
            "scene element {index} type {} is missing points",
            kind.as_str()
        ))
    })?;
    let values = points.as_array().ok_or_else(|| {
        CanvasError::InvalidManifest(format!(
            "scene element {index} field 'points' must be an array"
        ))
    })?;
    let min_points = if matches!(kind, CanvasObjectKind::Line | CanvasObjectKind::Arrow) {
        2
    } else {
        1
    };
    if values.len() < min_points {
        return Err(CanvasError::InvalidManifest(format!(
            "scene element {index} type {} needs at least {min_points} points",
            kind.as_str()
        )));
    }
    *point_samples = point_samples.saturating_add(values.len());
    if *point_samples > MAX_CANVAS_POINT_SAMPLES {
        return Err(CanvasError::InvalidManifest(format!(
            "scene point samples exceed {}; reduce or split the canvas",
            MAX_CANVAS_POINT_SAMPLES
        )));
    }
    values
        .iter()
        .enumerate()
        .map(|point| {
            let value = point.1.as_array().ok_or_else(|| {
                CanvasError::InvalidManifest(format!(
                    "scene element {index} point {} must be a two-number array",
                    point.0
                ))
            })?;
            if value.len() < 2 {
                return Err(CanvasError::InvalidManifest(format!(
                    "scene element {index} point {} is missing coordinates",
                    point.0
                )));
            }
            let x = value[0].as_f64().ok_or_else(|| {
                CanvasError::InvalidManifest(format!(
                    "scene element {index} point {} x must be a finite number",
                    point.0
                ))
            })?;
            let y = value[1].as_f64().ok_or_else(|| {
                CanvasError::InvalidManifest(format!(
                    "scene element {index} point {} y must be a finite number",
                    point.0
                ))
            })?;
            if !x.is_finite() || !y.is_finite() {
                return Err(CanvasError::InvalidGeometry(format!(
                    "scene element {index} point {} is non-finite",
                    point.0
                )));
            }
            Ok(CanvasPoint { x, y })
        })
        .collect()
}

/// Derive a bounded, deterministic manifest from the exact sanitized Excalidraw scene subset.
/// Geometry is normalized to the minimum visible scene bounds and rounded to three decimals;
/// point samples remain only in the envelope and never cross into the manifest or summary.
pub fn derive_manifest_from_scene(
    scene: &Value,
    asset_ids: &BTreeSet<String>,
) -> Result<CanvasManifest, CanvasError> {
    let map = scene.as_object().ok_or_else(|| {
        CanvasError::InvalidEnvelope("scene must be an object with an elements array".into())
    })?;
    if let Some(app_state) = map.get("appState") {
        let app_state = app_state.as_object().ok_or_else(|| {
            CanvasError::InvalidEnvelope("scene appState must be an object".into())
        })?;
        if let Some(active_tool) = app_state.get("activeTool") {
            let active_tool = active_tool.as_str().ok_or_else(|| {
                CanvasError::InvalidEnvelope("scene activeTool must be a string".into())
            })?;
            if !matches!(active_tool, "selection" | "select" | "hand") {
                return Err(CanvasError::InvalidEnvelope(format!(
                    "scene tool '{active_tool}' is not allowlisted"
                )));
            }
        }
    }
    let elements = map.get("elements").ok_or_else(|| {
        CanvasError::InvalidEnvelope("scene is missing an elements array".into())
    })?;
    let elements = elements.as_array().ok_or_else(|| {
        CanvasError::InvalidEnvelope("scene elements must be an array".into())
    })?;
    if elements.len() > MAX_CANVAS_SCENE_ELEMENTS {
        return Err(CanvasError::InvalidManifest(
            "scene element count exceeds 16384; reduce or split the canvas".into(),
        ));
    }

    let mut ids = BTreeSet::new();
    let mut point_samples = 0usize;
    let mut total_text_bytes = 0usize;
    let mut raw_objects = Vec::new();
    let mut visible_count = 0usize;

    for (index, element) in elements.iter().enumerate() {
        let object = scene_object(element, index)?;
        let id = opaque_scene_id(required_scene_string(object, "id", index)?, "id", index)?;
        if !ids.insert(id.clone()) {
            return Err(CanvasError::InvalidManifest(format!(
                "duplicate scene element id '{id}'"
            )));
        }
        let type_name = required_scene_string(object, "type", index)?;
        let kind = CanvasObjectKind::parse(&type_name).ok_or_else(|| {
            CanvasError::InvalidManifest(format!(
                "scene object type '{type_name}' is not allowlisted"
            ))
        })?;
        let deleted = optional_scene_bool(object, "isDeleted", false, index)?;
        let opacity = optional_scene_number(object, "opacity", 100.0, index)?;
        if !(0.0..=100.0).contains(&opacity) {
            return Err(CanvasError::InvalidGeometry(format!(
                "scene element {index} opacity must be between 0 and 100"
            )));
        }
        let x = required_scene_number(object, "x", index)?;
        let y = required_scene_number(object, "y", index)?;
        let visible = !deleted && opacity > 0.0;

        let (min_x, max_x, min_y, max_y, arrow_start, arrow_end, original_text, asset_id) =
            match kind {
                CanvasObjectKind::Rectangle
                | CanvasObjectKind::Ellipse
                | CanvasObjectKind::Text
                | CanvasObjectKind::Image => {
                    let width = required_scene_number(object, "width", index)?;
                    let height = required_scene_number(object, "height", index)?;
                    if width < 0.0 || height < 0.0 {
                        return Err(CanvasError::InvalidGeometry(format!(
                            "scene element {index} has negative dimensions"
                        )));
                    }
                    let text = if kind == CanvasObjectKind::Text {
                        let fallback = object.get("text").map(|value| {
                            value.as_str().ok_or_else(|| {
                                CanvasError::InvalidManifest(format!(
                                    "scene element {index} field 'text' must be a string"
                                ))
                            })
                        });
                        let fallback = match fallback {
                            Some(value) => value?,
                            None => "",
                        };
                        match object.get("originalText") {
                            Some(value) => value.as_str().ok_or_else(|| {
                                CanvasError::InvalidManifest(format!(
                                    "scene element {index} field 'originalText' must be a string"
                                ))
                            })?.to_string(),
                            None => fallback.to_string(),
                        }
                    } else {
                        String::new()
                    };
                    if kind == CanvasObjectKind::Text {
                        if text.len() > MAX_CANVAS_TEXT_BYTES {
                            return Err(CanvasError::InvalidManifest(format!(
                                "text in scene element {index} exceeds {}; reduce or split the canvas",
                                MAX_CANVAS_TEXT_BYTES
                            )));
                        }
                        total_text_bytes = total_text_bytes.saturating_add(text.len());
                        if total_text_bytes > MAX_CANVAS_TOTAL_TEXT_BYTES {
                            return Err(CanvasError::InvalidManifest(format!(
                                "canvas text exceeds {}; reduce or split the canvas",
                                MAX_CANVAS_TOTAL_TEXT_BYTES
                            )));
                        }
                    }
                    let asset_id = if kind == CanvasObjectKind::Image {
                        let file_id = opaque_scene_id(
                            required_scene_string(object, "fileId", index)?,
                            "fileId",
                            index,
                        )?;
                        if !asset_ids.contains(&file_id) {
                            return Err(CanvasError::InvalidManifest(format!(
                                "image scene element {index} references unknown asset '{file_id}'"
                            )));
                        }
                        Some(file_id)
                    } else {
                        None
                    };
                    (x, x + width, y, y + height, None, None, text, asset_id)
                }
                CanvasObjectKind::Line | CanvasObjectKind::Arrow | CanvasObjectKind::Pen => {
                    let points = scene_points(object, index, kind, &mut point_samples)?;
                    let min_point_x = points.iter().map(|point| point.x).fold(f64::INFINITY, f64::min);
                    let max_point_x = points.iter().map(|point| point.x).fold(f64::NEG_INFINITY, f64::max);
                    let min_point_y = points.iter().map(|point| point.y).fold(f64::INFINITY, f64::min);
                    let max_point_y = points.iter().map(|point| point.y).fold(f64::NEG_INFINITY, f64::max);
                    let arrow_start = (kind == CanvasObjectKind::Arrow).then_some(CanvasPoint {
                        x: x + points[0].x,
                        y: y + points[0].y,
                    });
                    let arrow_end = (kind == CanvasObjectKind::Arrow).then_some(CanvasPoint {
                        x: x + points[points.len() - 1].x,
                        y: y + points[points.len() - 1].y,
                    });
                    (
                        x + min_point_x,
                        x + max_point_x,
                        y + min_point_y,
                        y + max_point_y,
                        arrow_start,
                        arrow_end,
                        String::new(),
                        None,
                    )
                }
            };

        if !visible {
            continue;
        }
        visible_count += 1;
        if visible_count > MAX_CANVAS_VISIBLE_OBJECTS {
            return Err(CanvasError::InvalidManifest(format!(
                "visible scene objects exceed {}; reduce or split the canvas",
                MAX_CANVAS_VISIBLE_OBJECTS
            )));
        }
        if !min_x.is_finite() || !max_x.is_finite() || !min_y.is_finite() || !max_y.is_finite() {
            return Err(CanvasError::InvalidGeometry(format!(
                "scene element {index} has non-finite bounds"
            )));
        }
        let bounds = CanvasRect {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
        };
        bounds.validate()?;
        raw_objects.push(RawCanvasObject {
            object: CanvasObject::new(id, kind, bounds, (visible_count - 1) as i64),
            min_x,
            max_x,
            min_y,
            max_y,
            arrow_start,
            arrow_end,
        });
        let last = raw_objects.last_mut().expect("just pushed");
        last.object.original_text = original_text;
        last.object.asset_id = asset_id;
    }

    let origin_x = raw_objects
        .iter()
        .map(|object| object.min_x)
        .fold(f64::INFINITY, f64::min);
    let origin_y = raw_objects
        .iter()
        .map(|object| object.min_y)
        .fold(f64::INFINITY, f64::min);
    for raw in &mut raw_objects {
        raw.object.bounds = CanvasRect {
            x: rounded3(raw.min_x - origin_x)?,
            y: rounded3(raw.min_y - origin_y)?,
            width: rounded3(raw.max_x - raw.min_x)?,
            height: rounded3(raw.max_y - raw.min_y)?,
        };
        if let Some(point) = raw.arrow_start {
            raw.object.arrow_start = Some(CanvasPoint {
                x: rounded3(point.x - origin_x)?,
                y: rounded3(point.y - origin_y)?,
            });
        }
        if let Some(point) = raw.arrow_end {
            raw.object.arrow_end = Some(CanvasPoint {
                x: rounded3(point.x - origin_x)?,
                y: rounded3(point.y - origin_y)?,
            });
        }
    }
    CanvasManifest::new(raw_objects.into_iter().map(|raw| raw.object).collect()).normalized()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanvasManifest {
    pub objects: Vec<CanvasObject>,
}

impl CanvasManifest {
    pub fn new(objects: Vec<CanvasObject>) -> Self {
        Self { objects }
    }

    pub fn normalized(mut self) -> Result<Self, CanvasError> {
        validate_manifest_budgets(&self.objects)?;
        let assets = BTreeSet::new();
        let mut ids = BTreeSet::new();
        for object in &self.objects {
            if object.kind == CanvasObjectKind::Image {
                if object.id.trim().is_empty() {
                    return Err(CanvasError::InvalidManifest("empty object id".into()));
                }
                object.bounds.validate()?;
            } else {
                object.validate(&assets)?;
            }
            if !ids.insert(object.id.clone()) {
                return Err(CanvasError::InvalidManifest(format!(
                    "duplicate object id '{}'",
                    object.id
                )));
            }
        }
        // Image references are checked by `CanvasSnapshot::validate` once envelope assets are
        // available.  Keep ordering independent of editor insertion order.
        self.objects.sort_by(|a, b| a.layer.cmp(&b.layer).then_with(|| a.id.cmp(&b.id)));
        Ok(self)
    }

    pub(crate) fn validate_with_assets(&self, assets: &BTreeSet<String>) -> Result<(), CanvasError> {
        validate_manifest_budgets(&self.objects)?;
        let mut ids = BTreeSet::new();
        for object in &self.objects {
            object.validate(assets)?;
            if !ids.insert(object.id.clone()) {
                return Err(CanvasError::InvalidManifest(format!(
                    "duplicate object id '{}'",
                    object.id
                )));
            }
        }
        let mut expected = self.objects.clone();
        expected.sort_by(|a, b| a.layer.cmp(&b.layer).then_with(|| a.id.cmp(&b.id)));
        if expected != self.objects {
            return Err(CanvasError::InvalidManifest(
                "manifest objects are not in deterministic layer/id order".into(),
            ));
        }
        Ok(())
    }
}

fn validate_manifest_budgets(objects: &[CanvasObject]) -> Result<(), CanvasError> {
    if objects.len() > MAX_CANVAS_VISIBLE_OBJECTS {
        return Err(CanvasError::InvalidManifest(format!(
            "manifest has {} objects, exceeding {}; reduce or split the canvas",
            objects.len(),
            MAX_CANVAS_VISIBLE_OBJECTS
        )));
    }
    let mut total_text_bytes = 0usize;
    for object in objects {
        if object.original_text.len() > MAX_CANVAS_TEXT_BYTES {
            return Err(CanvasError::InvalidManifest(format!(
                "text object '{}' exceeds {}; reduce or split the canvas",
                object.id, MAX_CANVAS_TEXT_BYTES
            )));
        }
        total_text_bytes = total_text_bytes.saturating_add(object.original_text.len());
    }
    if total_text_bytes > MAX_CANVAS_TOTAL_TEXT_BYTES {
        return Err(CanvasError::InvalidManifest(format!(
            "manifest text exceeds {}; reduce or split the canvas",
            MAX_CANVAS_TOTAL_TEXT_BYTES
        )));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CanvasExportKind {
    Overview,
    Detail,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanvasExport {
    pub id: String,
    pub kind: CanvasExportKind,
    /// Detail tiles use a zero-based ordered index.  Overview must use `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index: Option<u32>,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub bytes: Vec<u8>,
}

impl CanvasExport {
    fn validate(&self) -> Result<(), CanvasError> {
        if self.id.trim().is_empty() {
            return Err(CanvasError::InvalidExports("empty export id".into()));
        }
        if self.mime_type != "image/png" {
            return Err(CanvasError::InvalidExports(
                "canvas exports must be external PNGs".into(),
            ));
        }
        validate_dimensions(self.width, self.height)?;
        let pixels = u64::from(self.width) * u64::from(self.height);
        if pixels > MAX_CANVAS_EXPORT_PIXELS {
            return Err(CanvasError::ExportOverBudget(format!(
                "export '{}' has {pixels} pixels",
                self.id
            )));
        }
        if self.bytes.len() > MAX_CANVAS_EXPORT_BYTES {
            return Err(CanvasError::ExportOverBudget(format!(
                "export '{}' is {} bytes",
                self.id,
                self.bytes.len()
            )));
        }
        if !self.bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err(CanvasError::InvalidExports(format!(
                "export '{}' is not PNG data",
                self.id
            )));
        }
        let reader = image::ImageReader::new(std::io::Cursor::new(&self.bytes))
            .with_guessed_format()
            .map_err(|error| CanvasError::InvalidExports(format!("export header: {error}")))?;
        let dimensions = reader
            .into_dimensions()
            .map_err(|error| CanvasError::InvalidExports(format!("export decode: {error}")))?;
        if dimensions != (self.width, self.height) {
            return Err(CanvasError::InvalidExports(format!(
                "export '{}' dimensions do not match metadata",
                self.id
            )));
        }
        // A valid PNG signature/IHDR is not sufficient: reject truncated or corrupt IDAT
        // payloads before the export can enter an immutable snapshot or provider prompt.
        image::ImageReader::new(std::io::Cursor::new(&self.bytes))
            .with_guessed_format()
            .map_err(|error| CanvasError::InvalidExports(format!("export header: {error}")))?
            .decode()
            .map_err(|error| CanvasError::InvalidExports(format!("export decode: {error}")))?;
        match self.kind {
            CanvasExportKind::Overview if self.index.is_some() => {
                return Err(CanvasError::InvalidExports(
                    "overview export cannot have an index".into(),
                ))
            }
            CanvasExportKind::Detail if self.index.is_none() => {
                return Err(CanvasError::InvalidExports(
                    "detail export must have an index".into(),
                ))
            }
            _ => {}
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanvasExportBudget {
    pub max_exports: usize,
    pub max_each_bytes: usize,
    pub max_each_pixels: u64,
    pub max_total_bytes: usize,
    pub max_total_pixels: u64,
}

impl Default for CanvasExportBudget {
    fn default() -> Self {
        Self {
            max_exports: MAX_CANVAS_EXPORTS,
            max_each_bytes: MAX_CANVAS_EXPORT_BYTES,
            max_each_pixels: MAX_CANVAS_EXPORT_PIXELS,
            max_total_bytes: MAX_CANVAS_TOTAL_BYTES,
            max_total_pixels: MAX_CANVAS_TOTAL_PIXELS,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanvasSnapshot {
    pub id: CanvasId,
    pub revision: CanvasRevision,
    pub title: String,
    pub theme: CanvasTheme,
    pub created_at: i64,
    pub frozen_at: i64,
    pub object_count: usize,
    pub envelope: CanvasSceneEnvelope,
    pub manifest: CanvasManifest,
    #[serde(default)]
    pub assets: Vec<CanvasStaticAsset>,
    pub summary: String,
    #[serde(default)]
    pub exports: Vec<CanvasExport>,
}

impl CanvasSnapshot {
    pub fn validate(&self) -> Result<(), CanvasError> {
        self.envelope.validate()?;
        if self.envelope.revision != self.revision {
            return Err(CanvasError::InvalidEnvelope(
                "envelope and snapshot revisions differ".into(),
            ));
        }
        if self.envelope.theme != self.theme {
            return Err(CanvasError::InvalidEnvelope(
                "envelope and snapshot themes differ".into(),
            ));
        }
        let asset_ids = self
            .envelope
            .assets
            .iter()
            .map(|asset| asset.id.clone())
            .collect::<BTreeSet<_>>();
        let snapshot_asset_ids = self
            .assets
            .iter()
            .map(|asset| asset.id.clone())
            .collect::<BTreeSet<_>>();
        if asset_ids != snapshot_asset_ids {
            return Err(CanvasError::InvalidAssets(
                "envelope and snapshot asset sets differ".into(),
            ));
        }
        validate_static_assets_for_store(&self.assets)?;
        let derived = derive_manifest_from_scene(&self.envelope.scene, &asset_ids)?;
        self.manifest.validate_with_assets(&asset_ids)?;
        if self.manifest != derived {
            return Err(CanvasError::InvalidManifest(
                "manifest does not match the exact scene-derived projection".into(),
            ));
        }
        if self.object_count != self.manifest.objects.len() {
            return Err(CanvasError::InvalidManifest(
                "object count does not match manifest".into(),
            ));
        }
        validate_exports(&self.exports, CanvasExportBudget::default())?;
        let expected = deterministic_summary(&self.manifest);
        if self.summary != expected {
            return Err(CanvasError::InvalidManifest(
                "summary is not the deterministic manifest projection".into(),
            ));
        }
        Ok(())
    }

    pub fn search_projection(&self) -> String {
        canvas_search_projection(self)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanvasDraft {
    pub id: CanvasId,
    pub owner: String,
    pub revision: CanvasRevision,
    pub title: String,
    pub theme: CanvasTheme,
    pub envelope: CanvasSceneEnvelope,
    pub manifest: CanvasManifest,
    #[serde(default)]
    pub assets: Vec<CanvasStaticAsset>,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tombstoned_at: Option<i64>,
}

impl CanvasDraft {
    pub fn validate(&self) -> Result<(), CanvasError> {
        if self.envelope.revision != self.revision {
            return Err(CanvasError::InvalidEnvelope(
                "draft envelope and revision differ".into(),
            ));
        }
        if self.envelope.theme != self.theme {
            return Err(CanvasError::InvalidEnvelope(
                "draft envelope and theme differ".into(),
            ));
        }
        self.envelope.validate()?;
        validate_static_assets_for_store(&self.assets)?;
        let asset_ids = self
            .assets
            .iter()
            .map(|asset| asset.id.clone())
            .collect::<BTreeSet<_>>();
        let envelope_asset_ids = self
            .envelope
            .assets
            .iter()
            .map(|asset| asset.id.clone())
            .collect::<BTreeSet<_>>();
        if asset_ids != envelope_asset_ids {
            return Err(CanvasError::InvalidAssets(
                "draft envelope and static asset sets differ".into(),
            ));
        }
        let manifest = self.manifest.clone().normalized()?;
        manifest.validate_with_assets(&asset_ids)?;
        if manifest != derive_manifest_from_scene(&self.envelope.scene, &asset_ids)? {
            return Err(CanvasError::InvalidManifest(
                "manifest does not match the exact scene-derived projection".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanvasStaticAsset {
    pub id: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub bytes: Vec<u8>,
}

impl CanvasStaticAsset {
    pub fn reference(&self) -> CanvasAssetRef {
        CanvasAssetRef {
            id: self.id.clone(),
            mime_type: self.mime_type.clone(),
            width: self.width,
            height: self.height,
            source_name: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanvasDraftUpdate {
    pub title: String,
    pub theme: CanvasTheme,
    pub envelope: CanvasSceneEnvelope,
    pub manifest: CanvasManifest,
    #[serde(default)]
    pub assets: Vec<CanvasStaticAsset>,
}

impl CanvasDraftUpdate {
    pub fn validate_for_revision(&self, revision: CanvasRevision) -> Result<(), CanvasError> {
        let mut envelope = self.envelope.clone();
        envelope.revision = revision;
        envelope.theme = self.theme;
        envelope.assets = self.assets.iter().map(CanvasStaticAsset::reference).collect();
        envelope.validate()?;
        validate_static_assets_for_store(&self.assets)?;
        let manifest = self.manifest.clone().normalized()?;
        let asset_ids = self
            .assets
            .iter()
            .map(|asset| asset.id.clone())
            .collect::<BTreeSet<_>>();
        manifest.validate_with_assets(&asset_ids)?;
        let derived = derive_manifest_from_scene(&envelope.scene, &asset_ids)?;
        if manifest != derived {
            return Err(CanvasError::InvalidManifest(
                "manifest does not match the exact scene-derived projection".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanvasFreezeInput {
    pub title: String,
    pub theme: CanvasTheme,
    pub envelope: CanvasSceneEnvelope,
    pub manifest: CanvasManifest,
    #[serde(default)]
    pub assets: Vec<CanvasStaticAsset>,
    #[serde(default)]
    pub exports: Vec<CanvasExport>,
    pub now: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanvasPromptPayload {
    pub id: CanvasId,
    pub revision: CanvasRevision,
    pub title: String,
    pub summary: String,
    pub exports: Vec<CanvasExport>,
    pub text_originals: Vec<String>,
}

/// The bounded, structured history projection appended to a canonical prompt.  JSON escaping
/// keeps this marker one physical line even when a title or text original contains newlines,
/// brackets, control characters, or text that resembles an older marker format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CanvasHistoryMarker {
    pub version: u8,
    pub id: CanvasId,
    pub revision: CanvasRevision,
    pub title: String,
    #[serde(default)]
    pub text_originals: Vec<String>,
}

pub const CANVAS_HISTORY_MARKER_PREFIX: &str = "[canvas-history-json ";

impl CanvasHistoryMarker {
    pub fn new(
        id: impl Into<String>,
        revision: CanvasRevision,
        title: &str,
        text_originals: &[String],
    ) -> Self {
        Self {
            version: 1,
            id: id.into(),
            revision,
            title: title.chars().take(MAX_CANVAS_HISTORY_TITLE_CHARS).collect(),
            text_originals: text_originals
                .iter()
                .take(MAX_CANVAS_HISTORY_TEXTS)
                .map(|text| text.chars().take(MAX_CANVAS_HISTORY_TEXT_CHARS).collect())
                .collect(),
        }
    }

    pub fn encode(&self) -> String {
        let json = serde_json::to_string(self).expect("CanvasHistoryMarker is serializable");
        format!("{CANVAS_HISTORY_MARKER_PREFIX}{json}]" )
    }
}

pub fn encode_canvas_history_marker(
    id: &str,
    revision: CanvasRevision,
    title: &str,
    text_originals: &[String],
) -> String {
    CanvasHistoryMarker::new(id, revision, title, text_originals).encode()
}

/// Parse the exact marker emitted by [`CanvasHistoryMarker::encode`].  A malformed marker is
/// treated as absent so transcript consumers can safely inspect older history without guessing at
/// partially decoded user text.
pub fn parse_canvas_history_marker(value: &str) -> Option<CanvasHistoryMarker> {
    if value.contains('\n') || value.contains('\r') {
        return None;
    }
    let json = value
        .strip_prefix(CANVAS_HISTORY_MARKER_PREFIX)?
        .strip_suffix(']')?;
    let marker: CanvasHistoryMarker = serde_json::from_str(json).ok()?;
    if marker.version != 1
        || marker.id.trim().is_empty()
        || marker.revision == 0
        || marker.title.chars().count() > MAX_CANVAS_HISTORY_TITLE_CHARS
        || marker.text_originals.len() > MAX_CANVAS_HISTORY_TEXTS
        || marker
            .text_originals
            .iter()
            .any(|text| text.chars().count() > MAX_CANVAS_HISTORY_TEXT_CHARS)
    {
        return None;
    }
    Some(marker)
}

impl CanvasSnapshot {
    pub fn prompt_payload(&self) -> CanvasPromptPayload {
        CanvasPromptPayload {
            id: self.id.clone(),
            revision: self.revision,
            title: self.title.clone(),
            summary: self.summary.clone(),
            exports: self.exports.clone(),
            text_originals: self
                .manifest
                .objects
                .iter()
                .filter(|object| object.kind == CanvasObjectKind::Text)
                .map(|object| object.original_text.clone())
                .filter(|text| !text.is_empty())
                .collect(),
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum CanvasError {
    #[error("canvas feature gate {CANVAS_FEATURE_GATE} is disabled")]
    GateDisabled,
    #[error("canvas owner mismatch")]
    OwnerMismatch,
    #[error("canvas '{0}' was not found")]
    NotFound(String),
    #[error("canvas '{id}' has stale revision: expected {expected}, found {actual}")]
    StaleRevision {
        id: String,
        expected: CanvasRevision,
        actual: CanvasRevision,
    },
    #[error("canvas '{0}' is immutable")]
    Immutable(String),
    #[error("canvas '{0}' is tombstoned")]
    Tombstoned(String),
    #[error("invalid canvas envelope: {0}")]
    InvalidEnvelope(String),
    #[error("invalid canvas manifest: {0}")]
    InvalidManifest(String),
    #[error("invalid canvas assets: {0}")]
    InvalidAssets(String),
    #[error("invalid canvas exports: {0}")]
    InvalidExports(String),
    #[error("canvas export budget exceeded: {0}")]
    ExportOverBudget(String),
    #[error("invalid canvas geometry: {0}")]
    InvalidGeometry(String),
    #[error("unsupported or unsafe media: {0}")]
    UnsafeMedia(String),
    #[error("canvas provider explicitly does not support images; choose structure_only explicitly")]
    ProviderImageUnsupported {
        capability: CanvasProviderImageCapability,
    },
    #[error("sqlite: {0}")]
    Sqlite(String),
    #[error("serde: {0}")]
    Serde(String),
}

impl From<rusqlite::Error> for CanvasError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error.to_string())
    }
}

impl From<serde_json::Error> for CanvasError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serde(error.to_string())
    }
}

/// Normalize an imported image to metadata-free PNG. GIFs intentionally become their first
/// frame; SVG is accepted only after a small, strict static subset check and is rasterized to a
/// bounded transparent PNG. No active source format is persisted.
pub fn normalize_media(bytes: &[u8], declared_mime: Option<&str>) -> Result<CanvasStaticAsset, CanvasError> {
    if bytes.is_empty() || bytes.len() > MAX_CANVAS_INPUT_BYTES {
        return Err(CanvasError::UnsafeMedia("input byte budget exceeded".into()));
    }
    let source = detect_media(bytes, declared_mime)?;
    let (width, height) = match source {
        MediaKind::Svg => {
            let svg = rasterize_safe_svg(bytes)?;
            (svg.width(), svg.height())
        }
        MediaKind::Png | MediaKind::Jpeg | MediaKind::Webp | MediaKind::Gif => {
            let reader = ImageReader::new(std::io::Cursor::new(bytes))
                .with_guessed_format()
                .map_err(|error| CanvasError::UnsafeMedia(format!("image header: {error}")))?;
            let (width, height) = reader
                .into_dimensions()
                .map_err(|error| CanvasError::UnsafeMedia(format!("image dimensions: {error}")))?;
            validate_dimensions(width, height)?;
            let reader = ImageReader::new(std::io::Cursor::new(bytes))
                .with_guessed_format()
                .map_err(|error| CanvasError::UnsafeMedia(format!("image header: {error}")))?;
            let image = reader
                .decode()
                .map_err(|error| CanvasError::UnsafeMedia(format!("image decode: {error}")))?;
            let mut output = Vec::new();
            image
                .write_to(&mut std::io::Cursor::new(&mut output), ImageFormat::Png)
                .map_err(|error| CanvasError::UnsafeMedia(format!("PNG encode: {error}")))?;
            if output.len() > MAX_CANVAS_OUTPUT_BYTES {
                return Err(CanvasError::UnsafeMedia("normalized PNG is too large".into()));
            }
            let id = format!("asset-{}", blake3::hash(&output).to_hex());
            return Ok(CanvasStaticAsset {
                id,
                mime_type: "image/png".into(),
                width,
                height,
                bytes: output,
            });
        }
    };
    validate_dimensions(width, height)?;
    let output = if source == MediaKind::Svg {
        let svg = rasterize_safe_svg(bytes)?;
        let mut output = Vec::new();
        svg.write_to(&mut std::io::Cursor::new(&mut output), ImageFormat::Png)
            .map_err(|error| CanvasError::UnsafeMedia(format!("SVG PNG encode: {error}")))?;
        output
    } else {
        unreachable!("non-SVG media returns after decode")
    };
    if output.len() > MAX_CANVAS_OUTPUT_BYTES {
        return Err(CanvasError::UnsafeMedia("normalized PNG is too large".into()));
    }
    let id = format!("asset-{}", blake3::hash(&output).to_hex());
    Ok(CanvasStaticAsset {
        id,
        mime_type: "image/png".into(),
        width,
        height,
        bytes: output,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MediaKind {
    Png,
    Jpeg,
    Webp,
    Gif,
    Svg,
}

fn detect_media(bytes: &[u8], declared_mime: Option<&str>) -> Result<MediaKind, CanvasError> {
    let detected = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(MediaKind::Png)
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some(MediaKind::Jpeg)
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some(MediaKind::Gif)
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some(MediaKind::Webp)
    } else if looks_like_svg(bytes) {
        Some(MediaKind::Svg)
    } else {
        None
    };
    let detected = detected.ok_or_else(|| CanvasError::UnsafeMedia("unknown image format".into()))?;
    if let Some(declared) = declared_mime {
        let expected = match declared {
            "image/png" => MediaKind::Png,
            "image/jpeg" => MediaKind::Jpeg,
            "image/webp" => MediaKind::Webp,
            "image/gif" => MediaKind::Gif,
            "image/svg+xml" => MediaKind::Svg,
            other => return Err(CanvasError::UnsafeMedia(format!("unsupported MIME {other}"))),
        };
        if expected != detected {
            return Err(CanvasError::UnsafeMedia("declared MIME does not match bytes".into()));
        }
    }
    Ok(detected)
}

fn looks_like_svg(bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else { return false };
    let trimmed = text.trim_start_matches('\u{feff}').trim_start();
    trimmed.starts_with("<svg") || (trimmed.starts_with("<?xml") && trimmed.contains("<svg"))
}

fn rasterize_safe_svg(bytes: &[u8]) -> Result<DynamicImage, CanvasError> {
    let text = std::str::from_utf8(bytes)
        .map_err(|_| CanvasError::UnsafeMedia("SVG is not UTF-8".into()))?;
    let lower = text
        .to_ascii_lowercase()
        .replace("xmlns=\"http://www.w3.org/2000/svg\"", "")
        .replace("xmlns='http://www.w3.org/2000/svg'", "");
    for forbidden in [
        "<script",
        "</script",
        "foreignobject",
        "<!doctype",
        "<!entity",
        "data:",
        "http:",
        "https:",
        "file:",
        "xlink:href",
        "href=",
        "url(",
        "<image",
    ] {
        if lower.contains(forbidden) {
            return Err(CanvasError::UnsafeMedia(format!(
                "SVG contains forbidden active/external construct {forbidden}"
            )));
        }
    }
    let mut options = resvg::usvg::Options::default();
    options.resources_dir = None;
    let tree = resvg::usvg::Tree::from_data(bytes, &options)
        .map_err(|error| CanvasError::UnsafeMedia(format!("SVG parse: {error}")))?;
    let size = tree.size().to_int_size();
    validate_dimensions(size.width(), size.height())?;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(size.width(), size.height())
        .ok_or_else(|| CanvasError::UnsafeMedia("SVG raster dimensions are invalid".into()))?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::default(),
        &mut pixmap.as_mut(),
    );
    let png = pixmap
        .encode_png()
        .map_err(|error| CanvasError::UnsafeMedia(format!("SVG PNG encode: {error}")))?;
    let image = image::load_from_memory_with_format(&png, ImageFormat::Png)
        .map_err(|error| CanvasError::UnsafeMedia(format!("SVG PNG decode: {error}")))?;
    Ok(image)
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), CanvasError> {
    if width == 0 || height == 0 || width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION {
        return Err(CanvasError::UnsafeMedia(format!(
            "dimensions {width}x{height} exceed bound"
        )));
    }
    if u64::from(width) * u64::from(height) > MAX_CANVAS_DECODED_PIXELS {
        return Err(CanvasError::UnsafeMedia("decoded pixel budget exceeded".into()));
    }
    Ok(())
}

pub(crate) fn validate_static_asset_for_store(asset: &CanvasStaticAsset) -> Result<(), CanvasError> {
    let reference = asset.reference();
    reference.validate()?;
    if asset.bytes.len() > MAX_CANVAS_OUTPUT_BYTES {
        return Err(CanvasError::InvalidAssets(format!(
            "asset '{}' exceeds byte budget",
            asset.id
        )));
    }
    if !asset.bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(CanvasError::InvalidAssets(format!(
            "asset '{}' is not normalized PNG data",
            asset.id
        )));
    }
    let reader = image::ImageReader::new(std::io::Cursor::new(&asset.bytes))
        .with_guessed_format()
        .map_err(|error| CanvasError::InvalidAssets(format!("asset header: {error}")))?;
    let dimensions = reader
        .into_dimensions()
        .map_err(|error| CanvasError::InvalidAssets(format!("asset decode: {error}")))?;
    image::ImageReader::new(std::io::Cursor::new(&asset.bytes))
        .with_guessed_format()
        .map_err(|error| CanvasError::InvalidAssets(format!("asset header: {error}")))?
        .decode()
        .map_err(|error| CanvasError::InvalidAssets(format!("asset decode: {error}")))?;
    if dimensions != (asset.width, asset.height) {
        return Err(CanvasError::InvalidAssets(format!(
            "asset '{}' dimensions do not match metadata",
            asset.id
        )));
    }
    Ok(())
}

fn reject_active_or_external(value: &Value, path: &str) -> Result<(), CanvasError> {
    fn is_active_key(key: &str) -> bool {
        matches!(
            key.to_ascii_lowercase().as_str(),
            "src" | "href" | "xlink:href" | "url" | "data" | "asset" | "assetref" | "asset_ref"
        )
    }

    match value {
        Value::String(text) => {
            let key = path.rsplit('.').next().unwrap_or(path);
            if is_active_key(key) && !text.trim().is_empty() {
                return Err(CanvasError::InvalidEnvelope(format!(
                    "{path} contains a forbidden external/active reference"
                )));
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                reject_active_or_external(item, &format!("{path}[{index}]"))?;
            }
        }
        Value::Object(map) => {
            for (key, item) in map {
                if is_active_key(key) {
                    if !item.is_null() {
                        return Err(CanvasError::InvalidEnvelope(format!(
                            "{path}.{key} is an external/active reference"
                        )));
                    }
                    continue;
                }
                reject_active_or_external(item, &format!("{path}.{key}"))?;
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
    Ok(())
}

pub fn deterministic_summary(manifest: &CanvasManifest) -> String {
    let mut objects = manifest.objects.clone();
    objects.sort_by(|a, b| a.layer.cmp(&b.layer).then_with(|| a.id.cmp(&b.id)));
    let mut out = String::new();
    for object in objects {
        let _ = write!(
            out,
            "object id={} type={} text={} x={} y={} width={} height={} layer={}",
            object.id,
            object.kind.as_str(),
            serde_json::to_string(&object.original_text).unwrap_or_else(|_| "\"\"".into()),
            stable_number(object.bounds.x),
            stable_number(object.bounds.y),
            stable_number(object.bounds.width),
            stable_number(object.bounds.height),
            object.layer
        );
        if let (Some(start), Some(end)) = (object.arrow_start, object.arrow_end) {
            let _ = write!(
                out,
                " arrow_start=({}, {}) arrow_end=({}, {})",
                stable_number(start.x),
                stable_number(start.y),
                stable_number(end.x),
                stable_number(end.y)
            );
        }
        out.push('\n');
    }
    out
}

fn stable_number(value: f64) -> String {
    if value == 0.0 {
        return "0".into();
    }
    let mut text = format!("{value:.6}");
    while text.contains('.') && text.ends_with('0') {
        text.pop();
    }
    if text.ends_with('.') {
        text.pop();
    }
    text
}

pub fn canvas_search_projection(snapshot: &CanvasSnapshot) -> String {
    let mut parts = vec![
        format!("Canvas: {}", snapshot.title),
        format!("Canvas revision: {}@{}", snapshot.id, snapshot.revision),
    ];
    parts.extend(
        snapshot
            .manifest
            .objects
            .iter()
            .filter(|object| !object.original_text.trim().is_empty())
            .map(|object| object.original_text.trim().to_string()),
    );
    parts.join("\n")
}

pub fn validate_exports(
    exports: &[CanvasExport],
    budget: CanvasExportBudget,
) -> Result<(), CanvasError> {
    if exports.is_empty() {
        return Err(CanvasError::InvalidExports(
            "one overview PNG export is required".into(),
        ));
    }
    if exports.len() > budget.max_exports {
        return Err(CanvasError::ExportOverBudget(format!(
            "{} exports exceeds {}",
            exports.len(),
            budget.max_exports
        )));
    }
    if !matches!(exports.first().map(|export| export.kind), Some(CanvasExportKind::Overview)) {
        return Err(CanvasError::InvalidExports(
            "overview export must precede detail tiles".into(),
        ));
    }
    let mut ids = BTreeSet::new();
    let mut overview_count = 0;
    let mut next_detail = 0;
    let mut total_bytes = 0usize;
    let mut total_pixels = 0u64;
    for export in exports {
        export.validate()?;
        if export.bytes.len() > budget.max_each_bytes
            || u64::from(export.width) * u64::from(export.height) > budget.max_each_pixels
        {
            return Err(CanvasError::ExportOverBudget(format!(
                "export '{}' exceeds per-image budget",
                export.id
            )));
        }
        if !ids.insert(export.id.clone()) {
            return Err(CanvasError::InvalidExports(format!(
                "duplicate export id '{}'",
                export.id
            )));
        }
        match export.kind {
            CanvasExportKind::Overview => overview_count += 1,
            CanvasExportKind::Detail => {
                if export.index != Some(next_detail) {
                    return Err(CanvasError::InvalidExports(
                        "detail exports must be ordered from index 0".into(),
                    ));
                }
                next_detail += 1;
            }
        }
        total_bytes = total_bytes.saturating_add(export.bytes.len());
        total_pixels = total_pixels.saturating_add(u64::from(export.width) * u64::from(export.height));
    }
    if overview_count != 1 {
        return Err(CanvasError::InvalidExports(
            "exactly one overview export is required".into(),
        ));
    }
    if total_bytes > budget.max_total_bytes || total_pixels > budget.max_total_pixels {
        return Err(CanvasError::ExportOverBudget(
            "total export budget exceeded".into(),
            ));
    }
    Ok(())
}

pub(crate) fn validate_static_assets_for_store(assets: &[CanvasStaticAsset]) -> Result<(), CanvasError> {
    if assets.len() > MAX_CANVAS_ASSETS {
        return Err(CanvasError::InvalidAssets(format!(
            "{} assets exceeds {}; reduce or split the canvas",
            assets.len(),
            MAX_CANVAS_ASSETS
        )));
    }
    let mut ids = BTreeSet::new();
    let mut total_bytes = 0usize;
    let mut total_pixels = 0u64;
    for asset in assets {
        if !ids.insert(asset.id.clone()) {
            return Err(CanvasError::InvalidAssets(format!(
                "duplicate asset id '{}'; remove duplicates before saving",
                asset.id
            )));
        }
        validate_static_asset_for_store(asset)?;
        total_bytes = total_bytes.saturating_add(asset.bytes.len());
        total_pixels = total_pixels.saturating_add(u64::from(asset.width) * u64::from(asset.height));
    }
    if total_bytes > MAX_CANVAS_TOTAL_ASSET_BYTES {
        return Err(CanvasError::InvalidAssets(format!(
            "normalized assets total {} bytes, exceeding {}; reduce or split the canvas",
            total_bytes, MAX_CANVAS_TOTAL_ASSET_BYTES
        )));
    }
    if total_pixels > MAX_CANVAS_TOTAL_ASSET_PIXELS {
        return Err(CanvasError::InvalidAssets(format!(
            "normalized assets total {} pixels, exceeding {}; reduce or split the canvas",
            total_pixels, MAX_CANVAS_TOTAL_ASSET_PIXELS
        )));
    }
    Ok(())
}

/// Resolve a frozen reference and apply its caller-selected image policy.  The resolver is kept
/// generic so Store remains the only component that knows SQLite details.
pub fn resolve_prompt_payload<F>(
    reference: &CanvasRef,
    gate: CanvasFeatureGate,
    capability: CanvasProviderImageCapability,
    resolve: F,
) -> Result<CanvasPromptPayload, CanvasError>
where
    F: FnOnce(&str, CanvasRevision) -> Result<CanvasPromptPayload, CanvasError>,
{
    gate.require()?;
    if reference.id.trim().is_empty() || reference.frozen_revision == 0 {
        return Err(CanvasError::NotFound(reference.id.clone()));
    }
    let mut payload = resolve(&reference.id, reference.frozen_revision)?;
    if reference.pixel_policy == CanvasPixelPolicy::Required
        && matches!(capability, CanvasProviderImageCapability::Unsupported)
    {
        return Err(CanvasError::ProviderImageUnsupported { capability });
    }
    if reference.pixel_policy == CanvasPixelPolicy::StructureOnly {
        payload.exports.clear();
    }
    Ok(payload)
}

/// Store schema installation is called by [`crate::store::Store`] alongside the existing session
/// and memory schemas.  Bytes are private BLOBs; no workspace path or raw scene enters a document.
pub(crate) const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS canvas_drafts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  theme TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  assets_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  tombstoned_at INTEGER,
  immutable INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS canvas_drafts_owner ON canvas_drafts(owner, updated_at DESC);
CREATE TABLE IF NOT EXISTS canvas_revisions (
  canvas_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  owner TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (canvas_id, revision)
);
CREATE TABLE IF NOT EXISTS canvas_tombstones (
  canvas_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  tombstoned_at INTEGER NOT NULL
);
"#;

pub(crate) fn install(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(SCHEMA)
}

/// A compact constructor used by Store and tests.  It avoids exposing raw timestamps/UUID policy
/// in every caller while keeping owner identity explicit.
pub fn new_draft(owner: impl Into<String>, title: impl Into<String>, now: i64) -> CanvasDraft {
    let id = Uuid::new_v4().to_string();
    let envelope = CanvasSceneEnvelope::new(
        1,
        CanvasTheme::Light,
        serde_json::json!({
            "elements": [],
            "appState": {"activeTool": "selection"}
        }),
    );
    CanvasDraft {
        id,
        owner: owner.into(),
        revision: 1,
        title: title.into(),
        theme: CanvasTheme::Light,
        envelope,
        manifest: CanvasManifest { objects: Vec::new() },
        assets: Vec::new(),
        created_at: now,
        updated_at: now,
        tombstoned_at: None,
    }
}
