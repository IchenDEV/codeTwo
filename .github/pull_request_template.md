## Change artifact

Link the canonical file under `docs/sdlc/changes/`:

- Change: <!-- docs/sdlc/changes/... -->
- Accepted Intent/Spec evidence: <!-- user request, issue, ADR, design -->

## Outcome

Describe the observable product or repository result, not the implementation diary.

## Verification

- [ ] Acceptance criteria are mapped to actual evidence in the change artifact.
- [ ] Relevant Rust, desktop, documentation, packaging, or runtime checks passed.
- [ ] User-visible UI changes include real light, dark, and narrow evidence where applicable.
- [ ] Failures, skipped checks, and residual risk are recorded.

## Review and release

- Risk level: <!-- low / medium / high -->
- Release target: <!-- none / nightly / versioned release / other -->
- Rollback: <!-- link or concise path -->
- [ ] Merge/release authorization is explicit; this PR does not infer it from implementation work.
