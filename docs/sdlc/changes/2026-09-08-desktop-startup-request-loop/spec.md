---
id: 2026-09-08-desktop-startup-request-loop
schema: 5
stage: spec
status: accepted
owner: Codex
created: 2026-09-08
based_on: intent.md
---

# Spec: Desktop Startup Request Loop

## Design

Startup reads and Core subscriptions must not restart merely because App renders again. App currently falls back from React Compiler optimization; memoization is a performance aid, not a lifecycle guarantee. Explicit callbacks track workspace/provider inputs. Event dispatch reads the latest handlers through the existing latest-ref pattern; subscription cleanup also handles an asynchronously delivered disposer.

## Acceptance criteria

- [x] AC-1: Repeated unrelated renders do not repeat provider, quota, skills, scene or Git startup reads; workspace/provider changes refresh the affected reads.
- [x] AC-2: Core event subscription stays stable across rerenders, uses current handlers, and releases late asynchronous subscriptions on unmount.
- [x] AC-3: Actual isolated dual desktop startup no longer produces the unbounded request and provider-child-process storm seen before the fix; measurements exclude build/watch and GUI automation.
