//! Workspace file listing and reading — backs `@`-file mentions in the prompt document.

use std::io::Read;
use std::path::{Component, Path};

/// Directories we never descend into when listing files.
const SKIP_DIRS: [&str; 9] =
    [".git", "node_modules", "target", "dist", "build", "vendor", ".next", "__pycache__", ".venv"];

const MAX_DEPTH: usize = 8;
/// Per-file cap when inlining a mentioned file into a prompt.
pub const MAX_FILE_CHARS: usize = 20_000;
/// Cap for the built-in viewer. Generous — it exists to refuse things that aren't really text
/// documents, not to truncate real source files the way the prompt cap does.
pub const MAX_VIEW_BYTES: usize = 2_000_000;

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

/// Resolve a workspace-relative path, refusing anything that leaves the workspace.
///
/// Every mutating operation goes through this. The checks are on the *string* rather than the
/// resolved path on purpose: `canonicalize` needs the file to exist, which is exactly what a
/// create or a rename target doesn't.
fn safe_path(cwd: &Path, rel: &str) -> Result<std::path::PathBuf, std::io::Error> {
    let rel = rel.trim().trim_matches('/');
    if rel.is_empty() || rel.starts_with('/') || rel.split('/').any(|c| c == ".." || c == ".") {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid path"));
    }
    Ok(cwd.join(rel))
}

fn already_exists(rel: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::AlreadyExists, format!("“{rel}” already exists"))
}

/// Create an empty file, making parent directories as needed.
///
/// Refuses to overwrite: a "new file" that silently truncates an existing one is data loss wearing
/// a friendly name.
pub fn create_file(cwd: &Path, rel: &str) -> Result<(), std::io::Error> {
    let path = safe_path(cwd, rel)?;
    if path.exists() {
        return Err(already_exists(rel));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, "")
}

/// Create a directory, and any missing parents.
pub fn create_dir(cwd: &Path, rel: &str) -> Result<(), std::io::Error> {
    let path = safe_path(cwd, rel)?;
    if path.exists() {
        return Err(already_exists(rel));
    }
    std::fs::create_dir_all(&path)
}

/// Read a file for viewing. Separate from [`read_file`], which truncates hard because its output
/// goes into a prompt; a viewer wants the whole file, so the cap here is only a guard against
/// opening something that isn't really text.
pub fn read_text(cwd: &Path, rel: &str) -> Result<String, std::io::Error> {
    let path = safe_path(cwd, rel)?;
    let bytes = std::fs::read(&path)?;
    if bytes.len() > MAX_VIEW_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("file is {} KB — too large to open here", bytes.len() / 1024),
        ));
    }
    // A NUL byte in the first block is the same heuristic `grep` uses to call a file binary.
    if bytes.iter().take(8000).any(|b| *b == 0) {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "binary file"));
    }
    String::from_utf8(bytes)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "not valid UTF-8"))
}

/// Images are the one binary the file pane and prompt compiler render rather than refuse, so they
/// get their own cap: a screenshot or design export is routinely bigger than a text file, but it
/// must still be bounded before either IPC transfer or base64 expansion.
pub const MAX_IMAGE_BYTES: usize = 16_000_000;

/// Read a file as raw bytes, for the image preview. Same path guard as everything else; no text
/// check, because "this isn't text" is precisely the case this exists to serve.
pub fn read_binary(cwd: &Path, rel: &str) -> Result<Vec<u8>, std::io::Error> {
    let path = safe_path(cwd, rel)?;
    let bytes = std::fs::read(&path)?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("file is {} MB — too large to preview here", bytes.len() / 1_000_000),
        ));
    }
    Ok(bytes)
}

/// Overwrite a file's contents. The file must already exist — this saves an edit, it doesn't
/// create, so a typo'd path fails loudly instead of leaving a stray file behind.
pub fn write_text(cwd: &Path, rel: &str, content: &str) -> Result<(), std::io::Error> {
    let path = safe_path(cwd, rel)?;
    if !path.is_file() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, format!("no such file: {rel}")));
    }
    std::fs::write(&path, content)
}

