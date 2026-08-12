//! Scene artifacts — the versioned descriptor layer above the content-addressed blob store.
//!
//! A scene declares the artifacts a stage is expected to produce ([`SceneArtifactSpec`]); this
//! module owns their captured versions. Content lives in the shared `artifacts` blob layer via
//! [`ArtifactStore::save_document`]; each capture adds a `scene_artifacts` descriptor row keyed by
//! `(session_id, artifact_key)` with a 1-based version. Newest wins; `pin` freezes one version;
//! unpin restores newest-wins. Pipeline stages carry artifacts forward through [`resolve_carry`].
//!
//! [`resolve_carry`]: SceneArtifactStore::resolve_carry

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

use crate::artifact::{ArtifactError, ArtifactRef, ArtifactStore};
use crate::scene::{CarriedArtifact, PipelineStage, SceneArtifactSpec};
use crate::store::Store;

/// Carried content is prompt context, not a file transfer: cap each artifact at 32 KiB and note
/// the truncation in the label so the agent knows it is reading a prefix.
pub const MAX_CARRY_CONTENT_BYTES: usize = 32 * 1024;

#[derive(Clone)]
pub struct SceneArtifactStore {
    store: Arc<Store>,
    blobs: ArtifactStore,
}

/// One captured version of one scene artifact.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SceneArtifactRecord {
    pub id: i64,
    pub scene_ref: String,
    pub artifact_key: String,
    pub kind: String,
    pub title: String,
    pub session_id: String,
    pub pipeline_instance_id: Option<String>,
    pub stage_id: Option<String>,
    pub artifact: ArtifactRef,
    pub version: i64,
    pub pinned: bool,
    pub created_at: i64,
}

/// Shared SELECT projection joining the descriptor row with its blob metadata; every query below
/// reads rows through [`row_to_record`] so the column order stays in one place.
const SELECT_RECORD: &str = "SELECT s.id, s.scene_ref, s.artifact_key, s.kind, s.title,
        s.session_id, s.pipeline_instance_id, s.stage_id,
        a.id, a.mime_type, a.byte_count, a.width, a.height, a.display_name,
        s.version, s.pinned, s.created_at
 FROM scene_artifacts s JOIN artifacts a ON a.id = s.artifact_id";

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<SceneArtifactRecord> {
    Ok(SceneArtifactRecord {
        id: row.get(0)?,
        scene_ref: row.get(1)?,
        artifact_key: row.get(2)?,
        kind: row.get(3)?,
        title: row.get(4)?,
        session_id: row.get(5)?,
        pipeline_instance_id: row.get(6)?,
        stage_id: row.get(7)?,
        artifact: ArtifactRef {
            id: row.get(8)?,
            mime_type: row.get(9)?,
            bytes: row.get::<_, i64>(10)?.max(0) as u64,
            width: row.get::<_, i64>(11)?.max(0) as u32,
            height: row.get::<_, i64>(12)?.max(0) as u32,
            display_name: row.get(13)?,
        },
        version: row.get(14)?,
        pinned: row.get::<_, i64>(15)? != 0,
        created_at: row.get(16)?,
    })
}

impl SceneArtifactStore {
    pub fn new(store: Arc<Store>, blobs: ArtifactStore) -> Self {
        Self { store, blobs }
    }

