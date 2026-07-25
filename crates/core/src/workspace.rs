//! Workspace file listing and reading — backs `@`-file mentions in the prompt document.

use std::path::Path;

/// Directories we never descend into when listing files.
const SKIP_DIRS: [&str; 9] =
    [".git", "node_modules", "target", "dist", "build", "vendor", ".next", "__pycache__", ".venv"];

const MAX_DEPTH: usize = 8;
/// Per-file cap when inlining a mentioned file into a prompt.
pub const MAX_FILE_CHARS: usize = 20_000;

/// One entry in a directory listing.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct DirEntry {
    /// Name on its own, for display.
    pub name: String,
    /// Workspace-relative path, which is what an `@` mention needs.
    pub path: String,
    pub is_dir: bool,
}

/// List a single directory level under `cwd`.
///
/// The recursive [`list_files`] is the right shape for a search box, which is where it's used, but
/// wrong for a tree: it caps its output, and past that cap files simply aren't there with nothing
/// saying so. A tree expands one level at a time, so it never needs a cap and never lies about a
/// large repository.
///
/// Rejects absolute paths and `..` escapes, same as [`read_file`].
pub fn list_dir(cwd: &Path, rel: &str) -> Result<Vec<DirEntry>, std::io::Error> {
    if rel.starts_with('/') || rel.split('/').any(|c| c == "..") {
        return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "path escapes the workspace"));
    }
    let dir = if rel.is_empty() { cwd.to_path_buf() } else { cwd.join(rel) };

    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir)?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.path().is_dir();
        // Same exclusions as the search: a tree full of node_modules is a tree nobody can use.
        if name.starts_with('.') || (is_dir && SKIP_DIRS.contains(&name.as_str())) {
            continue;
        }
        let path = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        out.push(DirEntry { name, path, is_dir });
    }
    // Directories first, then case-insensitive by name — the order every file tree uses.
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

/// Create an empty file at a workspace-relative path, making parent directories as needed.
///
/// Refuses to overwrite: "new file" that silently truncates an existing one is a data-loss bug
/// wearing a friendly name. Same escape rejection as [`read_file`].
pub fn create_file(cwd: &Path, rel: &str) -> Result<(), std::io::Error> {
    let rel = rel.trim();
    if rel.is_empty() || rel.starts_with('/') || rel.split('/').any(|c| c == "..") {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid path"));
    }
    let path = cwd.join(rel);
    if path.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            format!("“{rel}” already exists"),
        ));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, "")
}

/// List workspace-relative file paths under `cwd`, filtered by a case-insensitive substring query.
pub fn list_files(cwd: &Path, query: &str, limit: usize) -> Vec<String> {
    let mut out = Vec::new();
    let q = query.to_lowercase();
    walk(cwd, cwd, 0, &q, limit, &mut out);
    out.sort();
    out.truncate(limit);
    out
}

fn walk(root: &Path, dir: &Path, depth: usize, q: &str, limit: usize, out: &mut Vec<String>) {
    if depth > MAX_DEPTH || out.len() >= limit.saturating_mul(4) {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            walk(root, &path, depth + 1, q, limit, out);
        } else {
            let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
            if q.is_empty() || rel.to_lowercase().contains(q) {
                out.push(rel);
            }
        }
    }
}

/// Read a workspace-relative file, truncated. Rejects absolute paths and `..` escapes.
pub fn read_file(cwd: &Path, rel: &str) -> std::io::Result<String> {
    if rel.starts_with('/') || rel.split('/').any(|c| c == "..") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "path escapes the workspace",
        ));
    }
    let text = std::fs::read_to_string(cwd.join(rel))?;
    Ok(text.chars().take(MAX_FILE_CHARS).collect())
}

/// MIME type for an image path, or `None` if it isn't a supported image.
pub fn image_mime(rel: &str) -> Option<&'static str> {
    match rel.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

/// Read an image and return `(mime, base64)` for an ACP image content block.
pub fn read_image_base64(cwd: &Path, rel: &str) -> std::io::Result<(String, String)> {
    if rel.starts_with('/') || rel.split('/').any(|c| c == "..") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "path escapes the workspace",
        ));
    }
    let mime = image_mime(rel)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "not an image"))?;
    let bytes = std::fs::read(cwd.join(rel))?;
    Ok((mime.to_string(), base64_encode(&bytes)))
}