/// Rename or move. One operation, because on a filesystem they are one operation: renaming to a
/// path with a different parent *is* a move, which is what makes "type the new path" a complete
/// answer to both.
pub fn rename_path(cwd: &Path, from: &str, to: &str) -> Result<(), std::io::Error> {
    let src = safe_path(cwd, from)?;
    let dst = safe_path(cwd, to)?;
    if !src.exists() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, format!("no such path: {from}")));
    }
    if dst.exists() {
        return Err(already_exists(to));
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(&src, &dst)
}

/// Copy a file to a new path. Directories are refused — a recursive copy is a different operation
/// with different failure modes, and quietly doing one under "duplicate" would surprise.
pub fn copy_file(cwd: &Path, from: &str, to: &str) -> Result<(), std::io::Error> {
    let src = safe_path(cwd, from)?;
    let dst = safe_path(cwd, to)?;
    if src.is_dir() {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "can't duplicate a folder"));
    }
    if dst.exists() {
        return Err(already_exists(to));
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(&src, &dst).map(|_| ())
}

/// Delete a file, or a directory and everything in it.
///
/// `safe_path` rejects the empty string, so the workspace root can never be the target — the one
/// mistake here that would be unrecoverable.
pub fn delete_path(cwd: &Path, rel: &str) -> Result<(), std::io::Error> {
    let path = safe_path(cwd, rel)?;
    if path.is_dir() {
        std::fs::remove_dir_all(&path)
    } else {
        std::fs::remove_file(&path)
    }
}

/// How well a path answers a query, as a sort key — smaller is better.
///
/// The point is that a picker's first row should be the file you meant. Typing `main` wants
/// `src/main.rs`, not `docs/domain/maintenance.md` merely because `d` sorts before `s`. So a hit on
/// the file's own name outranks one that only matched some directory along the way, a name that
/// *starts* with the query outranks one that merely contains it, and shallower and shorter paths
/// win the ties — a top-level file is a likelier mention than something eight directories down.
///
/// With no query there is nothing to score, so every path lands in the same tier and the depth and
/// length tiebreaks do the work: the root of the workspace first, generated trees like `gen/` and
/// `icons/` after it, rather than whatever happens to start with an early letter.
fn rank(rel: &str, q: &str) -> (u8, usize, usize) {
    let lower = rel.to_lowercase();
    let name = lower.rsplit('/').next().unwrap_or(lower.as_str());
    let tier = if q.is_empty() {
        0
    } else if name.starts_with(q) {
        0
    } else if name.contains(q) {
        1
    } else {
        2 // matched a directory in the path, not the file itself
    };
    (tier, rel.matches('/').count(), rel.len())
}

/// List workspace-relative file paths under `cwd`, filtered by a case-insensitive substring query
/// and ordered by how well each one answers it. See [`rank`].
pub fn list_files(cwd: &Path, query: &str, limit: usize) -> Vec<String> {
    let mut out = Vec::new();
    let q = query.to_lowercase();
    walk(cwd, cwd, 0, &q, &mut out);
    // Rank the whole set, then cut. Cutting first — which is what sorting alphabetically and
    // truncating amounted to — could drop the exact file the query named.
    out.sort_by(|a, b| rank(a, &q).cmp(&rank(b, &q)).then_with(|| a.cmp(b)));
    out.truncate(limit);
    out
}

/// Matches collected before the walk gives up. Generous, because ranking needs to see the
/// candidates to order them, and bounded, because a home directory is not a workspace.
const SCAN_CAP: usize = 2_000;

fn walk(root: &Path, dir: &Path, depth: usize, q: &str, out: &mut Vec<String>) {
    if depth > MAX_DEPTH || out.len() >= SCAN_CAP {
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
            walk(root, &path, depth + 1, q, out);
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

fn canonical_workspace_file(cwd: &Path, rel: &str) -> std::io::Result<std::path::PathBuf> {
    let relative = Path::new(rel);
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || relative.components().any(|component| {
            matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_))
        })
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "path escapes the workspace",
        ));
    }

    let workspace = cwd.canonicalize()?;
    let path = workspace.join(relative).canonicalize()?;
    if !path.starts_with(&workspace) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "path escapes the workspace",
        ));
    }
    Ok(path)
}

fn image_too_large(size: u64) -> std::io::Error {
    std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        format!("image is {} MB — too large to attach", size / 1_000_000),
    )
}

