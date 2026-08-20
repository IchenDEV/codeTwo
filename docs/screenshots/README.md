# Scene UI screenshots

Captured from the vite dev preview (headless Chromium, 1440×900) at the R1–R14 tip. The preview
runs without the native desktop host, so scenes come from `bridge.ts`'s `FALLBACK_SCENES` — the five
builtins. Emoji glyphs render as boxes in the headless container's font set; a real desktop build
draws the scene icons.

| File | What it shows |
|---|---|
| `app-main.png` | Session rail, hero composer, and the single scene chip that replaced the posture chip row. |
| `scene-popover.png` | The scene picker: "No scene" plus the five builtin scenes with source badges, over the posture pickers the scene sets. |
| `scene-develop.png` | The escalation dialog. Switching Ask → Develop (auto-edit) names both modes: a scene never loosens permissions silently. |
| `scene-applied.png` | After confirming: the chip reads "Develop" and a toast reports the switch. |
| `slash-menu.png` | The `/` picker, skills grouped by source (library, plugin components). |
