//! Import standard `SKILL.md` files from a GitHub repository into Code2's local skill library.
//!
//! Repository access is deliberately narrow: HTTPS GitHub URLs (or `owner/repo` shorthand), a
//! shallow non-interactive clone, bounded traversal, and small text-only skill manifests. Imported
//! instructions are inlined so every ACP provider receives them even when it has no native skill
//! installation mechanism.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use thiserror::Error;
use tokio::process::Command;

use crate::harness::parse_frontmatter;
use crate::skill::{Skill, SkillPayload};

const MAX_SKILLS: usize = 100;
const MAX_ENTRIES: usize = 20_000;
const MAX_DEPTH: usize = 10;
const MAX_SKILL_BYTES: u64 = 512 * 1024;
const CLONE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubRepoSpec {
    pub owner: String,
    pub repo: String,
    pub reference: Option<String>,
    pub subpath: Option<PathBuf>,
}

impl GitHubRepoSpec {
    pub fn source(&self) -> String {
        format!("GitHub · {}/{}", self.owner, self.repo)
    }

    fn clone_url(&self) -> String {
        format!("https://github.com/{}/{}.git", self.owner, self.repo)
    }
}

#[derive(Debug)]
pub struct GitHubSkillBundle {
    pub source: String,
    pub skills: Vec<Skill>,
}

/// A short-lived, verified checkout. The directory is removed automatically when the value drops.
pub struct GitHubCheckout {
    pub root: PathBuf,
    pub spec: GitHubRepoSpec,
}

impl GitHubCheckout {
    pub fn selected_root(&self) -> Result<PathBuf, GitHubSkillError> {
        let canonical_root = self.root.canonicalize()?;
        let selected = self
            .spec
            .subpath
            .as_ref()
            .map_or_else(|| self.root.clone(), |path| self.root.join(path));
        let selected = selected.canonicalize()?;
        if !selected.starts_with(&canonical_root) {
            return Err(GitHubSkillError::OutsideCheckout);
        }
        Ok(selected)
    }
}

impl Drop for GitHubCheckout {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[derive(Debug, Error)]
pub enum GitHubSkillError {
    #[error("{0}")]
    InvalidRepository(String),
    #[error("Git is not available on PATH")]
    GitUnavailable,
    #[error("GitHub download timed out after 60 seconds")]
    Timeout,
    #[error("Could not download the repository: {0}")]
    Clone(String),
    #[error("Could not read the repository: {0}")]
    Io(#[from] std::io::Error),
    #[error("The selected repository path is outside the checkout")]
    OutsideCheckout,
    #[error("Repository scan exceeded the {0}-entry safety limit")]
    TooManyEntries(usize),
    #[error("Repository contains more than {0} skills; choose a specific /tree/ path")]
    TooManySkills(usize),
    #[error("No readable SKILL.md files were found in the selected repository path")]
    NoSkills,
}

/// Accept `owner/repo`, a repository URL, or a GitHub `/tree/<ref>/<path>` / `blob` URL.
pub fn parse_repository(input: &str) -> Result<GitHubRepoSpec, GitHubSkillError> {
    let raw = input.trim().trim_end_matches('/');
    if raw.is_empty() || raw.chars().any(char::is_whitespace) {
        return Err(invalid("Enter owner/repo or a GitHub repository URL"));
    }
    if raw.contains(['?', '#', '%', '\\']) {
        return Err(invalid(
            "GitHub URLs with query strings, fragments, or escapes are not supported",
        ));
    }

    let path = if let Some(rest) = raw.strip_prefix("https://github.com/") {
        rest
    } else if raw.contains("://") || raw.starts_with("git@") {
        return Err(invalid("Only HTTPS github.com URLs are supported"));
    } else {
        raw
    };

    let parts: Vec<&str> = path.split('/').filter(|part| !part.is_empty()).collect();
    if parts.len() < 2 {
        return Err(invalid(
            "A GitHub repository must include both owner and repository",
        ));
    }
    let owner = parts[0];
    let repo = parts[1].strip_suffix(".git").unwrap_or(parts[1]);
    if !valid_repo_part(owner) || !valid_repo_part(repo) {
        return Err(invalid(
            "Owner and repository may only contain letters, numbers, '.', '_' and '-'",
        ));
    }

    let (reference, mut subpath) = if parts.len() == 2 {
        (None, Vec::new())
    } else if parts.len() >= 4 && matches!(parts[2], "tree" | "blob") {
        let reference = parts[3];
        if !valid_reference(reference) {
            return Err(invalid("The Git reference in this URL is not supported"));
        }
        let mut subpath = parts[4..].to_vec();
        if parts[2] == "blob" {
            if subpath.last().copied() != Some("SKILL.md") {
                return Err(invalid("A GitHub blob URL must point to SKILL.md"));
            }
            subpath.pop();
        }
        (Some(reference.to_string()), subpath)
    } else {
        return Err(invalid("Use a repository URL or a /tree/<ref>/<path> link"));
    };

    if subpath.iter().any(|part| !valid_path_part(part)) {
        return Err(invalid(
            "The repository path contains an unsupported component",
        ));
    }

    Ok(GitHubRepoSpec {
        owner: owner.to_string(),
        repo: repo.to_string(),
        reference,
        subpath: (!subpath.is_empty()).then(|| subpath.drain(..).collect()),
    })
}

/// Download and parse the repository. Persistence stays with the caller so it can be transactional
/// with its own library refresh.
pub async fn fetch(repository: &str) -> Result<GitHubSkillBundle, GitHubSkillError> {
    let checkout = checkout(repository).await?;
    let skills = skills_from_checkout(&checkout.root, &checkout.spec)?;
    Ok(GitHubSkillBundle {
        source: checkout.spec.source(),
        skills,
    })
}

/// Download a public GitHub repository into a bounded, non-interactive temporary checkout.
pub async fn checkout(repository: &str) -> Result<GitHubCheckout, GitHubSkillError> {
    let spec = parse_repository(repository)?;
    let checkout =
        std::env::temp_dir().join(format!("codetwo-github-skills-{}", uuid::Uuid::new_v4()));
    let cleanup = TempCheckout(checkout.clone());

    let mut command = Command::new("git");
    command
        .arg("clone")
        .args([
            "--depth",
            "1",
            "--single-branch",
            "--filter=blob:limit=1048576",
        ])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LFS_SKIP_SMUDGE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    if let Some(reference) = &spec.reference {
        command.arg(format!("--branch={reference}"));
    }
    command.arg("--").arg(spec.clone_url()).arg(&checkout);

    let output = tokio::time::timeout(CLONE_TIMEOUT, command.output())
        .await
        .map_err(|_| GitHubSkillError::Timeout)?
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GitHubSkillError::GitUnavailable
            } else {
                GitHubSkillError::Io(error)
            }
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.lines().last().unwrap_or("git clone failed");
        return Err(GitHubSkillError::Clone(detail.chars().take(500).collect()));
    }