    /// Capture one version of `spec` for a session (and optionally a pipeline
    /// `(instance_id, stage_id)`). The next version is `MAX + 1` per `(session_id, artifact_key)`;
    /// re-recording the same content still bumps the version — the blob layer dedupes bytes, the
    /// descriptor history stays append-only.
    pub fn record(
        &self,
        scene_ref: &str,
        spec: &SceneArtifactSpec,
        session_id: &str,
        pipeline: Option<(&str, &str)>,
        content: &str,
    ) -> Result<SceneArtifactRecord, ArtifactError> {
        let artifact = self.blobs.save_document(
            content,
            "text/markdown",
            Some(&format!("{}.md", spec.id)),
            session_id,
            &format!("scene:{}", spec.id),
        )?;
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(i64::MAX as u128) as i64;
        let (instance_id, stage_id) = match pipeline {
            Some((instance, stage)) => (Some(instance), Some(stage)),
            None => (None, None),
        };
        let conn = self.store.conn.lock().unwrap();
        let version: i64 = conn.query_row(
            "SELECT COALESCE(MAX(version),0)+1 FROM scene_artifacts
             WHERE session_id=?1 AND artifact_key=?2",
            rusqlite::params![session_id, spec.id],
            |row| row.get(0),
        )?;
        conn.execute(
            "INSERT INTO scene_artifacts
             (scene_ref,artifact_key,kind,title,session_id,pipeline_instance_id,stage_id,
              artifact_id,version,pinned,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10)",
            rusqlite::params![
                scene_ref,
                spec.id,
                spec.kind.as_str(),
                spec.title,
                session_id,
                instance_id,
                stage_id,
                artifact.id,
                version,
                created_at,
            ],
        )?;
        let id = conn.last_insert_rowid();
        Ok(SceneArtifactRecord {
            id,
            scene_ref: scene_ref.to_string(),
            artifact_key: spec.id.clone(),
            kind: spec.kind.as_str().to_string(),
            title: spec.title.clone(),
            session_id: session_id.to_string(),
            pipeline_instance_id: instance_id.map(str::to_string),
            stage_id: stage_id.map(str::to_string),
            artifact,
            version,
            pinned: false,
            created_at,
        })
    }

    /// Pin one version per `(session_id, artifact_key)` scope — at most one row stays pinned.
    /// `None` unpins the scope entirely, restoring newest-wins.
    pub fn pin(
        &self,
        session_id: &str,
        artifact_key: &str,
        version: Option<i64>,
    ) -> Result<(), ArtifactError> {
        let conn = self.store.conn.lock().unwrap();
        conn.execute(
            "UPDATE scene_artifacts SET pinned=0 WHERE session_id=?1 AND artifact_key=?2",
            rusqlite::params![session_id, artifact_key],
        )?;
        if let Some(version) = version {
            let changed = conn.execute(
                "UPDATE scene_artifacts SET pinned=1
                 WHERE session_id=?1 AND artifact_key=?2 AND version=?3",
                rusqlite::params![session_id, artifact_key, version],
            )?;
            if changed == 0 {
                return Err(ArtifactError::NotFound);
            }
        }
        Ok(())
    }

    /// The effective version for a `(session_id, artifact_key)` scope: the pinned row if any,
    /// otherwise the newest.
    pub fn latest(
        &self,
        session_id: &str,
        artifact_key: &str,
    ) -> Result<Option<SceneArtifactRecord>, ArtifactError> {
        let conn = self.store.conn.lock().unwrap();
        Ok(conn
            .query_row(
                &format!(
                    "{SELECT_RECORD} WHERE s.session_id=?1 AND s.artifact_key=?2
                     ORDER BY s.pinned DESC, s.version DESC LIMIT 1"
                ),
                rusqlite::params![session_id, artifact_key],
                row_to_record,
            )
            .optional()?)
    }

    /// The effective version produced by one pipeline stage across an instance (pinned wins,
    /// else newest).
    pub fn latest_for_stage(
        &self,
        instance_id: &str,
        stage_id: &str,
        artifact_key: &str,
    ) -> Result<Option<SceneArtifactRecord>, ArtifactError> {
        let conn = self.store.conn.lock().unwrap();
        Ok(conn
            .query_row(
                &format!(
                    "{SELECT_RECORD} WHERE s.pipeline_instance_id=?1 AND s.stage_id=?2
                       AND s.artifact_key=?3
                     ORDER BY s.pinned DESC, s.version DESC LIMIT 1"
                ),
                rusqlite::params![instance_id, stage_id, artifact_key],
                row_to_record,
            )
            .optional()?)
    }

