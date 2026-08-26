//! Harness skill discovery — surface the Agent Skills each product keeps on disk.
//!
//! Claude Code stores skills as `~/.claude/skills/<name>/SKILL.md` plus a per-project
//! `.claude/skills/`, and the other harnesses follow the same one-directory-per-skill layout under
//! their own roots. C2 scans whichever of these exist and turns each `SKILL.md` into an
//! [`SkillPayload::AgentSkill`] library entry, so typing `/` in the editor finds the provider-native
//! skill without any manual registration. Like [`crate::rules`], the conventions are a hardcoded
//! table and a root that doesn't exist on this machine simply contributes nothing.

use std::path::{Path, PathBuf};

use crate::skill::{Skill, SkillPayload};

/// One product's skill-directory convention.
pub struct HarnessSpec {
    /// Namespace used in discovered skill ids: `harness:<id>:<skill-dir>`.
    pub id: &'static str,
    /// Human label pickers group the skills under.
    pub label: &'static str,
    /// Skill roots relative to the user's home directory.
    pub user_roots: &'static [&'static str],
    /// Skill roots relative to the project working directory. Scanned before `user_roots`, so a
    /// project-level skill shadows a user-level one of the same name — the harnesses' own rule.
    pub project_roots: &'static [&'static str],
}

/// The products we know skill-directory conventions for.
pub const HARNESSES: [HarnessSpec; 5] = [
    HarnessSpec {
        id: "claude",
        label: "Claude Code",
        user_roots: &[".claude/skills"],
        project_roots: &[".claude/skills"],
    },
    HarnessSpec {
        id: "codex",
        label: "Codex",
        user_roots: &[".codex/skills"],
        project_roots: &[".codex/skills"],
    },
    HarnessSpec {
        id: "opencode",
        label: "OpenCode",
        // OpenCode 2 prefers the plural directory but continues to read the V1-compatible
        // singular form. Scan the preferred form first so it wins on duplicate skill ids.
        user_roots: &[".config/opencode/skills", ".config/opencode/skill"],
        project_roots: &[".opencode/skills", ".opencode/skill"],
    },
    HarnessSpec {
        id: "cursor",
        label: "Cursor",
        user_roots: &[".cursor/skills"],
        project_roots: &[".cursor/skills"],
    },
    HarnessSpec {
        id: "droid",
        label: "Droid",
        user_roots: &[".factory/skills"],
        project_roots: &[".factory/skills"],
    },
];

/// Cap so a rambling frontmatter description doesn't swamp the picker.
const MAX_DESCRIPTION_CHARS: usize = 280;

/// Scan every harness skill root under the user's home and `cwd`. Grouped by harness (table order),
/// name-sorted within each group, so the picker order is deterministic.
pub fn discover(cwd: Option<&Path>) -> Vec<Skill> {
    discover_in(home().as_deref(), cwd)
}

/// [`discover`] with an explicit home, for tests.
pub fn discover_in(home: Option<&Path>, cwd: Option<&Path>) -> Vec<Skill> {
    let mut out = Vec::new();
    for spec in &HARNESSES {
        let start = out.len();
        if let Some(cwd) = cwd {
            for root in spec.project_roots {
                scan_root(&cwd.join(root), spec, &mut out);
            }
        }
        if let Some(home) = home {
            for root in spec.user_roots {
                scan_root(&home.join(root), spec, &mut out);
            }
        }
        out[start..].sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    }
    out
}

/// The harness display label for a discovered skill id (`harness:claude:…` → "Claude Code");
/// `None` for ordinary library skills.
pub fn source_label(skill_id: &str) -> Option<&'static str> {
    let rest = skill_id.strip_prefix("harness:")?;
    let (harness_id, _) = rest.split_once(':')?;
    HARNESSES.iter().find(|h| h.id == harness_id).map(|h| h.label)
}

