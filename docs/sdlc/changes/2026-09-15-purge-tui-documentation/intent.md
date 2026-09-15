---
id: 2026-09-15-purge-tui-documentation
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-15
source: user
risk: low
approved_by: chenli
approved_at: 2026-09-15
approval_source: "Direct request: 解决残留 (resolve the documentation residual named in 2026-09-15-repair-post-merge-test-contracts)."
next_trigger: chenli reviews verified work.
---

# Intent: Purge the removed TUI from the documentation

## Intent

The architecture simplification removed `crates/tui`, but the user-facing documentation still ships a
whole TUI page (`website/guide/tui.md`), a "Run the TUI" section, `codetwo-tui` test commands, a TUI
row in the surface table and the landing-page diagram, and TUI prose across both language tracks and
the `docs/reference` set. The previous repair change fixed failing checks and left this narrative
drift as its only recorded residual.

Outcome: no non-historical document advertises a TUI surface or a `codetwo-tui` crate; the surviving
surfaces (desktop, server, remote client, NAPI addon) are described instead, and the stale
"nine agent CLIs" count matches the eleven-provider registry.

Constraints: documentation and navigation only — no code, packaging, or runtime change. Keep both
language tracks equivalent. Do not rewrite unrelated prose. Historical change records and
`docs/archive/` stay untouched as the audit trail.

Non-goals: adding any new surface documentation, and re-verifying the removed surface's behavior.
