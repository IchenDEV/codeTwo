## Canonical change bundle

Link the canonical `docs/sdlc/changes/<date>-<slug>/` bundle:

- Bundle: <!-- docs/sdlc/changes/... -->
- Schema: <!-- 3 -->
- Intent approval: <!-- named approver + source -->
- Spec approval: <!-- named approver -->
- Plan approval: <!-- named approver + scope summary -->
- Verification status: <!-- draft / passed / failed -->

## Outcome

Describe the observable product or repository result, not the implementation diary.

## Verification

- [ ] Every `AC-N` acceptance criterion is mapped to one actual command or linked evidence item in `verification.md`.
- [ ] `verification.md` records `Verdict:` and residual risk consistently with its status.
- [ ] Verification mode, verifier, and date match the risk lane; high/critical verification is independent.
- [ ] Relevant Rust, desktop, documentation, packaging, or runtime checks passed.
- [ ] User-visible UI changes include real light, dark, and narrow evidence where applicable.
- [ ] Failures, skipped checks, and residual risk are recorded.

## Review and release

- Risk level: <!-- low / medium / high / critical -->
- Release target: <!-- none / nightly / versioned release / other -->
- Rollback: <!-- link or concise path -->
- Merge approval: <!-- pending or named authorization -->
- Release approval: <!-- not applicable / pending / named authorization -->
- [ ] This PR does not infer merge, deployment, or release authority from implementation work.
