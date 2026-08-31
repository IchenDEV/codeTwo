---
layout: false
title: C2 — 以文档为中心的编程智能体
description: 在一个本地界面中编写结构化提示词、组合可复用技能，并运行不同的编程 CLI。
---

<script setup>
import { onMounted } from "vue";
import { initLandingMotion } from "../.vitepress/theme/motion";
import { initLandingAppearance } from "../.vitepress/theme/appearance";

onMounted(() => {
  initLandingMotion();
  initLandingAppearance();
});
</script>

<div class="codetwo-home" lang="zh-CN">
  <a class="skip-link" href="#main-content">跳到正文</a>
  <div class="window-bar" aria-label="C2 窗口">
    <span class="traffic-lights" aria-hidden="true">
      <i></i><i></i><i></i>
    </span>
    <span>code2 — 本地智能体工作区</span>
  </div>
  <header class="site-header">
    <div class="shell header-inner">
      <a class="brand" href="./" aria-label="C2 中文首页">
        <img class="brand-mark" src="/logo.svg" width="32" height="32" alt="" />
        <strong>C2</strong>
      </a>
      <nav class="desktop-nav" aria-label="主导航">
        <a href="#product">产品</a>
        <a href="#providers">提供方</a>
        <a href="./guide/getting-started">文档</a>
        <a class="locale-link" href="../" lang="en-US">English</a>
        <button class="theme-toggle" type="button" aria-label="切换浅色 / 深色模式" aria-pressed="false">
          <svg class="icon-sun" aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4.3" />
            <path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
          </svg>
          <svg class="icon-moon" aria-hidden="true" viewBox="0 0 24 24">
            <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6a8.5 8.5 0 1 0 10.6 10.6Z" />
          </svg>
        </button>
        <a class="nav-cta" href="https://github.com/IchenDEV/codeTwo">GitHub</a>
      </nav>
      <details class="mobile-nav">
        <summary aria-label="打开导航">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </summary>
        <nav aria-label="移动端导航">
          <a href="#product">产品</a>
          <a href="#providers">提供方</a>
          <a href="./guide/getting-started">文档</a>
          <a class="locale-link" href="../" lang="en-US">English</a>
          <a href="https://github.com/IchenDEV/codeTwo">GitHub</a>
          <button class="theme-toggle" type="button" aria-label="切换浅色 / 深色模式" aria-pressed="false">
            <svg class="icon-sun" aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4.3" />
              <path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
            </svg>
            <svg class="icon-moon" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6a8.5 8.5 0 1 0 10.6 10.6Z" />
            </svg>
            <span>浅色 / 深色</span>
          </button>
        </nav>
      </details>
    </div>
  </header>
  <main id="main-content">
    <section class="hero" aria-labelledby="hero-title">
      <div class="shell hero-copy">
        <div class="section-command" data-motion="type" aria-hidden="true">$ code2 --compose</div>
        <h1 id="hero-title" data-motion>
          以文档为中心的<br />
          编程智能体<span class="terminal-period">。</span><span
            class="hero-cursor"
            aria-hidden="true"
          ></span>
        </h1>
        <p data-motion style="--motion-delay: 120ms">
          编写结构化提示词，组合可复用技能，并在一个本地界面中运行 Claude Code、Codex、Grok、Cursor、OpenCode 1 或 2、Pi、Kimi 或 GLM。
        </p>
        <div class="actions" data-motion style="--motion-delay: 240ms">
          <a class="button button-primary" href="./guide/getting-started">
            <span aria-hidden="true">&gt;</span>
            从源码构建
          </a>
          <a class="button button-secondary" href="https://github.com/IchenDEV/codeTwo">
            <span aria-hidden="true">&lt;/&gt;</span>
            查看源码
          </a>
        </div>
        <p class="hero-meta" data-motion style="--motion-delay: 340ms">本地优先 · ACP 统一接入 · Apache-2.0</p>
      </div>
      <figure
        class="shell screenshot-frame hero-window"
        data-motion
        data-parallax
        style="--motion-delay: 180ms"
      >
        <img
          src="/screenshots/app-main.png"
          width="1440"
          height="900"
          alt="C2 桌面应用，包含会话栏、文档编辑器和环境面板"
        />
      </figure>
      <ul class="shell hero-capabilities" aria-label="核心能力" data-motion-stagger="70">
        <li data-motion><span aria-hidden="true">&gt;_</span> 结构化文档</li>
        <li data-motion><span aria-hidden="true">&gt;_</span> 内联技能</li>
        <li data-motion><span aria-hidden="true">&gt;_</span> 8 个 Provider</li>
        <li data-motion><span aria-hidden="true">&gt;_</span> 一个本地核心</li>
      </ul>
    </section>
    <section id="product" class="workflow" aria-labelledby="workflow-title">
      <div class="shell">
        <div class="section-command" data-motion="type" aria-hidden="true">$ code2 workflow --inspect</div>
        <div class="workflow-head">
          <h2 id="workflow-title" data-motion>
            写下任务。<br />
            选择智能体<span class="terminal-period">。</span>
          </h2>
          <p data-motion style="--motion-delay: 140ms">
            C2 会先把提示词变成一份可编辑、可复用、可检查的结构化文档，然后再运行。
          </p>
        </div>
        <div class="workflow-stage">
          <ol class="steps" data-motion-stagger="130">
            <li data-motion>
              <span class="terminal-mark" aria-hidden="true">&gt;</span>
              <div>
                <h3>像写文档一样组织任务</h3>
                <p>用标题、列表和上下文梳理需求。</p>
              </div>
            </li>
            <li data-motion>
              <span class="terminal-mark" aria-hidden="true">&gt;</span>
              <div>
                <h3>在文档中加入技能和文件</h3>
                <p>无需离开文档，就能引用可复用技能和项目文件。</p>
              </div>
            </li>
            <li data-motion>
              <span class="terminal-mark" aria-hidden="true">&gt;</span>
              <div>
                <h3>通过 ACP 运行</h3>
                <p>选择提供方，通过同一协议发送编译后的提示词。</p>
              </div>
            </li>
          </ol>
          <figure
            class="screenshot-frame workflow-window"
            data-motion
            style="--motion-delay: 160ms"
          >
            <img
              src="/screenshots/slash-menu.png"
              width="1440"
              height="900"
              loading="lazy"
              alt="C2 文档编辑器，已打开技能与内容块选择菜单"
            />
          </figure>
        </div>
      </div>
    </section>
    <section id="providers" class="providers" aria-labelledby="providers-title">
      <div class="shell">
        <div class="section-command" data-motion="type" aria-hidden="true">$ code2 providers --list</div>
        <div class="providers-head">
          <h2 id="providers-title" data-motion>
            带上你已经在用的<br />
            编程智能体<span class="terminal-period">。</span>
          </h2>
          <p data-motion style="--motion-delay: 140ms">
            C2 只在本机启动 CLI 或 ACP 适配器。账号、订阅、配额和费用仍由对应 Provider 管理。
          </p>
        </div>
        <div class="provider-matrix" data-motion-stagger="45">
          <article class="provider-entry" data-motion>
            <span class="provider-index">01</span>
            <div>
              <h3>Claude Code</h3>
              <p>ACP 适配器 · 需要 Node</p>
              <code>claude-agent-acp</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">02</span>
            <div>
              <h3>Codex</h3>
              <p>App Server 适配器 · 需要 Node</p>
              <code>codex-acp@1.7.0</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">03</span>
            <div>
              <h3>Grok</h3>
              <p>原生 ACP</p>
              <code>grok agent stdio</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">04</span>
            <div>
              <h3>Cursor</h3>
              <p>内置 ACP 模式</p>
              <code>cursor-agent acp</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">05</span>
            <div>
              <h3>OpenCode 1</h3>
              <p>内置 ACP 模式</p>
              <code>opencode acp</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">06</span>
            <div>
              <h3>OpenCode 2</h3>
              <p>内置 ACP 模式 · Beta</p>
              <code>opencode2 acp</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">07</span>
            <div>
              <h3>Pi</h3>
              <p>社区适配器 · 需要 Node</p>
              <code>pi-acp</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">08</span>
            <div>
              <h3>Kimi</h3>
              <p>原生 ACP</p>
              <code>kimi acp</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">09</span>
            <div>
              <h3>ZCode（GLM）</h3>
              <p>GLM ACP 智能体 · 需要 Node</p>
              <code>glm-acp-agent</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">10</span>
            <div>
              <h3>Amp</h3>
              <p>ACP 适配器 · 需要 Node</p>
              <code>amp-acp</code>
            </div>
          </article>
          <article class="provider-entry" data-motion>
            <span class="provider-index">11</span>
            <div>
              <h3>Droid</h3>
              <p>原生 ACP</p>
              <code>droid exec --output-format acp</code>
            </div>
          </article>
        </div>
        <div class="provider-facts" data-motion>
          <p><span>本地</span> CLI 或适配器以子进程方式运行在你的机器上。</p>
          <p><span>ACP</span> 原生端点和适配器统一使用同一套提交/事件接口。</p>
          <p><span>状态</span> 绿点表示所需启动命令已出现在 PATH 中。</p>
        </div>
        <a class="provider-doc-link" href="./guide/providers" data-motion style="--motion-delay: 120ms">
          对比安装要求 <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
    <section class="architecture" aria-labelledby="architecture-title">
      <div class="shell">
        <div class="section-command" data-motion="type" aria-hidden="true">$ code2 architecture --local</div>
        <h2 id="architecture-title" data-motion>
          一个本地核心。<br />
          三种使用方式<span class="terminal-period">。</span>
        </h2>
        <div class="architecture-stage" data-architecture-stage>
          <div
            class="architecture-flow"
            data-architecture-flow
            data-motion
            role="img"
            aria-label="编程 CLI 通过 ACP 连接 Rust 核心，由核心驱动桌面端、终端界面和远程控制"
          >
          <div class="architecture-node"><span>编程 CLI</span></div>
          <svg class="flow-arrow" aria-hidden="true" viewBox="0 0 100 20">
            <path d="M1 10h92M86 3l7 7-7 7" />
          </svg>
          <div class="architecture-node architecture-node-small">
            <span>ACP</span>
          </div>
          <svg class="flow-arrow" aria-hidden="true" viewBox="0 0 100 20">
            <path d="M1 10h92M86 3l7 7-7 7" />
          </svg>
          <div class="architecture-node architecture-node-core">
            <span>Rust 核心</span>
          </div>
          <div class="architecture-branches">
            <svg class="branch-lines" aria-hidden="true" viewBox="0 0 210 270">
              <path d="M0 135h64M64 38v194M64 38h132M64 135h132M64 232h132" />
              <path d="m188 31 8 7-8 7M188 128l8 7-8 7M188 225l8 7-8 7" />
            </svg>
            <div class="architecture-outputs">
              <div class="output-node"><span>桌面端</span></div>
              <div class="output-node"><span>终端界面</span></div>
              <div class="output-node"><span>远程控制</span></div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </section>
    <section class="open-source" aria-labelledby="open-source-title">
      <div class="shell section-command-row">
        <div class="section-command" data-motion="type" aria-hidden="true">$ code2 source --open</div>
      </div>
      <div class="shell open-source-grid">
        <h2 id="open-source-title" data-motion>
          从核心开始，<br />
          全面开源<span class="terminal-period">。</span>
        </h2>
        <div class="open-source-copy">
          <p data-motion style="--motion-delay: 140ms">
            C2 基于 Apache 2.0 许可证开源，为希望自主掌控编程智能体工作流的人而构建。
          </p>
          <div class="actions" data-motion style="--motion-delay: 260ms">
            <a
              class="button button-primary button-github"
              href="https://github.com/IchenDEV/codeTwo"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 12 .7Z"
                />
              </svg>
              在 GitHub 查看
            </a>
            <a class="quiet-link" href="./reference/architecture">
              阅读架构说明 <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
      <footer class="shell site-footer">
        <a class="footer-brand" href="./">
          <img class="brand-mark" src="/logo.svg" width="32" height="32" alt="" />
          C2
        </a>
        <nav aria-label="页脚导航">
          <a href="./guide/getting-started">文档</a>
          <a href="https://github.com/IchenDEV/codeTwo">GitHub</a>
          <a href="https://github.com/IchenDEV/codeTwo/blob/main/LICENSE">Apache-2.0</a>
        </nav>
      </footer>
    </section>
  </main>
</div>
