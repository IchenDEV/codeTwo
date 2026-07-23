//! Workspace file listing and reading — backs `@`-file mentions in the prompt document.

use std::path::Path;

/// Directories we never descend into when listing files.
const SKIP_DIRS: [&str; 9] =
    [".git", "node_modules", "target", "dist", "build", "vendor", ".next", "__pycache__", ".venv"];

const MAX_DEPTH: usize = 8;
/// Per-file cap when inlining a mentioned file into a prompt.
pub const MAX_FILE_CHARS: usize = 20_000;

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
    fn lang_hints() {
        assert_eq!(lang_for("src/main.rs"), "rust");
        assert_eq!(lang_for("a/b.tsx"), "tsx");
        assert_eq!(lang_for("x.unknown"), "");
    }
}