/// Read `<root>/<dir>/SKILL.md` entries into `out`, skipping ids an earlier (higher-precedence)
/// root already produced.
fn scan_root(root: &Path, spec: &HarnessSpec, out: &mut Vec<Skill>) {
    let Ok(entries) = std::fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let dir = entry.path();
        let Some(dir_name) = dir.file_name().and_then(|s| s.to_str()).map(str::to_string) else {
            continue;
        };
        if dir_name.starts_with('.') {
            continue;
        }
        // Also rejects stray files: `<file>/SKILL.md` can't be read.
        let Ok(text) = std::fs::read_to_string(dir.join("SKILL.md")) else { continue };
        let id = format!("harness:{}:{dir_name}", spec.id);
        if out.iter().any(|s| s.id == id) {
            continue;
        }
        let (name, description) = parse_frontmatter(&text);
        // The frontmatter `name` is what the harness invokes the skill by; the directory name is
        // the fallback (they match by convention anyway).
        let name = name.unwrap_or_else(|| dir_name.clone());
        let mut description = description.unwrap_or_default();
        if description.chars().count() > MAX_DESCRIPTION_CHARS {
            description = description.chars().take(MAX_DESCRIPTION_CHARS).collect::<String>() + "…";
        }
        // No icon: discovered skills take the picker's neutral fallback glyph rather than
        // inventing an emoji per product.
        out.push(Skill {
            id,
            name: name.clone(),
            description,
            icon: None,
            source: Some(spec.label.to_string()),
            payload: SkillPayload::AgentSkill { skill_ref: name, inline_text: None },
        });
    }
}

/// Pull `name:` and `description:` out of a SKILL.md YAML frontmatter block. Deliberately tiny:
/// top-level `key: value` pairs (plain or quoted) plus indented continuation lines / `>`-style
/// block scalars for multi-line descriptions. Anything fancier still loads — unknown keys are
/// ignored and missing ones fall back to the directory name / empty.
pub(crate) fn parse_frontmatter(text: &str) -> (Option<String>, Option<String>) {
    let mut lines = text.lines();
    if lines.next().map(str::trim_end) != Some("---") {
        return (None, None);
    }
    let mut name = None;
    let mut description = None;
    // The key still collecting continuation lines, and what it has so far.
    let mut open: Option<(bool, String)> = None; // (is_name, value)
    fn flush(open: &mut Option<(bool, String)>, name: &mut Option<String>, description: &mut Option<String>) {
        if let Some((is_name, value)) = open.take() {
            let value = value.trim().to_string();
            if !value.is_empty() {
                *if is_name { name } else { description } = Some(value);
            }
        }
    }
    for line in lines {
        if line.trim_end() == "---" {
            break;
        }
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some((_, value)) = open.as_mut() {
                if !line.trim().is_empty() {
                    if !value.is_empty() {
                        value.push(' ');
                    }
                    value.push_str(line.trim());
                }
            }
            continue;
        }
        flush(&mut open, &mut name, &mut description);
        let Some((key, value)) = line.split_once(':') else { continue };
        let is_name = match key.trim() {
            "name" => true,
            "description" => false,
            _ => continue,
        };
        let value = value.trim();
        // `>` / `|` (with optional chomping `-`) start a block scalar: the value is the indented
        // lines that follow.
        let seed =
            if matches!(value, ">" | ">-" | "|" | "|-") { String::new() } else { unquote(value).to_string() };
        open = Some((is_name, seed));
    }
    flush(&mut open, &mut name, &mut description);
    (name, description)
}

fn unquote(value: &str) -> &str {
    let v = value.trim();
    for q in ['"', '\''] {
        if v.len() >= 2 && v.starts_with(q) && v.ends_with(q) {
            return &v[1..v.len() - 1];
        }
    }
    v
}

