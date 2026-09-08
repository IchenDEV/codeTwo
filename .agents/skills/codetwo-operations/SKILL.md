---
name: codetwo-operations
description: Operate CodeTwo remote nodes or diagnose and recover a running CodeTwo instance.
---

# CodeTwo operations

Load only the matching reference:

- Desktop launch preflight, shared-state limits and ownership: [desktop instances](references/desktop-instances.md).
- Remote-agent installation, pairing, task transfer and network boundaries: [remote agent](references/remote-agent.md).
- Live-instance diagnosis, recovery evidence and Incident follow-up: [incident response](references/incident-response.md).

Read-only diagnosis does not authorize stopping a user's Core, replacing live data, moving tasks,
or sending messages. Keep recovery within the authorized target and action; preserve one Core
owner per data directory. Packaging or publication follows the [release Skill](../codetwo-release/SKILL.md).

Before handoff, apply the shared [cleanup contract](../codetwo-develop/references/workflow.md#cleanup-and-handoff) and record what was removed or retained, including when work fails or stops.
