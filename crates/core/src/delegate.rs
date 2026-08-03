//! **Prototype.** A manager agent that selects context instead of doing work.
//!
//! Not wired into the engine or either frontend — this exists to answer a design question, and
//! should be deleted or promoted on the strength of the answer.
//!
//! # The pattern
//!
//! Two layers. A *manager* reads the skill catalog and decides what knowledge this task needs; an
//! *executor* receives a short, focused brief and decides how to do the work. The manager never
//! edits a file, runs a command, or writes a test. Its only job is: *what does this task need to
//! know?*
//!
//! # Why this fits here
//!
//! Code2 already implements this pattern — with a human in the manager's chair. Typing `/` is
//! skill awareness, [`crate::skill::compile_with_context`] is the context assembly, and
//! `session/prompt` is the delegation. So the question isn't whether the architecture supports a
//! manager; it's whether a model in that chair beats the human, or beats not having one.
//!
//! The seam that makes this cheap: a manager's output is a [`DocBlock`] list — the very same
//! document the editor produces. The manager writes the document you would have written, and
//! nothing downstream changes.
//!
//! # The economics, which are the whole point
//!
//! The manager sees only the catalog *index* — id, name, kind, one-line description — never the
//! skill bodies. That's the asymmetry the pattern trades on: an index entry costs a few dozen
//! tokens, a body costs hundreds to thousands. Selecting from the index and then loading only what
//! was selected is what keeps the executor's context small. [`Digest::estimated_chars`] and
//! [`Plan::to_doc`] make that measurable rather than assumed — see `examples/delegate_demo.rs`.

use serde::{Deserialize, Serialize};

use crate::skill::{DocBlock, SkillKind, SkillLibrary};

/// One catalog entry as the manager sees it: enough to choose, not enough to execute.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CatalogEntry {
    pub id: String,
    pub name: String,
    pub kind: SkillKind,
    pub description: String,
}

/// The catalog index handed to the manager — the "company wiki", table of contents only.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Digest {
    pub entries: Vec<CatalogEntry>,
}

impl Digest {
    /// Index every skill in the library. Bodies are deliberately excluded.
    pub fn of(library: &SkillLibrary) -> Digest {
        let mut entries: Vec<CatalogEntry> = library
            .all()
            .map(|s| CatalogEntry {
                id: s.id.clone(),
                name: s.name.clone(),
                kind: s.kind(),
                description: s.description.clone(),
            })
            .collect();
        // Stable order so a manager prompt is reproducible across runs — the same task should not
        // produce a different selection because a HashMap iterated differently.
        entries.sort_by(|a, b| a.id.cmp(&b.id));
        Digest { entries }
    }

    /// Rough size of the index, for comparing against the cost of inlining every body.
    pub fn estimated_chars(&self) -> usize {
        self.render().len()
    }

    /// The index as the manager sees it.
    pub fn render(&self) -> String {
        let mut out = String::new();
        for e in &self.entries {
            out.push_str(&format!(
                "- `{}` ({}) — {}: {}\n",
                e.id,
                kind_word(e.kind),
                e.name,
                e.description
            ));
        }
        out
    }
}

fn kind_word(k: SkillKind) -> &'static str {
    match k {
        SkillKind::Fragment => "fragment",
        SkillKind::Macro => "macro",
        SkillKind::AgentSkill => "agent-skill",
        SkillKind::Mcp => "tool",
    }
}

/// What the manager returns: a selection plus the delegation itself.
///
/// The shape is the argument. A brief with no `boundaries` is a wish, and one with no `done_when`
/// can't be checked — so both are part of the contract rather than advice in a prose prompt.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Plan {
    /// Catalog ids the executor needs. Ids the library doesn't know are dropped by [`Self::to_doc`]
    /// and reported by [`Self::unknown_skills`].
    #[serde(default)]
    pub skills: Vec<String>,
    /// What to do, and why — in the manager's words, not the user's verbatim request.
    pub task: String,
    /// What the executor must not do. Explicit, because "use judgement" is not a boundary.
    #[serde(default)]
    pub boundaries: Vec<String>,
    /// How the executor knows it's finished.
    #[serde(default)]
    pub done_when: Vec<String>,
}

impl Plan {
    /// Selected ids the library can't resolve — a manager hallucinating a skill is the failure mode
    /// this pattern is most exposed to, so it's surfaced rather than silently dropped.
    pub fn unknown_skills(&self, library: &SkillLibrary) -> Vec<String> {
        self.skills.iter().filter(|id| library.get(id).is_none()).cloned().collect()
    }