/// Minimal standard base64 encoder (avoids pulling in a dependency for one call site).
pub fn base64_encode(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b1 = chunk[0] as u32;
        let b2 = *chunk.get(1).unwrap_or(&0) as u32;
        let b3 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b1 << 16) | (b2 << 8) | b3;
        out.push(T[(n >> 18 & 63) as usize] as char);
        out.push(T[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    out
}

/// A fenced-code language hint from a file extension (best effort).
pub fn lang_for(rel: &str) -> &'static str {
    match rel.rsplit('.').next().unwrap_or("") {
        "rs" => "rust",
        "ts" | "mts" | "cts" => "typescript",
        "tsx" => "tsx",
        "js" | "mjs" | "cjs" => "javascript",
        "jsx" => "jsx",
        "py" => "python",
        "go" => "go",
        "java" => "java",
        "rb" => "ruby",
        "sh" | "bash" | "zsh" => "bash",
        "json" => "json",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "md" => "markdown",
        "css" => "css",
        "html" => "html",
        "sql" => "sql",
        _ => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("codetwo-ws-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();
        std::fs::create_dir_all(dir.join(".git")).unwrap();
        std::fs::write(dir.join("src/main.rs"), "fn main() {}").unwrap();
        std::fs::write(dir.join("src/lib.rs"), "pub fn x() {}").unwrap();
        std::fs::write(dir.join("README.md"), "# hi").unwrap();
        std::fs::write(dir.join("node_modules/pkg/index.js"), "junk").unwrap();
        std::fs::write(dir.join(".git/config"), "junk").unwrap();
        dir
    }

    #[test]
    fn create_file_makes_parents_and_refuses_to_clobber() {
        let dir = fixture();

        create_file(&dir, "src/new/deep.rs").unwrap();
        assert!(dir.join("src/new/deep.rs").exists(), "parents are created");

        // The existing README must survive a second "new file" with the same name.
        let before = std::fs::read_to_string(dir.join("README.md")).unwrap();
        assert!(create_file(&dir, "README.md").is_err());
        assert_eq!(std::fs::read_to_string(dir.join("README.md")).unwrap(), before);

        assert!(create_file(&dir, "../escape.txt").is_err());
        assert!(create_file(&dir, "").is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_dir_puts_directories_first_and_skips_noise() {
        let dir = fixture();
        let top = list_dir(&dir, "").unwrap();
        let names: Vec<&str> = top.iter().map(|e| e.name.as_str()).collect();

        assert_eq!(names, vec!["src", "README.md"], "dirs first, then files");
        assert!(top[0].is_dir);
        // node_modules and .git never appear — a tree full of them is a tree nobody can use.
        assert!(!names.contains(&"node_modules"));
        assert!(!names.contains(&".git"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_dir_paths_are_workspace_relative() {
        let dir = fixture();
        let src = list_dir(&dir, "src").unwrap();
        let paths: Vec<&str> = src.iter().map(|e| e.path.as_str()).collect();
        // The path is what an `@` mention needs, so it has to carry the parent.
        assert_eq!(paths, vec!["src/lib.rs", "src/main.rs"]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_dir_rejects_escapes() {
        let dir = fixture();
        assert!(list_dir(&dir, "../..").is_err());
        assert!(list_dir(&dir, "/etc").is_err());
        assert!(list_dir(&dir, "src/../..").is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn lists_files_and_skips_noise() {
        let dir = fixture();
        let all = list_files(&dir, "", 100);
        assert!(all.contains(&"src/main.rs".to_string()));
        assert!(all.contains(&"README.md".to_string()));
        assert!(!all.iter().any(|p| p.contains("node_modules")), "should skip node_modules");
        assert!(!all.iter().any(|p| p.contains(".git/")), "should skip .git");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn query_filters_and_limit_applies() {
        let dir = fixture();
        let rs = list_files(&dir, "main", 100);
        assert_eq!(rs, vec!["src/main.rs".to_string()]);
        assert!(list_files(&dir, "", 1).len() <= 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_file_and_blocks_escapes() {
        let dir = fixture();
        assert_eq!(read_file(&dir, "src/main.rs").unwrap(), "fn main() {}");
        assert!(read_file(&dir, "../secret").is_err());
        assert!(read_file(&dir, "/etc/passwd").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"hello world"), "aGVsbG8gd29ybGQ=");
    }

    #[test]
    fn image_mime_and_read() {
        assert_eq!(image_mime("a/b.PNG"), Some("image/png"));
        assert_eq!(image_mime("a/b.jpeg"), Some("image/jpeg"));
        assert_eq!(image_mime("a/b.rs"), None);

        let dir = std::env::temp_dir().join(format!("codetwo-img-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("x.png"), b"foo").unwrap();
        let (mime, b64) = read_image_base64(&dir, "x.png").unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(b64, "Zm9v");
        assert!(read_image_base64(&dir, "x.rs").is_err(), "non-images rejected");
        assert!(read_image_base64(&dir, "../x.png").is_err(), "escapes rejected");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn lang_hints() {
        assert_eq!(lang_for("src/main.rs"), "rust");
        assert_eq!(lang_for("a/b.tsx"), "tsx");
        assert_eq!(lang_for("x.unknown"), "");
    }
}
