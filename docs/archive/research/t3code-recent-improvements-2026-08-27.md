# t3code 冻结点后增量复核与 CodeTwo 后续吸纳建议

> 证据截止：2026-08-27 21:04（Asia/Singapore，13:04 UTC）
> 上游增量起点：[`b0a028126915`](https://github.com/pingdotgg/t3code/commit/b0a0281269156295e2202d31198829bd3b500bdf)（2026-08-26 04:04:35 UTC）
> 上游复核终点：[`a6797b3b97dc`](https://github.com/pingdotgg/t3code/commit/a6797b3b97dca6b6941574ff062d069c45c89b9a)（2026-08-27 09:58:24 UTC）
> 稳定版变化：[`v0.0.34`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.34) → [`v0.0.35`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.35)（2026-08-27 05:36:01 UTC）
> CodeTwo 复核对象：本地 checkout `4d690a8ed9a4` 加当前未提交工作树；这不是已发布版本

## 结论

**无重大新增。**

### [事实]

GitHub compare 在冻结点与复核终点之间显示 **9 个 commit、67 个文件变化**。其中 [`v0.0.35`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.35) 相对冻结点只前进 4 个 commit：会话重新活跃后的排序 [#8231](https://github.com/pingdotgg/t3code/pull/8231)、release CI 优化 [#8250](https://github.com/pingdotgg/t3code/pull/8250)、公开下载 macOS preview DMG [#8243](https://github.com/pingdotgg/t3code/pull/8243)、Codex 0.150 multi-agent schema 兼容 [#8346](https://github.com/pingdotgg/t3code/pull/8346)。release notes 还列出 [#8248](https://github.com/pingdotgg/t3code/pull/8248)，但其 merge commit 正是本报告的冻结点，不属于新增增量。

稳定版之后、截至复核终点的 `main` 又合并了 Grok 运行可靠性 [#8358](https://github.com/pingdotgg/t3code/pull/8358)、过期 Codex 审批回调恢复 [#5195](https://github.com/pingdotgg/t3code/pull/5195)、纯测试删除 [#8252](https://github.com/pingdotgg/t3code/pull/8252) 与投影启动追赶 [#7538](https://github.com/pingdotgg/t3code/pull/7538)，另有一个 release preparation commit。这些 post-release 变化不能称为稳定版已交付功能。

### [推断或建议]

这 24 小时的增量以兼容性、生命周期收敛和发布流水线为主，没有新的产品面或架构不变量足以改变 2026-08-26 报告的方向。七项原优先缺口已经在当前 CodeTwo checkout 落地，因此后续不应重复实现；接下来最值得做的是补齐它们周围仍存在的权威确认、静默恢复和可诊断性边界。

## 当前仍值得吸纳的保守排序

| 排名 | 优先级 | 候选 | 增量来源 | CodeTwo 判断 |
| --- | --- | --- | --- | --- |
| 1 | P0/P1 | 审批响应必须返回权威结果，并收敛过期 route | [#5195](https://github.com/pingdotgg/t3code/pull/5195) | **有具体小缺口**：Core 能识别 unknown/duplicate request，但 Desktop command 仍统一返回 `true` |
| 2 | P1 | provider 静默 turn 的 liveness watchdog | [#8358](https://github.com/pingdotgg/t3code/pull/8358) | **明确缺口**：当前 prompt future 没有基于进展的静默超时 |
| 3 | P1 | 用“重新活跃时间”而非创建时间定义 Recent | [#8231](https://github.com/pingdotgg/t3code/pull/8231) | **明确缺口**：会话列表仍以 `created_at` 排序，旧会话新开一轮不会回到顶部 |
| 4 | P1 | Codex adapter/CLI 兼容性 canary | [#8346](https://github.com/pingdotgg/t3code/pull/8346) | **风险已证实、C2 影响未确认**：不要复制 T3 schema patch，应验证 C2 实际 adapter 边界 |
| 5 | P1/P2 | 可导出、默认脱敏的 provider/process diagnostics | v0.0.34 既有候选；本次兼容性与静默故障再次强化其价值 | **仍未吸纳**：当前主要依赖 tracing/debug，用户难以形成可分享的故障证据包 |

## 1. 审批响应的权威确认与过期 route 收敛

### [事实]

上游 [#5195](https://github.com/pingdotgg/t3code/pull/5195) 处理的是“审批卡可持久化、provider callback 只在内存中”的失配：Codex 重启后，旧卡回答可能返回 `Unknown pending Codex approval request`。上游在 [`ProviderCommandReactor.ts@230c5d4`](https://github.com/pingdotgg/t3code/blob/230c5d4a5cc31656de3d46719e7f4d2a13369991/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts) 将它归一到已有的 provider-neutral stale approval failure，清除不可执行的 pending 状态，同时不伪造 `approval.resolved`，也不执行原命令。

### [CodeTwo 当前事实]

CodeTwo 的精确重启故障已被另一种设计规避：[`Store::normalize_interrupted_activities`](../../../crates/core/src/store.rs) 在新进程展示 session list 前，把持久化的 `Running/AwaitingInput` 转成不可操作的 `Interrupted`；不存在 callback 的旧 pending input 不会继续呈现为可回答卡片。

但当前 [`engine.answer_permission`](../../../crates/plugins/src/app/plugins/engine.rs) command 在 `Engine::submit(Op::AnswerPermission)` 成功后固定返回 `true`，而 [`Engine::answer_permission`](../../../crates/core/src/engine.rs) 本身已经能对 wrong-session、unknown、duplicate request 返回 `false`。Desktop 因此无法得到真实业务确认。`ActivityTracker::answer_permission` 还会忽略 oneshot receiver 已关闭时的 `send` 结果。

### [推断或建议]

先做这个小而直接的修复：command 返回 Core 的真实 boolean；elicitation 保持同一语义；重复、过期、错误 session 和错误 option 都不得回报成功。若 route 在取出后发现 receiver 已关闭，应以捕获的 turn identity 收敛为失败或重新读取当前 activity，不能让新 turn 被旧回调覆盖。

验收至少覆盖：重复回答、错误 session、provider 在回答前退出、回答与自然 terminal 竞速、重启后 pending 不可操作。不要复制上游的 Codex 错误字符串表，因为 C2 的 provider callback 边界在 ACP adapter 内。

## 2. provider 静默 turn 的 liveness watchdog

### [事实]

post-release `main` 的 [#8358](https://github.com/pingdotgg/t3code/pull/8358) 为 Grok ACP turn 增加静默 watchdog：普通静默与存在 active tool 时使用不同窗口，并在 steer、plan、approval 和 user input 等真实进展上刷新 liveness。该 PR 同时包含 Grok skills、reasoning、plan 与 usage 支持；这些是 Grok 专属实现，不应与通用 watchdog 混为一项。

### [CodeTwo 当前事实]

[`engine.rs`](../../../crates/core/src/engine.rs) 的 turn task 直接等待 `client.prompt(&acp_sid, blocks).await`。连接关闭会得到错误，用户 cancel 失败也已有 recovery，但“子进程仍存活、RPC future 长时间无任何有效进展”的情况没有超时或 watchdog，session 可以一直保持 Running。

### [推断或建议]

做 provider-neutral、progress-aware 的 watchdog，而不是照抄 Grok 的 10/30 分钟常数：记录最后一个可信 progress revision，区分生成文本、active tool、等待用户输入和完全静默；超时先请求 cancel，再复用现有 captured-turn recovery，必要时终止 provider。长编译、等待网络和用户审批不能被普通静默阈值误杀。

第一步只做可观测与 fixture，不立即启用强制终止：证明一个 mock provider 保持连接但停止响应时，C2 能给出明确状态，并且旧 watchdog 不能终止已经自然完成或开始新 turn 的 session。

## 3. 会话重新活跃后的 Recent 排序

### [事实]

稳定版 [#8231](https://github.com/pingdotgg/t3code/pull/8231) 在 thread 重新进入 active list 时记录 `unsettledAt`，客户端以 `max(createdAt, unsettledAt)` 作为排序锚点；settle 时清除该值。它刻意不让普通 activity chunk 持续重排列表。上游也明确留下限制：客户端推导的自动 settle 没有 server event，尚不能获得同样的 re-entry stamp。

### [CodeTwo 当前事实]

[`Store::query_sessions`](../../../crates/core/src/store.rs) 对 active session 使用 `pinned DESC, created_at DESC`；[`SessionRail`](../../../apps/desktop/src/sidebar/SessionRail.tsx) 又按相同规则排序。因此“Recent chats”实际是“最近创建”，一个很久以前的 session 即使刚接受新 prompt，仍留在旧位置。

### [推断或建议]

增加一个语义窄的 `last_active_at` 或 `reentered_at`，只在用户 prompt 被 Core durable-accept、显式 unarchive/reopen 等高价值动作上更新；不要在 token、tool update 或后台同步上更新。pinned 分组仍优先，组内才按新锚点排序。这样吸收的是“重新投入工作的对象回到视野”，不是复制 t3code 的 settle 模型。

## 4. Codex adapter/CLI 兼容性 canary

### [事实]

稳定版 [#8346](https://github.com/pingdotgg/t3code/pull/8346) 证明 Codex 0.150 新增的 multi-agent enum 会让 T3 Code 的固定 app-server schema 拒绝持久化 history：`subAgentActivity.kind = completed` 可阻断 `thread/resume`，新的 collaboration tool/status 也可能在 live decode 时丢失。上游选择在 schema generator 中加入兼容 override，而不是进行一次包含大量无关变化的完整协议刷新。

### [CodeTwo 当前事实]

CodeTwo 不直接使用 T3 的 `effect-codex-app-server` schema。默认 provider 启动的是固定 [`@agentclientprotocol/codex-acp@1.6.2`](../../../crates/core/src/provider.rs)；该 adapter 的 1.6.2 源码依赖 [`@openai/codex ^0.148.0`](https://github.com/agentclientprotocol/codex-acp/blob/9780d314d34616b476b1ae451ad31089b3dce49a/package.json)，所以不能把 T3 的 Codex 0.150 故障直接宣称为 C2 已复现。C2 对未知 ACP `session/update` 会记录 debug 后继续连接，这能避免整个 reader 崩溃，但也可能静默失去新事件。

在证据截止前，`codex-acp` 的 native ACP subagent sessions 已在 [#419](https://github.com/agentclientprotocol/codex-acp/pull/419) 合并，但 npm 查询到的稳定版本仍是 1.6.2；是否以及何时升级不属于本报告已确认事实。

### [推断或建议]

不要把 #8346 的 enum 硬编码复制进 Core。建立 adapter/CLI 兼容性 canary：对 C2 支持的固定版本组合运行 `new → multi-agent turn → persist → process restart → load/resume → live terminal`；保存 adapter、bundled Codex 和 ACP capability 版本；升级 pin 前先跑 canary。未知 update 应有有界、可导出的计数与类别，不能只留 debug 日志。

### [未确认]

尚未用真实 Codex 0.150 与 C2 当前 adapter 运行上述 probe，因此不能声称当前 C2 会阻断 resume，也不能声称 1.6.2 已兼容 0.150。`codex-acp` #419 在截止时尚无对应稳定 npm release 证据。

## 5. 默认脱敏的 provider/process diagnostics

### [事实]

这是 2026-08-26 报告已保留的次优先候选，不是本次新增。#8346 的协议漂移、#8358 的静默 turn 与 #5195 的 stale callback 共同说明：只显示“失败”不足以区分 adapter 版本、provider 版本、capability、decode drop、RPC silence 与 process exit。

### [CodeTwo 当前事实]

当前 checkout 已有 tracing、provider lifecycle 检测与部分 UI 错误，但没有一个可由用户主动导出、默认脱敏的 provider 诊断包。ACP 未识别 update 目前只写 debug；这类证据在用户复现结束后很难恢复。

### [推断或建议]

导出范围保持小：C2/Core 版本、provider/adapter/CLI 版本、协商 capability、最近一次启动/退出、最近若干 RPC method 与分类错误、未知 update 的类型计数、当前 session activity revision。默认移除 prompt、tool output、路径、环境变量值、token 与账号信息；用户显式选择后才附加更详细日志。它应服务支持与复现，不演变成完整遥测平台。

## 七项既有建议：当前 checkout 已实现

以下状态来自当前 CodeTwo 工作树，不再列为“未实现”候选。

| 七项 | [CodeTwo 当前事实] | 主要证据 |
| --- | --- | --- |
| Usage fork/subagent 去重 | **已实现**：识别 `forked_from_id` 与 subagent parent，抑制复制祖先 usage，并保留 child 真正增量 | [`usage.rs`](../../../crates/core/src/usage.rs) 及其 fork/subagent tests |
| cancel recovery | **已实现**：cancel RPC 失败时以 captured turn id 竞态保护，投影 provider failure，并终止对应 provider，避免永久 Running | [`activity.rs`](../../../crates/core/src/activity.rs)、[`engine.rs`](../../../crates/core/src/engine.rs) |
| tool-update bounded persistence | **已实现**：非终止 update 仅持久化有界 preview/reference，terminal row 保留最终有界结果 | [`engine.rs`](../../../crates/core/src/engine.rs)、[`store.rs`](../../../crates/core/src/store.rs) |
| durable invested drafts | **已实现**：versioned、per-scope invested draft，持久化 doc/attachments/posture，并具迁移与冲突保护 | [`composerDrafts.ts`](../../../apps/desktop/src/session/composerDrafts.ts)、[`App.tsx`](../../../apps/desktop/src/App.tsx) |
| Agent browser access 总闸 | **已实现**：独立于 backend selection，关闭时 withholding provider-native 与外部 browser capability，并 fail closed | [`broker.ts`](../../../packages/tool-broker/src/broker.ts)、[`engine.rs`](../../../crates/core/src/engine.rs)、[`SettingsPage.tsx`](../../../apps/desktop/src/settings/SettingsPage.tsx) |
| provider-native compaction | **已实现**：从 ACP `available_commands_update` feature-detect `/compact`，只把精确 text-only `/compact` 原样送给 provider | [`wire.rs`](../../../crates/core/src/acp/wire.rs)、[`engine.rs`](../../../crates/core/src/engine.rs)、[`Statusline.tsx`](../../../apps/desktop/src/session/Statusline.tsx) |
| PR ↔ Task durable link | **已实现**：GitHub PR identity、Task Board v3、一对一归属、显式 link/unlink 与 revision 防陈旧回调；不会自动完成 Task | [`taskBoard.ts`](../../../apps/desktop/src/taskboard/taskBoard.ts)、[`PullRequestsPage.tsx`](../../../apps/desktop/src/github/PullRequestsPage.tsx) |

### [证据边界]

- “已实现”只表示源码和测试已存在于当前本地 checkout；工作树包含未提交变化，本报告不把它们称为 GitHub `main`、release 或已部署功能。
- 本次仅做源码与现有测试证据复核，没有重新运行全量测试、真实 provider probe 或 Native Desktop 窗口验收。
- 七项原建议的完整上游背景仍见 [`t3code-recent-improvements-2026-08-26.md`](./t3code-recent-improvements-2026-08-26.md)；本报告不再把它们包装成新的待办。

## 明确不吸纳或不在本轮前移

| 上游变化 | 处理 |
| --- | --- |
| [#7538](https://github.com/pingdotgg/t3code/pull/7538) 的 `Number.MAX_SAFE_INTEGER` projection bootstrap catch-up | **不直接吸纳**。CodeTwo 没有同一套 event-store/projector 架构；若以后出现 catch-up loop，应先固定 high-water mark 并分页，不复制一个近似无限 limit |
| [#8346](https://github.com/pingdotgg/t3code/pull/8346) 的 T3 专属 app-server enum override | **不复制**。协议适配属于 `codex-acp` 边界；C2 应做版本 pin、canary 与 unknown-event diagnostics |
| [#8358](https://github.com/pingdotgg/t3code/pull/8358) 的整套 Grok-specific skills/plan/usage patch | **不整包吸纳**。只保留通用 liveness 不变量；各能力继续以 ACP 实际广告为准 |
| [#8243](https://github.com/pingdotgg/t3code/pull/8243) 的公开 rolling preview DMG release | **暂不吸纳**。当前没有已确认的外部/headless preview 分发需求；公开 ad-hoc、未 notarize 的开发 DMG 还会增加误装与支持边界 |
| [#8250](https://github.com/pingdotgg/t3code/pull/8250) 的 release workflow 调度细节 | **不照搬**。CodeTwo workflow 与 T3 job graph 不同；只能基于 C2 自身 run timing 找重复构建或错误依赖 |
| [#8252](https://github.com/pingdotgg/t3code/pull/8252) | **无产品变化**，只是删除重复测试 |
| 多托管平台 PR 工作台 | **继续需求触发**。当前 GitHub PR ↔ Task link 已闭环；没有 GitLab/Bitbucket/Azure DevOps 的真实需求前不扩 |

模型搜索/provider-scoped favorites、pinned session 手工排序仍是 P2；本次没有新证据把它们抬到前五。主题系统、mobile/T3 Connect、整套 Effect/event-sourced orchestration等 2026-08-26 报告中的“不吸纳”判断不变。

## 总证据边界

- 上游数量、发布时间、合并状态与改动文件来自 GitHub compare、release、merged PR 和对应 merge commit 源码，证据截止时间写在文首。
- `v0.0.35` 与 post-release `main` 已分开；nightly/main commit 不称为稳定交付。
- PR 正文里的测试数、分钟数、故障样本只代表上游作者环境，不外推为 CodeTwo 的发生率或收益。
- CodeTwo 判断来自当前 checkout 的 live source，而不是 2026-08-26 报告的旧快照；七项状态已据此更新。
- [#8346](https://github.com/pingdotgg/t3code/pull/8346) 对 CodeTwo 当前 adapter 的精确影响、真实 provider 静默阈值、公开 preview DMG 的用户需求均属 **未确认**；在 probe、测量或需求证据出现前，不应宣称故障已复现或方案已验收。