fn read_bounded_image(path: &Path) -> std::io::Result<Vec<u8>> {
    let file = std::fs::File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "image path is not a file",
        ));
    }
    if metadata.len() > MAX_IMAGE_BYTES as u64 {
        return Err(image_too_large(metadata.len()));
    }

    // The metadata check avoids allocating for an already-large file. `take` also covers a regular
    // file that grows after that check, without ever reading an unbounded payload into memory.
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take((MAX_IMAGE_BYTES + 1) as u64).read_to_end(&mut bytes)?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(image_too_large(bytes.len() as u64));
    }
    Ok(bytes)
}

fn looks_like_svg(bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    let mut rest = text.strip_prefix('\u{feff}').unwrap_or(text);

    // XML declarations and comments before the document element are common in exported SVGs. Keep
    // this parser narrow: the first real element still has to be a lowercase `svg` root.
    loop {
        rest = rest.trim_start();
        if rest.starts_with("<?") {
            let Some(end) = rest.find("?>") else { return false };
            rest = &rest[end + 2..];
        } else if rest.starts_with("<!--") {
            let Some(end) = rest.find("-->") else { return false };
            rest = &rest[end + 3..];
        } else {
            break;
        }
    }

    let Some(after_name) = rest.strip_prefix("<svg") else { return false };
    let valid_boundary = after_name.chars().next().is_some_and(|character| {
        character.is_whitespace() || character == '>' || character == '/'
    });
    valid_boundary && after_name.contains('>')
}

fn detected_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if looks_like_svg(bytes) {
        Some("image/svg+xml")
    } else {
        None
    }
}

