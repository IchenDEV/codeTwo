---
id: "2026-08-30-plugin-connectors"
stage: verification
schema: 3
status: pending
owner: codex
created: 2026-08-30
based_on: plan.md
commit: ""
verification_mode: independent
verified_by: ""
verified_at: ""
release_target: none
release_identity: "not applicable until released."
---

# Verification: Add connector contributions to the extension model

## Automated checks

- `bun test ./tests/pluginModel.test.ts ./tests/pluginContributions.test.ts
  ./tests/pluginCatalog.test.ts ./tests/feishuWorkspaceRendered.test.tsx`: 22 passed, 0 failed,
  321 assertions after the Ponytail reduction. The rendered tests emit existing React `act(...)`
  warnings.
- `bun run build:renderer`: passed design-system source/dist checks, TypeScript, and the Vite production
  build. Vite retained its existing large-chunk warning.
- Authorization-state regression run on 2026-08-31: the Feishu workspace and plugin-manager rendered
  suites passed 28 tests / 0 failures, including English and Chinese unauthorized states, absence of all
  three resource groups, exact plugin selection, settings-host authorization controls, and the preserved
  authorized directory. `bunx tsc --noEmit`, `git diff --check`, and `bun run build:renderer` passed;
  the build retained only the existing large-chunk warning.
- Sender-identity regression run on 2026-08-31: the focused desktop rendered and prompt suites passed
  13 tests / 0 failures, including a red-to-green case that rejects `Member · <open_id>` when the
  connector supplies a name and avatar. `bunx tsc --noEmit` and `bun run build:renderer` passed; the
  build retained only the existing large-chunk warning.
- Community adapter 0.5.1 passed `npm run check` (69 tests, typecheck, source/client/bundle builds) and
  `CODETWO_RUNTIME_BUNDLE=1 npx vitest run tests/codetwo-runtime.spec.ts` (11 tests). The packaged-runtime
  test confirms a single tenant-authenticated Contacts batch returns `林小满` and her avatar for both
  messages, rather than exposing `ou_lin`; C2's validator accepted version 0.5.1 with one connector.
- Draft-PR preflight on 2026-08-31: the eight affected desktop suites passed 94 tests / 0 failures;
  `DOCS_RS=1 cargo check -p codetwo-plugins --tests` passed; and
  `DOCS_RS=1 cargo test -p codetwo-plugins --lib` passed 38 tests / 0 failures.
- Community bundle `npx vitest run tests/codetwo-runtime.spec.ts`: 9 passed; `npm run -s build` passed;
  C2's validator accepted version 0.3.0 with one static runtime command, no UI actions, and one
  connector. The runtime and its tests now use only `feishu.connector.invoke`; the private legacy
  command aliases were deleted.
- `git diff --check`: passed.
- `DOCS_RS=1 cargo check -p codetwo-plugins`: passed, compiling the new Rust manifest and command
  contracts while intentionally skipping the Ghostty native build.
- `DOCS_RS=1 cargo check -p codetwo-plugins --tests`: passed, including the updated integration-test
  fixtures under the current-only installed-record contract.
- `DOCS_RS=1 cargo test -p codetwo-plugins --lib`: 37 passed, including the 1.2 connector parser,
  ownership validation, and capability-to-operation policy. This mode does not link the native
  terminal library.
- The native integration-test binaries currently fail to link because the local Ghostty symbols are
  unavailable. Their sources type-check under `cargo check --tests`, but this run does not claim a
  linked integration-test pass.
- Installed the minimized community bundle through `codetwo-plugins`' real local-bundle install path
  while the Core was stopped. Installed-record readback shows version 0.3.0 / C2 Plugin Standard 1.2,
  exactly one public runtime command, `feishu.connector.invoke`, the four-field `provider: feishu`
  connector descriptor, no UI action, and the preserved trusted/enabled state.
- Against the packaged desktop Core and default data directory, `plugins.list` surfaced that installed
  connector. `plugins.invoke_connector` successfully dispatched `connection.status` and
  `resources.list` through the community runtime: the existing Feishu account was connected and the
  result contained real direct contacts, groups, documents, and Base resources.
