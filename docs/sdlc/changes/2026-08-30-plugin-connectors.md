---
id: change-2026-08-30-plugin-connectors
kind: change
status: executing
owner: codex
approvers: chenli
created: 2026-08-30
updated: 2026-08-31
source: user request in this task, "需要提升扩展plugin 模型"
inputs: the C2 process runtime model, host-rendered UI contributions, and the Feishu collaboration extension
outputs: a manifest-declared connector contribution invoked through one owned runtime command
next_trigger: free or isolate port 1420 from the separate /Users/chenli/projects/codeTwo renderer and rerun real-window verification
---

# Add connector contributions to the extension model

## Intent

The Feishu collaboration experience currently depends on the desktop recognizing one installed
bundle by name and calling its `feishu.*` commands directly. That makes a community extension look
integrated while keeping its discovery and routing inside product-specific host code. The user
requested a stronger extension model so rich collaboration integrations remain community plugins.

## Spec

C2 Plugin Standard 1.2 adds host-rendered connector descriptors. A connector declares only a stable
bundle-local id, a provider identifier, one command owned by the same runtime, and the capabilities
that are implemented now. The host invokes that command with an operation and input; the
bundle owns provider-specific authentication and data access. Connector code cannot inject React or
HTML and cannot invoke another bundle's command.

The initial capabilities cover connection, conversations, documents, tables, messaging, and turn
notifications. The existing Feishu surface becomes the first provider adapter: it is discovered
through the descriptor rather than the bundle name, and all host calls pass through the connector
invocation command. A connector for another provider cannot be rendered by the Feishu adapter.
Only C2 Plugin Standard 1.2 bundles and installed records are accepted.

### Acceptance criteria

- [x] A valid 1.2 bundle can declare a connector whose command is statically declared by the same
      runtime; unknown capabilities, commands, fields, and duplicate ids fail closed.
- [x] C2 accepts only Plugin Standard 1.2; 1.0 and 1.1 manifests and installed records fail closed.
- [x] Installed bundle inventory, catalog counts, and desktop bridge expose connector
      descriptors without starting an untrusted runtime.
- [x] Connector invocation verifies enabled/trusted state, contribution ownership, command ownership,
      and caller realm before dispatching `{ operation, input }`.
- [x] The desktop discovers the Feishu collaboration surface from an active connector and contains no
      plugin-name check or direct `feishu.*` command call for that surface.
- [x] The community Feishu bundle declares the connector and implements its single operation dispatcher
      as its only public runtime command.
- [x] Before Feishu authorization, the rail shows no contact, document, or Base groups; it presents
      only a concise sign-in prompt whose action opens the Feishu bundle's plugin settings.
- [x] Feishu app setup and account authorization live in the Feishu plugin details rather than the
      collaboration workspace; successful authorization restores the existing resource directory.
- [ ] The authorization boundary is covered in English and Chinese and checked in the rendered desktop.
- [ ] Focused Rust, renderer, community-plugin, build, SDLC, and real-window checks pass.

## Decision and gates

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. No PR, merge, publication, deployment, or release is authorized.

## Plan

Extend the manifest parser and installed model, add one ownership-checked connector invocation command,
project active descriptors into the renderer, migrate Feishu discovery and calls to that seam, and add
contract tests at the parser, runtime, bridge, and rendered-surface levels. Rollback removes the 1.2
descriptor support and restores the previous Feishu-specific host lookup.

For the authorization state, keep provider controls host-rendered but mount them only inside the owning
bundle's plugin details. The collaboration rail is a resource directory after authorization, not a
second setup surface.

## Build

- Added the 1.2 manifest, installed-bundle, inventory, catalog, validation CLI,
  bridge, and localization contracts for connector contributions.
- Added `plugins.invoke_connector`, which checks bundle enablement and trust, contribution and command
  ownership, runtime realm, input shape, and capability-to-operation namespace before dispatching the
  standard `{ operation, input }` envelope.
- Moved the Feishu desktop surface to active connector discovery with `provider: feishu`; all
  provider calls now use standard operations through the connector facade.
- Updated the community Feishu bundle to C2 Plugin Standard 1.2 and version 0.3.0, removed its obsolete
  rail UI action, and reduced its public command surface to the connector dispatcher.
- Ponytail Full removed the one-value connector `kind`, unused label/description/order metadata,
  speculative reference/forwarding capabilities, per-connector policy components, and the redundant
  renderer-side enabled/trusted lookup and unused context payload. Bundle enablement remains the
  single product policy gate.
- Per the user's explicit instruction, removed C2 Plugin Standard 1.0/1.1 parsing and installed-record
  compatibility. Runtime commands and contribution arrays are now required installed data, and all
  checked-in C2 packs declare 1.2.
- Added a host-owned plugin-details extension point and moved Feishu app creation, account authorization,
  reauthorization, and disconnect controls into the owning community bundle's plugin details. The
  unauthorized rail and workspace now expose only a concise sign-in route and no resource groups.

## Verification

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

Residual risk: the community source no longer contains legacy command aliases, but the already-running
default desktop profile still owns its installed copy. Replacing that copy safely requires the next
explicit stop/install/restart window. Separately, restore the Ghostty native link environment and clear
the same-bundle desktop collision before accepting native integration and left-rail rendering.

## Review and release

Approval: implementation approved by chenli through the user request.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove connector contributions and restore the previous host-specific Feishu routing.
No release: no release was requested.

## Feedback

The user requested `ponytail full`; the response removed unused connector concepts rather than adding
another abstraction or compatibility layer.