    std::mem::forget(cleanup);
    Ok(GitHubCheckout {
        root: checkout,
        spec,
    })
}

/// Parse an already available checkout. Public for deterministic tests and future local-repo UI.
pub fn skills_from_checkout(
    root: &Path,
    spec: &GitHubRepoSpec,
) -> Result<Vec<Skill>, GitHubSkillError> {
    let canonical_root = root.canonicalize()?;
    let selected = spec
        .subpath
        .as_ref()
        .map_or_else(|| root.to_path_buf(), |path| root.join(path));
    let canonical_selected = selected.canonicalize()?;
    if !canonical_selected.starts_with(&canonical_root) {
        return Err(GitHubSkillError::OutsideCheckout);
    }

    let mut manifests = Vec::new();
    let mut visited = 0;
    collect_manifests(&canonical_selected, 0, &mut visited, &mut manifests)?;
    manifests.sort();
    if manifests.is_empty() {
        return Err(GitHubSkillError::NoSkills);
    }
    if manifests.len() > MAX_SKILLS {
        return Err(GitHubSkillError::TooManySkills(MAX_SKILLS));
    }

    let source = spec.source();
    let mut skills = Vec::with_capacity(manifests.len());
    for manifest in manifests {
        let metadata = std::fs::metadata(&manifest)?;
        if metadata.len() > MAX_SKILL_BYTES {
            continue;
        }
        let text = match std::fs::read_to_string(&manifest) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::InvalidData => continue,
            Err(error) => return Err(error.into()),
        };
        let instructions = markdown_body(&text).trim();
        if instructions.is_empty() {
            continue;
        }
        let fallback = manifest
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .unwrap_or("GitHub skill");
        let (name, description) = parse_frontmatter(&text);
        let name = name.unwrap_or_else(|| fallback.to_string());
        let description = truncate(description.unwrap_or_default(), 280);
        let relative = manifest
            .strip_prefix(&canonical_root)
            .unwrap_or(&manifest)
            .to_string_lossy();
        let id = github_skill_id(spec, &relative);
        skills.push(Skill {
            id,
            name: name.clone(),
            description,
            icon: None,
            source: Some(source.clone()),
            payload: SkillPayload::AgentSkill {
                skill_ref: name,
                inline_text: Some(instructions.to_string()),
            },
        });
    }
    if skills.is_empty() {
        return Err(GitHubSkillError::NoSkills);
    }
    Ok(skills)
}

