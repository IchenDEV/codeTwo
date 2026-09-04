---
id: "2026-08-31-separate-quick-and-side-chat"
stage: verification
schema: 3
status: passed
owner: Codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "Codex"
verified_at: "2026-08-31"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Separate Quick Chat from Side Chat

## Automated checks

Verdict: verified.

All acceptance criteria are checked; merge, publication, and release remain a separate human
disposition.

- Final post-rebase repository verification passed ESLint, Stylelint, all 743 desktop tests with
  3,482 expectations, TypeScript, and the production Vite build with 6,405 transformed modules.
  `git diff --check` and the SDLC contract also passed.

- The focus-ring follow-up began with a deterministic rendered failure: the nested textarea owned
  both its shared default focus ring and a local inset ring while the outer composer also owned a
  `focus-within` ring. After making the nested ring explicitly optional, the focused test passed
  for both Quick Chat and Side Chat with six expectations.
- The related final regression set passed 58 tests and 348 expectations across transient chat,
  shared model and reasoning selection, SessionRail, and both Dock suites. Existing asynchronous
  React `act(...)` warnings remain non-failing.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the production Vite build with
  6,401 transformed modules. Vite retained its existing large-chunk advisory.
- Live Browser inspection at 1280x720 focused both transient textareas. In each surface, the outer
  composer computed to one 2px inset blue outline while the textarea computed to `outline-style:
  none`, `outline-offset: 0px`, and no visible box shadow; the rendered Quick Chat and Side Chat
  states each showed one blue boundary.
- The composer follow-up began with three deterministic rendered failures: neither surface exposed
  add-content or voice controls, the permission posture was a non-interactive span, and Quick Chat
  still used modal elevation while its inner composer used raised elevation. The corrected focused
  loop passed all three tests with 15 expectations.
- The final regression set passed 52 tests and 345 expectations across transient chat, shared model
  and reasoning selection, SessionRail, and both Dock suites. Existing asynchronous React
  `act(...)` warnings remain non-failing.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the production Vite build with
  6,401 transformed modules. Vite retained its existing large-chunk advisory.
- In the live 1280x720 Browser renderer, Quick Chat showed add-content, Ask first, Default model,
  voice, and send controls together. The add button opened a real multiple-file chooser, and the
  permission menu changed the pending posture from Ask first to Full access.
- The same renderer showed Side Chat in a 385px right Dock. Its 353px control row had equal client
  and scroll widths, no clipped buttons, and the same five control groups. The final computed
  composer shadow was exactly one theme-aware `0 1px 2px` layer; no 16px surface halo remained.
- A final live Browser focus pass selected each transient textarea in turn. Quick Chat and Side
  Chat each rendered one 2px blue outer outline; each nested textarea retained `outline: none` and
  a zero box shadow. The Browser log contained no warning or error entries.
- Final rendered evidence is saved at `/tmp/codetwo-quick-chat-composer-final.png` and
  `/tmp/codetwo-side-chat-composer-final.png`. The final Browser log contained no warnings or
  errors.

- The initial focused regression loop reproduced the reported behavior with four failures: the
  duplicate sidebar conversation action, Side Chat opening the floating surface, shared placement
  semantics, and no Quick Chat drag contract. The corrected final loop passed 37 tests and 285
  expectations across the SessionRail, Dock, and transient-chat suites. Existing asynchronous
  React `act(...)` warnings remain non-failing.
- `bun run build:renderer` passed the design-system source gate with 0 new violations, TypeScript,
  the production Vite build with 6,401 transformed modules, and the generated-dist design check
  with 35 semantic selectors. Vite retained its existing large-chunk advisory.
- `bun script/check-sdlc.ts` reported a valid contract and `git diff --check` passed.
- The Browser-backed live renderer at `http://127.0.0.1:1420/` identified itself as `C2`, showed
  one `Toggle Quick Chat` control in the New task group, and reported no console warnings or errors.
  At 1280x720, a real pointer drag moved Quick Chat from `(320, 40)` to `(460, 72)` and recorded
  offsets of `(140px, 32px)`; the 640px-tall panel stopped exactly at the 8px bottom inset.
- The same live renderer showed Side Chat selected as an ordinary right-Dock tab alongside the open
  sidebar. Its `Side chat` region contained one heading, description, composer, and send action,
  with no nested tab list or floating-dialog identity.
