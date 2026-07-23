# Document editor & skills

codeTwo's core idea: **compose your prompt as a document**, and combine reusable **skills** inline.

## The document editor

The main pane is a block editor (BlockNote). Write your request as prose — headings, paragraphs,
lists — like a short spec. When you run, the whole document becomes one prompt turn.

## The `/` skill picker

Type `/` anywhere to open the picker. Alongside the editor's normal block menu, a **Skills** group
lists every skill in your library. Picking one inserts an inline **skill node** (a chip) at the
cursor. You can insert several and interleave them with your own text.

Each chip is a real document element carrying a `skillId`, so the document serializes deterministically
— text runs become text, skill chips become skill blocks, in order.

## Skill kinds

A skill is one of four kinds:

| Kind | What it contributes |
| --- | --- |
| **Fragment** | A reusable markdown snippet (a persona, constraints, an output format). Inlined into the prompt. |
| **Macro** | A parameterized template with `{{slots}}`. Slots are substituted, then inlined. |
| **Agent Skill** | A reference to a provider-native Agent Skill (e.g. Claude Code's `SKILL.md`), with an optional inline fallback for providers that don't support native skills. |
| **MCP** | An MCP server to attach to the session (a *tool*, not prompt text). Passed at `session/new`. |

## How compilation works

When you run, codeTwo compiles the document into a `CompiledPrompt`:

- **prompt** — text blocks + fragment/macro/agent-skill blocks, concatenated as markdown.
- **mcpServers** — servers from MCP skills, attached when the session is created.
- **agentSkills** — provider-native skills referenced.

The compiler lives in the Rust core, so the TUI produces identical prompts from the same building
blocks. Unknown skill ids are surfaced as a warning rather than silently dropped.

## Managing your library

In the sidebar's **Skills** section:

- **＋** — author a new fragment skill (name + text).
- **×** — remove a skill.
- **🛒** — open the [skill market](/guide/market) to install more.

Skills are stored as JSON files under `~/.config/codetwo/skills/` (built-in skills are always
available on top). Adding or removing one updates the `/` picker and the compiler immediately.
