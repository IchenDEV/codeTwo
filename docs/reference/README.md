# Technical contracts

This directory describes current runtime behavior and extension boundaries. For build and
operating commands use the [development Skill](../../.agents/skills/codetwo-develop/SKILL.md); proposed behavior belongs in
[design](../design/README.md), and past investigations belong in [archive](../archive/README.md).

| Area | Authoritative document |
| --- | --- |
| Runtime ownership, dependencies, providers | [Architecture](architecture.md) |
| Project memory and persistence | [Memory contract](memory.md) |
| External plugin bundles and host capabilities | [Plugin standard](plugin-standard.md) |
| External extension wire protocol | [Plugin protocol](plugin-protocol.md) |
| Internal runtime-module composition | [Runtime modules and plugins](plugins.md) |
| Implemented scene and pipeline behavior | [Agent Scenes 1.0](scenes.md) |

[Scenes 2.0](../design/scenes-v2.md) and [development profiles](../design/desktop-development-profiles.md)
are separate future contracts, not currently supported features. The current desktop visual and
interaction contract is the [design system](../design/system.md).