- Quick Chat was also inspected at 700x700 in the light scheme. It remained within the viewport,
  retained its composer and controls, showed no framework overlay, and emitted no relevant console
  messages. Appearance and the viewport override were restored afterward.
- The model-selection follow-up first reproduced the omission with a deterministic rendered test:
  when provider models were empty, neither Quick Chat nor Side Chat exposed a `Model` button. A
  second live-equivalent case proved the renderer may have neither provider metadata nor a current
  model before the first prompt. Both cases passed after the fix.
- The final focused loop passed 47 tests and 309 expectations across SessionRail, Dock, transient
  chat, and the shared ModelPicker suite. It includes choosing `GPT Next` before the first prompt in
  both Quick Chat and Side Chat and verifying that each visible label updates.
- In the live 1280x720 renderer, both surfaces displayed and expanded `Default model` with no
  clipping or console warnings. This Browser fixture reports Grok as `CLI not found`, so the menu
  correctly explained that no provider model list was available instead of disappearing. The
  provider-list selection path was exercised in the rendered component loop above.
- The follow-up `bun run build:renderer` again passed the design source gate, TypeScript, the Vite
  production build with 6,401 modules, and the generated-dist semantic selector check.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: PASS — `Verification record above` preserves the original passing evidence.
- AC-8: PASS — `Verification record above` preserves the original passing evidence.
- AC-9: PASS — `Verification record above` preserves the original passing evidence.
- AC-10: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: the Browser fixture has no available Grok CLI and cannot execute the native private
attachment import or return a real provider model catalog. Alternative-model selection and pending
tab propagation are covered by rendered component tests; the live file chooser and attachment UI
were verified without selecting a user file. A different worktree already owns the default live
Core/data directory, so starting another instance would violate the repository's single-owner
launch rules. This checkout's interaction, accessibility, responsive, and visual behavior was
verified in the live Vite renderer without disturbing that Core.

## Behavioral evidence

Verdict: verified.

All acceptance criteria are checked; merge, publication, and release remain a separate human
disposition.

- Final post-rebase repository verification passed ESLint, Stylelint, all 743 desktop tests with
  3,482 expectations, TypeScript, and the production Vite build with 6,405 transformed modules.
  `git diff --check` and the SDLC contract also passed.

- The focus-ring follow-up began with a deterministic rendered failure: the nested textarea owned
  both its shared default focus ring and a local inset ring while the outer composer also owned a
  `focus-within` ring. After making the nested ring explicitly optional, the focused test passed
  for both Quick Chat and Side Chat with six expectations.
- The related final regression set passed 58 tests and 348 expectations across transient chat,
  shared model and reasoning selection, SessionRail, and both Dock suites. Existing asynchronous
  React `act(...)` warnings remain non-failing.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the production Vite build with
  6,401 transformed modules. Vite retained its existing large-chunk advisory.
- Live Browser inspection at 1280x720 focused both transient textareas. In each surface, the outer
  composer computed to one 2px inset blue outline while the textarea computed to `outline-style:
  none`, `outline-offset: 0px`, and no visible box shadow; the rendered Quick Chat and Side Chat
  states each showed one blue boundary.
- The composer follow-up began with three deterministic rendered failures: neither surface exposed
  add-content or voice controls, the permission posture was a non-interactive span, and Quick Chat
  still used modal elevation while its inner composer used raised elevation. The corrected focused
  loop passed all three tests with 15 expectations.
- The final regression set passed 52 tests and 345 expectations across transient chat, shared model
  and reasoning selection, SessionRail, and both Dock suites. Existing asynchronous React
  `act(...)` warnings remain non-failing.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the production Vite build with
  6,401 transformed modules. Vite retained its existing large-chunk advisory.
- In the live 1280x720 Browser renderer, Quick Chat showed add-content, Ask first, Default model,
  voice, and send controls together. The add button opened a real multiple-file chooser, and the
  permission menu changed the pending posture from Ask first to Full access.
- The same renderer showed Side Chat in a 385px right Dock. Its 353px control row had equal client
  and scroll widths, no clipped buttons, and the same five control groups. The final computed
  composer shadow was exactly one theme-aware `0 1px 2px` layer; no 16px surface halo remained.
- A final live Browser focus pass selected each transient textarea in turn. Quick Chat and Side
  Chat each rendered one 2px blue outer outline; each nested textarea retained `outline: none` and
  a zero box shadow. The Browser log contained no warning or error entries.
