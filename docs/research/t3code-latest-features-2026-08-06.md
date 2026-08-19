# t3code 最新功能调研与 C2 吸纳建议

> 首次调研：2026-08-06；最新复核：2026-08-07（Asia/Singapore）
> 上游：[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code)
> 方法：只采用上游仓库的 release、commit、PR 描述与源码；不把 issue、开放 PR 或设计稿当作已交付功能。
> 完整稳定版谱：[`t3code-expanded-version-history-2026-08-06.md`](./t3code-expanded-version-history-2026-08-06.md)

## 结论

t3code 截止最新复核的稳定版仍是 **v0.0.31**；最新 nightly 已推进到
**v0.0.32-nightly.20260806.1015**，对应
[`e4abc31f1e3f`](https://github.com/pingdotgg/t3code/commit/e4abc31f1e3f930e521a5bb62b38a9c5b28d8fb1)。
本次复核时 `main` 顶端为
[`4f5834ba72c5`](https://github.com/pingdotgg/t3code/commit/4f5834ba72c5905a318c00456dd21271b2fa9d6f)，
比该 nightly 多 5 个 commit；因此必须分开陈述“已发布 nightly”和“仅已合并 main”。

对 C2 最值得吸纳的不是整套 t3code 架构，而是五个可独立落地的产品能力：

1. **持久化 thread pinning**：上游行为成熟、C2 可用更小的数据模型得到同样的“重要会话不漂走”结果。
2. **ACP-compatible 子代理 / workflow 可观测性**：这是上游最新、战略价值最高的能力，但 C2 当前 ACP common-denominator 会丢掉一部分 provider-native 信号，必须分阶段做，不能只抄一个 Agents 面板。
3. **配对二维码的端点选择与回环地址保护**：改动小，直接修正 C2 现有远程配对的可达性问题。
4. **按会话正文搜索 + 可识别的自动标题**：共同解决会话越多越难找的问题。
5. **长会话读取必须有界**：上游刚修过真实 OOM 路径；C2 没有同样的全库 hydration，第四轮仍把单会话 transcript 收敛为按完整 user turn 的有界分页与 sequence-aware snapshot/live 合并。

**四轮实际吸纳覆盖 thread pinning、保守的 ACP launch observability、endpoint-aware pairing QR、规范化会话正文搜索、非侵入式自动标题、稳定 thread shell、长用户消息折叠、显式 Git index / 有界 diff，以及长会话的有界恢复。** 第一轮完成 pin / observability / pairing；扩大版本范围后，第二轮把搜索与标题建立在“用户原文和 provider 编译上下文分离”的数据边界上，并补齐快速切换会话的异步竞态保护、跨项目同步、单会话 turn 所有权和 `>8` 行或 `>600` 字符的消息折叠；第三轮把普通 Commit 改为只提交 index，并让 stage / unstage、diff scope、截断与粗粒度 Git 阶段成为可见行为；第四轮落地按完整 user turn 分页、durable revisioned `SessionActivity` / `Awaiting Input`，并把 worktree isolation 扩展为显式、仅使用本地 refs 的基线选择。这里仍没有声称已完成 core 子代理生命周期、TUI/remote Agents 面板、聚合用量或 interrupt-all。

上游开放中的“rich tool-call transcript”“自动 thread labels”“modular theme library”等仍属于未合并工作，本文仅列入观察，不建议现在移植。

## 版本与证据边界

| 层级 | 截止时状态 | 可据此声称什么 |
| --- | --- | --- |
| 稳定版 | [`v0.0.31`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.31)，2026-07-29，tag commit [`e6987965f659`](https://github.com/pingdotgg/t3code/commit/e6987965f65914861f0dabd0db03729fe5cd2508) | 面向稳定渠道已发布 |
| Nightly | [`v0.0.32-nightly.20260806.1015`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.32-nightly.20260806.1015)，pre-release，commit [`e4abc31f1e3f`](https://github.com/pingdotgg/t3code/commit/e4abc31f1e3f930e521a5bb62b38a9c5b28d8fb1) | 已由官方构建发布，但稳定性承诺低于 stable；包含 #5482 MCP payload 瘦身、#5483 工具历史快照投影与远程更新平滑化 |
| `main` | [`4f5834ba72c5`](https://github.com/pingdotgg/t3code/commit/4f5834ba72c5905a318c00456dd21271b2fa9d6f)，比 nightly 多 5 个 commit | 已合并源码但尚不能称为 nightly 交付；新增 ACP unknown approval 可操作性、自动权限 fallback 文案、移动端 pending-card 遮挡修复、composer inline-chip 对齐，以及显式 thread 操作后清除 woke 状态 |
| 开放 PR | 例如 [`#5471`](https://github.com/pingdotgg/t3code/pull/5471)、[`#5226`](https://github.com/pingdotgg/t3code/pull/5226)、[`#5446`](https://github.com/pingdotgg/t3code/pull/5446) | 只能称为提案或在研，不能称为 t3code 当前功能 |
| 已关闭未合并 | [`#5461`](https://github.com/pingdotgg/t3code/pull/5461) | 不能称为当前功能，也不继续列入开放路线 |

稳定版 v0.0.31 的官方 release note 主要包括：恢复 T3 Connect 登录、缩小 Electron 安装体积、保留 thread shell 加载状态、原生资源诊断降低空闲工作与磁盘抖动、初始化后识别 Git 仓库、合并 git numstat 调用、编辑文件焦点/实时语法高亮，以及跨会话保留 rendered-markdown 选择。它们是本轮 nightly 增量的基线，不应与 8 月的新功能混写。[官方 release note](https://github.com/pingdotgg/t3code/releases/tag/v0.0.31)

## 调研开始时的 C2 基线

C2 是 Rust core + Tauri/React desktop + ratatui TUI + headless WebSocket server，provider 统一通过 ACP 驱动；这与上游 TypeScript event-sourced server 的实现材料不同，所以应吸收行为与不变量，而非逐文件照搬。[项目说明](../../README.md) · [架构说明](../architecture.md)

以下是开始吸纳前的基线快照；后续实现已经改变其中 pinning、observability、remote pairing、正文搜索、初始标题、Git workflow 与 transcript 读取等项，保留这份快照用于说明移植起点：

- 会话默认标题仍是 `Untitled session`，现有能力只有手工 rename；没有 app-owned title generation service。[`session.rs`](../../crates/core/src/session.rs) · [`store.rs`](../../crates/core/src/store.rs)
- 命令面板只对 action、session label/hint 和 script 做前端模糊匹配，不搜索 transcript 正文。[`CommandPalette.tsx`](../../apps/desktop/src/palette/CommandPalette.tsx)
- session rail 有 active / archived、手工 rename 和 archive，但没有持久化 pin。[`SessionRail.tsx`](../../apps/desktop/src/sidebar/SessionRail.tsx)
- 远程设置已经列出 LAN / Loopback endpoints，也能生成 176px 左右的二维码；但 `remote_pairing_link` 不接收 endpoint，始终由 `pairing_url()` 自动挑一个 host。因此“展示了多个端点”和“二维码能选择端点”目前是两回事。[`Remote.tsx`](../../apps/desktop/src/remote/Remote.tsx) · [`src-tauri/src/lib.rs`](../../apps/desktop/src-tauri/src/lib.rs) · [`server/lib.rs`](../../crates/server/src/lib.rs)
- terminal 已经支持 font family、font size、scrollback 并能 live apply，因此没有必要重复移植上游 typography 的 terminal 子集。[`terminal/settings.ts`](../../apps/desktop/src/terminal/settings.ts)
- `delegate.rs` 明确标为未接入 engine / frontend 的 prototype。C2 还没有稳定的子代理生命周期、聚合用量、全体停止或 Agents surface。[`delegate.rs`](../../crates/core/src/delegate.rs)
- WebSocket 初始只送 session list，transcript 按 session 请求，这一点已经避开了上游“连接即全库 hydration”的同型问题；但 `Store::transcript()` 仍会把选中会话全部读入内存。[`server/lib.rs`](../../crates/server/src/lib.rs) · [`store.rs`](../../crates/core/src/store.rs)

## 已合并 / 已进 nightly 的重点增量

| 功能 | 合并时间与 commit | 上游状态 | C2 判断 |
| --- | --- | --- | --- |
| MCP 工具结果 payload 瘦身 | [`#5482`](https://github.com/pingdotgg/t3code/pull/5482)，[`3da315e7b5c4`](https://github.com/pingdotgg/t3code/commit/3da315e7b5c4537cbc7280f33dadb3f5f0e3baf0)，8 月 6 日 | 最新 nightly | 吸收“历史传输只保留 UI 所需字段”的边界，不照搬其数据模型或样本压缩比 |
| 工具调用历史快照去重 | [`b7d1981b57f1`](https://github.com/pingdotgg/t3code/commit/b7d1981b57f1c30908808d1939fd4edbc781de12)，8 月 6 日 | nightly 1015 | 已实现更保守的同 turn terminal projection；live event 完整保留 |
| 原生子代理与 workflow 可观测性 | [`#5219`](https://github.com/pingdotgg/t3code/pull/5219)，[`a2ca89aa10f1`](https://github.com/pingdotgg/t3code/commit/a2ca89aa10f13a2222e08afd98c66285121d5ba2)，8 月 6 日 | 最新 main + 最新 nightly | 本轮 P0 的保守切片：bounded ACP launch metadata + Desktop roster |
| 配对 QR 真正可扫、可选 endpoint | [`#5360`](https://github.com/pingdotgg/t3code/pull/5360)，[`fff6a5b028f8`](https://github.com/pingdotgg/t3code/commit/fff6a5b028f85122ffef8d3636f390f95ade5172)，8 月 4 日 | main + nightly | 本轮 P0；已实现 endpoint-aware link 与 loopback QR exclusion |
| 按 user / final-agent 正文搜索 thread | [`#4959`](https://github.com/pingdotgg/t3code/pull/4959)，[`4b71a2ae2ffb`](https://github.com/pingdotgg/t3code/commit/4b71a2ae2ffbbb7b6936051552094b71364cefd4)，7 月 30 日 | main + nightly | 第二轮已实现 provider-neutral FTS 切片 |
| durable thread title | [`#5357`](https://github.com/pingdotgg/t3code/pull/5357) → [`#5365`](https://github.com/pingdotgg/t3code/pull/5365) → [`#5368`](https://github.com/pingdotgg/t3code/pull/5368)，最终 commit [`2fa1fec8d8f6`](https://github.com/pingdotgg/t3code/commit/2fa1fec8d8f63bc8fa4579e7c0fd280b21de02ef) | main + nightly | 第二轮已实现 deterministic initial title；模型 regeneration 后置 |
| sidebar thread pinning | [`#5312`](https://github.com/pingdotgg/t3code/pull/5312)，[`da6e1a967825`](https://github.com/pingdotgg/t3code/commit/da6e1a96782594cab3a6925f441731a65be57c11)，8 月 4 日 | main + nightly | 本轮 P0；C2 做简化版 |
| 可配置 interface / prompt / code / terminal 字体 | [`#5103`](https://github.com/pingdotgg/t3code/pull/5103)，[`8eca20005b47`](https://github.com/pingdotgg/t3code/commit/8eca20005b47e197b3610f7996f3fd02355c1891)；terminal 行为随后由 [`#5444`](https://github.com/pingdotgg/t3code/pull/5444) 修正于 [`30e471530b3e`](https://github.com/pingdotgg/t3code/commit/30e471530b3e2ddf59caf309636bed940b8b3776) | main + nightly | P2；只补 C2 尚缺的三类字体 |
| 有界 catch-up replay、取消全库 snapshot hydration | [`#5147`](https://github.com/pingdotgg/t3code/pull/5147)，[`ca72e381c64f`](https://github.com/pingdotgg/t3code/commit/ca72e381c64f25d771236eecf70219f68e5f365b)，7 月 31 日 | main + nightly | P1 防御性不变量；不是原样移植 |
| git action 进度放回 commit button | [`#4963`](https://github.com/pingdotgg/t3code/pull/4963)，[`14dd128a682c`](https://github.com/pingdotgg/t3code/commit/14dd128a682c9ffa8a5941ed4f24d296dfdd4f8d)，7 月 30 日 | main + nightly | P2，小而一致的 UI 改良 |

### 0. 工具历史只传 UI 真正需要的状态：最新复核新增

Nightly 1014 中的 #5482 不再把完整 MCP tool result 塞进 thread payload。PR 在其自己的
真实样本上报告 payload 从 12.2 MB 降至 546 KB；这个数字只能说明上游样本，不能外推为
C2 的压缩比。可迁移的不变量是：**live 执行仍保留完整时序，而重连/历史快照只传恢复 UI
所需的投影**。[PR 与验证](https://github.com/pingdotgg/t3code/pull/5482)

随后进入 nightly 1015 的
[`b7d1981`](https://github.com/pingdotgg/t3code/commit/b7d1981b57f1c30908808d1939fd4edbc781de12)
又删除同一 turn 内已被 terminal update 覆盖的中间 `tool.updated` snapshot 行。C2 吸收时
采用更窄的规则：只有同一 user turn、同一 tool id 且后面确有 `completed` / `failed` 时才丢掉
较早的 non-terminal 行；terminal 行继承此前缺失的 title、tool kind 与受限 agent metadata。
后出现的 in-flight update、跨 turn id 重用、没有 terminal 的历史以及所有 live event 均不压缩。

这项投影与 turn-aligned transcript page 在同一 SQLite read transaction 内完成，因此不会为了
节省历史 payload 破坏 snapshot/live 的可重放边界。

1015 之后 `main` 的 5 个 commit 也逐项核过：unknown ACP approval 保持可操作与 C2
现有的 durable pending-input / 严格 answer routing 同方向；自动权限 fallback 只是文案澄清；
移动端 pending card 不属于当前 Desktop/TUI/remote surface；inline chip 是局部排版修复；最新
[`4f5834ba`](https://github.com/pingdotgg/t3code/commit/4f5834ba72c5905a318c00456dd21271b2fa9d6f)
只修复 snoozed thread 醒来后在发送、settle、archive 或显式打开时没有清除 `woke` 标记的问题。
C2 当前没有 snooze/woke 状态，因此不虚构对应迁移；窄视口与 composer chip 已纳入 rendered QA。

### 1. 配对二维码 endpoint 选择：本轮已吸收

上游把配对链接从隐藏的小二维码改为 Share panel：二维码 168px、白色 quiet-zone 卡片、完整 URL、copy actions，并在 LAN / Tailscale / hosted app 等端点之间选择。关键不变量是：

- loopback 仍可复制给同机使用，但**绝不能成为手机扫码目标**；
- 选项以 endpoint 的唯一 id 为 key，保存默认值与选择具体实例是两件事；
- stale selection 按“显式选择 → 保存默认 → 第一个可扫码 endpoint → 第一个 endpoint”回退；
- picker 使用 radiogroup，Share 按钮暴露 `aria-expanded` / `aria-controls`。

一手实现：[`ConnectionsSettings.logic.ts@fff6a5b`](https://github.com/pingdotgg/t3code/blob/fff6a5b028f85122ffef8d3636f390f95ade5172/apps/web/src/components/settings/ConnectionsSettings.logic.ts) · [`ConnectionsSettings.tsx@fff6a5b`](https://github.com/pingdotgg/t3code/blob/fff6a5b028f85122ffef8d3636f390f95ade5172/apps/web/src/components/settings/ConnectionsSettings.tsx)

本轮 C2 落地：

1. 给 `RemoteEndpoint` 增加稳定 id 与 `qr_shareable`（`lan=true`、`loopback=false`）。
2. `remotePairingLink` 接收所选 endpoint id，先在当前服务端发布列表中校验，再签发 token；不接受前端提供任意 base URL。
3. `RemoteModal` 显示 endpoint selector，默认优先 LAN；切换后立即为该 endpoint 生成新链接，并用 request sequence 防止旧异步响应覆盖新选择。
4. Loopback 仍可复制到本机另一个浏览器，但 UI 明示其他设备无法访问 `127.0.0.1`，且服务端返回空 QR SVG。
5. token 仍只放 URL fragment；现有一次性 token、hashed bearer、single-use WS ticket 三层安全模型保持不变。

实现只触及 `crates/server/src/lib.rs`、Tauri remote command、bridge remote types 与 `Remote.tsx`，无需数据库迁移。纯函数测试覆盖显式 endpoint 校验、LAN 优先、loopback-only fallback 与 fragment URL；原有 auth 单元测试和 WebSocket pairing round-trip 也继续通过。

### 2. 会话正文搜索：高价值、边界清楚

上游新增 bounded `orchestration.searchThreads` RPC，只搜索 user message 与 canonical final assistant output；200ms debounce 后并行查询已连接环境，同时保留即时的 title/project/branch 本地匹配。结果每个 thread 只保留一个、带 `You:` / `Agent:` snippet，旧 server 或断线环境失败时静默退化到 metadata 搜索。UI 在至少 2 个字符后才请求。[PR 说明与验证](https://github.com/pingdotgg/t3code/pull/4959)

一手实现：[`ProjectionSnapshotQuery.ts@4b71a2a`](https://github.com/pingdotgg/t3code/blob/4b71a2ae2ffbbb7b6936051552094b71364cefd4/apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts) · [`threadSearch.ts@4b71a2a`](https://github.com/pingdotgg/t3code/blob/4b71a2ae2ffbbb7b6936051552094b71364cefd4/packages/client-runtime/src/state/threadSearch.ts) · [`CommandPalette.logic.ts@4b71a2a`](https://github.com/pingdotgg/t3code/blob/4b71a2ae2ffbbb7b6936051552094b71364cefd4/apps/web/src/components/CommandPalette.logic.ts)

C2 不需要多 environment fan-out，第二轮采用了更小的实现：

- core `Store::search_sessions(query, limit)` 搜索 active + archived，并把归档状态交给结果行明确显示。
- v2 migration 把旧 `unicode61` 索引原子升级为 trigram FTS5 external-content projection；只索引新的 canonical user `Prompt` 与最终 agent `Text`。旧库只安全回填 agent text，因为旧 user `Text` 含编译后的 rules / skill / file context，不能伪装成用户原文。
- streamed agent chunks 在成功且未取消的 turn 结束前不入索引，结束时只合并、写入一次，避免逐 chunk 重建造成 O(n²)；SQL 先按 session 去重再应用 limit，长会话不会挤掉其他命中。
- query 截到 200 字符，limit 限制为 1–50；三字符以上走 trigram，短词、中文与标点输入走 literal `instr` fallback，`%` / `_` / `\` 不会被当成通配符。
- command palette 保留即时 metadata fuzzy search，正文请求采用 200ms debounce、2 字符门槛、loading 文案和 stale-response cancellation。

验收重点不是“能搜到字符串”，而是：不把 tool payload / thinking / interim stream 当作最终回答，不因大数据库阻塞 UI，literal `%` 可正确搜索，旧库迁移安全。

### 3. 原生子代理与 workflow 可观测性：吸收模型，不先抄 UI

这是 nightly 1012 的核心增量，也是上游本轮战略价值最高的能力之一；1014 又在其后加入
MCP payload 瘦身等改动。#5219 本身横跨 **46 个文件、42 个 commits、增加 6,871 行并删除
71 行**；其中大量代码专门适配 Claude SDK 与 Codex app-server 私有事件，不能把它当成一个
可直接复制的 UI feature。[PR 合并记录](https://github.com/pingdotgg/t3code/pull/5219)

上游不是靠解析 shell 文本猜“谁是 agent”，而是在 provider ingestion 时给 `task.*` / tool activity 加 agent linkage，再由 client fold 得出统一状态。它覆盖：

- `pending / running / waiting / idle / completed / failed / cancelled / interrupted` 生命周期；
- agent role、model、effort、workflow/phase、parent、attempt、output file、run handles；
- provider-specific usage 的幂等合并、最近活动 ring buffer、稳定 task progress id；
- Agents 右侧面板、workflow phase rail、chat 中单一 spawn CTA 与 quiet timeline；
- thread `Working / Monitoring` background liveness；
- Stop 会先停所有 live Claude tasks / Codex children，再停 parent turn。

一手实现：

- contract：[`providerRuntime.ts@a2ca89a`](https://github.com/pingdotgg/t3code/blob/a2ca89aa10f13a2222e08afd98c66285121d5ba2/packages/contracts/src/providerRuntime.ts)
- client fold：[`subagentRuntime.ts@a2ca89a`](https://github.com/pingdotgg/t3code/blob/a2ca89aa10f13a2222e08afd98c66285121d5ba2/packages/client-runtime/src/state/subagentRuntime.ts)
- Claude / Codex ingestion：[`ClaudeAdapter.ts@a2ca89a`](https://github.com/pingdotgg/t3code/blob/a2ca89aa10f13a2222e08afd98c66285121d5ba2/apps/server/src/provider/Layers/ClaudeAdapter.ts) · [`CodexAdapter.ts@a2ca89a`](https://github.com/pingdotgg/t3code/blob/a2ca89aa10f13a2222e08afd98c66285121d5ba2/apps/server/src/provider/Layers/CodexAdapter.ts)
- liveness：[`ThreadBackgroundLiveness.ts@a2ca89a`](https://github.com/pingdotgg/t3code/blob/a2ca89aa10f13a2222e08afd98c66285121d5ba2/apps/server/src/orchestration/ThreadBackgroundLiveness.ts)
- UI：[`AgentsPanel.tsx@a2ca89a`](https://github.com/pingdotgg/t3code/blob/a2ca89aa10f13a2222e08afd98c66285121d5ba2/apps/web/src/components/AgentsPanel.tsx)

C2 的关键限制：当前 Claude/Codex 都经过 ACP adapter，架构还明确“unknown session/update variants logged and dropped”。上游却依赖 Claude SDK `task_updated`、`parent_tool_use_id`、workflow progress，以及 Codex `thread/started` / `subAgentActivity` 等 provider-native 信号。因此，在不改 adapter 或不接原生 provider extension 的前提下，C2 无法诚实达到同等观测粒度。

本轮只吸收这个能力的 **phase zero**：ACP `tool_call` 若明确携带 provider-neutral `kind`，就随 event 与 transcript 保留；只有 tool kind/title/structured input 明确命中 agent/workflow launch signal 时，core 才从 raw input 投影描述性白名单字段。每个字段最多 2,048 字符、总预算 8,192 字符，command、secret、cwd、request id 等任意 payload 不会进入持久化或广播。Desktop 在 live update 与 transcript replay 中保留这些字段，并用窄规则生成只读 Agents roster；普通 task、shell 或只在文本中提到 agent 的调用仍留在 Tools。

这不是完整的 subagent runtime：当前没有 core lifecycle fold、乱序/终态状态机、usage 聚合、TUI/remote Agents surface、provider-native child linkage 或 interrupt-all。下列三片仍是后续架构顺序，而非本轮已交付项：

建议分三片：

1. **共享状态模型先行**：在 Rust core 定义 `AgentTaskLinkage`、`AgentTaskStatus`、`AgentTaskEvent` 与纯 fold；状态归 core，Desktop/TUI/remote 共用，避免把业务 fold 放 React。
2. **C2-owned delegation 先接入**：把现有 `delegate.rs` prototype 晋升为 engine 能控制的 manager/executor lifecycle，先验证 panel、usage、interrupt-all 和持久化语义。
3. **provider-native 扩展后接入**：对 ACP extension feature-detect，保留 unknown payload；只有拿到明确 task id / parent id 才标为 agent。没有 stamp 的 background shell 保持普通 tool row，禁止 UI 猜测。

第一阶段验收应以 mock wire fixture 为主：乱序 completion、重复 progress、idle 后 reactivation、父 turn 停止时所有 child 都收到 interrupt、late usage 不倒退。不要把“画出了 Agents panel”当作完成。

### 4. Durable title 与 pinning：共同改善信息架构

#### Durable title

上游的标题规则从“复述请求/产物名称”改成“几周后仍可识别的 subject + outcome”；3–8 词、少于 40 字符，忽略 plan/report/PR、工具、监控等 incidental instructions。长 thread regeneration 在 8,000 字符预算内固定保留首条 user message（最多 2,000 字符）和最新 tail，避免标题被最近一次 assistant finding 带偏。随后又把 prompt 重构成显式 plaintext template，行为不变、便于校准。[`TextGenerationPrompts.ts@2fa1fec`](https://github.com/pingdotgg/t3code/blob/2fa1fec8d8f63bc8fa4579e7c0fd280b21de02ef/apps/server/src/textGeneration/TextGenerationPrompts.ts) · [`ProviderCommandReactor.ts@9bd2a4c`](https://github.com/pingdotgg/t3code/blob/9bd2a4c6886a4c20e0a0a937dc98dd118c645c8f/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts)

C2 可复用上述 editorial rules，但不能照搬上游默认 GPT-5.6 Luna 的选择：C2 目前没有独立 text-generation service，调用正在进行的 ACP session 会污染 provider-native conversation。第二轮已完成第 1 步：

1. 首次 user prompt 后用 deterministic local heuristic 生成最多 8 词 / 40 字符的标题；中日韩脚本按 24 字符截断；
2. 等 app-owned isolated generation service 存在后，再启用模型标题与 regeneration；
3. 任何模型失败都保留旧标题，绝不回退为新的 `Untitled session`；手工 rename 后默认不自动覆盖。

#### Pinning

上游 pin 是 server-backed：`pinnedAt`、pin/unpin command/event、DB migration、client capability 与 web/mobile 一致排序。它还与 settle/snooze 生命周期联动。[`036_ProjectionThreadsPinned.ts@da6e1a9`](https://github.com/pingdotgg/t3code/blob/da6e1a96782594cab3a6925f441731a65be57c11/apps/server/src/persistence/Migrations/036_ProjectionThreadsPinned.ts) · [`SidebarV2.tsx@da6e1a9`](https://github.com/pingdotgg/t3code/blob/da6e1a96782594cab3a6925f441731a65be57c11/apps/web/src/components/SidebarV2.tsx) · [`decider.ts@da6e1a9`](https://github.com/pingdotgg/t3code/blob/da6e1a96782594cab3a6925f441731a65be57c11/apps/server/src/orchestration/decider.ts)

C2 没有 settle/snooze，本轮做了更小的正确版本：`sessions.pinned INTEGER NOT NULL DEFAULT 0`，active sessions 按 pinned first、组内 created-at descending 排序，archive 会解除 pin。字段由 core 持久化和序列化，Desktop 提供操作面；TUI/remote 尚未新增控件，因此不能写成全 surface 已对齐。

### 5. 长会话与 reconnect：先固化“有界”不变量

上游真实事故来自两个无界读取：stale cursor 追赶时读取整个 global event log 再在 JS 过滤，以及 snapshot endpoint hydration 全库 message/activity payload。修复后 replay gap 上限为 1,000；过旧或超前 cursor 直接退回 fresh per-thread snapshot，项目级读取改用不含 thread bodies 的轻量 read model。[`ws.ts@ca72e38`](https://github.com/pingdotgg/t3code/blob/ca72e381c64f25d771236eecf70219f68e5f365b/apps/server/src/ws.ts) · [`http.ts@ca72e38`](https://github.com/pingdotgg/t3code/blob/ca72e381c64f25d771236eecf70219f68e5f365b/apps/server/src/orchestration/http.ts)

C2 不应复制 1,000 这个常数；应复制三个不变量：

- shell/list snapshot 不携带 transcript body；
- per-session transcript 支持 limit/cursor，首次只拿最近窗口，需要时向前分页；
- reconnect 的 delta gap 超阈值时发 fresh bounded snapshot，不做无界 replay。

当前 server 已满足前两项：shell/list snapshot 不携带正文，per-session transcript 以完整 user turn 为边界分页，并用 durable sequence 合并 snapshot 与 live event。第三项仍等 remote protocol 引入全局 event cursor 后再实现，不需要为了“对齐 t3code”预造 event-sourcing machinery。

### 6. Typography 与 git progress：只吸收最终行为

上游字体设置覆盖 interface、prompt、code、terminal 四个 surface，并处理本机字体探测、monospace 校验与 CSS variable hydration。[`appearanceFonts.ts@8eca200`](https://github.com/pingdotgg/t3code/blob/8eca20005b47e197b3610f7996f3fd02355c1891/apps/web/src/appearanceFonts.ts) · [`FontFamilyPicker.tsx@8eca200`](https://github.com/pingdotgg/t3code/blob/8eca20005b47e197b3610f7996f3fd02355c1891/apps/web/src/components/settings/FontFamilyPicker.tsx)

但最初“窄 pane 自动缩小 terminal font 直到 80 列”的行为在第二天被移除：最终规则是 **split 改变 rows/columns，不改变用户设置的 font size**。[`surface.ts@30e4715`](https://github.com/pingdotgg/t3code/blob/30e471530b3e2ddf59caf309636bed940b8b3776/apps/web/src/terminal/ghostty/surface.ts) · [修正 PR](https://github.com/pingdotgg/t3code/pull/5444)

因此 C2 若扩展 Appearance，只补 interface / prompt / code family+size；terminal 已有设置，而且应保持 split 后字号不变。

git progress 的最终模式也值得作为 UI law：运行中状态、耗时、最新 hook 输出应放在发起动作的 commit button 内，floating toast 只报告最终成功/失败。[`GitActionsControl.logic.ts@14dd128`](https://github.com/pingdotgg/t3code/blob/14dd128a682c9ffa8a5941ed4f24d296dfdd4f8d/apps/web/src/components/GitActionsControl.logic.ts) · [`GitActionsControl.tsx@14dd128`](https://github.com/pingdotgg/t3code/blob/14dd128a682c9ffa8a5941ed4f24d296dfdd4f8d/apps/web/src/components/GitActionsControl.tsx)

C2 目前只有一个 `busy` boolean，最小吸收可以先显示 `Committing… / Pushing… / Creating PR…` 并保持按钮宽高；等 core 真能发 phase/hook event 后再加第二行，不能伪造进度。

## 不应当作当前功能吸收的未交付项

以下 PR 没有出现在本次复核的 nightly / `main` ancestry 中；其中 #5461 已关闭但未合并，
其余仍为 open。即使页面含完整截图、测试数字或实现 diff，也不能算 t3code 当前已交付功能：

| 未交付 PR | 复核状态 | 观察价值 | 当前处理 |
| --- | --- | --- |
| [`#5471 rich tool-call transcript`](https://github.com/pingdotgg/t3code/pull/5471) | open | tool rows、inline diffs、thinking bursts、live status | 等合并并观察与 #5219 quiet timeline 的最终组合 |
| [`#5461 automatic thread labels`](https://github.com/pingdotgg/t3code/pull/5461) | closed，未合并 | 自动标签可能补足 title + pin 的检索层 | 不预建 schema；先做正文 search |
| [`#5226 modular theme library`](https://github.com/pingdotgg/t3code/pull/5226) | open | appearance 扩展 | C2 有严格 design tokens，暂不引入外部主题 DSL |
| [`#5446 tag files/directories from anywhere`](https://github.com/pingdotgg/t3code/pull/5446) | open | composer context 选择 | 先不突破 C2 project/worktree scope |

## 本轮实际吸纳范围与后续顺序

### Slice A（本轮已实现）：持久化 thread pinning

- SQLite additive migration：`pinned INTEGER NOT NULL DEFAULT 0`，旧库与旧序列化 session 默认 unpinned。
- core `Session` / `Store` / `Engine` pin/unpin 语义；active sessions 按 pinned-first、组内 created-at descending 排序。
- Desktop rail 提供 Pinned 独立分组、pin/unpin action 与可见标记。
- archive 会清 pin，archived session 不能被重新 pin；restore 后保持 unpinned。

已达到的边界：pin 是 server-backed core 状态，不在 localStorage；持久化、排序、旧库 migration、archive/restore 规则都有 Rust 测试。TUI/remote 本轮没有新增 pin 控件，不把 Desktop 功能误称为全 surface 对齐。

### Slice B（本轮已实现的保守切片）：ACP-compatible observability

- ACP `ToolCall` event 与 transcript `Part` 保留 provider-neutral kind。
- 只对明确 agent/workflow launch signal 保留白名单描述字段，并施加 per-field / total size budget；普通 tool raw input 不持久化、不广播。
- Desktop live event 与 transcript replay 的 tool upsert 保留 metadata，再以窄 identifier / structured-field 规则派生只读 Agents roster；普通 task 不会仅因含有 `task`/`prompt` 字段被升级成 agent。
- Agents roster 与原 Tools 列表并存，只增加当前证据足以支撑的 title、role、status、task summary。

明确未实现：core lifecycle fold、乱序/终态状态机、provider-native parent/child linkage、usage 聚合、TUI/remote Agents surface、interrupt-all。当前 UI status 只是 ACP tool-call status 的保守呈现，不能据此声称与上游 #5219 等价。

### Slice C（本轮已实现）：远程配对正确性

- server 发布带稳定 id 与 `qr_shareable` 的 endpoint；Tauri command 在签发 token 前验证所选 id。
- 默认优先 LAN，loopback-only 环境安全回退；Loopback 链接可复制但不生成 QR。
- Desktop selector 变更即生成对应 host 的新链接；status refresh 会淘汰 stale selection，request sequence 会淘汰 stale response。
- token 继续位于 fragment，既有 one-time pairing、bearer revocation 与 single-use WS ticket 行为不变。

已达到的边界：二维码 URL 的 host 来自已验证选择；手机不会拿到 `127.0.0.1` 的 QR；loopback 同机复制路径仍可用。

### Slice D（第二轮已实现）：信息检索、标题与稳定读取

- 把用户 `DocBlock` 的规范化原文与发送给 provider 的 compiled prompt 分开持久化；rules、skill 展开、文件内容和引用会话正文不会进入 user 搜索索引。
- additive trigram FTS5 v2 migration + 输入/输出有界的 core search API + command palette role snippets；旧 compiled user rows 不回填，agent legacy chunks 按 turn 安全合并，中文、英文前缀与 literal `%` 均有回归测试。迁移仍一次性扫描旧 parts，1–2 字符 fallback 仍需全表 `instr`，因此这里不声称计算量或迁移内存已经有界。
- deterministic initial title + durable `default / automatic / manual` provenance；自动标题只写一次，手工 rename 永不被覆盖。
- 会话选择先清旧 transcript 并显示稳定 loading shell；monotonic request id 淘汰 A→B 快速切换中的旧响应，Engine event 只写入所属会话；已知项目同步 cwd/project，worktree cwd 不再被误认成项目身份。
- 用户消息超过 8 行或 600 字符时默认折叠，保留显式展开/收起和完整持久化正文。
- session creation 以 request id 关联发起客户端，远端并发创建不会夺走 Desktop/TUI/remote 的 pending prompt；显式导航会撤销本地 pending ownership，但保留编辑器草稿，迟到的创建结果只能刷新列表，不能夺回焦点。
- prompt 也有独立 request id；core 先持久化 canonical user `Prompt`，再发匹配的 `TurnStarted`。三端只在精确确认后消费自己的 pending 状态，写库失败、busy、同步发送失败、断线与 foreign request 都不会清掉错误的草稿。Desktop 还会比较原始 editor revision，确认期间新增的输入不会被晚到 ack 清除。
- core 以单会话 turn lease 拒绝并发 prompt，权限等待期间也不释放；`TurnStarted` / terminal event 让 Desktop、TUI 与 remote 消费同一运行边界。Desktop、TUI 和 remote 权限请求均按去重 FIFO 队列保留；rail 可显示远端启动的后台运行会话，TUI/desktop 的后台事件也不会写入当前 transcript。
- remote WebSocket 通过有界、保序且与 socket 生命周期解耦的 inbound worker 提交已接收操作；客户端在 `TurnStarted` 后断开不会取消 core lease 或把其他 frontend 留在假 Running。浏览器断线会恢复尚未确认的草稿并清理本地 busy，重连后仍由 core 仲裁。
- Desktop transcript load 以 request id、`TurnStarted` version 与按位置计数的 stream delta 合并快照；新一轮不会并入旧 tail，重复的相同文本不会被内容启发式误删，持久化领先 IPC 的 delta 也有回归覆盖。
- 原本只到 UI 的 worktree toggle 已接通 core：从显式选择的本地基线创建持久 sibling checkout；`project_path` 保留原项目身份，`worktree_path` 指向 checkout 根，`cwd` 镜像用户选择的仓库子目录，hooks 也在该子目录执行。基线可为当前 checkout 的 `HEAD` 或本地 symbolic `refs/remotes/origin/HEAD`，创建结果持久化实际 ref 与不可变 SHA。

仍未完成：10 万条 parts 的独立 benchmark 与分批 migration、isolated model title regeneration。

### Slice E（第三轮已实现）：显式 index 与有界 diff

- status 采用 NUL-safe porcelain 解析；`MM` 会同时出现在 Staged changes 与 Changes，rename 同时保留新旧 literal path。
- file-level stage / unstage 始终使用 `--` 与 literal pathspec；批量操作最多接收 256 个明确路径。unborn repo、stage 后又修改的 `AM`、SHA-1 / SHA-256 空树和 rename 筛选均有真实 Git 回归。
- 普通 Commit 不再隐式 `git add -A`，只提交当前 index；建议提交信息也只读取 staged files。提交失败不会由 C2 清空 message 或重置 index，push 失败会真实向上传播。
- diff 明确区分 `all / staged / unstaged`；禁用 external diff、textconv、pager 与颜色，并施加 2 MiB stdout、64 KiB stderr、256 files、10 秒共享预算。untracked 通过隔离临时 index 进入 working-tree diff，不污染用户 index；文件集竞态返回 `working_tree_changed`，所有截断都有结构化原因。
- Desktop 用有界 numstat 替代为统计而加载整份 patch；预览再设 4,000 行 DOM 上限，并用单调 request id 丢弃迟到 diff。Git status/stat、checkpoint list 与 Suggest 也各自淘汰迟到响应，旧结果不会覆盖新 index 或用户后来编辑的 message。按钮内只呈现能够诚实观测的 `Committing / Pushing / Creating PR`，不虚构 Git hook 子阶段。
- Source Control 在桌面与 390px 窄视口均可用；message 有可见 label，错误使用 live alert，交互保持原生 button、至少 24px 的小型操作目标、focus ring 与 pressed/busy 语义。checkpoint revert 会先明确确认，再进入受控 phase，异常不会成为未处理 Promise。

### Slice F（第四轮已实现）：有界 transcript、持久活动态与显式 worktree 基线

- transcript cursor 按**完整 user turn**对齐，而不是固定 parts 切片；默认返回最近 20 个 user turns，调用方即使请求更大也会被硬限制为 50。Desktop 与 remote 可显式加载更早内容并保持 scroll anchor，invalid / cross-session cursor 会得到明确错误。这个边界只声称 turn-count bounded；单一超大 turn 并没有额外的严格 byte/part 上限。
- transcript-backed live event 在持久化后携带 durable sequence；客户端以 `snapshot_through` 为边界合并读事务快照与并发 live event，不再靠文本内容猜重复。`@chat` 的真实发送与 preview 共用最近 20 个 user turns，并再受 16,000 个 Unicode scalar values 的硬上限约束，超出时显式标注省略。
- 历史 snapshot 仅在同一 user turn、同一 tool id 且后面确有 `completed` / `failed` 时折叠更早的非终态 `tool.updated`；terminal row 继承恢复 UI 所需的有界 metadata。所有 live tool event 原样保留，跨 turn id 重用、没有 terminal 的历史和 terminal 之后的新 in-flight update 都不压缩。
- core 持久化单调 revision 的 `SessionActivity`：`idle`、`running`、`awaiting_input`、`failed`。Desktop、TUI 与 remote 按 revision 合并 session snapshot 和 event，重载或多客户端观察不会让迟到快照倒退状态；`Awaiting Input` 的 pending sequence 提供跨会话 FIFO。进程重启后无法恢复 provider task / reply channel 的 `running` 或 `awaiting_input` 会原子归一化为 `failed(interrupted)`，清除失效按钮而不是伪装仍可回答。
- worktree 新建会话显式选择 **Off / Current / Local origin default**。两种有效基线都只解析本地 ref：Current 使用当前 `HEAD`，origin default 只接受本地 symbolic `refs/remotes/origin/HEAD`；实现绝不 fetch、猜 `main` / `master`、静默 fallback 或替换用户选择。会话持久化真正用于创建 checkout 的 ref + SHA；missing、dangling 或 stale origin ref 均按本地事实展示，其中 stale 也不会触发隐式网络更新。
- worktree 会话同时持久化创建时的目录身份：Unix 使用 device + inode，Windows 使用 volume serial + file index。每次 prompt 与进程恢复都在 `running` 状态、`TurnStarted`、transcript 写入或 ACP 交互之前重新验证；即使替换目录复制了同样的 `.git` marker 也会 fail closed。旧数据库行没有身份记录时，只允许更窄的 Git/path 校验，并在 Desktop/TUI 明示 `identity unverified`。
- 清理路径不依赖“先检查、后 rename/remove”的竞态窗口：当前实现全平台保留路径、Git registration 与 branch，返回需要人工处理的明确错误，绝不因身份检查刚刚通过就移动后来替换进来的目录。它牺牲自动清理，换取不会误伤不属于 C2 的工作区。
- interface/prompt/code typography 仍只在确有需求时作为独立工作处理。

## 本轮验证

- `cargo test -p codetwo-core`：218 个 library tests + 23 个 integration tests，共 241/241 通过；其中覆盖 transcript 分页/高水位、activity revision、permission FIFO、重启归一化、worktree SHA 与目录身份重校验，以及 replacement-directory race。
- `cargo test -p codetwo-server`：10 个 library tests + 2 个 WebSocket round-trip tests，共 12/12 通过；`cargo test -p codetwo-tui`：22/22 通过。Desktop Rust target 通过，`cargo check --workspace` 通过。
- Desktop `bun test`：46/46 tests、129 assertions 通过；production build 通过。website build、remote client inline JavaScript 语法检查、`cargo fmt --all -- --check` 与 `git diff --check` 均通过。
- 真实 rendered QA 覆盖 1440×900 与 390×844：worktree picker、不可用 baseline、窄屏弹层、右侧 surface overlay 的打开/关闭均正常。Vite fallback 没有真实选中项目/provider，因此无法在这条浏览器路径里执行 Tauri 原生 ref/SHA 解析与 receipt；这些边界由 Rust 单元/集成测试覆盖，仍不冒充原生打包 E2E。
- Windows 目录身份实现以 Rust 1.82 对 `x86_64-pc-windows-gnu` 做了聚焦编译验证；完整 core Windows cross-check 在构建 bundled SQLite 时因当前环境缺少 `x86_64-w64-mingw32-gcc` 被阻断，所以这里只声称该实现本身可编译，不声称完成整包 Windows 验证。

## 移植与许可证边界

t3code 当前源码使用 MIT License，Copyright 2026 T3 Tools Inc.；C2 workspace 声明 Apache-2.0。吸收产品行为和重新实现不产生逐段复制问题；若直接复制或实质性改写上游源码，应保留 MIT copyright 与 permission notice，并把来源 commit 写入 NOTICE/third-party 记录。[上游 LICENSE@4f5834b](https://github.com/pingdotgg/t3code/blob/4f5834ba72c5905a318c00456dd21271b2fa9d6f/LICENSE) · [C2 workspace license](../../Cargo.toml)

## 最终取舍

- **本轮已做**：server-backed pin；bounded ACP launch metadata + Desktop Agents roster；endpoint-aware pairing；canonical conversation search；非侵入式 initial title；稳定 thread shell；长 user message 折叠；按完整 user turn 对齐的 bounded transcript pagination；snapshot-only tool history projection；durable revisioned `SessionActivity` / `Awaiting Input`；显式且仅使用本地 ref 的 worktree baseline；跨客户端 session/turn/error/permission 状态隔离；explicit index、selective staging、bounded/no-external diff 与诚实的 Git action phase。
- **紧接着做**：在真实签名 Tauri app 与 Windows CI 中补齐平台级 E2E；这不改变本轮已通过的 core/server/TUI/Desktop/web 验证边界。
- **作为后续独立 epic 做**：完整 provider-native observability；只有 adapter 暴露可靠 linkage 后，才增加 core lifecycle、usage、全 surface 展示与 interrupt-all。
- **只借鉴不照搬**：event-sourced orchestration、Electron renderer recovery、Cloudflare self-update/relay 逻辑；它们解决的运行时与 C2 的 Rust/Tauri/ACP 边界不同。
- **暂不做**：所有 open PR 功能；等进入 `main` 且最好进入 nightly 后重新核验。
