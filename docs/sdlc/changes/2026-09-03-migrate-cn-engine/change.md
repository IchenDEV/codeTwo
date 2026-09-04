---
id: change-2026-09-03-migrate-cn-engine
kind: change
schema: 2
status: verified
risk: low
owner: composer
approvers: [user via the current 2026-09-03 install request]
approved_at: 2026-09-03
created: 2026-09-03
updated: 2026-09-03
source: user request to install https://t.co/G0xVuZdd6H (cn package)
inputs: existing apps/desktop cn wrapper over clsx + tailwind-merge with semantic theme extensions
outputs: cn@0.2.4 installed; desktop utils re-export createCn with the same extend config; clsx and tailwind-merge removed as direct deps
scope: apps/desktop/package.json, apps/desktop/bun.lock, apps/desktop/src/lib/utils.ts, docs/sdlc/changes/2026-09-03-migrate-cn-engine
next_trigger: human review may merge when desired; no release Gate for this dependency swap
verification_mode: owner
verified_by: composer
verified_at: 2026-09-03
---

# Migrate desktop class merging to `cn`

## Intent

The desktop app still merges Tailwind classes with `clsx` + `tailwind-merge`. The user asked to
install `cn` (https://t.co/G0xVuZdd6H / npm `cn`), a drop-in replacement that keeps the same merge
semantics while cutting join+conflict cost. Desired outcome: install `cn`, keep the existing
`@/lib/utils` `cn` API and semantic theme extensions, and drop direct `clsx` / `tailwind-merge`
dependencies when unused by first-party code.

Non-goals: redesigning the design-system tokens, changing component call sites, or enabling
`cn build` ahead-of-time compilation.

## Spec

- `import { cn } from "@/lib/utils"` continues to accept the same inputs and resolve Tailwind
  conflicts with later utilities winning.
- Semantic size/spacing/radius/shadow/duration/ease extensions currently registered via
  `extendTailwindMerge` remain registered through `createCn` from `cn/config`.
- Direct first-party imports of `clsx` and `tailwind-merge` are removed; transitive deps may remain.
- Existing design-system merge tests continue to pass without expectation changes.

### Acceptance criteria

- [x] AC-1: `cn` is a direct dependency of `apps/desktop` and resolves from node_modules.
- [x] AC-2: `apps/desktop/src/lib/utils.ts` exports `cn` built with `createCn` and the prior extend config.
- [x] AC-3: `bun test apps/desktop/tests/designSystem.test.ts` passes with the same merge expectations.

## Decision and gates

The user's direct install request accepts this Intent and Spec, with the user as named approver. It
authorizes repository implementation and local verification only. Merge, push, PR creation, release,
and production mutation remain separate human Gates.

Risk is low: API-compatible dependency swap behind an existing wrapper, covered by an existing
focused test.

## Plan

1. Add the `cn` package with Bun in `apps/desktop`.
2. Replace the `clsx` + `extendTailwindMerge` wrapper with `createCn` while preserving extend tables.
3. Remove direct `clsx` and `tailwind-merge` dependencies if unused by first-party code.
4. Run `designSystem.test.ts` and record evidence.

## Build

Installed `cn@0.2.4` in `apps/desktop`, rewrote `src/lib/utils.ts` to `createCn({ extend: ... })`
with the previous semantic theme/classGroups tables, and removed direct `clsx` /
`tailwind-merge` dependencies. Call sites still import `@/lib/utils`.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `apps/desktop/package.json` lists `"cn": "^0.2.4"`; `bun add cn` installed `cn@0.2.4`.
- AC-2: PASS — `apps/desktop/src/lib/utils.ts` exports `createCn` from `cn/config` with the prior extend tables.
- AC-3: PASS — `bun test tests/designSystem.test.ts` → `1 pass`, `8 expect() calls`.

Also ran `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`,
and `bun test script/verify/checks.test.ts` → all passed.

Residual risk: transitive packages may still pull `clsx`; merge semantics rely on `cn`'s claimed
parity with `tailwind-merge` for the registered semantic tokens—only the focused design-system
cases were re-checked.

## Review and release

Approval: pending human merge review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore `clsx` + `tailwind-merge` in `utils.ts` and package.json, then `bun install`.
No release: this is a local dependency/API-preserving swap; no product release is required to close
after merge if the reviewer accepts residual risk.

## Feedback

No feedback yet.
