//! Private prompt-image intake.
//!
//! Clipboard and file-input bytes cross the desktop bridge once, are decoded and normalized here,
//! and are then addressed by an opaque id. The original path and active source formats never enter
//! a prompt document.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const ATTACHMENT_DIR: &str = "attachments";
const MAX_METADATA_BYTES: u64 = 16 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PromptAttachment {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AttachmentMetadata {
    id: String,
    name: String,
    mime_type: String,
    width: u32,
    height: u32,
    created_at: i64,
}

fn display_name(input: &str) -> String {
    let one_line = input.replace(['\r', '\n'], " ");
    let leaf = one_line.rsplit(['/', '\\']).next().unwrap_or("").trim();
    let bounded = leaf.chars().take(160).collect::<String>();
    if bounded.is_empty() {
        "Image.png".into()
    } else {
        bounded
    }
}

fn validate_id(id: &str) -> Result<(), String> {
    let parsed = uuid::Uuid::parse_str(id).map_err(|_| "attachment id is invalid".to_string())?;
    if parsed.hyphenated().to_string() != id.to_ascii_lowercase() {
        return Err("attachment id is invalid".into());
    }
    Ok(())
}

fn attachment_root(data_dir: &Path) -> Result<PathBuf, String> {
    let requested = data_dir.join(ATTACHMENT_DIR);
    fs::create_dir_all(&requested).map_err(|error| error.to_string())?;
    let metadata = fs::symlink_metadata(&requested).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("attachment directory is invalid".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&requested, fs::Permissions::from_mode(0o700))
            .map_err(|error| error.to_string())?;
    }
    requested
        .canonicalize()
        .map_err(|_| "attachment directory is invalid".to_string())
}

fn write_private_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())
}

fn private_file(root: &Path, file_name: &str, label: &str) -> Result<PathBuf, String> {
    let requested = root.join(file_name);
    let metadata = fs::symlink_metadata(&requested)
        .map_err(|_| format!("attachment {label} is unavailable"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("attachment {label} is invalid"));
    }
    let canonical = requested
        .canonicalize()
        .map_err(|_| format!("attachment {label} is invalid"))?;
    if !canonical.starts_with(root) {
        return Err(format!("attachment {label} is invalid"));
    }
    Ok(canonical)
}

pub fn import_prompt_attachment(
    data_dir: &Path,
    name: &str,
    declared_mime: Option<&str>,
    bytes: &[u8],
    created_at: i64,
) -> Result<PromptAttachment, String> {
    let normalized =
        crate::canvas::normalize_media(bytes, declared_mime).map_err(|error| error.to_string())?;
    let root = attachment_root(data_dir)?;
    let id = uuid::Uuid::new_v4().hyphenated().to_string();
    let image_path = root.join(format!("{id}.png"));
    let metadata_path = root.join(format!("{id}.json"));
    let metadata = AttachmentMetadata {
        id: id.clone(),
        name: display_name(name),
        mime_type: normalized.mime_type.clone(),
        width: normalized.width,
        height: normalized.height,
        created_at,
    };
    let metadata_bytes = serde_json::to_vec(&metadata).map_err(|error| error.to_string())?;

    write_private_new(&image_path, &normalized.bytes)?;
    if let Err(error) = write_private_new(&metadata_path, &metadata_bytes) {
        let _ = fs::remove_file(&image_path);
        return Err(error);
    }

    Ok(PromptAttachment {
        id,
        name: metadata.name,
        mime_type: normalized.mime_type,
        width: normalized.width,
        height: normalized.height,
        bytes: normalized.bytes,
    })
}

pub fn load_prompt_attachment(data_dir: &Path, id: &str) -> Result<PromptAttachment, String> {
    validate_id(id)?;
    let root = attachment_root(data_dir)?;
    let image_path = private_file(&root, &format!("{id}.png"), "image")?;
    let metadata_path = private_file(&root, &format!("{id}.json"), "metadata")?;
    let metadata_size = fs::metadata(&metadata_path)
        .map_err(|error| error.to_string())?
        .len();
    if metadata_size == 0 || metadata_size > MAX_METADATA_BYTES {
        return Err("attachment metadata is invalid".into());
    }
    let metadata: AttachmentMetadata =
        serde_json::from_slice(&fs::read(&metadata_path).map_err(|error| error.to_string())?)
            .map_err(|_| "attachment metadata is invalid".to_string())?;
    if metadata.id != id || metadata.mime_type != "image/png" {
        return Err("attachment metadata does not match the image".into());
    }
    let image_size = fs::metadata(&image_path)
        .map_err(|error| error.to_string())?
        .len();
    if image_size == 0 || image_size > crate::canvas::MAX_CANVAS_OUTPUT_BYTES as u64 {
        return Err("attachment image is invalid".into());
    }
    let stored = fs::read(&image_path).map_err(|error| error.to_string())?;
    let normalized = crate::canvas::normalize_media(&stored, Some("image/png"))
        .map_err(|error| format!("attachment image is invalid: {error}"))?;
    if normalized.width != metadata.width || normalized.height != metadata.height {
        return Err("attachment metadata does not match the image".into());
    }
    Ok(PromptAttachment {
        id: id.to_string(),
        name: display_name(&metadata.name),
        mime_type: normalized.mime_type,
        width: normalized.width,
        height: normalized.height,
        bytes: normalized.bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine as _;

    fn png() -> Vec<u8> {
        base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
            .unwrap()
    }

    #[test]
    fn import_normalizes_private_pixels_and_loads_only_by_opaque_id() {
        let data = tempfile::tempdir().unwrap();
        let stored =
            import_prompt_attachment(data.path(), "../shot\n.png", Some("image/png"), &png(), 42)
                .unwrap();
        assert_eq!(stored.name, "shot .png");
        assert_eq!(stored.mime_type, "image/png");
        assert_eq!(stored.width, 1);
        assert_eq!(stored.height, 1);

        let loaded = load_prompt_attachment(data.path(), &stored.id).unwrap();
        assert_eq!(loaded, stored);
        assert!(load_prompt_attachment(data.path(), "../../escape").is_err());
    }
}
