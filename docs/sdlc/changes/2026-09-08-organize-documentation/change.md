---
id: 2026-09-08-organize-documentation
schema: 4
status: passed
owner: Codex
created: 2026-09-08
source: user
risk: medium
scope: .agents/skills, script/devflow.ts, script/devflow.test.ts, script/verify/docs.ts, script/verify/sdlc.ts, script/verify/checks.test.ts, docs/sdlc/workflow.md, docs/sdlc/templates, docs/sdlc/references/artifact-contracts.md, docs/sdlc/evals/ai-native-sdlc-gates.md, README.md, AGENTS.md, docs/README.md, docs/catalog.json, docs/development, docs/reference/README.md, docs/reference/remote-agent.md, docs/reference/desktop-development-profiles.md, docs/design/README.md, docs/design/desktop-development-profiles.md, docs/adr/README.md, docs/archive/README.md, script/README.md
approved_by: chenli
approved_at: 2026-09-08
approval_source: Current task from chenli on 2026-09-08 explicitly requests “重做项目文档组织”; local moves, consolidation and link repair are authorized. The follow-up explicitly says to follow Roleva PR 738, including Skill-owned procedures and templates. The subsequent “开始处理” approves the four findings from the Astra scaffold audit.
next_trigger: chenli reviews the locally verified documentation and Astra scaffold cleanup.
revision: documentation worktree based on 28de80fc160fac1351d55a85651c36a91db40e72
verification_mode: owner
verified_by: Codex
verified_at: 2026-09-08
release_target: none
---

# Organize Documentation

## Intent

Make repository documentation navigable by reader task. Keep public user guides in website/,
current runtime contracts in reference/, future product contracts in design/, operations in
project Skills, and lifecycle records in sdlc/. Preserve existing implementation and historical facts.

## Acceptance criteria

- [x] AC-1: Root README routes to project develop, release, and operations Skills; their references own procedures and devflow consumes their templates without copies in docs.
- [x] AC-2: Current contracts, pending designs, decisions, and history have explicit owners; three narrowly triggered Skills load only matching operating references.
- [x] AC-3: Moved documents retain their content and safety boundaries, links resolve, and every document matches one catalog rule.

- [x] AC-4: Eval triggers exclude pure wording edits, Skill routing names the external lifecycle Skill, startup details load only before instance operations, and Rust examples prioritize affected crates without weakening safety or CI.

## Plan

Follow [Roleva PR 738](https://github.com/VecEcho/role-mono/pull/738), observed merged at
`53b51b42be7433076e053769b68873c088716db4`: project develop/release/operations Skills own procedures;
README files route readers; docs owns contracts, design, records, and history. Move the development,
release, remote-agent and lifecycle references into those Skills. Keep current templates with their
owning Skill and point devflow there. Retain historical records and old linked workflow entry points
as pointers. Extend existing link validation to Skill Markdown; no new checker or external tracker.

Apply the approved Astra audit: move startup details into the operations Skill, retain the Core
ownership invariant and mandatory preflight pointer in AGENTS, explicitly distinguish codetwo-develop
from external ai-native-sdlc, narrow local Eval triggers to behavior/structure changes, and show
crate-scoped Rust checks before optional workspace checks. CI and external-action approvals stay intact.

## Verification

- AC-1: PASS — `npx --yes --package=bun@1.3.10 bun test script/verify/checks.test.ts script/devflow.test.ts` passed 14 tests and 113 assertions, including change, Incident and Eval template loading from the owning Skills. `docs/development/` and the three current template copies under `docs/sdlc/templates/` no longer exist.
- AC-2: PASS — `quick_validate.py` from the installed skill-creator passed for codetwo-develop, codetwo-release and codetwo-operations. Inspection of their short descriptions and reference links confirms distinct development, packaging and runtime-operation scopes. The [documentation map](../../../README.md) routes to the appropriate owner.
- AC-3: PASS — `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed. The contract suite now detects broken links inside project Skills. The remote guide remains unchanged; the subsequent AC-4 comparison checks preservation of the relocated Core launch rules.

- AC-4: PASS — `npx --yes --package=bun@1.3.10 bun test script/verify/checks.test.ts script/devflow.test.ts` passed 14 tests and 113 assertions after the four edits. A Python comparison confirmed the complete former AGENTS instance section is preserved in the operations reference, with only its heading level and relative links adjusted; AGENTS shrank from 76 to 40 lines. Inspection confirms scoped Rust examples, matching wording-only exclusions, and explicit external-Skill routing. CI configuration and approval boundaries were not changed by this cleanup.

Verdict: verified.
Residual risk: Structural validation and deterministic CLI regressions passed; model Skill-selection behavior was not independently replayed. PR delivery is authorized by chenli’s follow-up “pr”; merge and publication remain unauthorized. Historical workflow pointers preserve existing repository links.

## Review and release

Approval: pending.
Rollback: Revert the scoped documentation changes; no application state was changed.
Release: none requested; this is local documentation organization.
Feedback: No Incident was observed.