/// Read a workspace-contained image and return `(mime, base64)` for an ACP image content block.
pub fn read_image_base64(cwd: &Path, rel: &str) -> std::io::Result<(String, String)> {
    let expected_mime = image_mime(rel)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "not an image"))?;
    let path = canonical_workspace_file(cwd, rel)?;
    let bytes = read_bounded_image(&path)?;
    let detected_mime = detected_image_mime(&bytes).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "file content is not a supported image",
        )
    })?;
    if detected_mime != expected_mime {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("image content is {detected_mime}, not {expected_mime}"),
        ));
    }
    Ok((expected_mime.to_string(), base64_encode(&bytes)))
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

    const TINY_PNG: &[u8] = &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x00, 0x00, 0xb5,
        0x1c, 0x0c, 0x02, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x64,
        0xf8, 0x0f, 0x00, 0x01, 0x05, 0x01, 0x01, 0x27, 0x18, 0xe3, 0x66, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];

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
    fn rename_moves_across_directories() {
        let dir = fixture();
        // Renaming to a different parent is a move — the same call, because it's the same syscall.
        rename_path(&dir, "README.md", "src/docs/README.md").unwrap();
        assert!(!dir.join("README.md").exists());
        assert_eq!(std::fs::read_to_string(dir.join("src/docs/README.md")).unwrap(), "# hi");

        assert!(rename_path(&dir, "nope.md", "x.md").is_err(), "missing source");
        assert!(rename_path(&dir, "src/main.rs", "src/lib.rs").is_err(), "won't clobber");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_text_refuses_to_create() {
        let dir = fixture();
        write_text(&dir, "src/main.rs", "fn main() { todo!() }").unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("src/main.rs")).unwrap(), "fn main() { todo!() }");
        // Saving to a path that doesn't exist is a typo, not an instruction to create one.
        assert!(write_text(&dir, "src/typo.rs", "x").is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_text_refuses_binary() {
        let dir = fixture();
        std::fs::write(dir.join("blob.bin"), [0x00u8, 0x01, 0x02]).unwrap();
        assert!(read_text(&dir, "blob.bin").is_err());
        assert_eq!(read_text(&dir, "README.md").unwrap(), "# hi");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_removes_trees_but_the_root_is_unreachable() {
        let dir = fixture();
        delete_path(&dir, "src").unwrap();
        assert!(!dir.join("src").exists());

        // The one unrecoverable mistake: no spelling of "the workspace itself" is accepted.
        for root in ["", " ", "/", ".", "..", "src/.."] {
            assert!(delete_path(&dir, root).is_err(), "{root:?} must not be deletable");
        }
        assert!(dir.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn copy_file_duplicates_and_refuses_folders() {
        let dir = fixture();
        copy_file(&dir, "README.md", "README copy.md").unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("README copy.md")).unwrap(), "# hi");
        assert!(copy_file(&dir, "src", "src2").is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn create_dir_makes_parents_and_refuses_to_clobber() {
        let dir = fixture();
        create_dir(&dir, "a/b/c").unwrap();
        assert!(dir.join("a/b/c").is_dir());
        assert!(create_dir(&dir, "src").is_err());

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
    fn the_best_match_comes_first_and_survives_the_limit() {
        let dir = fixture();
        std::fs::create_dir_all(dir.join("apps/main/deep")).unwrap();
        // Alphabetically this is the *first* of the three; by relevance it's last, because "main"
        // only appears in a directory it sits under.
        std::fs::write(dir.join("apps/main/deep/a.rs"), "").unwrap();
        std::fs::write(dir.join("apps/mainframe.rs"), "").unwrap();

        let hits = list_files(&dir, "main", 100);
        assert_eq!(
            hits,
            vec![
                "src/main.rs".to_string(),      // name starts with the query, shallow
                "apps/mainframe.rs".to_string(), // name starts with it too, but longer
                "apps/main/deep/a.rs".to_string(), // only the directory matched
            ],
        );
        // And the one you meant is still there when only one row fits.
        assert_eq!(list_files(&dir, "main", 1), vec!["src/main.rs".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_empty_query_puts_the_workspace_root_first() {
        let dir = fixture();
        std::fs::create_dir_all(dir.join("gen/schemas")).unwrap();
        std::fs::write(dir.join("gen/schemas/acl.json"), "").unwrap();

        let all = list_files(&dir, "", 100);
        let root = all.iter().position(|p| p == "README.md").unwrap();
        let deep = all.iter().position(|p| p == "gen/schemas/acl.json").unwrap();
        assert!(root < deep, "generated trees shouldn't crowd out the root: {all:?}");
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
    fn image_mime_and_read_valid_image() {
        assert_eq!(image_mime("a/b.PNG"), Some("image/png"));
        assert_eq!(image_mime("a/b.jpeg"), Some("image/jpeg"));
        assert_eq!(image_mime("a/b.rs"), None);

        let dir = std::env::temp_dir().join(format!("codetwo-img-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("x.png"), TINY_PNG).unwrap();
        let (mime, b64) = read_image_base64(&dir, "x.png").unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(b64, base64_encode(TINY_PNG));
        assert!(read_image_base64(&dir, "x.rs").is_err(), "non-images rejected");
        assert!(read_image_base64(&dir, "../x.png").is_err(), "escapes rejected");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn image_read_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let dir = std::env::temp_dir().join(format!("codetwo-img-root-{}", uuid::Uuid::new_v4()));
        let outside = std::env::temp_dir().join(format!("codetwo-img-outside-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.png"), TINY_PNG).unwrap();
        symlink(outside.join("secret.png"), dir.join("escape.png")).unwrap();

        let error = read_image_base64(&dir, "escape.png").unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::PermissionDenied);

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn image_read_rejects_oversize_file_before_encoding() {
        let dir = std::env::temp_dir().join(format!("codetwo-img-size-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("huge.png");
        std::fs::write(&path, TINY_PNG).unwrap();
        std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len((MAX_IMAGE_BYTES + 1) as u64)
            .unwrap();

        let error = read_image_base64(&dir, "huge.png").unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
        assert!(error.to_string().contains("too large"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn image_read_rejects_extension_content_mismatch_and_arbitrary_bytes() {
        let dir = std::env::temp_dir().join(format!("codetwo-img-mismatch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("png-as-jpeg.jpg"), TINY_PNG).unwrap();
        std::fs::write(dir.join("text.png"), b"not actually an image").unwrap();

        for rel in ["png-as-jpeg.jpg", "text.png"] {
            let error = read_image_base64(&dir, rel).unwrap_err();
            assert_eq!(error.kind(), std::io::ErrorKind::InvalidData, "{rel}");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn lang_hints() {
        assert_eq!(lang_for("src/main.rs"), "rust");
        assert_eq!(lang_for("a/b.tsx"), "tsx");
        assert_eq!(lang_for("x.unknown"), "");
    }
}