fn home() -> Option<PathBuf> {
    crate::provider::home_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skill::{compile, DocBlock, SkillLibrary};
    use std::collections::HashMap;

    fn write_skill(root: &Path, dir: &str, body: &str) {
        let d = root.join(dir);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("SKILL.md"), body).unwrap();
    }

    #[test]
    fn discovers_per_harness_directories() {
        let tmp = std::env::temp_dir().join(format!("codetwo-harness-{}", uuid::Uuid::new_v4()));
        let home = tmp.join("home");
        let cwd = tmp.join("proj");
        write_skill(
            &home.join(".claude/skills"),
            "code-review",
            "---\nname: code-review\ndescription: Review a pull request\n---\nbody",
        );
        write_skill(&home.join(".codex/skills"), "deploy", "No frontmatter at all.");
        write_skill(&cwd.join(".opencode/skill"), "docs", "---\nname: docs\n---\n");
        std::fs::create_dir_all(home.join(".claude/skills/empty-no-md")).unwrap();
        write_skill(&home.join(".claude/skills"), ".hidden", "---\nname: h\n---\n");

        let skills = discover_in(Some(&home), Some(&cwd));
        let ids: Vec<&str> = skills.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["harness:claude:code-review", "harness:codex:deploy", "harness:opencode:docs"]);

        let review = &skills[0];
        assert_eq!(review.name, "code-review");
        assert_eq!(review.description, "Review a pull request");
        assert_eq!(
            review.payload,
            SkillPayload::AgentSkill { skill_ref: "code-review".into(), inline_text: None }
        );
        // No frontmatter → directory name, empty description.
        assert_eq!(skills[1].name, "deploy");
        assert_eq!(skills[1].description, "");

        // Missing home/cwd contribute nothing rather than failing.
        assert!(discover_in(Some(&tmp.join("nope")), None).is_empty());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn project_skill_shadows_user_skill() {
        let tmp = std::env::temp_dir().join(format!("codetwo-harness-shadow-{}", uuid::Uuid::new_v4()));
        let home = tmp.join("home");
        let cwd = tmp.join("proj");
        write_skill(&home.join(".claude/skills"), "review", "---\ndescription: user copy\n---\n");
        write_skill(&cwd.join(".claude/skills"), "review", "---\ndescription: project copy\n---\n");

        let skills = discover_in(Some(&home), Some(&cwd));
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].description, "project copy");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn opencode_v2_plural_skill_root_shadows_legacy_singular_root() {
        let tmp = std::env::temp_dir().join(format!(
            "codetwo-opencode2-skills-{}",
            uuid::Uuid::new_v4()
        ));
        let cwd = tmp.join("proj");
        write_skill(
            &cwd.join(".opencode/skills"),
            "review",
            "---\ndescription: V2 copy\n---\n",
        );
        write_skill(
            &cwd.join(".opencode/skill"),
            "review",
            "---\ndescription: V1 copy\n---\n",
        );

        let skills = discover_in(None, Some(&cwd));
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].description, "V2 copy");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn discovered_skill_compiles_as_agent_skill() {
        let tmp = std::env::temp_dir().join(format!("codetwo-harness-compile-{}", uuid::Uuid::new_v4()));
        let home = tmp.join("home");
        write_skill(&home.join(".claude/skills"), "pdf", "---\nname: pdf\ndescription: Work with PDFs\n---\n");

        let lib = SkillLibrary::new(discover_in(Some(&home), None));
        let doc = vec![DocBlock::Skill { skill_id: "harness:claude:pdf".into(), params: HashMap::new() }];
        let c = compile(&doc, &lib);
        assert_eq!(c.agent_skills, vec!["pdf".to_string()]);
        assert!(c.prompt.contains("Use the **pdf** skill."));
        assert!(c.unresolved.is_empty());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn frontmatter_handles_quotes_and_block_scalars() {
        let (name, desc) = parse_frontmatter(
            "---\nname: \"my-skill\"\ndescription: >-\n  Line one\n  and line two.\nlicense: MIT\n---\nbody",
        );
        assert_eq!(name.as_deref(), Some("my-skill"));
        assert_eq!(desc.as_deref(), Some("Line one and line two."));

        let (name, desc) = parse_frontmatter("---\ndescription: 'quoted'\n---\n");
        assert_eq!(name, None);
        assert_eq!(desc.as_deref(), Some("quoted"));

        assert_eq!(parse_frontmatter("just a markdown file"), (None, None));
    }

    #[test]
    fn source_label_maps_harness_ids() {
        assert_eq!(source_label("harness:claude:pdf"), Some("Claude Code"));
        assert_eq!(source_label("harness:opencode:docs"), Some("OpenCode"));
        assert_eq!(source_label("harness:unknown:x"), None);
        assert_eq!(source_label("reviewer"), None);
    }
}
