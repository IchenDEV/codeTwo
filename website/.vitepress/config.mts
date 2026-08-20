import { defineConfig, type DefaultTheme } from "vitepress";

const chineseThemeConfig: DefaultTheme.Config = {
  logo: "/favicon.svg",
  nav: [
    { text: "指南", link: "/zh/guide/getting-started" },
    { text: "提供方", link: "/zh/guide/providers" },
    { text: "架构", link: "/zh/reference/architecture" },
    { text: "GitHub", link: "https://github.com/IchenDEV/codeTwo" },
  ],
  sidebar: {
    "/zh/guide/": [
      {
        text: "开始使用",
        items: [
          { text: "安装与运行", link: "/zh/guide/getting-started" },
          { text: "Provider 与接入方式", link: "/zh/guide/providers" },
        ],
      },
    ],
    "/zh/reference/": [
      {
        text: "参考资料",
        items: [{ text: "架构", link: "/zh/reference/architecture" }],
      },
    ],
  },
  socialLinks: [
    { icon: "github", link: "https://github.com/IchenDEV/codeTwo" },
  ],
  search: {
    provider: "local",
    options: {
      translations: {
        button: {
          buttonText: "搜索",
          buttonAriaLabel: "搜索文档",
        },
        modal: {
          displayDetails: "显示详细结果",
          resetButtonTitle: "清除搜索",
          backButtonTitle: "关闭搜索",
          noResultsText: "没有找到相关结果",
          footer: {
            selectText: "选择",
            selectKeyAriaLabel: "回车",
            navigateText: "切换",
            navigateUpKeyAriaLabel: "向上",
            navigateDownKeyAriaLabel: "向下",
            closeText: "关闭",
            closeKeyAriaLabel: "Esc",
          },
        },
      },
    },
  },
  editLink: {
    pattern: "https://github.com/IchenDEV/codeTwo/edit/main/website/:path",
    text: "在 GitHub 上编辑此页",
  },
  footer: {
    message: "基于 Apache-2.0 许可证开源。",
    copyright: "C2 贡献者",
  },
  docFooter: {
    prev: "上一页",
    next: "下一页",
  },
  lastUpdated: {
    text: "最后更新于",
  },
  outline: {
    label: "本页内容",
  },
  darkModeSwitchLabel: "外观",
  lightModeSwitchTitle: "切换到浅色主题",
  darkModeSwitchTitle: "切换到深色主题",
  sidebarMenuLabel: "菜单",
  returnToTopLabel: "返回顶部",
  langMenuLabel: "切换语言",
  skipToContentLabel: "跳到正文",
  i18nRouting: false,
};

// Project page served at https://IchenDEV.github.io/codeTwo/
export default defineConfig({
  lang: "en-US",
  title: "C2",
  description:
    "The document-first coding agent. Compose structured prompts, weave in reusable skills, and run your coding CLIs through one local interface.",
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      link: "/",
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh/",
      title: "C2",
      description:
        "以文档为中心的编程智能体。在一个本地界面中编写结构化提示词、组合可复用技能，并运行不同的编程 CLI。",
      themeConfig: chineseThemeConfig,
    },
  },
  base: "/codeTwo/",
  lastUpdated: true,
  cleanUrls: true,
  sitemap: {
    hostname: "https://ichendev.github.io/codeTwo/",
  },
  head: [
    [
      "link",
      { rel: "icon", href: "/codeTwo/favicon.svg", type: "image/svg+xml" },
    ],
    ["link", { rel: "apple-touch-icon", href: "/codeTwo/apple-touch-icon.png" }],
    ["meta", { name: "theme-color", content: "#030504" }],
    ["meta", { property: "og:site_name", content: "C2" }],
    ["meta", { property: "og:type", content: "website" }],
    [
      "meta",
      {
        property: "og:title",
        content: "C2 — The document-first coding agent",
      },
    ],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Compose structured prompts, weave in reusable skills, and run your coding CLIs through one local interface.",
      },
    ],
  ],
  themeConfig: {
    logo: "/favicon.svg",
    i18nRouting: false,
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Providers", link: "/guide/providers" },
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
            { text: "Project memory", link: "/guide/memory" },
            { text: "Document editor & skills", link: "/guide/editor" },
            { text: "Project rules", link: "/guide/rules" },
            { text: "Plugins & market", link: "/guide/market" },
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
    socialLinks: [
      { icon: "github", link: "https://github.com/IchenDEV/codeTwo" },
    ],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/IchenDEV/codeTwo/edit/main/website/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Apache-2.0 licensed.",
      copyright: "C2 contributors",
    },
  },
});