- Rebuilt, packaged, and launched `C2-dev` from the canonical `script/build_and_run.sh` path. The new
  launcher and Core remain alive, and the Core is the only process owning the default data directory.
- Read-only real-window inspection found a separate launcher from another worktree with the same
  `dev.codetwo.app.dev` bundle id. Name-based inspection selected that stale window; full-path
  inspection selected this build but found its renderer blank, with only native window controls in
  the accessibility tree. The unrelated old launcher was not terminated, so left-rail rendering is
  not accepted yet.
- The 2026-08-31 real-window retry found that port 1420 is owned by PID 30184 from
  `/Users/chenli/projects/codeTwo/apps/desktop`, while this worktree's Electrobun/Core processes are
  under `/Users/chenli/.codex/worktrees/a685/codeTwo`. The current C2 window therefore loads the other
  checkout's renderer and still exposes its old account dialog. That user-owned renderer was not stopped
  or replaced, so this checkout's new authorization surface remains unverified in a native window.

Verdict: partial. Renderer tests, the current-only manifest and installed-record model, the minimized
source bundle, and the community runtime pass. Real-window behavior remains unverified because the
current renderer is blank while a same-bundle window from another worktree is also present, and the
native integration-test binaries do not currently link in this environment.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: PASS — `Verification record above` preserves the original passing evidence.
- AC-8: PASS — `Verification record above` preserves the original passing evidence.
- AC-9: BLOCKED — `Verification record above` preserves the original unresolved criterion.
- AC-10: PASS — `Verification record above` preserves the original passing evidence.
- AC-11: BLOCKED — `Verification record above` preserves the original unresolved criterion.

Residual risk: the community source no longer contains legacy command aliases, but the already-running
default desktop profile still owns its installed copy. Replacing that copy safely requires the next
explicit stop/install/restart window. Separately, restore the Ghostty native link environment and clear
the same-bundle desktop collision before accepting native integration and left-rail rendering.

## Behavioral evidence

- `bun test ./tests/pluginModel.test.ts ./tests/pluginContributions.test.ts
  ./tests/pluginCatalog.test.ts ./tests/feishuWorkspaceRendered.test.tsx`: 22 passed, 0 failed,
  321 assertions after the Ponytail reduction. The rendered tests emit existing React `act(...)`
  warnings.
- `bun run build:renderer`: passed design-system source/dist checks, TypeScript, and the Vite production
  build. Vite retained its existing large-chunk warning.
- Authorization-state regression run on 2026-08-31: the Feishu workspace and plugin-manager rendered
  suites passed 28 tests / 0 failures, including English and Chinese unauthorized states, absence of all
  three resource groups, exact plugin selection, settings-host authorization controls, and the preserved
  authorized directory. `bunx tsc --noEmit`, `git diff --check`, and `bun run build:renderer` passed;
  the build retained only the existing large-chunk warning.
- Sender-identity regression run on 2026-08-31: the focused desktop rendered and prompt suites passed
  13 tests / 0 failures, including a red-to-green case that rejects `Member · <open_id>` when the
  connector supplies a name and avatar. `bunx tsc --noEmit` and `bun run build:renderer` passed; the
  build retained only the existing large-chunk warning.
- Community adapter 0.5.1 passed `npm run check` (69 tests, typecheck, source/client/bundle builds) and
  `CODETWO_RUNTIME_BUNDLE=1 npx vitest run tests/codetwo-runtime.spec.ts` (11 tests). The packaged-runtime
  test confirms a single tenant-authenticated Contacts batch returns `林小满` and her avatar for both
  messages, rather than exposing `ou_lin`; C2's validator accepted version 0.5.1 with one connector.
- Draft-PR preflight on 2026-08-31: the eight affected desktop suites passed 94 tests / 0 failures;
  `DOCS_RS=1 cargo check -p codetwo-plugins --tests` passed; and
  `DOCS_RS=1 cargo test -p codetwo-plugins --lib` passed 38 tests / 0 failures.
