## Canonical change Artifact

Link the canonical `docs/sdlc/changes/<date>-<slug>/change.md`:

- Change: <!-- docs/sdlc/changes/... -->
- Schema: <!-- 2 -->
- Lifecycle status: <!-- executing / failed / verified / ready-to-release / released / closed -->
- Intent/Spec approval: <!-- named approver plus user request, issue, ADR, or design source -->
- Risk and scope: <!-- low / medium / high / critical; exact files or directory prefixes -->

## Outcome

Describe the observable product or repository result, not the implementation diary.

## Verification

- [ ] Every `AC-N` acceptance criterion is mapped to one actual command or linked evidence item.
- [ ] The Artifact records `Verdict:` and `Residual risk:` consistently with its status.
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
