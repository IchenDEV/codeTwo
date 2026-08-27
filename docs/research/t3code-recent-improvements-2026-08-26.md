# t3code 近期增量与 CodeTwo 吸纳建议

> 调研日期：2026-08-26（Asia/Singapore）
> 上游：[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code)
> 增量起点：既有报告冻结点 [`1a003e383ac6`](https://github.com/pingdotgg/t3code/commit/1a003e383ac6b10258b8100c2617d938c4f06c69)（2026-08-09）
> 稳定版：[`v0.0.33`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.33)（2026-08-10）→ [`v0.0.34`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.34)（2026-08-26）
> 上游 `main` 冻结点：[`b0a028126915`](https://github.com/pingdotgg/t3code/commit/b0a0281269156295e2202d31198829bd3b500bdf)（2026-08-26 04:04:35 UTC）
> CodeTwo 对照：GitHub `main` [`c72767545bb9`](https://github.com/IchenDEV/codeTwo/commit/c72767545bb9c98abceefae4b70ad3f293f95f33)（2026-08-26 04:52:54 UTC）

## 结论

从上次冻结点到本次上游 `main`，GitHub compare 显示 **415 个新增 commit**。数量很大，但会真正改变 CodeTwo 优先级的不是主题、mobile 或 T3 Connect，而是四类不变量：

1. **P0：Usage 必须识别 Codex fork/subagent 复制历史。** CodeTwo 已修复 cumulative/delta 与 Claude 去重，但当前 Codex scanner 仍按文件独立计数，没有 fork-aware suppression；多代理使用越多，统计越容易虚高。
2. **P0：取消、完成和工具生命周期必须最终收敛。** CodeTwo 目前忽略 ACP cancel 返回错误；流式工具 update 仍逐条 append 到 SQLite。上游近期事故表明，这两处会分别造成“永久 Working”和数据库写放大。
3. **P0/P1：草稿必须有身份，而不只是一个未卸载的编辑器。** CodeTwo 仍只有全局 `draft` 身份。切项目、切会话、并行创建任务时，正文、图片、provider、policy 与工作区选择没有原子归属。
4. **P1：把已有能力连成闭环。** CodeTwo 已有上下文 meter、Browser Use 选择、Task/Session、GitHub PR 页；值得吸纳的是“可控压缩”“所有浏览器能力总闸”“PR 与 Task/Session 持久关联”，而不是再造页面。

建议实施顺序：**Usage fork 去重 → cancel/lifecycle conformance + tool-update 写入有界化 → durable drafts → browser access gate → provider-native context compaction → PR↔Task link**。多托管平台 PR 工作台只在 GitLab/Bitbucket/Azure 需求成立后扩展。

## 优先级矩阵

| 优先级 | 建议 | 上游一手证据 | CodeTwo 当前判断 |
| --- | --- | --- | --- |
| P0 | Codex fork/subagent Usage 去重 | [#5887](https://github.com/pingdotgg/t3code/pull/5887) · [`usageTranscripts.ts@0d38866`](https://github.com/pingdotgg/t3code/blob/0d38866dcf63d133b2ed732bbb303dc533b5934f/apps/server/src/usage/usageTranscripts.ts) | **明确缺口**：Codex parser 没有 session-meta/fork identity 或跨文件 ancestor suppression |
| P0 | cancel 失败后的权威终态与竞态保护 | [#7412](https://github.com/pingdotgg/t3code/pull/7412) · [`ProviderCommandReactor.ts@17822fa`](https://github.com/pingdotgg/t3code/blob/17822fab708a90e82ac961e3b4895932667ce419/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts) | **明确缺口**：`Op::Cancel` 丢弃 provider cancel 结果，依赖 provider 后续 terminal event |
| P0 | 非终止 tool update 写入有界化 | [#6675](https://github.com/pingdotgg/t3code/pull/6675) · [`ProviderRuntimeIngestion.ts@f075a58`](https://github.com/pingdotgg/t3code/blob/f075a58119f392137d699cefe5290b2aa6e55935/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts) | **高概率缺口**：每个 update 都 append；读 snapshot 时才折叠 superseded rows |
| P0/P1 | 有身份、可恢复、可迁移的 invested drafts | [#5777](https://github.com/pingdotgg/t3code/pull/5777) · [#6393](https://github.com/pingdotgg/t3code/pull/6393) · [`composerDraftStore.ts@1e59b4c`](https://github.com/pingdotgg/t3code/blob/1e59b4c4004ce3c724d09ca0b140ed4523758d1e/apps/web/src/composerDraftStore.ts) | **明确缺口**：当前无 per-project/per-session draft store；`sessionId ?? "draft"` 只有一个草稿身份 |
| P1 | 所有 agent browser access 的 server-authoritative 总闸 | [#7083](https://github.com/pingdotgg/t3code/pull/7083) · [`ProviderService.ts@cd096b9`](https://github.com/pingdotgg/t3code/blob/cd096b9ad5a4156ffeab85de617cbb219057007f/apps/server/src/provider/Layers/ProviderService.ts) | **部分已有**：可选“不挂载外部后端”，但没有同时 withholding provider-native browser/MCP credentials 的总闸 |
| P1 | provider-native context compaction 与恢复提示 | [#8144](https://github.com/pingdotgg/t3code/pull/8144) · [`ClaudeAdapter.ts@c7222ca`](https://github.com/pingdotgg/t3code/blob/c7222ca4dfdea50df1d02ca33710aac5daddbeb7/apps/server/src/provider/Layers/ClaudeAdapter.ts) | **明确缺口**：已有 context meter，无 capability-gated compact command、旧会话提示或 provider threshold |
| P1 | PR 与 Task/Session 的 durable link | [#8160](https://github.com/pingdotgg/t3code/pull/8160) · [`ProjectionThreads.ts@3c75eb1`](https://github.com/pingdotgg/t3code/blob/3c75eb1132bb5d67cfa95ac6271ef68959f986c1/apps/server/src/persistence/Layers/ProjectionThreads.ts) | **明确缺口**：已有 Task Board 和 GitHub PR 页，但没有 durable PR identity 归属，也无法在 merge 后可靠更新任务状态 |
| P2/需求触发 | capability-driven 的多托管平台 PR 工作台 | [#6039](https://github.com/pingdotgg/t3code/pull/6039) · [`PullRequestProvider.ts@b28f9bf`](https://github.com/pingdotgg/t3code/blob/b28f9bf0a1bd562623c027c5ed80b5ca50395b28/apps/server/src/pullRequest/PullRequestProvider.ts) | **部分已有**：创建 change request 有 provider seam；当前 PR 列表/详情/评论仍是 GitHub 专用类型与命令 |

## 1. P0：修正 forked Codex Usage

### [事实]

上游 [#5887](https://github.com/pingdotgg/t3code/pull/5887) 发现：fork 与 subagent rollout 会把父会话历史复制到新文件，并以 fork 时刻重新打时间戳。它通过首个 `session_meta` 的 `forked_from_id` 或 subagent `thread_spawn` 识别复制历史，丢弃 fork 起点的紧密 token burst，并在首个相隔至少 1 秒的 usage event 后永久恢复计数。上游同时 bump scan-cache version，避免旧的虚高缓存继续生效。

PR 正文中的 1.85 倍、710 个文件、333 个 fork 是作者本机样本，**不能外推为 CodeTwo 的偏差幅度**；但 fork 文件复制祖先 usage 的格式事实足以构成计数正确性风险。

### [CodeTwo 当前事实]

[`usage.rs`](../../crates/core/src/usage.rs) 的 Claude 扫描在文件内与跨文件使用 `message/request` identity 去重；Codex 扫描只在**单个文件**里累加 `last_token_usage` delta、去连续重复并与最终 total 对账。`UsageRecord::dedupe_key` 没有为 Codex 设置，目录级扫描也只对 Claude 做跨文件去重。

### [建议]

- 解析首个 Codex `session_meta`，保留 child session id、fork parent、subagent parent 与首个真实 turn 边界。
- 不要只照抄“1 秒”常数；先用 CodeTwo 本地 fixture 和真实 rollout 证明 ACP/Codex 当前格式，再决定 burst gate。优先使用明确的 copied-history identity；时间间隔只做兼容 fallback。
- cache identity 加 parser schema version；升级后让 Codex cache 一次性失效重扫。
- 新测试至少覆盖普通 session、fork、五代 nested fork、subagent、祖先 `session_meta` 不覆盖 child id、真正首轮不会被吞、跨时区 timestamp。

验收：fork 前后的 usage 总量只增加 child 的真实新 turn；同一父历史被 1、10、100 个 subagent 继承时总量不随继承数增长。

## 2. P0：让取消和生命周期最终收敛

### [事实]

上游 [#7412](https://github.com/pingdotgg/t3code/pull/7412) 修复 provider interrupt 拒绝后 thread 永久停在 Working：失败时重新读取权威 session；如果没有自然完成、停止或切到另一 active turn，则 best-effort 停进程、清除 `activeTurnId`、记录错误并发布明确 activity。上游随后还修复了“读取已完成 subagent 结果又把它标回 running” [#7937](https://github.com/pingdotgg/t3code/pull/7937) 与 tool lifecycle identity 丢失 [#7151](https://github.com/pingdotgg/t3code/pull/7151)。

### [CodeTwo 当前事实]

[`engine.rs`](../../crates/core/src/engine.rs) 的 `Op::Cancel` 先取消本地 pending input，再调用 `rt.client.cancel(acp_sid)`，但丢弃返回结果。`ActivityTracker::cancel_pending` 的注释也明确：turn 会保持 Running，直到 provider 给 terminal response。若 cancel 调用失败且 provider 不再发 terminal event，C2 没有当前 turn 的 recovery path。

### [建议]

- 将 cancel 变成具 request/turn identity 的异步命令；失败后重读当前 activity revision 和 active turn，只有仍是同一 turn 才允许投影失败终态。
- recovery 不应直接杀整个长期 session，除非 provider 无可恢复 interrupt 能力；先区分 cancel RPC failure、process exit、timeout 与自然完成竞态。
- 固化 lifecycle conformance tests：`started → update* → completed/failed` 同 id；cancel RPC 失败；自然完成与 cancel failure 竞速；queued follow-up 不能覆盖当前 active turn；idle child 的 parent interaction 不能复活 child。
- UI 显示“取消失败，provider 已停止/仍可重试”的权威结果，不能让 spinner 永久运行，也不能把 provider failure 冒充用户主动取消成功。

## 3. P0：把流式 tool update 在写入时就变小

### [事实]

上游 [#6675](https://github.com/pingdotgg/t3code/pull/6675) 的根因是 accumulated output 在每次 `tool.updated` 都完整持久化，导致单次 tool call 的写入量呈 O(N²)。上游选择让**非终止** update 在 ingestion 时保存与 wire 相同的 slim projection，terminal `tool.completed` 仍保留完整最终 payload。PR 的 65 KB→238.7 MB 等数字是上游样本，不能外推为 C2 实测收益。

### [CodeTwo 当前事实]

[`engine.rs`](../../crates/core/src/engine.rs) 会把每个 `ToolCallUpdate` 转成 `Part::ToolCall`；[`store.rs`](../../crates/core/src/store.rs) 的 `append_part` 每次插入一个新 `parts` row。`drop_superseded_tool_updates` 只在 snapshot 读取时删除可见重复，并不会减少已经发生的写入。`ToolOutputNormalizer` 虽然把单条文本限制在 262,144 字符，但如果 provider 每次发 accumulated content，仍可能重复写入同一大段文本。

### [建议]

先做一个 fixture/benchmark 证明 ACP adapter 实际发送 delta 还是 accumulated output。若能复现写放大：

- 非终止 row 只保存 id、status、kind、bounded preview、artifact refs 和必要 launch metadata。
- terminal row 保存完整、已有 hard cap 的最终输出；snapshot 继续 carry-forward 丢失 metadata。
- 更进一步可为 `(session, user_turn, tool_call_id)` 维护一个 mutable live projection，而不是每个 update 都新建 transcript row；但需保留事件审计需求，不要未经需求改成 event sourcing。
- 验收同时量 SQLite bytes、row count、snapshot load time、remote payload 与 renderer commits；不能只测 UI 看起来没卡。

## 4. P0/P1：durable invested drafts

### [事实]

v0.0.33 的 [#5777](https://github.com/pingdotgg/t3code/pull/5777) 给有正文或附件的未发送草稿稳定 identity，并允许从 sidebar 返回。v0.0.34 的 [#6393](https://github.com/pingdotgg/t3code/pull/6393) 又补上 repo 切换：仅移动 prompt 与图片，terminal/element/annotation/review 等 session-bound context 留在源草稿，且不覆盖已有内容的目标草稿。

### [CodeTwo 当前事实]

[`Composer.tsx`](../../apps/desktop/src/session/Composer.tsx) 的 fallback key 是固定字符串 `draft`。App 虽然通过保持 BlockNote 挂载避免最常见的文字丢失，但没有 versioned draft store，也不能同时保存多个草稿的正文、图片、provider/model、execution policy、scene/memory policy 与 worktree baseline。项目切换会切换这些执行上下文，而编辑器正文并没有同一套原子 identity。

### [建议]

- 只对“有正文或附件”的 invested draft 分配 id；纯 ambient picker 改动不制造 sidebar 垃圾。
- 持久化 canonical `DocBlock[]`、私有附件 id、provider/model、execution policy、scene/memory policy、worktree baseline 和 project identity；绝不把任意绝对路径当 durable authority。
- `send` 成功、显式 discard 才删除；provider 拒绝或 session 创建失败时保留。
- 项目切换必须是一个有类型的 move/copy：prompt 与 app-owned attachments 可迁移；session-bound Browser annotation、terminal context、PR review context 默认留在源草稿。
- destination 已 invested 时不得静默覆盖；提供“切换并保留当前草稿 / 移动正文到目标 / 取消”。

这项优先级高于 model favorite 与 pin reorder，因为它直接保护用户输入和执行上下文。

## 5. P1：独立的 Agent Browser Access 总闸

### [事实]

上游 [#7083](https://github.com/pingdotgg/t3code/pull/7083) 不只是选择 browser backend，而是在唯一 MCP credential minting boundary 上 withholding/revoking credential；同一权威状态同时决定工具是否附加、agent prompt 是否描述这些工具。设置读取失败时 fail closed。

### [CodeTwo 当前事实]

CodeTwo Settings 的 Browser Use 选项是“Automatic / **No external backend** / 某 external backend”。[`tool-broker`](../../packages/tool-broker/src/broker.ts) 在 No external backend 下不挂 MCP bridge，但 Codex provider-native Browser/Chrome capability 仍可存在。这符合当前文案，却不是“禁止 agent 使用浏览器”。

### [建议]

保留 backend selection，再新增正交的 `Agent browser access` 总闸：

- Off 时同时移除 provider-native capability、外部 MCP server 与对应 routing instructions。
- Core/session 创建时 snapshot；如果产品承诺即时撤销，则还需 revoke live credential/terminate tool session，并明确已有 provider-native capability 能否即时回收。
- settings/config 读取失败 fail closed；UI 必须区分“无外部后端”和“禁止所有 agent browser access”。
- Browser 面板供人手动浏览不必一起禁用；gate 管的是 agent capability，不是用户 UI。

## 6. P1：provider-native context compaction

### [事实]

上游 [#8144](https://github.com/pingdotgg/t3code/pull/8144) 为 Claude 接通 native resume-summary dialog、`/compact`、context meter action 和可配置 auto-compaction threshold。70 分钟/100k token 是该 PR 对 Claude 当前行为的匹配，不应变成跨 provider 的通用常数。

### [CodeTwo 当前事实]

CodeTwo 已接收 provider `context_window` 事件并在 [`Statusline.tsx`](../../apps/desktop/src/session/Statusline.tsx) 显示 meter，但没有 compact capability、命令或旧会话恢复提示。C2 也坚持 provider-native context 为连续性的权威，因此不应自行摘要后伪装成 provider history。

### [建议]

- 先 feature-detect provider slash/config/elicitation capability；Claude 可暴露 native `/compact`，其他 provider 只有真实能力时才显示。
- 复用现有 ACP elicitation/pending-input 队列呈现 resume choices；abort-before-listener、cancel while dialog open、reconnect 都要有测试。
- threshold 是 provider setting，不缩小 UI 宣称的 context window；meter 同时显示 capacity 与 auto-compact mark。
- 无 native compaction 时只建议“新建会话并引用旧 session/Task artifact”，不要由 C2 静默重写上下文。

## 7. P1：把 PR 变成 Task/Session 的 durable artifact

### [事实]

上游 [#8160](https://github.com/pingdotgg/t3code/pull/8160) 将 PR identity 持久化到 thread metadata；sidebar 使用 live PR detail 而不是只根据当前 checkout/branch 猜测，merge/close 可以驱动 settle。链接发生变化时，用 identity 检查淘汰旧的异步状态。

### [CodeTwo 当前事实]

CodeTwo 已有 Task Board、Task→Session history、GitHub PR list/detail/review 与“把 PR 送进 chat”的入口，但 store 没有 PR/change-request identity 与 Task/Session 的 durable association。项目切换、branch 删除或另一 checkout 创建 PR 后，这条关系无法从 Git 状态可靠恢复。

### [建议]

- 把 provider、host、repository identity、PR number/url 作为 Task artifact/reference；Session 只消费该关联，不成为新的产品主语。
- 关联/解除必须显式；异步 detail 以 link revision 对账，旧请求不能更新新链接。
- merged/closed 可以建议完成、归档或进入 review，但不要自动完成 Task，除非 Result Contract 明确允许。
- 第一版只做 GitHub，因为当前页面和 auth 已经存在；不要为“多 provider”先做大重构。

## 8. P2 / 需求触发：扩展 PR provider seam，不复制整套工作台

### [事实]

上游 [#6039](https://github.com/pingdotgg/t3code/pull/6039) 已把 PR 列表扩成 capability-driven 的 GitHub/GitLab/Bitbucket/Azure DevOps 工作台，含 filters/qualifiers、partial-result degradation、update-branch、inline editing、reactions、checks 与 smarter diff order。这是一个跨 contracts/server/web 的大功能，不是移植一个组件。

### [CodeTwo 当前事实]

[`source_control`](../../crates/core/src/source_control.rs) 已有托管平台识别与 create-change-request seam；Desktop PR 页和 bridge 仍使用 `GitHubPullRequest*` 类型及 `github.*` 命令。已有架构 seam 与用户 surface 没有完全对齐。

### [建议]

只有真实用户需要非 GitHub hosting 时再扩：先抽 capability + read-only list/detail，再做 comments/review；update branch、merge、reaction 与 inline edit 分别 gated。任一 provider 失败时保留其他结果。不要先移植 import-graph diff 排序、reaction 或 auto-merge。

## 仍值得做，但本轮没有被“新变化”抬高优先级

- **模型搜索与 provider-scoped favorites**：CodeTwo `ModelPicker` 仍只 map 全部 rows，没有 query/favorite；模型数较多的 OpenCode/Cursor 场景有价值，仍是 P1/P2。
- **可导出、默认脱敏的 provider/process diagnostics**：ACP stderr 仍只进入 tracing；对 provider 安装、启动、PTY、remote 问题很有价值，仍是支持性 P1。
- **pinned session 手工排序**：store 只有 boolean pin，按 `pinned DESC, created_at DESC`；仍是 P2。

这三项继续沿用既有报告的判断，不因 v0.0.34 的大量 UI polish 而前移。

## 已有或在途，不应重复立项

- Markdown transcript、图片粘贴/私有附件、项目工作区默认、Usage 基础 scanner、Browser recent、任务看板、并行任务、subagent roster、GitHub PR 页面已经存在。
- tool activity disclosure [CodeTwo PR #148](https://github.com/IchenDEV/codeTwo/pull/148) 与 native link context menus [PR #147](https://github.com/IchenDEV/codeTwo/pull/147) 已合并进 `main`；不另开同题实现。它们改善显示层，但没有消除非终止 tool update 的 SQLite 写放大。
- 当前仓库 object 中还有本地未发布 commit `118245d`（turn copy/feedback/fork）。它不属于 GitHub `main`，也不能算已交付；但新任务开始前必须先决定复用、修正或丢弃这份实现，不能并行重复写第二套。

## 明确不吸纳

| 上游变化 | 处理 |
| --- | --- |
| Open VSX theme 搜索、OKLCH palette、contrast slider、整套主题库 | 不吸纳。CodeTwo 应继续沿自己的 design tokens 与真实窗口 QA；这是高迁移成本的外观系统，不是近期核心缺口 |
| React Native/mobile/tablet、EAS、Live Activities、T3 Connect/Clerk/relay | 不适配当前 Desktop/TUI/remote ownership；只能在对应交付面真实存在后评估 |
| 自动 remote-default-branch fallback | 不吸纳。CodeTwo 保持 local ref、固定 SHA、no fetch、no silent fallback 的显式 contract |
| 整套 composer drawers / workspace chrome | 不复制视觉树。只吸收“pending input 必须靠近输入、运行时状态不能遮挡内容”的结果，用 CodeTwo 现有 Composer/mission control 语言实现 |
| 上游 Effect/event-sourced orchestration、multi-server environment registry | 不移植内部架构；只迁移可验证的 lifecycle、boundedness 与 identity 不变量 |

## 推荐落地批次

### Batch A：正确性与数据安全

1. fork-aware Codex Usage parser + cache versioning；
2. cancel failure recovery + active-turn/revision race tests；
3. invested draft identity、持久化与项目迁移。

### Batch B：性能与运行时边界

1. tool update write-amplification fixture/benchmark；
2. ingest-time slim projection 或 live-row upsert；
3. agent browser access 总闸与 prompt/tool一致性测试。

### Batch C：产品闭环

1. Claude/native context compaction；
2. PR identity 作为 Task artifact；
3. 有需求再扩非 GitHub provider。

## 证据边界

- 本文的上游事实来自 GitHub stable releases、已合并 PR、merge commit 与源码路径；PR 正文里的本机测量只作为上游事故样本，不当作 CodeTwo 收益。
- CodeTwo 判断针对 GitHub `main` `c7276754` 与当前 checkout 可见源码；GitHub `main` 比当前 checkout `221e8045` 多出 static plugin commands、native link context menus 与 tool activity disclosure。它们不改变本文列出的 parser、lifecycle、draft、write path、browser gate、context compaction 和 durable PR association 缺口。
- “高概率缺口”表示两边写入形状相同但尚未用真实 CodeTwo provider stream 复现；完成本地 fixture/benchmark 前不能宣称已有 O(N²) 事故或具体节省比例。
- 上游 `main` 在 v0.0.34 后仍有 commit；本文只把稳定版内容作为可吸纳依据，post-release `main` 只用于冻结点，不把 nightly/未发布代码称为已交付功能。
