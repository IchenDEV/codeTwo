# CodeTwo Provider 模型与思考等级核验（2026-08-20）

> 调研日期：2026-08-20（Asia/Singapore）
>
> 范围：Claude Code、Grok、Cursor Agent、OpenCode、Pi、Kimi Code、ZCode / GLM ACP；Codex 作为对照。
>
> 目标：严格分开“服务商公开模型目录”“对应 CLI 实际接受的模型”“ACP `session/new` 实际上报的模型 / `thought_level`”，为 `crates/core/src/models.rs` 的回退策略提供依据。
>
> 后续核验（2026-08-28）：同一台机器上的 `cursor-agent 2026.07.23-e383d2b` 提供未列在顶层帮助中的 `cursor-agent acp` 子命令；`cursor-agent --acp` 仍然无效。Cursor 官方现已发布 [ACP 文档](https://prod.cursor.com/docs/cli/acp)。下文的 `--acp` 失败记录是旧启动参数的历史证据，不再代表 Cursor 没有 ACP 入口。

## 结论先行

1. **不能把服务商 API 模型目录直接抄成 CLI / ACP 选择器。** Claude Code 受账号、云服务商、组织 allowlist 与 effort cap 影响；OpenCode、Pi、Kimi 都由本地配置和已登录 Provider 生成目录；Cursor 还把 effort、thinking、fast 编进完整模型 ID。服务商目录只能说明“理论可用”，不能证明当前 CLI 或 ACP 会接受。
2. **除 Codex 的 app-server 查询外，`models.rs` 现有静态表大多已经过时或模型 ID 形状不对。** Grok、Cursor、OpenCode、Pi、Kimi、ZCode 都不应继续把现在的静态表当作可信目录。
3. **思考等级必须以当前模型的运行时能力为准，不能按 Provider 统一硬编码。** 明确不应硬编码的 Provider：Claude Code、Grok、Cursor、OpenCode、Pi、Kimi Code、ZCode / GLM ACP；Codex 也应继续以 app-server `model/list` 为主，静态表只能是短期故障回退。
4. **当前最明显的等级错配是 GLM-5.3。** Z.AI 官方服务实际只区分 `low / high / max`，但 `glm-acp-agent@1.6.0` 当前上报 `minimal / low / medium / high / xhigh / max` 六档；其中多档会被服务端归并，用户看到的是伪精度。应优先修适配器，让它只上报真实三档。
5. **Cursor 必须使用 ACP 子命令，不是旧 flag。** 本机 `cursor-agent 2026.07.23-e383d2b` 对 `--acp` 返回 `unknown option`，但 `cursor-agent acp` 可启动 ACP server。模型 / effort 仍应服从真实 ACP 会话，不应由静态表伪造。

### 本次 CodeTwo 兼容处置

- Grok：从模型 `_meta` 读取本机实际四档，并通过 `session/set_mode` 写回。
- GLM-5.3：在 UI 边界把当前适配器的同义值收敛为服务端真实的 `low / high / max`；这是上游修复前的窄兼容层。
- Pi：暂时隐藏 `pi-acp@0.0.33` 固定上报的伪模型级档位；待适配器接入 Pi 的 `get_available_thinking_levels` 后删除该保护。
- Cursor：启动改为 `cursor-agent acp`；只把 `--list-models` 的完整账号 ID 作为原子模型候选，不额外生成组合。

## 证据口径与本机探针

- **厂商目录**：只使用厂商官方文档或官方模型仓库；它说明服务端产品目录，不自动等于 CLI 目录。
- **CLI 目录**：优先使用当前安装 CLI 的 `--help`、模型枚举命令和官方 CLI 文档；这仍可能受账号、区域、套餐和本地配置影响。
- **ACP 目录**：以真实 `initialize` + `session/new` 响应为最高优先级；无法建立会话时，退回到对应适配器当前源码，并标记“未本机确认”。
- **本机版本（2026-08-20）**：`codex-cli 0.148.0`、`grok 1.0.5 (5115b46bc909)`、`cursor-agent 2026.07.23-e383d2b`、`opencode 1.18.18`、`kimi 0.37.2`；未安装 Claude Code 与 Pi。npm 当日最新为 `@agentclientprotocol/claude-agent-acp@0.70.0`、`@agentclientprotocol/codex-acp@1.6.0`、`pi-acp@0.0.33`、`glm-acp-agent@1.6.0`。包版本可在对应官方 npm 页面核对：[Claude ACP](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp)、[Codex ACP](https://www.npmjs.com/package/@agentclientprotocol/codex-acp)、[Pi ACP](https://www.npmjs.com/package/pi-acp)、[GLM ACP](https://www.npmjs.com/package/glm-acp-agent)（访问：2026-08-20）。

真实 ACP 探针均使用当前工作区作为 `cwd`，发送 ACP `protocolVersion: 1` 的 `initialize`，随后发送 `session/new`。没有发送 prompt，也没有修改 Provider 配置。

## 总览矩阵

| Provider | 服务商公开目录 | 当前 CLI 实际目录 | ACP `session/new` 实际上报 | thinking / effort 结论 | 是否可静态硬编码 |
|---|---|---|---|---|---|
| Claude Code | Fable 5、Opus 5、Sonnet 5、Haiku 4.5 | alias、完整模型名、账号 picker、组织 allowlist 共同决定 | 适配器源码：动态 `model` + 当前模型的 `thought_level`；本机未确认 | 模型级 + 组织 cap；`ultracode` 不是模型 effort | 否 |
| Grok | 服务目录与 CLI 账号目录可变 | 本机只有 `grok-4.6` | **已实测**：标准 legacy `models` 仅 `grok-4.6`；effort 在 `_meta.x.ai/sessionConfig` | 本机 `low / medium / high / xhigh`；不是标准 `thought_level` | 否 |
| Cursor Agent | 官方产品页含 Claude 5、GPT-5.6、Gemini 3.x、Composer 2.5、Grok 4.6 等 | **已实测**：账号级长列表；effort / thinking / fast 编入模型 ID | `cursor-agent acp` 入口已确认；账号级 `session/new` payload 待复测 | 不能从模型家族推导；完整 CLI ID 是原子选择 | 否 |
| OpenCode | 75+ Provider，含本地模型；不是单一目录 | 由项目、凭据、Provider、配置生成 | **已实测**：标准动态 `model`；当前模型无 variant，因此无 `thought_level` | variant 名称按模型生成 | 否 |
| Pi | 多 Provider 内置目录 + 自定义 / 已认证模型 | 本机未安装；源码提供运行时 `get_available_models` | `pi-acp` 源码动态拿模型，但静态上报六档 thought level | 适配器已落后于 Pi 的模型级等级 RPC，且漏 `max` | 否 |
| Kimi Code | Kimi K3；API `kimi-k3` | Kimi Code 使用配置 alias，例如 `kimi-code/k3` | 本机因未登录而 `Authentication required`；源码为动态 model + model-specific thought level | K3 为 `low / high / max`、不可关闭；API 默认 `max`，账号 ACP 默认未确认 | 否 |
| ZCode / GLM ACP | Coding Plan：GLM-5.3、GLM-5-Turbo、GLM-4.7 | CodeTwo 实际启动社区 `glm-acp-agent` | 适配器上报标准 model + thought level | 5.3 适配器六档，但服务端只有 `low / high / max` 三个有效档 | 否；先修适配器 |
| Codex（对照） | API 最新为 GPT-5.6 Sol / Terra / Luna | 本机 Codex app-server 返回账号可用目录 | 非 ACP；CodeTwo 已调用 `model/list` | app-server 是模型级能力，且与公开 API 档位并不完全相同 | 仅限故障回退 |

## Provider 逐项核验

### 1. Claude Code

#### 服务商公开模型目录

- Anthropic 当前公开最新模型为 Claude Fable 5、Claude Opus 5、Claude Sonnet 5、Claude Haiku 4.5；API ID 分别为 `claude-fable-5`、`claude-opus-5`、`claude-sonnet-5`、`claude-haiku-4-5-20251001`。这是 API / 平台目录，不代表某个 Claude Code 账号全部可见。[Anthropic Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)（访问：2026-08-20）。

#### Claude Code 接受的模型

- Claude Code 当前接受 alias 或完整模型名。稳定 alias 包括 `default`、`best`、`fable`、`sonnet`、`opus`、`haiku`、`sonnet[1m]`、`opus[1m]`、`opusplan`；alias 解析结果随 Provider、账号和版本变化。Anthropic API 当前 `opus → Opus 5`、`sonnet → Sonnet 5`，但 Bedrock、Foundry 等可解析到不同版本。[Claude Code model configuration](https://code.claude.com/docs/en/model-config#model-aliases)（访问：2026-08-20）。
- CLI 的 `/model` picker 受账号可用性、`availableModels`、组织模型限制和云 Provider 影响。完整模型名虽然可被 `--model` 接受，也不等于该账号请求时一定成功。[Claude Code model configuration](https://code.claude.com/docs/en/model-config#setting-your-model)（访问：2026-08-20）。

#### ACP 实际上报

- 本机未安装 `claude`，所以无法对账号做真实 `session/new`；此项标记为**未本机确认**。
- `@agentclientprotocol/claude-agent-acp@0.70.0` 当前实现从 Claude Agent SDK 初始化结果取 `availableModels`，再应用用户 `availableModels` allowlist；`configOptions` 的 `model` 来自该动态列表，`thought_level` 来自**当前模型**的 `supportedEffortLevels`，并包含 `Default` 哨兵值。源码：[动态模型状态](https://github.com/agentclientprotocol/claude-agent-acp/blob/d334766ef95dd89201979d42252e3d2a5a259cb9/src/acp-agent.ts#L7680-L7720)、[按当前模型构造 effort](https://github.com/agentclientprotocol/claude-agent-acp/blob/d334766ef95dd89201979d42252e3d2a5a259cb9/src/acp-agent.ts#L7180-L7270)（访问：2026-08-20）。

#### thinking / effort

- Claude Code 当前 effort 是模型级能力：Fable 5、Opus 5、Sonnet 5、Opus 4.8、Opus 4.7 支持 `low / medium / high / xhigh / max`；Opus 4.6、Sonnet 4.6 支持 `low / medium / high / max`；其他未列模型不支持 effort。组织还可按模型设置上限，进一步缩短菜单。[Claude Code effort levels](https://code.claude.com/docs/en/model-config#adjust-effort-level)（访问：2026-08-20）。
- `ultracode` 是 Claude Code 工作流设置：给模型发送 `xhigh` 并启用额外编排，不是第六个模型 effort；不应和 `low…max` 平铺为同一协议档位。[Claude Code effort levels](https://code.claude.com/docs/en/model-config#choose-an-effort-level)（访问：2026-08-20）。

**对 CodeTwo 的含义**：静态回退最多保留不会迅速过期的 CLI alias，并补齐 `default / best / fable / opus / sonnet / haiku / opusplan`；不能给 alias 绑定固定 effort。会话建立后必须完全服从 ACP `configOptions`，包括组织 cap 后的结果。

### 2. Grok

#### 服务商目录与 CLI

- 官方 Grok Build 支持 `grok models`、`--model` 和 `--effort`；模型、默认 effort 和可选 effort 可由远端 catalog 返回，而不是编译期常量。[Grok Build repository](https://github.com/xai-org/grok-build)、[模型目录实现](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-shell/src/agent/models.rs)（访问：2026-08-20）。
- 本机 `grok 1.0.5` 的 `grok models` 实际只返回 `grok-4.6`，且它是 default。这个账号级结果优先于仓库中可能滞后的示例文本，不能据示例继续展示 `grok-4`、`grok-4-fast` 或 `grok-code-fast-1`。

#### ACP 实际上报（已实测）

- `session/new.models.availableModels` 只有 `grok-4.6`，标准 legacy 模型接口可直接被 CodeTwo 使用。
- 模型 `_meta` 上报 `supportsReasoningEffort: true`、当前 `reasoningEffort: xhigh`，以及远端菜单 `xhigh / high / medium / low`；其中 `high` 被标记为 catalog default。
- 它**没有**标准 `configOptions`。effort 另放在 `_meta["x.ai/sessionConfig"].options`，而且 category 是 `mode`，不是 `thought_level`。当前 CodeTwo 若只解析标准 `configOptions`，会看见模型但看不见 Grok 的 effort。
- 官方实现明确优先解析远端 `reasoningEfforts`；只有远端没有可用列表时才退到内置菜单。[Grok ACP model state](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/src/acp/model_state.rs)（访问：2026-08-20）。

**对 CodeTwo 的含义**：把 Grok 回退模型收敛为当前 `grok-4.6` 只能临时止血；更可靠的是在会话前调用 `grok models`，会话后使用标准 `models`。effort 不应硬编码，短期可解析 xAI `_meta`，长期应推动 Grok 输出标准 `configOptions(category: thought_level)`。

### 3. Cursor Agent

#### 服务商公开目录

- Cursor 当前产品目录包括 Claude Fable 5 / Opus 5 / Sonnet 5、Composer 2.5、Gemini 3.1 Pro / 3.6 Flash、GPT-5.6 Sol / Terra / Luna、Cursor Grok 4.5 / 4.6 等；产品目录仍不等于某账号 CLI 清单。[Cursor models](https://cursor.com/docs)（访问：2026-08-20）。
- Cursor 官方说明 Grok 4.6 在其产品中有 `low / medium / high / xhigh` 四档，named-model default 为 `high`；套餐还可能固定档位。[Cursor Grok 4.6](https://cursor.com/help/models-and-usage/grok-4-6)（访问：2026-08-20）。

#### CLI 实际接受的模型（已实测）

- `cursor-agent --list-models` 返回当前账号的完整可用 ID；本机列表含 `composer-2.5`、Claude 5 系列、GPT-5.6 系列、`cursor-grok-4.6-*`、Gemini 3.x、Kimi K3 等。
- effort、thinking、context 和 fast 常被编码进完整模型 ID，例如 `cursor-grok-4.6-xhigh-fast`、`claude-opus-5-thinking-max`、`gpt-5.6-sol-medium-fast`。CLI 也支持参数化写法，例如 `claude-opus-4-8[context=1m,effort=high,fast=false]`。官方 CLI changelog 提供 `agent models` / `--list-models` 作为账号目录入口。[Cursor CLI changelog](https://cursor.com/changelog/cli-jan-08-2026)（访问：2026-08-20）。

#### ACP 实际上报

- 本机 `cursor-agent 2026.07.23-e383d2b --acp` 立即返回 `error: unknown option '--acp'`；正确入口是未列在顶层帮助中的 `cursor-agent acp`，其帮助明确说明会启动 ACP server。
- Cursor 官方 ACP 文档列出 `cursor/task` 等扩展。CodeTwo 启动配置必须使用 `cursor-agent acp`；账号级模型与 `thought_level` 仍需通过真实 `session/new` 复测。

**对 CodeTwo 的含义**：启动参数改为 `cursor-agent acp`，不能用静态模型表掩盖会话探测失败。若仍要提供会话前选项，应实时解析 `cursor-agent --list-models`，并把每个返回 ID 视为原子选择；不要再额外生成独立的 thought level，否则会与 ID 内 effort 重复或组合出 CLI 不接受的值。

### 4. OpenCode

#### 服务商目录与 CLI

- OpenCode 使用 75+ Provider，也支持 Ollama、LM Studio、vLLM 和自定义 Provider；当前项目可选目录由凭据、Provider 可用性、配置和 catalog 共同决定。[OpenCode models](https://opencode.ai/docs/models)（访问：2026-08-20）。
- OpenCode v2 文档明确要求客户端只展示当前模型提供的 variant；variant 是模型级请求 overlay，名称可能是 reasoning effort，也可能是别的含义，不能假定每个模型都有 `low / high / max`。[OpenCode v2 models](https://opencode.ai/v2/docs/models#variants)（访问：2026-08-20）。

#### ACP 实际上报（已实测）

- 本机 `opencode 1.18.18` 的 `session/new.configOptions` 标准上报 `category: model`。当前账号 / 项目得到 27 个模型，来自 DeepSeek、OpenCode Go、OpenCode Zen，当前值为 `opencode/big-pickle`。
- 当前模型没有 variant，因此 ACP **没有** `category: thought_level`；这不是能力缺失 bug，而是该模型运行时没有可展示 variant。
- 官方源码按当前 Provider catalog 构造 model options，只在当前模型存在 variants 时构造 `thought_level`。[OpenCode ACP config options](https://github.com/anomalyco/opencode/blob/6386e67949a512254d8587a13cbed906f829f857/packages/opencode/src/acp/config-option.ts)（访问：2026-08-20）。

**对 CodeTwo 的含义**：删除当前四条固定模型作为“可信目录”。会话前可以调用 OpenCode 自身的模型枚举命令，或者只在会话建立后显示 ACP 目录；`thought_level` 必须完全来自当前模型 variants，模型切换后刷新。

### 5. Pi

#### CLI 模型与 thinking 能力

- Pi 是多 Provider / BYOK 运行时，当前默认模型示例包括 Anthropic `claude-opus-4-8`、OpenAI / OpenAI Codex `gpt-5.5`、xAI `grok-4.6`、Z.AI `glm-5.3`，但真实可用目录仍取决于认证和配置。[Pi model resolver](https://github.com/badlogic/pi-mono/blob/496185f6e4267b979e3663c45f7eb70b0c6a97b4/packages/coding-agent/src/core/model-resolver.ts#L15-L45)（访问：2026-08-20）。
- Pi RPC 已提供 `get_available_models` 和 `get_available_thinking_levels`；后者基于当前模型返回模型级等级。[Pi RPC mode](https://github.com/badlogic/pi-mono/blob/496185f6e4267b979e3663c45f7eb70b0c6a97b4/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L480-L515)（访问：2026-08-20）。
- Pi 的等级算法为：非 reasoning 模型只有 `off`；reasoning 模型基础候选为 `off / minimal / low / medium / high / xhigh / max`，但 `thinkingLevelMap` 可删除任意项，`xhigh / max` 只有模型明确映射时才出现。[Pi model-specific thinking](https://github.com/badlogic/pi-mono/blob/496185f6e4267b979e3663c45f7eb70b0c6a97b4/packages/ai/src/models.ts#L900-L924)（访问：2026-08-20）。

#### ACP 适配器状态

- 本机未安装 Pi，无法建立真实会话；此项标记为**未本机确认**。
- `pi-acp@0.0.33` 会动态请求 `get_available_models`，但 `thought_level` 仍固定写死 `off / minimal / low / medium / high / xhigh`，既没有调用 Pi 新增的 `get_available_thinking_levels`，也遗漏了 `max`。[pi-acp current implementation](https://github.com/svkozak/pi-acp/blob/d1cffc047ab37a096ee70ca39cfc1de463db8d12/src/acp/agent.ts#L1200-L1300)（访问：2026-08-20）。

**对 CodeTwo 的含义**：Pi 模型与 thought level 都不能静态硬编码。正确修复点是更新 / fork `pi-acp`，让它在创建会话和模型切换后调用 Pi 的 `get_available_thinking_levels` 并发送 `config_option_update`；CodeTwo 不应再在外层补一个通用六档菜单。

### 6. Kimi Code

#### 服务商公开模型目录

- Moonshot 当前旗舰是 Kimi K3，公开 API ID 为 `kimi-k3`。K3 始终开启 thinking，API `reasoning_effort` 只接受 `low / high / max`，默认 `max`。[Kimi K3 official repository](https://github.com/MoonshotAI/Kimi-K3#6-model-usage)（访问：2026-08-20）。

#### Kimi Code CLI 实际模型形状

- Kimi Code 不是直接把服务商 API ID 当选择器值；它从 `~/.kimi-code/config.toml` 读取模型 alias。官方当前完整示例以 `kimi-code/k3` 为 default，并同时配置 `kimi-code/kimi-for-coding` 与 `kimi-code/kimi-for-coding-highspeed`。[Kimi Code config files](https://moonshotai.github.io/kimi-code/en/configuration/config-files)（访问：2026-08-20）。
- 当前配置文档的完整示例中，managed `kimi-code/k3` 指向底层 `k3`，声明 `thinking + always_thinking`、`support_efforts = ["low", "high", "max"]`、`default_effort = "max"`；用户还可覆盖模型和能力，所以这个列表不是所有安装的固定全局目录。[同一官方配置文档](https://moonshotai.github.io/kimi-code/en/configuration/config-files)（访问：2026-08-20）。
- **默认值仍有官方文档内部矛盾。** 同一页的 secondary-model 示例又把 `/login` provisioned 的 `kimi-code/k3` 描述成 default `high`。因此能确认的只有可选集合 `low / high / max` 与“不能关闭”；服务 API 默认是 `max`，但具体 Kimi Code 登录账号通过 ACP 上报的 current/default 要等真实登录会话确认。

#### ACP 实际上报

- 本机 `kimi 0.37.2` 可以启动 `kimi acp`，但 `session/new` 返回 `Authentication required`，所以账号实际 model / `thought_level` 菜单为**未确认**。
- 当前官方源码从 harness 配置生成模型目录；只在当前模型声明 thinking 时产生标准 `category: thought_level`，effort-capable 模型使用自己的 `support_efforts`，`always_thinking` 模型不会出现 `off`。[Kimi ACP config options](https://github.com/MoonshotAI/kimi-code/blob/fa9865f2ee653133295992489554bb2db05a9db5/packages/acp-adapter/src/config-options.ts)、[Kimi ACP model catalog](https://github.com/MoonshotAI/kimi-code/blob/fa9865f2ee653133295992489554bb2db05a9db5/packages/acp-adapter/src/model-catalog.ts)（访问：2026-08-20）。

**对 CodeTwo 的含义**：当前静态 `k3` / `k3-256k` / `kimi-for-coding*` 与 Kimi Code alias 形状不一致；`k3-256k` 没有当前官方证据，应删除。如果必须保留紧急回退，至少使用 `kimi-code/k3`、`kimi-code/kimi-for-coding`、`kimi-code/kimi-for-coding-highspeed`，但首选仍是解析配置 / ACP。K3 思考档只能显示 `low / high / max`，不得显示 `off / minimal / medium / xhigh`；选择器 current/default 必须采用 ACP 值，不能从文档猜。

### 7. ZCode / GLM ACP

#### 先厘清 Provider 身份

- CodeTwo 的 `ZCode` 实际执行 `npx -y glm-acp-agent`；这不是 Z.AI 官方 ZCode 应用的内建协议，而是社区适配器。研究必须分别看 Z.AI 官方服务语义和该适配器实际上报什么。[glm-acp-agent repository](https://github.com/stefandevo/glm-acp-agent)（访问：2026-08-20）。

#### 服务商公开模型目录

- Z.AI Coding Plan 当前支持 `GLM-5.3`、`GLM-5-Turbo`、`GLM-4.7`。请求旧 `GLM-5.2 / GLM-5.1` 会自动路由到 `GLM-5.3`。[Z.AI Coding Plan overview](https://docs.z.ai/devpack/overview#supported-models)（访问：2026-08-20）。
- GLM-5.3 是强制 thinking，不能关闭。[Z.AI Thinking Mode](https://docs.z.ai/guides/capabilities/thinking-mode#default-thinking-behaviour)（访问：2026-08-20）。
- Z.AI 官方对 GLM-5.3 的实际 effort 归并规则只有三档：`minimal / light / low → low`，`medium / high → high`，`xhigh / max / ultra → max`；禁用 thinking 也只会归为 `low`，默认 `max`。[Z.AI switch effort](https://docs.z.ai/devpack/latest-model#switch-effort-thinking-intensity)（访问：2026-08-20）。

#### ACP 适配器实际上报

- `glm-acp-agent@1.6.0` 当前模型选项为 `glm-5.3`（default）、`glm-5-turbo`、`glm-4.7`；旧 5.2 / 5.1 和 4.5 Air 不再作为独立模型广告。[适配器 README](https://github.com/stefandevo/glm-acp-agent/blob/b1c21fd627a8cd3e3342d69c5cb8ce5299c18281/README.md#models)（访问：2026-08-20）。
- 适配器标准 `configOptions` 对 GLM-5.3 上报 `minimal / low / medium / high / xhigh / max`，对其他 thinking 模型上报 `off / on`。[适配器 thought-level 实现](https://github.com/stefandevo/glm-acp-agent/blob/b1c21fd627a8cd3e3342d69c5cb8ce5299c18281/src/llm/glm-client.ts#L1-L95)（访问：2026-08-20）。
- 这六档虽能被 API 接受，却不是六种可区分行为；按官方映射，`minimal` 与 `low` 相同，`medium` 与 `high` 相同，`xhigh` 与 `max` 相同。因此适配器当前 UI 是“协议接受值”，不是“服务真实档位”。

**对 CodeTwo 的含义**：模型回退只保留 `glm-5.3 / glm-5-turbo / glm-4.7`。思考等级不要在 `models.rs` 写死；先向 `glm-acp-agent` 修补 / 提交问题，使 GLM-5.3 只上报 `low / high / max`，默认 `max` 且无 `off`。CodeTwo 应继续忠实渲染 Provider `configOptions`，不要建立一个长期的 Provider 特判归并层，否则适配器修复后会产生双重转换。

### 8. Codex（对照）

#### 服务商公开目录与 Codex app-server 的区别

- OpenAI 公开 API 当前推荐 GPT-5.6 Sol、Terra、Luna，公开 API 页面列出的通用 reasoning 档位为 `none / low / medium / high / xhigh / max`。[OpenAI models](https://developers.openai.com/api/docs/models)（访问：2026-08-20）。
- 这不等于 Codex 客户端目录。本机 `codex-cli 0.148.0` 的 `app-server model/list` 实际返回：

| Codex 模型 | app-server 实际档位 | default |
|---|---|---|
| `gpt-5.6-sol` | `low / medium / high / xhigh / max / ultra` | `low` |
| `gpt-5.6-terra` | `low / medium / high / xhigh / max / ultra` | `medium` |
| `gpt-5.6-luna` | `low / medium / high / xhigh / max` | `medium` |
| `gpt-5.5` | `low / medium / high / xhigh` | `medium` |
| `gpt-5.4` | `low / medium / high / xhigh` | `medium` |
| `gpt-5.4-mini` | `low / medium / high / xhigh` | `medium` |
| `gpt-5.3-codex-spark` | `low / medium / high / xhigh` | `high` |

- app-server 还把 GPT-5.4 / 5.4 Mini 标记为将迁移到 Terra / Luna。CodeTwo 当前 `available_models` 已正确优先调用 `model/list`，而且静态 fallback 与本机当日结果一致。
- 公开 API 有 `none`，Codex app-server 当日列表没有；Codex app-server 另有 `ultra`。这正是不能从服务商 API 页面推导 CLI thinking selector 的直接反例。

**对 CodeTwo 的含义**：保留 app-server 动态查询为唯一权威；静态表只作为短期故障回退并标注 snapshot 日期。另需注意 `provider.rs` 仍固定启动 `@agentclientprotocol/codex-acp@1.1.14`，而当日 npm 最新是 1.6.0；会话期适配器能力可能因此落后于本机 Codex CLI，升级需单独兼容性验证。

## 对 `crates/core/src/models.rs` 的具体建议

### P0：先消除“看似可选、实际不可用”

1. **Cursor**：在找到官方可用 ACP 启动方式前，不要返回当前四个静态模型；明确把 Provider 标成不可启动，或暂时禁用。若产品仍需要会话前列表，解析 `cursor-agent --list-models`，完整 ID 原样透传。
2. **ZCode**：静态模型改为 `glm-5.3`、`glm-5-turbo`、`glm-4.7`；移除 `glm-5.2`、`glm-5.1`、`glm-4.5-air`。
3. **Kimi**：移除无当前依据的 `k3-256k`；不要把底层 `k3` 当成 Kimi Code alias。紧急回退使用 `kimi-code/k3`、`kimi-code/kimi-for-coding`、`kimi-code/kimi-for-coding-highspeed`，或者直接返回空并等待 ACP。
4. **Grok**：旧三项替换为 `grok-4.6` 只能作为当日 snapshot；优先新增 `grok models` 动态发现。

### P1：把动态发现从 Codex 扩展到 Provider-specific discovery

建议将 `available_models` 从“Codex 特判”改为按 Provider 路由的发现层：

| Provider | 会话前发现 | 会话建立后权威来源 |
|---|---|---|
| Claude Code | 稳定 alias 作为降级；不猜完整模型 | ACP `configOptions(model)` |
| Codex | `app-server model/list` | 当前 Codex / adapter 报告 |
| Grok | `grok models` | ACP legacy `models` + 远端 metadata |
| Cursor | `cursor-agent --list-models`，仅在 transport 修好后 | 未确认 |
| OpenCode | OpenCode 自身模型枚举，或不做会话前目录 | ACP `configOptions(model)` |
| Pi | 不维护通用 catalog | ACP / Pi RPC 动态模型 |
| Kimi | 解析有效 config alias，或不做会话前目录 | ACP `configOptions(model)` |
| ZCode | 三项短表可作应急回退 | ACP `configOptions(model)` |

发现失败时宁可展示“进入会话后由 Provider 加载”，也不要展示一个会被 CLI 拒绝的旧模型。

### P1：模型和思考等级保持两个状态轴

- 不要把所有 Provider 都模仿 Codex fallback，生成 `model[effort]` 笛卡尔积。
- 标准 ACP Provider 应使用 `configOptions(category: model)` 与 `configOptions(category: thought_level)` 两个独立控件；模型切换后重新读取 / 接收 `config_option_update`，因为可用等级会变。
- Cursor 是例外：它当前 CLI 返回的完整 ID 已经把 effort / thinking / fast 编码在模型 ID 中；在没有官方 ACP schema 前应视为一个原子列表，而不是再叠加 thought level。
- Grok 当前是另一个临时例外：effort 存在 xAI `_meta`，需要兼容解析或推动上游标准化。

### P1：修正上游适配器而非堆积 CodeTwo 特判

1. `glm-acp-agent`：GLM-5.3 的 `thought_level` 改为 `low / high / max`。
2. `pi-acp`：改用 Pi `get_available_thinking_levels`，支持 `max` 和模型级删减；切换模型后推送新菜单。
3. Grok：推动标准 `configOptions(thought_level)`；在此之前仅做清晰隔离的 `_meta` 兼容层。
4. Claude / OpenCode / Kimi：它们已经按当前模型动态产生标准 `thought_level`，CodeTwo 不应覆盖。

### P2：给静态回退加可维护性边界

- 每个 fallback 条目记录 `verified_at` 或在源码注释中写核验日期；动态查询失败时可在 UI 标注“离线回退”。
- 测试重点从“每个 Provider 静态列表非空”改为：动态 Provider 可以合法返回空、Provider 报告优先于 fallback、模型切换会替换 thought level、未知等级原样可渲染。
- `ultra`、`ultracode`、`fast`、`thinking` 不应仅凭名字归为同一维度：`ultra` 在 Codex app-server 是 reasoning option，`ultracode` 在 Claude Code 是工作流模式，Cursor 的 `fast` 是模型 ID 变体。

## 仍未确认

1. **Claude Code 账号级 ACP 实际 payload**：本机未安装 / 登录 Claude Code；源码能证明动态行为，但不能证明当前账号会显示哪些模型、是否受组织 allowlist / effort cap。
2. **Pi 账号级 ACP 实际 payload**：本机没有 Pi；`pi-acp@0.0.33` 源码已证明固定六档问题，但没有真实 session 输出。
3. **Kimi Code 登录后的实际 ACP payload**：本机 `session/new` 被 `Authentication required` 阻断；官方配置和源码表明 K3 应为 `low / high / max`，但同一官方配置页对 provisioned alias 的 default 同时出现 `max` 与 `high` 两种描述，账号还可能下发不同 alias / override。
4. **Cursor 账号级 ACP payload**：官方入口与本机 `cursor-agent acp` 已确认；仍需在已登录会话中复测 `session/new` 的模型和思考等级 payload。
5. **Grok 标准化计划**：当前 xAI ACP 确实把 effort 放在专有 `_meta`，没有证据表明何时会迁移为标准 `configOptions`。
6. **GLM adapter 上游是否会接受三档修正**：服务端三档语义有官方证据，但社区适配器当前刻意暴露六个“可接受字符串”；需要上游 issue / PR 决策。

## 主要一手来源索引

所有链接访问日期均为 2026-08-20。

- Anthropic：[Claude Code model configuration](https://code.claude.com/docs/en/model-config)、[Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview)、[Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort)、[Claude ACP source](https://github.com/agentclientprotocol/claude-agent-acp/tree/d334766ef95dd89201979d42252e3d2a5a259cb9)
- SpaceXAI：[Grok Build](https://github.com/xai-org/grok-build)、[ACP model state](https://github.com/xai-org/grok-build/blob/d92c5b0b8582fda358de1f97446aa74af44a464f/crates/codegen/xai-grok-pager/src/acp/model_state.rs)
- Cursor：[Models](https://cursor.com/docs)、[Grok 4.6 effort](https://cursor.com/help/models-and-usage/grok-4-6)、[CLI model listing](https://cursor.com/changelog/cli-jan-08-2026)
- OpenCode：[Models](https://opencode.ai/docs/models)、[V2 model / variants semantics](https://opencode.ai/v2/docs/models)、[ACP config implementation](https://github.com/anomalyco/opencode/blob/6386e67949a512254d8587a13cbed906f829f857/packages/opencode/src/acp/config-option.ts)
- Pi：[Pi model-specific levels](https://github.com/badlogic/pi-mono/blob/496185f6e4267b979e3663c45f7eb70b0c6a97b4/packages/ai/src/models.ts#L900-L924)、[Pi RPC](https://github.com/badlogic/pi-mono/blob/496185f6e4267b979e3663c45f7eb70b0c6a97b4/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L480-L515)、[pi-acp](https://github.com/svkozak/pi-acp/tree/d1cffc047ab37a096ee70ca39cfc1de463db8d12)
- Moonshot AI：[Kimi K3](https://github.com/MoonshotAI/Kimi-K3)、[Kimi Code config](https://moonshotai.github.io/kimi-code/en/configuration/config-files)、[Kimi ACP source](https://github.com/MoonshotAI/kimi-code/tree/fa9865f2ee653133295992489554bb2db05a9db5/packages/acp-adapter)
- Z.AI / GLM ACP：[Coding Plan models](https://docs.z.ai/devpack/overview#supported-models)、[GLM-5.3 effort mapping](https://docs.z.ai/devpack/latest-model#switch-effort-thinking-intensity)、[Thinking mode](https://docs.z.ai/guides/capabilities/thinking-mode)、[glm-acp-agent](https://github.com/stefandevo/glm-acp-agent/tree/b1c21fd627a8cd3e3342d69c5cb8ce5299c18281)
- OpenAI：[Model catalog](https://developers.openai.com/api/docs/models)