    pub fn list_for_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<SceneArtifactRecord>, ArtifactError> {
        let conn = self.store.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!(
            "{SELECT_RECORD} WHERE s.session_id=?1 ORDER BY s.artifact_key ASC, s.version DESC"
        ))?;
        let rows = stmt.query_map([session_id], row_to_record)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn list_for_instance(
        &self,
        instance_id: &str,
    ) -> Result<Vec<SceneArtifactRecord>, ArtifactError> {
        let conn = self.store.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!(
            "{SELECT_RECORD} WHERE s.pipeline_instance_id=?1
             ORDER BY s.stage_id ASC, s.artifact_key ASC, s.version DESC"
        ))?;
        let rows = stmt.query_map([instance_id], row_to_record)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// The stored UTF-8 content of one captured version.
    pub fn content(&self, record_id: i64) -> Result<String, ArtifactError> {
        let artifact_id: Option<String> = {
            let conn = self.store.conn.lock().unwrap();
            conn.query_row(
                "SELECT artifact_id FROM scene_artifacts WHERE id=?1",
                [record_id],
                |row| row.get(0),
            )
            .optional()?
        };
        let artifact_id = artifact_id.ok_or(ArtifactError::NotFound)?;
        let bytes = self.blobs.get(&artifact_id)?;
        String::from_utf8(bytes).map_err(|error| ArtifactError::InvalidData(error.to_string()))
    }

    /// Resolve a stage's `carry` list into prompt-ready [`CarriedArtifact`]s: for each
    /// [`crate::scene::CarrySpec`], the pinned-or-newest version the named `from` stage produced
    /// in this instance. A `from` stage with no record is skipped SILENTLY — pipelines loop, and
    /// an early lap legitimately has nothing to carry yet. Content is capped at
    /// [`MAX_CARRY_CONTENT_BYTES`] with the truncation noted in the label; `as` overrides the
    /// label.
    pub fn resolve_carry(&self, instance_id: &str, stage: &PipelineStage) -> Vec<CarriedArtifact> {
        let mut carried = Vec::new();
        for carry in &stage.carry {
            let record = match self.latest_for_stage(instance_id, &carry.from, &carry.artifact) {
                Ok(Some(record)) => record,
                Ok(None) | Err(_) => continue,
            };
            let Ok(mut content) = self.content(record.id) else {
                continue;
            };
            let mut label = carry
                .as_label
                .clone()
                .unwrap_or_else(|| record.title.clone());
            if content.len() > MAX_CARRY_CONTENT_BYTES {
                let mut end = MAX_CARRY_CONTENT_BYTES;
                while !content.is_char_boundary(end) {
                    end -= 1;
                }
                content.truncate(end);
                label.push_str(" (truncated to 32 KiB)");
            }
            carried.push(CarriedArtifact {
                label,
                from_stage: Some(carry.from.clone()),
                version: record.version,
                content,
            });
        }
        carried
    }
}