    /// Lower the plan into the document an editor would have produced.
    ///
    /// This is the whole trick: the manager's output is the app's existing input type, so the
    /// compiler, the preview, the MCP attachment and the transcript all work unchanged.
    pub fn to_doc(&self, library: &SkillLibrary) -> Vec<DocBlock> {
        let mut doc: Vec<DocBlock> = self
            .skills
            .iter()
            .filter(|id| library.get(id).is_some())
            .map(|id| DocBlock::Skill { skill_id: id.clone(), params: Default::default() })
            .collect();

        doc.push(DocBlock::Text { text: self.render_brief() });
        doc
    }

    /// The delegation as prose: what, boundaries, done. Deliberately short — the executor decides
    /// how to think, what order to work in, and which tools to reach for.
    pub fn render_brief(&self) -> String {
        let mut out = String::new();
        out.push_str("## Task\n\n");
        out.push_str(self.task.trim());

        if !self.boundaries.is_empty() {
            out.push_str("\n\n## Boundaries\n\n");
            for b in &self.boundaries {
                out.push_str(&format!("- {}\n", b.trim()));
            }
        }
        if !self.done_when.is_empty() {
            out.push_str("\n\n## Done when\n\n");
            for d in &self.done_when {
                out.push_str(&format!("- {}\n", d.trim()));
            }
        }
        out.trim_end().to_string()
    }
}

/// The manager's instructions: choose context, delegate, and do no work.
///
/// The prohibitions are load-bearing. A capable model handed a task and a catalog will start
/// solving the task — and a manager that starts solving has spent the executor's context on its own
/// reasoning, which is the one thing this pattern exists to avoid.
pub fn manager_instructions(task: &str, digest: &Digest) -> String {
    format!(
        "You are a manager. You do not do the work.\n\
         \n\
         Your only job is to decide what knowledge this task needs, and to write a brief for the \
         agent who will do it. You must not write code, edit files, run commands, or solve any \
         part of the task yourself — an executor with a clean context will do all of that, and \
         anything you reason through here is context it doesn't get.\n\
         \n\
         ## The task\n\
         \n\
         {task}\n\
         \n\
         ## Available skills\n\
         \n\
         Each line is a catalog entry. You are seeing the index, not the contents; pick by \
         relevance to the task.\n\
         \n\
         {catalog}\n\
         ## What to return\n\
         \n\
         A single JSON object, no prose around it:\n\
         \n\
         {{\n\
         \x20 \"skills\": [\"id\", ...],     // only ids from the catalog above; [] if none apply\n\
         \x20 \"task\": \"...\",              // what to do and why, in your own words\n\
         \x20 \"boundaries\": [\"...\"],      // what the executor must not touch or change\n\
         \x20 \"done_when\": [\"...\"]        // how the executor knows it has finished\n\
         }}\n\
         \n\
         Choose the fewest skills that actually apply. Selecting an irrelevant one costs the \
         executor context and pulls it off-task; leaving out a needed one leaves it guessing. If \
         nothing in the catalog applies, return an empty list — that is a valid answer.",
        task = task.trim(),
        catalog = digest.render(),
    )
}

/// Parse a manager's reply. Models fence JSON more often than not, so accept both.
pub fn parse_plan(reply: &str) -> Result<Plan, String> {
    let body = extract_json(reply).ok_or_else(|| {
        format!("no JSON object in the manager's reply: {}", reply.chars().take(200).collect::<String>())
    })?;
    serde_json::from_str::<Plan>(&body).map_err(|e| format!("manager returned malformed JSON: {e}"))
}

