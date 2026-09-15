---
id: 2026-09-15-remove-host-version-pin
schema: 5
stage: intent
status: accepted
owner: idevlab
created: 2026-09-15
source: user
risk: low
approved_by: idevlab
approved_at: 2026-09-15
approval_source: "Direct user request in this session: \"咱们不需要把版本号写死\" and, when offered the options, \"先只去掉版本号写死\"."
next_trigger: idevlab reviews verified work.
---

# Intent: Remove Host Version Pin

## Intent

The Bun Tool Broker pins one ChatGPT desktop version in `VERIFIED_HOST_VERSIONS`
(`packages/tool-broker/src/broker.ts`). Any signed ChatGPT host on another version is reported as
`unverified` with the misleading fix "This ChatGPT version is outside C2's verified range", even
though the real trust gate is the OpenAI code signature already checked in
`detectHostToolEvidence` (bundle id `com.openai.codex`, TeamId `2DC432GLL2`). The pinned version is
older than every host currently installed, so Computer Use and Browser/Chrome are permanently
reported `unverified` on up-to-date machines.

Outcome: the host state reflects signature verification only; the version is still reported as
evidence but no longer gates capability state. No "verified range" claim remains.

Constraints: macOS-only concern (the signature check is `darwin`-gated); keep the signature check and
all other routing unchanged; do not touch the Rust adapter, the selection store, or the wire format.

Non-goals (explicitly deferred by the requester): a selectable "Codex Computer Use" Settings
backend, and any attempt to make the extracted OpenAI Computer Use MCP authorize for non-Codex
providers. The `-1743` failure is a deliberate CUA trusted-ancestor boundary (`com.openai.codex*`
signed by OpenAI) and stays out of scope.

Original request: "帮我测试一下这个东西 ... 把设置这个东西给补全 ... 然后看看能不能把权限问题给解决了"; after
the trust-boundary finding the requester chose "先只去掉版本号写死".
