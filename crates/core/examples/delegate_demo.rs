//! **Prototype demo.** What the manager/executor split actually costs, in characters.
//!
//! `cargo run -p codetwo-core --example delegate_demo`
//!
//! No network and no provider: a canned manager reply stands in for the model, because the question
//! this answers is about context economics, not about whether a given model chooses well. That
//! second question needs a real agent and a set of tasks to grade against — see the notes at the
//! end of the output.

use codetwo_core::delegate::{manager_instructions, parse_plan, Digest};
use codetwo_core::market::builtin_catalog;
use codetwo_core::skill::{builtin_skills, compile, DocBlock, SkillLibrary};

fn rule(title: &str) {
    println!("\n\x1b[1m{title}\x1b[0m\n{}", "─".repeat(title.len()));
}

fn main() {
    // A realistic catalog: the built-in skills plus everything in the market.
    let mut skills = builtin_skills();
    skills.extend(builtin_catalog().iter().map(|e| e.to_skill()));
    let library = SkillLibrary::new(skills);
    let catalog_size = library.all().count();

    let task = "The ACP client drops in-flight requests when the agent process restarts. \
                Find out why and fix it.";

    // ---- 1. what the manager reads -------------------------------------------------------
    let digest = Digest::of(&library);
    rule("1. The manager's view — the catalog index");
    print!("{}", digest.render());
    println!("\n{} skills indexed, {} chars", catalog_size, digest.estimated_chars());

    let instructions = manager_instructions(task, &digest);
    println!("full manager prompt: {} chars", instructions.len());

    // ---- 2. what the manager returns -----------------------------------------------------
    // Canned: this is what a manager that follows its instructions produces.
    let reply = r#"```json
{
  "skills": ["reviewer", "test-writer"],
  "task": "Find why in-flight ACP requests are lost when the agent subprocess restarts, and fix it. The pending-request map is the first place to look. Explain the mechanism before changing anything.",
  "boundaries": [
    "Don't change the ACP wire types — other providers depend on them",
    "Don't add a dependency",
    "Leave the reconnect backoff policy alone"
  ],
  "done_when": [
    "A test reproduces the dropped request and fails before the fix",
    "That test passes after it",
    "cargo test -p codetwo-core is green"
  ]
}
```"#;

    let plan = parse_plan(reply).expect("manager reply parses");
    rule("2. The delegation");
    println!("skills chosen: {:?}", plan.skills);
    let unknown = plan.unknown_skills(&library);
    if unknown.is_empty() {
        println!("all chosen ids exist in the catalog");
    } else {
        println!("\x1b[33mhallucinated ids: {unknown:?}\x1b[0m");
    }
    println!("\n{}", plan.render_brief());

    // ---- 3. what the executor receives ---------------------------------------------------
    let doc = plan.to_doc(&library);
    let selected = compile(&doc, &library);
    rule("3. The executor's prompt");
    println!("{}", selected.prompt);

    // ---- 4. the comparison ---------------------------------------------------------------
    let everything: Vec<DocBlock> = library
        .all()
        .map(|s| DocBlock::Skill { skill_id: s.id.clone(), params: Default::default() })
        .collect();
    let dump = compile(&everything, &library);

    let bare = compile(&[DocBlock::Text { text: task.to_string() }], &library);

    rule("4. What it costs");
    println!("  bare task, no skills          {:>6} chars", bare.prompt.len());
    println!("  manager-selected (2 skills)   {:>6} chars   ← what the executor gets", selected.prompt.len());
    println!("  every skill inlined           {:>6} chars", dump.prompt.len());
    println!("  catalog index                 {:>6} chars   ← what the manager pays, once", digest.estimated_chars());
    println!(
        "\n  selection saves the executor {:.0}% against the dump.",
        100.0 * (1.0 - selected.prompt.len() as f64 / dump.prompt.len() as f64)
    );
    println!(
        "  two hops cost {} chars total vs {} for one hop that dumps everything.",
        instructions.len() + selected.prompt.len(),
        dump.prompt.len()
    );

    // ---- 5. when it pays -----------------------------------------------------------------
    //
    // The totals above say the manager loses at this catalog. That's worth taking apart rather
    // than accepting, because it's an artifact of *these* skills: C2's are one-liners, so a
    // body costs barely more than its own index entry and there's nothing to save by choosing.
    let avg_body = dump.prompt.len() as f64 / catalog_size as f64;
    let avg_entry = digest.estimated_chars() as f64 / catalog_size as f64;
    let overhead = (instructions.len() - digest.estimated_chars()) as f64; // fixed manager framing
    let picked = plan.skills.len() as f64;

    rule("5. When the manager starts paying for itself");
    println!("  average skill body     {avg_body:>6.0} chars");
    println!("  average index entry    {avg_entry:>6.0} chars");
    println!("  manager framing        {overhead:>6.0} chars (fixed)");
    println!(
        "\n  One hop costs N·body. Two cost framing + N·entry + k·body.\n  \
         The manager wins once  N·(body − entry) > framing + k·body."
    );

    // Solve for N across plausible body sizes. `entry` stays put — a one-line description is a
    // one-line description whether it fronts a paragraph or a 3000-char SKILL.md.
    println!("\n  body size   break-even catalog (k={picked:.0} selected)");
    for body in [avg_body.round() as usize, 500, 1_000, 2_000, 4_000] {
        let b = body as f64;
        let gap = b - avg_entry;
        if gap <= 0.0 {
            println!("  {body:>6}      never — bodies cost no more than their index entries");
            continue;
        }
        let n = (overhead + picked * b) / gap;
        let verdict = if n.ceil() as usize <= catalog_size { "  ← already there" } else { "" };
        println!("  {body:>6}      {:>4} skills{verdict}", n.ceil() as usize);
    }
    println!(
        "\n  C2's built-ins average {avg_body:.0} chars, which is why the manager loses here.\n  \
         A real catalog entry — a SKILL.md, a wiki page, a house style guide — is 1–4k, and at\n  \
         that size the pattern pays from a handful of skills onward."
    );

    rule("What this does and doesn't show");
    println!(
        "Shown: the index is cheap to read and selection keeps the executor's context small.
That holds by construction, and holds harder as the catalog grows — the index grows
linearly while the executor's context stays flat.

Not shown, and it's the part that decides the pattern:
  · whether a model in the manager's chair picks the right skills. Needs a graded task
    set; a wrong pick is worse than no manager, because the executor is confidently
    under-briefed and can't tell.
  · whether the manager stays in its chair. The instructions forbid doing the work;
    capable models are drawn to solving anyway, and every token it spends reasoning is
    context the executor never sees.
  · latency. Two sequential agent turns, and the user waits through both with nothing
    on screen until the second starts.

The economics are settled and they point at one thing: build this when the catalog holds
real documents, not one-line personas. Against {catalog} short built-ins it loses; against a
wiki it wins early. So the prerequisite isn't the manager — it's having skills worth
choosing between.",
        catalog = catalog_size
    );
}
