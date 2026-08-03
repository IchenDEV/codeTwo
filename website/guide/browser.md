# Built-in browser

Code2 has an embedded browser panel so you can bring web context to the agent without leaving the
app. Open it in the side dock with `Mod+B`, or the panel button in the header → **Browser** tab.

## Navigating

Type a URL in the address bar and press Enter (or **Go**). The page loads in an embedded frame.

## Quick annotate → prompt

The **annotate bar** at the bottom is the point of the feature: type a note about what you're looking
at and press **Add to prompt**. Code2 turns the current URL and your note into a **browser-context
block** and inserts it into your prompt document, so the agent sees what you see.

A rendered context block looks like:

```
**Browser context** — https://example.com/pricing
- note: the primary CTA is misaligned on mobile
```

## Giving the agent its own browser

Beyond passing context, you can give the *agent* a browser tool: install **Browser Tool (MCP)** from
the [skill market](/guide/market) and add it to your prompt. That attaches a browser MCP server to
the session so the agent can drive a browser itself (the MCP server binary must be installed).

::: info Limits
The embedded browser uses an iframe, so sites that send `X-Frame-Options: DENY` won't render inside
it. A native webview child window with a visual element-picker (à la Cursor) is a future enhancement;
today annotate captures the URL and your note.
:::
