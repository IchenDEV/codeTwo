# 安装与运行

C2 尚未发布预编译安装包，需要从源码运行。项目由 Cargo 工作区和 Bun 构建的前端组成。

## 环境要求

| 工具 | 用途 | 说明 |
| --- | --- | --- |
| **Rust**（1.82+） | 构建核心、TUI、服务端和 Tauri 应用 | [rustup.rs](https://rustup.rs) |
| **Zig**（必须为 0.15.2） | 构建内嵌的 Ghostty 终端引擎 | [ziglang.org](https://ziglang.org/download/) |
| **Bun** | 构建桌面端前端 | [bun.sh](https://bun.sh) |
| **git** | 工作树、检查点和版本控制 | 通常已安装 |
| 至少一个**提供方 CLI** | 实际驱动智能体 | 可选项见下文 |

还需要安装 Tauri 对应的系统工具链：macOS 使用 Xcode Command Line Tools；Linux 使用 `webkit2gtk` 和基础构建工具。详见 [Tauri 环境要求](https://tauri.app/start/prerequisites/)。

在 macOS 上可通过 Homebrew 安装指定版本的 Zig：

```sh
brew install zig@0.15
brew link --force zig@0.15
```

### 至少安装一个提供方

要运行真实任务，你需要让以下至少一个智能体 CLI 出现在 `PATH` 中：

- **Grok** — `grok`，原生支持 ACP，最简单且不依赖 Node。
- **Claude Code** — Node/npx；C2 会运行 `npx @agentclientprotocol/claude-agent-acp`。
- **Codex** — Node/npx；运行 `npx -y @agentclientprotocol/codex-acp@1.1.14`。
- **Cursor** — `cursor-agent`。
- **OpenCode** — `opencode`。
- **Pi** — Node/npx；运行 `npx -y pi-acp`，并需要在 `PATH` 中提供 `pi` 以读取自身配置。
- **Kimi** — `kimi`，原生支持 ACP。
- **ZCode（GLM）** — Node/npx；运行 `npx -y glm-acp-agent`，并设置 `Z_AI_API_KEY`。

C2 会为每个 Provider 显示健康状态，方便确认当前启动命令是否可用。完整说明见 [Provider 与接入方式](/zh/guide/providers)。

## 克隆并测试核心

```sh
git clone https://github.com/IchenDEV/codeTwo
cd codeTwo

# 构建并运行离线测试套件：使用模拟 ACP 智能体、真实 git 和真实 PTY
cargo test -p codetwo-core -p codetwo-tui -p codetwo-server
```

## 运行桌面应用

```sh
cd apps/desktop
bun install --frozen-lockfile
bun run tauri dev        # 打开桌面窗口
```

## 运行 TUI

```sh
cargo run -p codetwo-tui
```

## 运行远程控制服务

```sh
cargo run -p codetwo-server   # 输出配对 URL、令牌和二维码
```

远程控制的完整说明见[英文文档](/guide/remote)。

## 不安装提供方也能体验

如果想在安装 CLI 前了解一次任务的完整流程，可以运行内置演示。它会启动一个轻量模拟智能体（需要 `node`），并完成一次完整任务：

```sh
cargo run -p codetwo-core --example live_demo
```

下一步：[开始第一个会话（英文）](/guide/first-session)。
