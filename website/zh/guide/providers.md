# Provider 与接入方式

在 Code2 中，**Provider** 指由 Code2 通过 **Agent Client Protocol（ACP）** 驱动的编程智能体 CLI。
Code2 不会重新实现智能体，也不代理模型访问；它只在本机启动 CLI 或 ACP 适配器子进程，并通过 stdin/stdout 交换 JSON-RPC 消息。

身份验证、订阅、配额、可用模型和费用仍由对应 Provider 管理。开始真实会话前，请先安装并登录相应 CLI。

## “支持”具体意味着什么

每个内置 Provider 都有固定的 ID 和启动配置。为会话选择 Provider 后，Code2 会：

1. 检查启动命令是否能从 `PATH` 中找到；
2. 在本机启动原生 ACP 端点或适配器；
3. 初始化 ACP 会话，并把编译后的文档作为提示词发送；
4. 在 Provider 实际提供对应能力时，把文本流、工具调用、权限请求、计划、终端更新和任务结束状态转换为统一的 Code2 Event。

“支持”不代表所有 Provider 都暴露完全相同的模型和 ACP 能力。Code2 只显示当前 ACP 端点真实上报的内容，不会伪造能力一致性。

## 八个内置 Provider

| Provider | 接入方式 | Code2 启动命令 | 前置要求 |
| --- | --- | --- | --- |
| **Claude Code** | ACP 适配器 | `npx -y @agentclientprotocol/claude-agent-acp` | Node，以及已完成身份验证的 Claude Code 环境 |
| **OpenAI Codex** | App Server ACP 适配器 | `npx -y @agentclientprotocol/codex-acp@1.1.14` | Node，以及本地 Codex runtime/登录状态 |
| **Grok** | 原生 ACP | `grok agent stdio` | 已登录的 `grok` CLI，并位于 `PATH` 中 |
| **Cursor** | CLI 内置 ACP 模式 | `cursor-agent --acp` | 已登录的 `cursor-agent`，并位于 `PATH` 中 |
| **OpenCode** | CLI 内置 ACP 模式 | `opencode acp` | 已登录的 `opencode`，并位于 `PATH` 中 |
| **Pi** | 社区 ACP 适配器 | `npx -y pi-acp` | Node；`pi` 位于 `PATH` 中以读取配置和凭据 |
| **Kimi** | 原生 ACP | `kimi acp` | 已登录的 `kimi` CLI，并位于 `PATH` 中 |
| **ZCode（GLM）** | GLM ACP 智能体 | `npx -y glm-acp-agent` | Node，加 `Z_AI_API_KEY` 或一次性 `--setup` |

### 原生 ACP

**Grok** 和 **Kimi** 直接提供 ACP 端点，因此 Code2 无需 Node 适配器即可启动它们。

### CLI 内置 ACP 模式

**Cursor** 和 **OpenCode** 通过自身 CLI 的 ACP 模式接入。不同 CLI 版本的参数可能变化；如果默认启动配置失效，应以已安装版本的官方说明为准。

### 适配器接入

**Claude Code**、**Codex**、**Pi** 和 **ZCode（GLM）** 通过 `npx` 启动。Pi 使用社区适配器，因为 Pi 本身目前没有 ACP 模式。GLM 项启动的是 GLM ACP 智能体，而不是 ZCode 桌面应用；后者自身是 ACP 客户端，不能作为 Code2 驱动的 CLI。

GLM 可以通过环境变量提供 `Z_AI_API_KEY`，也可以先运行：

```sh
npx -y glm-acp-agent --setup
```

## 可用状态与身份验证

Code2 会为每个内置 Provider 显示健康状态：

- **绿点**表示注册的启动命令可以从 `PATH` 中找到；
- **缺失**表示 Code2 找不到该命令；
- 如果新会话选择了缺失命令，编辑器会在运行前给出警告。

这个检查有意保持窄范围：它不能证明凭据有效、账户仍有配额，或适配器包可以成功下载。对于通过适配器接入的 Provider，绿点主要说明 `npx` 可用。

## 模型与 Provider 专属能力

如果 ACP 端点在 `session/new` 阶段上报模型，Code2 会显示模型控件，并在切换时发送 `session/set_model`。如果端点没有上报模型列表，模型仍由 Provider 自己的 CLI 配置决定。

计划、斜杠命令、MCP 工具、图片、浏览器/计算机控制等能力也遵循相同边界：是否可用取决于 Provider、适配器版本和宿主运行时。出现在上表中，不代表它自动拥有所有可选能力。

## 统一的 ACP 循环

八个 Provider 最终都会进入同一条核心链路：

```text
initialize → session/new → session/prompt → stream session/update
           → answer session/request_permission → read StopReason
```

正是这层统一传输，让桌面端、TUI 和远程客户端可以共享与 Provider 无关的会话与事件模型。

支持 MCP 的 Provider 可以在会话开始时接收额外工具。Code2 的 MCP Server 来自 **MCP Skill**；完整说明见[技能文档（英文）](/guide/editor#skill-kinds)和[市场（英文）](/guide/market)。
