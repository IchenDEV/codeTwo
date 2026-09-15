---
id: 2026-09-15-pi-computer-use-backend
schema: 5
stage: intent
status: accepted
owner: idevlab
created: 2026-09-15
source: user
risk: medium
approved_by: idevlab
approved_at: 2026-09-15
approval_source: "Direct request: \"https://github.com/injaneity/pi-computer-use 可以先接一下这个后端\", followed by the choice \"做成通用 MCP 后端\"."
next_trigger: idevlab reviews verified work.
---

# Intent: Pi Computer Use backend

## Intent

C2's Computer Use had only two paths: Codex/OpenAI-native (whose portable extraction is blocked for
other providers by the CUA parent code requirement, Team ID `2DC432GLL2`) and backends a user
manually declares in `host-tools.json`. The requester wants `pi-computer-use`
(https://github.com/injaneity/pi-computer-use, MIT) wired in as a first-party portable backend.

`pi-computer-use` is a **Pi extension**, not an MCP server: its tools are registered through the Pi
extension API, and its macOS side is a self-signed helper app (`pi-computer-use.app`) that owns the
Accessibility and Screen Recording grants and serves a local socket. C2's backend contract expects an
MCP server, so the integration is a thin stdio MCP bridge over the published package.

Outcome: a built-in **Pi Computer Use** computer-use backend that appears in Settings → Computer Use,
can be selected globally, and attaches to any provider through the existing ToolBroker plan.

Constraints: macOS only (requester: "我确实只要支持麦克就行了"); the Codex CUA trust boundary stays
untouched and this backend never claims to be that path; the Bun ToolBroker stays the single policy
owner; schemas come from the package's own tool definitions rather than being re-declared.

Non-goals (deferred): bundling the bridge and its dependency into the signed nightly/release
desktop; Windows/Linux helper locations; a C2-owned permission grant UI beyond the helper's own
flow. The helper's own installation and TCC grants remain authoritative.