- Final rendered evidence is saved at `/tmp/codetwo-quick-chat-composer-final.png` and
  `/tmp/codetwo-side-chat-composer-final.png`. The final Browser log contained no warnings or
  errors.

- The initial focused regression loop reproduced the reported behavior with four failures: the
  duplicate sidebar conversation action, Side Chat opening the floating surface, shared placement
  semantics, and no Quick Chat drag contract. The corrected final loop passed 37 tests and 285
  expectations across the SessionRail, Dock, and transient-chat suites. Existing asynchronous
  React `act(...)` warnings remain non-failing.
- `bun run build:renderer` passed the design-system source gate with 0 new violations, TypeScript,
  the production Vite build with 6,401 transformed modules, and the generated-dist design check
  with 35 semantic selectors. Vite retained its existing large-chunk advisory.
- `bun script/check-sdlc.ts` reported a valid contract and `git diff --check` passed.
- The Browser-backed live renderer at `http://127.0.0.1:1420/` identified itself as `C2`, showed
  one `Toggle Quick Chat` control in the New task group, and reported no console warnings or errors.
  At 1280x720, a real pointer drag moved Quick Chat from `(320, 40)` to `(460, 72)` and recorded
  offsets of `(140px, 32px)`; the 640px-tall panel stopped exactly at the 8px bottom inset.
- The same live renderer showed Side Chat selected as an ordinary right-Dock tab alongside the open
  sidebar. Its `Side chat` region contained one heading, description, composer, and send action,
  with no nested tab list or floating-dialog identity.
- Quick Chat was also inspected at 700x700 in the light scheme. It remained within the viewport,
  retained its composer and controls, showed no framework overlay, and emitted no relevant console
  messages. Appearance and the viewport override were restored afterward.
- The model-selection follow-up first reproduced the omission with a deterministic rendered test:
  when provider models were empty, neither Quick Chat nor Side Chat exposed a `Model` button. A
  second live-equivalent case proved the renderer may have neither provider metadata nor a current
  model before the first prompt. Both cases passed after the fix.
- The final focused loop passed 47 tests and 309 expectations across SessionRail, Dock, transient
  chat, and the shared ModelPicker suite. It includes choosing `GPT Next` before the first prompt in
  both Quick Chat and Side Chat and verifying that each visible label updates.
- In the live 1280x720 renderer, both surfaces displayed and expanded `Default model` with no
  clipping or console warnings. This Browser fixture reports Grok as `CLI not found`, so the menu
  correctly explained that no provider model list was available instead of disappearing. The
  provider-list selection path was exercised in the rendered component loop above.
- The follow-up `bun run build:renderer` again passed the design source gate, TypeScript, the Vite
  production build with 6,401 modules, and the generated-dist semantic selector check.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: PASS — `Verification record above` preserves the original passing evidence.
- AC-8: PASS — `Verification record above` preserves the original passing evidence.
- AC-9: PASS — `Verification record above` preserves the original passing evidence.
- AC-10: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: the Browser fixture has no available Grok CLI and cannot execute the native private
attachment import or return a real provider model catalog. Alternative-model selection and pending
tab propagation are covered by rendered component tests; the live file chooser and attachment UI
were verified without selecting a user file. A different worktree already owns the default live
Core/data directory, so starting another instance would violate the repository's single-owner
launch rules. This checkout's interaction, accessibility, responsive, and visual behavior was
verified in the live Vite renderer without disturbing that Core.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the Browser fixture has no available Grok CLI and cannot execute the native private

## Verdict

Verdict: verified..

## Review and release

Approval: the user approved PR creation and merge on 2026-08-31 after rendered verification.
Review surface: [PR #188](https://github.com/IchenDEV/codeTwo/pull/188).
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: Revert this renderer-only change; it performs no migration and changes no durable data.
No release: PR creation and merge are authorized; no tag, publication, deployment, or product
release was requested.

This section records merge authorization only; it does not authorize deployment, release, or
production mutation.

## Feedback

The user explicitly identified three follow-up gaps after the initial surface split: model choice,
the rest of the conversation controls beyond send, and excessive composer elevation. Each was
folded into this Artifact and verified through focused rendered tests plus live Browser inspection.
The user then identified a doubled blue focus outline around the transient composer; this follow-up
keeps the outer card as the single focus owner and removes the nested textarea ring.