fn collect_manifests(
    dir: &Path,
    depth: usize,
    visited: &mut usize,
    manifests: &mut Vec<PathBuf>,
) -> Result<(), GitHubSkillError> {
    if depth > MAX_DEPTH {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
        *visited += 1;
        if *visited > MAX_ENTRIES {
            return Err(GitHubSkillError::TooManyEntries(MAX_ENTRIES));
        }
        let entry = entry?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_file() && entry.file_name() == "SKILL.md" {
            manifests.push(path);
            continue;
        }
        if !metadata.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if matches!(name.as_ref(), ".git" | "node_modules" | "target" | ".venv") {
            continue;
        }
        collect_manifests(&path, depth + 1, visited, manifests)?;
    }
    Ok(())
}

fn markdown_body(text: &str) -> &str {
    let Some(rest) = text
        .strip_prefix("---\n")
        .or_else(|| text.strip_prefix("---\r\n"))
    else {
        return text;
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        offset += line.len();
        if line.trim_end_matches(['\r', '\n']) == "---" {
            return &rest[offset..];
        }
    }
    text
}

fn github_skill_id(spec: &GitHubRepoSpec, path: &str) -> String {
    let stem = slug(&format!("{}-{}-{}", spec.owner, spec.repo, path));
    format!(
        "github-{}-{:08x}",
        stem.chars().take(90).collect::<String>(),
        fnv1a(path.as_bytes())
    )
}

fn slug(value: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    out.trim_end_matches('-').to_string()
}

fn fnv1a(bytes: &[u8]) -> u32 {
    bytes.iter().fold(0x811c9dc5, |hash, byte| {
        (hash ^ u32::from(*byte)).wrapping_mul(0x01000193)
    })
}

fn truncate(value: String, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value
    } else {
        value.chars().take(max_chars).collect::<String>() + "…"
    }
}

fn valid_repo_part(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
}

fn valid_reference(value: &str) -> bool {
    valid_repo_part(value) && !value.starts_with('-') && !value.contains("..")
}

fn valid_path_part(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value
            .chars()
            .any(|ch| ch.is_control() || matches!(ch, ':' | '\\'))
}

fn invalid(message: &str) -> GitHubSkillError {
    GitHubSkillError::InvalidRepository(message.to_string())
}

struct TempCheckout(PathBuf);

impl Drop for TempCheckout {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_shorthand_and_tree_urls() {
        let short = parse_repository("openai/skills").unwrap();
        assert_eq!(short.owner, "openai");
        assert_eq!(short.repo, "skills");
        assert_eq!(short.reference, None);
        assert_eq!(short.subpath, None);

        let tree =
            parse_repository("https://github.com/acme/skills/tree/main/frontend/review").unwrap();
        assert_eq!(tree.reference.as_deref(), Some("main"));
        assert_eq!(tree.subpath.as_deref(), Some(Path::new("frontend/review")));

        let blob = parse_repository("https://github.com/acme/skills/blob/v1/pdf/SKILL.md").unwrap();
        assert_eq!(blob.reference.as_deref(), Some("v1"));
        assert_eq!(blob.subpath.as_deref(), Some(Path::new("pdf")));
    }

    #[test]
    fn rejects_non_github_and_unsafe_paths() {
        assert!(parse_repository("https://example.com/acme/skills").is_err());
        assert!(parse_repository("git@github.com:acme/skills.git").is_err());
        assert!(parse_repository("https://github.com/acme/skills/tree/main/../secret").is_err());
        assert!(parse_repository("https://github.com/acme/skills?tab=readme").is_err());
    }

    #[test]
    fn scans_standard_skill_manifests_with_source_and_inline_fallback() {
        let root =
            std::env::temp_dir().join(format!("codetwo-github-scan-{}", uuid::Uuid::new_v4()));
        let first = root.join("skills/review");
        let second = root.join(".codex/skills/pdf");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        std::fs::write(
            first.join("SKILL.md"),
            "---\nname: code-review\ndescription: Review pull requests\n---\nAlways inspect the diff.",
        )
        .unwrap();
        std::fs::write(second.join("SKILL.md"), "Work carefully with PDFs.").unwrap();

        let spec = parse_repository("acme/skills").unwrap();
        let skills = skills_from_checkout(&root, &spec).unwrap();
        assert_eq!(skills.len(), 2);
        assert!(skills
            .iter()
            .all(|skill| skill.source.as_deref() == Some("GitHub · acme/skills")));
        let review = skills
            .iter()
            .find(|skill| skill.name == "code-review")
            .unwrap();
        assert_eq!(review.description, "Review pull requests");
        assert!(matches!(
            &review.payload,
            SkillPayload::AgentSkill { inline_text: Some(text), .. } if text == "Always inspect the diff."
        ));
        assert!(skills
            .iter()
            .all(|skill| !skill.id.contains('/') && !skill.id.contains(':')));

        let _ = std::fs::remove_dir_all(root);
    }
}
