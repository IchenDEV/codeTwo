import { defineConfig } from "vitepress";

// Project page served at https://IchenDEV.github.io/codeTwo/
export default defineConfig({
  title: "codeTwo",
  description:
    "A document-first coding agent. Compose prompts as documents, weave in skills, and drive Claude Code / Codex / Grok / Cursor / OpenCode over ACP — desktop, TUI, and remote.",
  base: "/codeTwo/",
  lastUpdated: true,
  cleanUrls: true,
  head: [["meta", { name: "theme-color", content: "#2563eb" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/architecture" },
      { text: "GitHub", link: "https://github.com/IchenDEV/codeTwo" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Getting started",
          items: [
            { text: "Introduction", link: "/guide/introduction" },
            { text: "Install & run", link: "/guide/getting-started" },
            { text: "Your first session", link: "/guide/first-session" },
          ],
        },
        {
          text: "Features",
          items: [
            { text: "Providers", link: "/guide/providers" },
            { text: "Document editor & skills", link: "/guide/editor" },
            { text: "Project rules", link: "/guide/rules" },
            { text: "Skill market", link: "/guide/market" },
            { text: "Git, checkpoints & worktrees", link: "/guide/git" },
            { text: "Permissions & sandbox", link: "/guide/permissions" },
            { text: "Issues & project scripts", link: "/guide/issues" },
            { text: "Built-in browser", link: "/guide/browser" },
            { text: "Voice input", link: "/guide/voice" },
            { text: "Usage tracking", link: "/guide/usage" },
            { text: "Keybindings & palette", link: "/guide/keybindings" },
            { text: "Terminal & tmux", link: "/guide/terminal" },
            { text: "Remote control", link: "/guide/remote" },
            { text: "The TUI", link: "/guide/tui" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Architecture", link: "/reference/architecture" },
            { text: "codetwo-server", link: "/reference/server" },
            { text: "Op / Event protocol", link: "/reference/protocol" },
            { text: "FAQ", link: "/reference/faq" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/IchenDEV/codeTwo" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/IchenDEV/codeTwo/edit/main/website/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Apache-2.0 licensed.",
      copyright: "codeTwo",
    },
  },
});
