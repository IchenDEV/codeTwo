---
id: 2026-09-15-remove-host-version-pin
schema: 5
stage: spec
status: accepted
owner: idevlab
created: 2026-09-15
based_on: intent.md
---

# Spec: Remove Host Version Pin

## Design

Delete `VERIFIED_HOST_VERSIONS` and derive the host capability state from the signature result that
`detectHostToolEvidence` already produces: `hostVerified` is true only when the discovered ChatGPT
bundle carries OpenAI's signature (`Identifier=com.openai.codex`, `TeamIdentifier=2DC432GLL2`).

- `hostState = evidence.hostVerified ? "ready" : "unverified"`.
- The two `"This ChatGPT version is outside C2's verified range."` fix strings are replaced by an
  actionable signature-based remediation. They are unreachable while `hostVerified` is required for
  `nativeComputerReady`/`portableComputerReady`, but they stay accurate if that boundary changes.
- `hostVersion` and `computerVersion` are still surfaced in capability `version` fields; only the
  gating changes.

Boundaries: change is confined to `packages/tool-broker/src/broker.ts` plus regression tests. The
portable Computer Use attachment is still advertised as `unverified`; the CUA trusted-ancestor
authorization (`-1743`) is unchanged and remains undocumented as a bypass. No Rust, wire, selection,
or documentation-contract changes.

## Acceptance criteria

- [x] AC-1: A signed host on a version other than the former pin resolves `computer_use` to `ready`
      for both `codex` (native) and a non-Codex provider (portable adapter), and no capability
      `reason` or `fix` mentions a verified version range.
- [x] AC-2: An unsigned/absent host keeps `computer_use` `unavailable` with the existing
      "verified ChatGPT host" reason, including when `hostVersion` is `null`.
- [x] AC-3: Affected desktop checks pass: `bun test`, `bun run lint`, `bun run build` in
      `apps/desktop`, and `bun script/verify/sdlc.ts --worktree` at the repository root.
