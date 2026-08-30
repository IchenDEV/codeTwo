## Canonical change Artifact

Link the canonical file under `docs/sdlc/changes/`:

- Change: <!-- docs/sdlc/changes/... -->
- Lifecycle status: <!-- executing / failed / verified / ready-to-release / released / closed -->
- Intent/Spec approval: <!-- named approver plus user request, issue, ADR, or design source -->

## Outcome

Describe the observable product or repository result, not the implementation diary.

## Verification

- [ ] Acceptance criteria are mapped to actual evidence in the change artifact.
- [ ] The Artifact records `Verdict:` and `Residual risk:` consistently with its status.
- [ ] Relevant Rust, desktop, documentation, packaging, or runtime checks passed.
- [ ] User-visible UI changes include real light, dark, and narrow evidence where applicable.
- [ ] Failures, skipped checks, and residual risk are recorded.

## Review and release

- Risk level: <!-- low / medium / high -->
- Release target: <!-- none / nightly / versioned release / other -->
- Rollback: <!-- link or concise path -->
- Merge approval: <!-- pending or named authorization -->
- Release approval: <!-- not applicable / pending / named authorization -->
- [ ] This PR does not infer merge, deployment, or release authority from implementation work.
