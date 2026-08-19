//! Project rules — the "always-on" instructions a repo ships for coding agents.
//!
//! Codex reads `AGENTS.md`, Cursor reads `.cursorrules` / `.cursor/rules/*`, Claude Code reads
//! `CLAUDE.md`. C2 loads whichever of these exist in the working directory and prepends them to
//! every compiled prompt, so a repo's conventions travel with the session regardless of provider.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Files we look for, in priority order.
pub const RULE_FILES: [&str; 5] = [
    "AGENTS.md",
    "CLAUDE.md",
    ".cursorrules",
    ".github/copilot-instructions.md",
    ".codetwo/rules.md",
];

/// Per-file cap so a huge rules file can't swamp the prompt.
const MAX_RULE_CHARS: usize = 8000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectRule {
    /// Path relative to the working directory.
    pub path: String,
    pub text: String,
}

/// Load all rule files present under `cwd` (plus `.cursor/rules/*.md`/`.mdc`).
pub fn load(cwd: &Path) -> Vec<ProjectRule> {
    let mut out = Vec::new();

    for name in RULE_FILES {
        let p = cwd.join(name);
        if let Some(rule) = read_rule(&p, name) {
            out.push(rule);
        }
    }

    // Cursor's newer layout: .cursor/rules/*.md(c)
    let dir = cwd.join(".cursor").join("rules");
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let mut paths: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
        paths.sort();
        for p in paths {
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
            if ext == "md" || ext == "mdc" {
                let rel = format!(".cursor/rules/{}", p.file_name().and_then(|s| s.to_str()).unwrap_or(""));
                if let Some(rule) = read_rule(&p, &rel) {
                    out.push(rule);
                }
            }
        }
    }

    out
}

fn read_rule(path: &Path, rel: &str) -> Option<ProjectRule> {
    let text = std::fs::read_to_string(path).ok()?;
    if text.trim().is_empty() {
        return None;
    }
    let truncated: String = text.chars().take(MAX_RULE_CHARS).collect();
    Some(ProjectRule { path: rel.to_string(), text: truncated.trim().to_string() })
}

/// Render loaded rules as a markdown block to prepend to a prompt. Empty when there are none.
pub fn to_context(rules: &[ProjectRule]) -> String {
    if rules.is_empty() {
        return String::new();
    }
    let mut s = String::from("## Project rules\n");
    for r in rules {
        s.push_str(&format!("\n### {}\n{}\n", r.path, r.text));
    }
    s.trim_end().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_known_rule_files_and_cursor_dir() {
        let dir = std::env::temp_dir().join(format!("codetwo-rules-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join(".cursor").join("rules")).unwrap();
        std::fs::write(dir.join("AGENTS.md"), "Use tabs.").unwrap();
        std::fs::write(dir.join(".cursorrules"), "Prefer small functions.").unwrap();
        std::fs::write(dir.join(".cursor/rules/style.md"), "No unwrap in prod.").unwrap();
        std::fs::write(dir.join("empty.md"), "").unwrap();

        let rules = load(&dir);
        let paths: Vec<&str> = rules.iter().map(|r| r.path.as_str()).collect();
        assert!(paths.contains(&"AGENTS.md"));
        assert!(paths.contains(&".cursorrules"));
        assert!(paths.contains(&".cursor/rules/style.md"));

        let ctx = to_context(&rules);
        assert!(ctx.starts_with("## Project rules"));
        assert!(ctx.contains("Use tabs."));
        assert!(ctx.contains("No unwrap in prod."));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_rules_yields_empty_context() {
        let dir = std::env::temp_dir().join(format!("codetwo-rules-none-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(load(&dir).is_empty());
        assert_eq!(to_context(&[]), "");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
