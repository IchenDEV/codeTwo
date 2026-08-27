---
layout: false
title: C2 — The document-first coding agent
description: Compose structured prompts, weave in reusable skills, and run your coding CLIs through one local interface.
---

<div class="codetwo-home">
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="window-bar" aria-label="C2 window">
    <span class="traffic-lights" aria-hidden="true">
      <i></i><i></i><i></i>
    </span>
    <span>code2 — local agent workspace</span>
  </div>
  <header class="site-header">
    <div class="shell header-inner">
      <a class="brand" href="./" aria-label="C2 home">
        <img class="brand-mark" src="/logo.svg" width="32" height="32" alt="" />
        <strong>C2</strong>
      </a>
      <nav class="desktop-nav" aria-label="Primary navigation">
        <a href="#product">Product</a>
        <a href="#providers">Providers</a>
        <a href="./guide/getting-started">Docs</a>
        <a class="locale-link" href="./zh/" lang="zh-CN">中文</a>
        <a class="nav-cta" href="https://github.com/IchenDEV/codeTwo">GitHub</a>
      </nav>
      <details class="mobile-nav">
        <summary aria-label="Open navigation">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </summary>
        <nav aria-label="Mobile navigation">
          <a href="#product">Product</a>
          <a href="#providers">Providers</a>
          <a href="./guide/getting-started">Docs</a>
          <a class="locale-link" href="./zh/" lang="zh-CN">中文</a>
          <a href="https://github.com/IchenDEV/codeTwo">GitHub</a>
        </nav>
      </details>
    </div>
  </header>
  <main id="main-content">
    <section class="hero" aria-labelledby="hero-title">
      <div class="shell hero-copy">
        <div class="section-command" aria-hidden="true">$ code2 --compose</div>
        <h1 id="hero-title">
          The document-first<br />
          coding agent<span class="terminal-period">.</span>
        </h1>
        <p>
          Compose structured prompts, weave in reusable skills, and run Claude
          Code, Codex, Grok, Cursor, OpenCode 1 or 2, Pi, Kimi, or GLM through one
          local interface.
        </p>
        <div class="actions">
          <a class="button button-primary" href="./guide/getting-started">
            <span aria-hidden="true">&gt;</span>
            Build from source
          </a>
          <a class="button button-secondary" href="https://github.com/IchenDEV/codeTwo">
            <span aria-hidden="true">&lt;/&gt;</span>
            View source
          </a>
        </div>
        <p class="hero-meta">Local-first · ACP orchestration · Apache-2.0</p>
      </div>
      <figure class="shell screenshot-frame hero-window">
        <img
          src="/screenshots/app-main.png"
          width="1440"
          height="900"
          alt="C2 desktop app with a session rail, document composer, and environment dock"
        />
      </figure>
      <ul class="shell hero-capabilities" aria-label="Key capabilities">
        <li><span aria-hidden="true">&gt;_</span> Structured documents</li>
        <li><span aria-hidden="true">&gt;_</span> Inline skills</li>
        <li><span aria-hidden="true">&gt;_</span> 8 providers</li>
        <li><span aria-hidden="true">&gt;_</span> One local core</li>
      </ul>
    </section>
    <section id="product" class="workflow" aria-labelledby="workflow-title">
      <div class="shell">
        <div class="section-command" aria-hidden="true">$ code2 workflow --inspect</div>
        <div class="workflow-head">
          <h2 id="workflow-title">
            Write the work.<br />
            Choose the agent<span class="terminal-period">.</span>
          </h2>
          <p>
            C2 turns a prompt into a structured document you can edit,
            reuse, and inspect before it runs.
          </p>
        </div>
        <div class="workflow-stage">
          <ol class="steps">
            <li>
              <span class="terminal-mark" aria-hidden="true">&gt;</span>
              <div>
                <h3>Compose as a document</h3>
                <p>Shape the brief with headings, lists, and context.</p>
              </div>
            </li>
            <li>
              <span class="terminal-mark" aria-hidden="true">&gt;</span>
              <div>
                <h3>Add skills and files inline</h3>
                <p>
                  Reference reusable skills and project files without leaving
                  the document.
                </p>
              </div>
            </li>
            <li>
              <span class="terminal-mark" aria-hidden="true">&gt;</span>
              <div>
                <h3>Run through ACP</h3>
                <p>
                  Pick a provider and send the compiled prompt over one
                  protocol.
                </p>
              </div>
            </li>
          </ol>
          <figure class="screenshot-frame workflow-window">
            <img
              src="/screenshots/slash-menu.png"
              width="1440"
              height="900"
              loading="lazy"
              alt="C2 document editor with the slash picker open for skills and blocks"
            />
          </figure>
        </div>
      </div>
    </section>
    <section id="providers" class="providers" aria-labelledby="providers-title">
      <div class="shell">
        <div class="section-command" aria-hidden="true">$ code2 providers --list</div>
        <div class="providers-head">
          <h2 id="providers-title">
            Bring the agent<br />
            you already use<span class="terminal-period">.</span>
          </h2>
          <p>
            C2 starts the CLI or ACP adapter on your machine. Your provider
            account, subscription, quota, and billing stay with the provider.
          </p>
        </div>
        <div class="provider-matrix">
          <article class="provider-entry">
            <span class="provider-index">01</span>
            <div>
              <h3>Claude Code</h3>
              <p>ACP adapter · Node required</p>
              <code>claude-agent-acp</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">02</span>
            <div>
              <h3>OpenAI Codex</h3>
              <p>App Server adapter · Node required</p>
              <code>codex-acp@1.7.0</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">03</span>
            <div>
              <h3>Grok</h3>
              <p>Native ACP</p>
              <code>grok agent stdio</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">04</span>
            <div>
              <h3>Cursor</h3>
              <p>Built-in ACP mode</p>
              <code>cursor-agent acp</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">05</span>
            <div>
              <h3>OpenCode 1</h3>
              <p>Built-in ACP mode</p>
              <code>opencode acp</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">06</span>
            <div>
              <h3>OpenCode 2</h3>
              <p>Built-in ACP mode · Beta</p>
              <code>opencode2 acp</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">07</span>
            <div>
              <h3>Pi</h3>
              <p>Community adapter · Node required</p>
              <code>pi-acp</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">08</span>
            <div>
              <h3>Kimi</h3>
              <p>Native ACP</p>
              <code>kimi acp</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">09</span>
            <div>
              <h3>ZCode (GLM)</h3>
              <p>GLM ACP agent · Node required</p>
              <code>glm-acp-agent</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">10</span>
            <div>
              <h3>Amp</h3>
              <p>ACP adapter · Node required</p>
              <code>amp-acp</code>
            </div>
          </article>
          <article class="provider-entry">
            <span class="provider-index">11</span>
            <div>
              <h3>Droid</h3>
              <p>Native ACP</p>
              <code>droid exec --output-format acp</code>
            </div>
          </article>
        </div>
        <div class="provider-facts">
          <p><span>LOCAL</span> The CLI or adapter runs as a child process on your machine.</p>
          <p><span>ACP</span> Native endpoints and adapters share one submission/event interface.</p>
          <p><span>STATUS</span> A green dot means the required launch command is on your PATH.</p>
        </div>
        <a class="provider-doc-link" href="./guide/providers">
          Compare setup requirements <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
    <section class="architecture" aria-labelledby="architecture-title">
      <div class="shell">
        <div class="section-command" aria-hidden="true">$ code2 architecture --local</div>
        <h2 id="architecture-title">
          One local core.<br />
          Three ways in<span class="terminal-period">.</span>
        </h2>
        <div
          class="architecture-flow"
          role="img"
          aria-label="Coding CLIs connect over ACP to the Rust core, which powers Desktop, TUI, and Remote surfaces"
        >
          <div class="architecture-node"><span>Coding CLIs</span></div>
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
            <span>Rust core</span>
          </div>
          <div class="architecture-branches">
            <svg class="branch-lines" aria-hidden="true" viewBox="0 0 210 270">
              <path d="M0 135h64M64 38v194M64 38h132M64 135h132M64 232h132" />
              <path d="m188 31 8 7-8 7M188 128l8 7-8 7M188 225l8 7-8 7" />
            </svg>
            <div class="architecture-outputs">
              <div class="output-node"><span>Desktop</span></div>
              <div class="output-node"><span>TUI</span></div>
              <div class="output-node"><span>Remote</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="open-source" aria-labelledby="open-source-title">
      <div class="shell section-command-row">
        <div class="section-command" aria-hidden="true">$ code2 source --open</div>
      </div>
      <div class="shell open-source-grid">
        <h2 id="open-source-title">
          Open source,<br />
          from the core out<span class="terminal-period">.</span>
        </h2>
        <div class="open-source-copy">
          <p>
            C2 is licensed under Apache 2.0 and built in the open for people
            who want control over their coding-agent workflow.
          </p>
          <div class="actions">
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
              View on GitHub
            </a>
            <a class="quiet-link" href="./reference/architecture">
              Read the architecture <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
      <footer class="shell site-footer">
        <a class="footer-brand" href="./">
          <img class="brand-mark" src="/logo.svg" width="32" height="32" alt="" />
          C2
        </a>
        <nav aria-label="Footer navigation">
          <a href="./guide/getting-started">Docs</a>
          <a href="https://github.com/IchenDEV/codeTwo">GitHub</a>
          <a href="https://github.com/IchenDEV/codeTwo/blob/main/LICENSE">Apache-2.0</a>
        </nav>
      </footer>
    </section>
  </main>
</div>
