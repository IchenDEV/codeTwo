# Built-in browser

C2 has an embedded browser panel so you can bring web context to the agent without leaving the
app. Open it in the side dock with `Mod+B`, or the panel button in the header → **Browser** tab.

## Navigating

Type a URL in the address bar and press Enter. The page loads in a sandboxed Electrobun child
webview, so sites that reject iframe embedding can still render.

## Quick annotate → prompt

Turn on **Annotate**, select elements in the page, and add notes or temporary style changes. Press
**Add to prompt** to turn those selections into **browser-context blocks** in the prompt document.

A rendered context block looks like:

```
**Browser context** — https://example.com/pricing
- note: the primary CTA is misaligned on mobile
```

## Giving the agent its own browser

Beyond passing context, you can give the *agent* a browser tool in **Settings → Browser Use**. Codex
can use the discovered **OpenAI Browser / Chrome** runtime. Any compatible provider can instead use
a Browser Use, Playwright, Chrome DevTools, or other standard MCP backend registered in
`host-tools.json`. The choice is per provider and is attached when a new session starts; see
[Providers → Configure Browser Use](/guide/providers#configure-browser-use-or-another-browser-mcp).

::: info Limits
Embedded tabs are for manual browsing and annotation. Electrobun's stable BrowserView surface does
not yet provide the screenshot and evaluated-result primitives C2's former authenticated
agent-browser adapter required, so agents cannot take over these tabs through C2's embedded panel.
The Codex-native OpenAI Browser plugin and separately configured browser MCPs run as independent
tools. OpenAI's private `node_repl` runtime is not exported to other providers.
:::