- Community bundle `npx vitest run tests/codetwo-runtime.spec.ts`: 9 passed; `npm run -s build` passed;
  C2's validator accepted version 0.3.0 with one static runtime command, no UI actions, and one
  connector. The runtime and its tests now use only `feishu.connector.invoke`; the private legacy
  command aliases were deleted.
- `git diff --check`: passed.
- `DOCS_RS=1 cargo check -p codetwo-plugins`: passed, compiling the new Rust manifest and command
  contracts while intentionally skipping the Ghostty native build.
- `DOCS_RS=1 cargo check -p codetwo-plugins --tests`: passed, including the updated integration-test
  fixtures under the current-only installed-record contract.
- `DOCS_RS=1 cargo test -p codetwo-plugins --lib`: 37 passed, including the 1.2 connector parser,
  ownership validation, and capability-to-operation policy. This mode does not link the native
  terminal library.
- The native integration-test binaries currently fail to link because the local Ghostty symbols are
  unavailable. Their sources type-check under `cargo check --tests`, but this run does not claim a
  linked integration-test pass.
- Installed the minimized community bundle through `codetwo-plugins`' real local-bundle install path
  while the Core was stopped. Installed-record readback shows version 0.3.0 / C2 Plugin Standard 1.2,
  exactly one public runtime command, `feishu.connector.invoke`, the four-field `provider: feishu`
  connector descriptor, no UI action, and the preserved trusted/enabled state.
- Against the packaged desktop Core and default data directory, `plugins.list` surfaced that installed
  connector. `plugins.invoke_connector` successfully dispatched `connection.status` and
  `resources.list` through the community runtime: the existing Feishu account was connected and the
  result contained real direct contacts, groups, documents, and Base resources.
- Rebuilt, packaged, and launched `C2-dev` from the canonical `script/build_and_run.sh` path. The new
  launcher and Core remain alive, and the Core is the only process owning the default data directory.
- Read-only real-window inspection found a separate launcher from another worktree with the same
  `dev.codetwo.app.dev` bundle id. Name-based inspection selected that stale window; full-path
  inspection selected this build but found its renderer blank, with only native window controls in
  the accessibility tree. The unrelated old launcher was not terminated, so left-rail rendering is
  not accepted yet.
- The 2026-08-31 real-window retry found that port 1420 is owned by PID 30184 from
  `/Users/chenli/projects/codeTwo/apps/desktop`, while this worktree's Electrobun/Core processes are
  under `/Users/chenli/.codex/worktrees/a685/codeTwo`. The current C2 window therefore loads the other
  checkout's renderer and still exposes its old account dialog. That user-owned renderer was not stopped
  or replaced, so this checkout's new authorization surface remains unverified in a native window.

Verdict: partial. Renderer tests, the current-only manifest and installed-record model, the minimized
source bundle, and the community runtime pass. Real-window behavior remains unverified because the
current renderer is blank while a same-bundle window from another worktree is also present, and the
native integration-test binaries do not currently link in this environment.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: PASS — `Verification record above` preserves the original passing evidence.
- AC-8: PASS — `Verification record above` preserves the original passing evidence.
- AC-9: BLOCKED — `Verification record above` preserves the original unresolved criterion.
- AC-10: PASS — `Verification record above` preserves the original passing evidence.
- AC-11: BLOCKED — `Verification record above` preserves the original unresolved criterion.

Residual risk: the community source no longer contains legacy command aliases, but the already-running
default desktop profile still owns its installed copy. Replacing that copy safely requires the next
explicit stop/install/restart window. Separately, restore the Ghostty native link environment and clear
the same-bundle desktop collision before accepting native integration and left-rail rendering.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the community source no longer contains legacy command aliases, but the already-running

## Verdict

Verdict: partial. Renderer tests, the current-only manifest and installed-record model, the minimized.

## Review and release

Approval: implementation approved by chenli through the user request.
Draft PR: https://github.com/IchenDEV/codeTwo/pull/185
Merge approval: explicitly granted by chenli on 2026-08-31.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove connector contributions and restore the previous host-specific Feishu routing.
No release: no release was requested.

## Feedback

The user requested `ponytail full`; the response removed unused connector concepts rather than adding
another abstraction or compatibility layer.