/// Best-effort capture over one turn's agent text: fenced code blocks whose info string contains
/// `artifact:<id>` for a DECLARED id (the convention `prompt_preamble`'s capture instruction
/// teaches). Unmarked fences and undeclared ids are ignored; each declared id keeps its LAST
/// block when the text re-emits it. Pure — R8's TurnEnded glue calls it and records the results.
pub fn extract_artifact_blocks(
    text: &str,
    declared: &[SceneArtifactSpec],
) -> Vec<(String, String)> {
    enum Fence {
        /// Inside a fence that is not a declared artifact — its body must not open captures.
        Skip(usize),
        Capture {
            id: String,
            content: String,
            fence_len: usize,
        },
    }

    let mut out: Vec<(String, String)> = Vec::new();
    let mut state: Option<Fence> = None;
    for line in text.lines() {
        let trimmed = line.trim_start();
        let backticks = trimmed.chars().take_while(|c| *c == '`').count();
        let closes = |open_len: usize| {
            backticks >= open_len && !trimmed.is_empty() && trimmed.chars().all(|c| c == '`')
        };
        state = match state.take() {
            Some(Fence::Skip(open_len)) => {
                if closes(open_len) {
                    None
                } else {
                    Some(Fence::Skip(open_len))
                }
            }
            Some(Fence::Capture {
                id,
                mut content,
                fence_len,
            }) => {
                if closes(fence_len) {
                    match out.iter_mut().find(|(existing, _)| *existing == id) {
                        Some(entry) => entry.1 = content,
                        None => out.push((id, content)),
                    }
                    None
                } else {
                    if !content.is_empty() {
                        content.push('\n');
                    }
                    content.push_str(line);
                    Some(Fence::Capture {
                        id,
                        content,
                        fence_len,
                    })
                }
            }
            None => {
                if backticks >= 3 {
                    let info = trimmed[backticks..].trim();
                    let id = info
                        .split_whitespace()
                        .find_map(|token| token.strip_prefix("artifact:"))
                        .filter(|id| declared.iter().any(|spec| spec.id == *id));
                    Some(match id {
                        Some(id) => Fence::Capture {
                            id: id.to_string(),
                            content: String::new(),
                            fence_len: backticks,
                        },
                        None => Fence::Skip(backticks),
                    })
                } else {
                    None
                }
            }
        };
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::{CarrySpec, SceneArtifactKind};
    use tempfile::tempdir;

    fn spec(id: &str, title: &str) -> SceneArtifactSpec {
        SceneArtifactSpec {
            id: id.into(),
            title: title.into(),
            kind: SceneArtifactKind::Report,
            required: false,
            template: None,
            description: None,
        }
    }

    fn store_in(dir: &std::path::Path) -> SceneArtifactStore {
        let store = Arc::new(Store::open(dir.join("codetwo.db").to_str().unwrap()).unwrap());
        let blobs = ArtifactStore::from_store(store.clone()).unwrap();
        SceneArtifactStore::new(store, blobs)
    }

    fn stage(id: &str, carry: Vec<CarrySpec>) -> PipelineStage {
        PipelineStage {
            id: id.into(),
            scene: "develop".into(),
            title: None,
            gate: None,
            carry,
        }
    }

    #[test]
    fn record_bumps_versions_and_content_round_trips() {
        let dir = tempdir().unwrap();
        let artifacts = store_in(dir.path());
        let spec = spec("report", "Report");

        let v1 = artifacts
            .record("builtin:research", &spec, "s1", None, "first findings")
            .unwrap();
        let v2 = artifacts
            .record("builtin:research", &spec, "s1", None, "second findings")
            .unwrap();
        assert_eq!((v1.version, v2.version), (1, 2));
        assert_eq!(v2.kind, "report");
        assert_eq!(artifacts.content(v2.id).unwrap(), "second findings");

        // Newest wins by default; another session's counter is independent.
        let latest = artifacts.latest("s1", "report").unwrap().unwrap();
        assert_eq!(latest.version, 2);
        let other = artifacts
            .record("builtin:research", &spec, "s2", None, "elsewhere")
            .unwrap();
        assert_eq!(other.version, 1);
    }

    #[test]
    fn pinned_beats_newest_and_unpin_restores() {
        let dir = tempdir().unwrap();
        let artifacts = store_in(dir.path());
        let spec = spec("report", "Report");
        for content in ["v1", "v2", "v3"] {
            artifacts
                .record("builtin:research", &spec, "s1", None, content)
                .unwrap();
        }

        artifacts.pin("s1", "report", Some(2)).unwrap();
        let pinned = artifacts.latest("s1", "report").unwrap().unwrap();
        assert_eq!(pinned.version, 2);
        assert!(pinned.pinned);

        // Re-pinning moves the single pinned row; unpinning restores newest-wins.
        artifacts.pin("s1", "report", Some(1)).unwrap();
        assert_eq!(artifacts.latest("s1", "report").unwrap().unwrap().version, 1);
        artifacts.pin("s1", "report", None).unwrap();
        let newest = artifacts.latest("s1", "report").unwrap().unwrap();
        assert_eq!(newest.version, 3);
        assert!(!newest.pinned);

        assert!(matches!(
            artifacts.pin("s1", "report", Some(99)),
            Err(ArtifactError::NotFound)
        ));
    }

    #[test]
    fn carry_resolves_pinned_or_newest_and_skips_silently() {
        let dir = tempdir().unwrap();
        let artifacts = store_in(dir.path());
        let spec = spec("report", "Research report");
        artifacts
            .record(
                "builtin:research",
                &spec,
                "s1",
                Some(("inst-1", "research")),
                "old findings",
            )
            .unwrap();
        artifacts
            .record(
                "builtin:research",
                &spec,
                "s1",
                Some(("inst-1", "research")),
                "new findings",
            )
            .unwrap();

        let develop = stage(
            "develop",
            vec![
                CarrySpec {
                    from: "research".into(),
                    artifact: "report".into(),
                    as_label: None,
                },
                // A stage that never ran in this instance is skipped silently (pipelines loop).
                CarrySpec {
                    from: "test".into(),
                    artifact: "test-report".into(),
                    as_label: None,
                },
            ],
        );
        let carried = artifacts.resolve_carry("inst-1", &develop);
        assert_eq!(carried.len(), 1);
        assert_eq!(carried[0].label, "Research report");
        assert_eq!(carried[0].from_stage.as_deref(), Some("research"));
        assert_eq!(carried[0].version, 2);
        assert_eq!(carried[0].content, "new findings");

        // Pinning within the scope redirects the carry.
        artifacts.pin("s1", "report", Some(1)).unwrap();
        let carried = artifacts.resolve_carry("inst-1", &develop);
        assert_eq!(carried[0].version, 1);
        assert_eq!(carried[0].content, "old findings");
    }

    #[test]
    fn carry_applies_as_label_and_truncation_note() {
        let dir = tempdir().unwrap();
        let artifacts = store_in(dir.path());
        let spec = spec("report", "Research report");
        let long = "x".repeat(MAX_CARRY_CONTENT_BYTES + 10);
        artifacts
            .record(
                "builtin:research",
                &spec,
                "s1",
                Some(("inst-1", "research")),
                &long,
            )
            .unwrap();

        let develop = stage(
            "develop",
            vec![CarrySpec {
                from: "research".into(),
                artifact: "report".into(),
                as_label: Some("Prior research".into()),
            }],
        );
        let carried = artifacts.resolve_carry("inst-1", &develop);
        assert_eq!(carried.len(), 1);
        assert_eq!(carried[0].label, "Prior research (truncated to 32 KiB)");
        assert_eq!(carried[0].content.len(), MAX_CARRY_CONTENT_BYTES);
    }

    #[test]
    fn extract_artifact_blocks_captures_declared_marked_fences_only() {
        let declared = [spec("report", "Report"), spec("plan", "Plan")];
        let text = "Intro.\n\
                    ```artifact:report\nfindings\n```\n\
                    ```rust\nfn main() {}\n```\n\
                    ```artifact:unknown\nignored\n```\n\
                    ```markdown artifact:plan\n- [ ] step\n```\n";
        let blocks = extract_artifact_blocks(text, &declared);
        assert_eq!(
            blocks,
            vec![
                ("report".to_string(), "findings".to_string()),
                ("plan".to_string(), "- [ ] step".to_string()),
            ]
        );

        // Re-emitting an id within one text keeps the last block.
        let text = "```artifact:report\nfirst\n```\n```artifact:report\nsecond\n```";
        let blocks = extract_artifact_blocks(text, &declared);
        assert_eq!(blocks, vec![("report".to_string(), "second".to_string())]);

        // An unclosed fence captures nothing.
        assert!(extract_artifact_blocks("```artifact:report\ndangling", &declared).is_empty());
    }
}
