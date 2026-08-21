# Document editor & skills

C2's core idea: **compose your prompt as a document**, and combine reusable **skills** inline.

## The document editor

The prompt is a block editor (BlockNote), not a text field. Write your request as prose — headings,
paragraphs, lists, code blocks — like a short spec. When you run, the whole document becomes one
prompt turn.

**A new session opens as a full page**, with the caret already in it: a document-first app should
hand you a page to write on, not a chat box under an empty transcript. Sending collapses the page
into a composer docked at the foot of the transcript, because from then on there's an answer worth
looking at. Starting another session gives you the page back.

Docked, it grows with what you write. Two ways to get more room, neither of which changes what the
document *is*:

- **Drag the top edge** of the composer to any height. The size is remembered.
- **Expand** (`Mod+Shift+E`, or the ⤢ button) makes the document *the page*: the card falls away and
  the text runs full height on a centred measure, with a block gutter for the drag/insert handles
  and larger type for long-form writing. The control row becomes the page's footer. Sending — or
  `Mod+Shift+E` again — brings the transcript back.

Your draft is the same document in both, so switching never costs you what you've written.

## The `/` skill picker

Type `/` anywhere to open the picker. Alongside the editor's normal block menu, a **Skills** group
lists every skill in your library. Picking one inserts an inline **skill node** (a chip) at the
cursor. You can insert several and interleave them with your own text.

Each chip is a real document element carrying a `skillId`, so the document serializes deterministically
— text runs become text, skill chips become skill blocks, in order.

### Harness skills are discovered automatically

The picker also lists the Agent Skills your installed harnesses already keep on disk, grouped per
product: Claude Code's `~/.claude/skills/` and the project's `.claude/skills/`, Codex's
`.codex/skills/`, OpenCode's preferred `.opencode/skills/` (plus legacy `.opencode/skill/`),
Cursor's `.cursor/skills/`. Each
`<name>/SKILL.md` found becomes an **Agent Skill** entry (name and description read from its
frontmatter) — type the skill's name after `/` and reference it without registering anything. A
project-level skill shadows a user-level one of the same name, the directories are rescanned when
you switch projects, and a product that isn't installed simply contributes nothing.

## `@` — mentioning files

Type `@` to search the workspace and insert a **file mention**. At compile time the core reads that
file and inlines its contents into the prompt inside a fenced block, so the agent sees the actual
code rather than a filename:

````md
**File** `src/auth.rs`

```rust
pub fn login(…) { … }
```
````

Files are read relative to the session's working directory, capped in size, and guarded against
`..`/absolute-path escapes. A file you mention but that can't be read is reported as unresolved
instead of silently dropped.

You can also browse: command palette → **“Browse workspace files”**.

## Images

Attach an image and it's sent to the agent as a real ACP image content block (base64), alongside the
text — useful for screenshots of a broken UI.

## Preview what will actually be sent

Click **Preview** (or the palette's “Preview compiled prompt”) to see the fully compiled prompt:
[project rules](/guide/rules) prepended, skills expanded, macros substituted, `@`-files inlined, plus
the MCP servers and agent-skills that will be attached. It's exactly what goes over the wire.

## Skill kinds

A skill is one of four kinds:

| Kind | What it contributes |
| --- | --- |
| **Fragment** | A reusable markdown snippet (a persona, constraints, an output format). Inlined into the prompt. |
| **Macro** | A parameterized template with `{{slots}}`. Slots are substituted, then inlined. |
| **Agent Skill** | A reference to a provider-native Agent Skill (e.g. Claude Code's `SKILL.md`), with an optional inline fallback for providers that don't support native skills. |
| **MCP** | An MCP server to attach to the session (a *tool*, not prompt text). Passed at `session/new`. |

## How compilation works

When you run, C2 compiles the document into a `CompiledPrompt`:

- **prompt** — text blocks + fragment/macro/agent-skill blocks, concatenated as markdown.
- **mcpServers** — servers from MCP skills, attached when the session is created.
- **agentSkills** — provider-native skills referenced.

The compiler lives in the Rust core, so the TUI produces identical prompts from the same building
blocks. Unknown skill ids are surfaced as a warning rather than silently dropped.

## Managing your library

At the foot of the session rail:

- **＋** — author a new fragment skill (name + text).
- **🛒** — open [Plugin Hub](/guide/market) to manage plugins, components, and scaffolds.

You pick skills with `/` inside the document, so the rail only carries the library management — it
doesn't list every skill and compete with your sessions for space.

Skills are stored as JSON files under `~/.config/codetwo/skills/` (built-in skills are always
available on top). Adding or removing one updates the `/` picker and the compiler immediately.