/// Pull the outermost `{...}` out of a reply, tolerating ``` fences and surrounding chatter.
fn extract_json(reply: &str) -> Option<String> {
    let start = reply.find('{')?;
    // Scan for the matching brace so trailing prose after the object doesn't break the parse.
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (i, c) in reply[start..].char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(reply[start..start + i + 1].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skill::{builtin_skills, compile, SkillLibrary};

    fn library() -> SkillLibrary {
        SkillLibrary::new(builtin_skills())
    }

    #[test]
    fn digest_indexes_without_bodies() {
        let lib = library();
        let digest = Digest::of(&lib);
        let rendered = digest.render();

        assert!(rendered.contains("`reviewer`"), "{rendered}");
        assert!(rendered.contains("Meticulous senior reviewer persona"), "{rendered}");
        // The body must not leak into the index — that's the economy the pattern runs on.
        assert!(
            !rendered.contains("Flag bugs, unsafe patterns"),
            "skill body leaked into the catalog index: {rendered}"
        );
    }

    #[test]
    fn digest_is_stably_ordered() {
        let lib = library();
        assert_eq!(Digest::of(&lib).render(), Digest::of(&lib).render());
    }

    #[test]
    fn plan_lowers_into_the_editor_s_own_document_type() {
        let lib = library();
        let plan = Plan {
            skills: vec!["reviewer".into(), "test-writer".into()],
            task: "Review the auth module and cover the gaps with tests.".into(),
            boundaries: vec!["Don't touch the database schema".into()],
            done_when: vec!["Every finding has a test or a written reason it has none".into()],
        };

        let doc = plan.to_doc(&lib);
        assert_eq!(doc.len(), 3, "two skills and one brief");

        // The payoff: the existing compiler handles it with no special case.
        let compiled = compile(&doc, &lib);
        assert!(compiled.prompt.contains("meticulous senior code reviewer"));
        assert!(compiled.prompt.contains("thorough, isolated unit tests"));
        assert!(compiled.prompt.contains("## Boundaries"));
        assert!(compiled.prompt.contains("Don't touch the database schema"));
        assert!(compiled.unresolved.is_empty());
    }

    #[test]
    fn a_hallucinated_skill_is_reported_not_silently_dropped() {
        let lib = library();
        let plan = Plan {
            skills: vec!["reviewer".into(), "refactor-master-9000".into()],
            task: "Review it.".into(),
            ..Default::default()
        };

        assert_eq!(plan.unknown_skills(&lib), vec!["refactor-master-9000".to_string()]);
        // The document still compiles cleanly; the invented id doesn't reach the executor.
        let compiled = compile(&plan.to_doc(&lib), &lib);
        assert!(compiled.unresolved.is_empty());
        assert!(!compiled.prompt.contains("refactor-master-9000"));
    }

    #[test]
    fn manager_is_told_not_to_do_the_work() {
        let lib = library();
        let text = manager_instructions("Fix the login bug", &Digest::of(&lib));
        assert!(text.contains("You do not do the work"));
        assert!(text.contains("Fix the login bug"));
        assert!(text.contains("`reviewer`"));
    }

    #[test]
    fn parses_fenced_json_and_trailing_prose() {
        let reply = "Sure — here's the plan:\n\n```json\n{\n  \"skills\": [\"reviewer\"],\n  \
                     \"task\": \"Review it\",\n  \"boundaries\": [\"no schema changes\"],\n  \
                     \"done_when\": [\"findings ranked\"]\n}\n```\n\nHope that helps!";
        let plan = parse_plan(reply).unwrap();
        assert_eq!(plan.skills, vec!["reviewer".to_string()]);
        assert_eq!(plan.task, "Review it");
        assert_eq!(plan.boundaries, vec!["no schema changes".to_string()]);
    }

    #[test]
    fn parses_a_brace_inside_a_string() {
        let plan = parse_plan(r#"{"skills":[],"task":"use {{slot}} syntax"}"#).unwrap();
        assert_eq!(plan.task, "use {{slot}} syntax");
        assert!(plan.skills.is_empty());
    }

    #[test]
    fn a_reply_with_no_json_is_an_error_that_shows_the_reply() {
        let err = parse_plan("I'd rather not.").unwrap_err();
        assert!(err.contains("I'd rather not."), "{err}");
    }

    #[test]
    fn selecting_beats_inlining_everything() {
        let lib = library();
        let digest = Digest::of(&lib);

        // What the manager reads: the index.
        let index_cost = digest.estimated_chars();

        // What "just give the agent everything" costs: every body, compiled.
        let everything: Vec<DocBlock> = lib
            .all()
            .map(|s| DocBlock::Skill { skill_id: s.id.clone(), params: Default::default() })
            .collect();
        let dump_cost = compile(&everything, &lib).prompt.len();

        // What the executor actually receives under the pattern.
        let plan = Plan {
            skills: vec!["reviewer".into()],
            task: "Review the auth module.".into(),
            ..Default::default()
        };
        let selected_cost = compile(&plan.to_doc(&lib), &lib).prompt.len();

        assert!(
            selected_cost < dump_cost,
            "selection ({selected_cost}) should cost the executor less than the dump ({dump_cost})"
        );
        // The index is what the *manager* pays; it stays in the same order of magnitude as one
        // skill body, which is what makes the second hop affordable at this catalog size.
        assert!(index_cost < dump_cost, "index {index_cost} vs dump {dump_cost}");
    }
}
