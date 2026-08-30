# t3code 扩大版本范围后的 C2 差距审计

> 审计日期：2026-08-07（Asia/Singapore）
>
> 上游：[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code)
>
> 对照范围：稳定版 `v0.0.20`–`v0.0.31`、`v0.0.32-nightly.20260806.1015`、审计时的 `main`，以及 C2 当前工作树
>
> 证据口径：只采用上游 release、tag、已合并 commit/PR 与对应源码；开放 PR、issue 和二手介绍不算已交付功能

## 结论

扩大范围后，旧报告里最重要的三个“下一步”已经不再是缺口：C2 当前工作树已经有 durable
`AwaitingInput`、显式且固定完整 SHA 的 `origin/HEAD` worktree 基线，以及按完整 user turn
分页的 transcript。继续围绕它们立项会重复建设。

扩大审计最终收敛出六项；其中 1、2 已在本轮落地，5 已完成 core seam 与 Desktop capability 第一片。第一项不是新 UI，
而是继续声称“已吸纳 v0.0.21 权限能力”之前必须补齐的本地正确性硬门槛：

1. **原子、持久、首轮生效的 execution policy**：本轮已完成 core/schema/协议与 Desktop/TUI/remote 闭环；更新携带 request-id，core 只在 durable + live 同时提交后广播权威策略，失败则相关联报错并保持旧值。
2. **项目正文搜索**：nightly 已交付；本轮已按 C2 的 local-first 边界重写为有界、可取消的 `rg --json` 搜索，并接入 Desktop 全局快捷键与 Monaco 行列跳转。
3. **安全 Markdown transcript 与工作区文件跳转**：稳定版 v0.0.30 已交付；C2 当前 agent answer 仍是纯文本。
4. **新会话模型预选 + 搜索与收藏**：稳定版 v0.0.21 已交付搜索/收藏；C2 还能列动态模型，但创建首轮前 picker 被隐藏。
5. **完成 SourceControlProvider driver seam**：本轮已把 PR 路径从纯 Git 拆到 provider-aware core，并完成 Desktop 能力/不可用原因展示；仍缺显式 self-hosted 配置、认证预检与非 GitHub adapter。
6. **可导出、先脱敏的 provider/process diagnostics**：v0.0.23–v0.0.31 连续演进；C2 仅把 provider stderr 写到 tracing。

本轮之后，下一顺序应是先做 3，再并行评估 4 与 6；5 只在出现真实 provider 需求时继续 auth/self-hosted/non-GitHub adapter。
prompt stash 有价值，但相对上述六项降为 P2 backlog。
不要把云 relay、原生移动端、AI 自动审批或 t3code 的 Electron/Effect 内部架构一并带入。

## 证据边界与当前上游

审计时用官方 remote ref 重新核对了三个边界：

| 层级 | 官方 ref | 本报告可据此声称什么 |
| --- | --- | --- |
| 最新稳定版 | [`v0.0.31`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.31) → [`e6987965f659`](https://github.com/pingdotgg/t3code/commit/e6987965f65914861f0dabd0db03729fe5cd2508) | 已进入稳定渠道 |
| 最新 nightly | [`v0.0.32-nightly.20260806.1015`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.32-nightly.20260806.1015) → [`e4abc31f1e3f`](https://github.com/pingdotgg/t3code/commit/e4abc31f1e3f930e521a5bb62b38a9c5b28d8fb1) | 官方预发布已包含；稳定性承诺低于 stable |
| 审计时 `main` | [`4f5834ba72c5`](https://github.com/pingdotgg/t3code/commit/4f5834ba72c5905a318c00456dd21271b2fa9d6f) | 已合并但尚不能称为 nightly/stable 交付 |

`v0.0.31...nightly 1015` 一共有 127 个 commit；nightly 之后 `main` 有 5 个 commit。完整差异入口：
[`v0.0.31...1015`](https://github.com/pingdotgg/t3code/compare/v0.0.31...v0.0.32-nightly.20260806.1015) ·
[`1015...main`](https://github.com/pingdotgg/t3code/compare/v0.0.32-nightly.20260806.1015...main)。

C2 是共享、未提交工作树；本报告按最终校验后的工作树更新状态。`ExecutionPolicy`、`initial_policy`、durable
`sandbox_policy`、项目正文搜索和 SourceControl capability surface 均已形成可验证闭环；没有把尚未实现的 Markdown、模型收藏、
diagnostics、认证预检或非 GitHub adapter 一并算作成功。

本报告把纯 CI、release、vendor、文档和 TypeScript/Effect 内部重构归入“实现材料，不移植”；但所有在 release
note 或这 127 个 commit 中形成用户能力、兼容边界或安全/规模不变量的项目，都在下面逐版本归类，没有用抽样代替覆盖。

状态定义：

- **已吸纳**：当前 C2 工作树存在同等行为，并且核心不变量已有测试或清晰实现。
- **部分吸纳**：已有基础，但上游用户结果仍缺一段；不能写成“已完成”。
- **未吸纳**：当前代码没有对应入口或协议。
- **不适配**：依赖不同产品边界，或会削弱 C2 的 provider-neutral / local-first / fail-closed 约束。

## 先纠正两份早期研究中的过时结论

本报告合并并取代了 2026-08-06 的 expanded version history 与 latest features 两份早期
研究。它们不能分别单独当作“当前差距”，因此已从现行文档目录移除；原始内容仍可从
Git 历史恢复。按当前工作树复核：

| 旧结论或旧基线 | 当前证据 | 现判定 |
| --- | --- | --- |
| `Awaiting Input` 仍应进入 core 状态机 | [`session.rs`](../../../crates/core/src/session.rs)、[`activity.rs`](../../../crates/core/src/activity.rs) 已有 revisioned `Idle / Running / AwaitingInput / Failed`，Desktop/TUI/remote 消费同一状态 | **已吸纳**，不再立项 |
| origin-based worktree 是未来候选 | [`worktree.rs`](../../../crates/core/src/worktree.rs) 只解析本地 `refs/remotes/origin/HEAD`；[`engine.rs`](../../../crates/core/src/engine.rs) 固定并复核完整 SHA 与目录身份 | **已吸纳**；继续禁止隐式 fetch/fallback |
| 选中会话仍会整体读入 transcript | [`store.rs`](../../../crates/core/src/store.rs)、[`bridge.ts`](../../../apps/desktop/src/bridge.ts) 已有 bounded page/cursor/high-water snapshot | **已吸纳** |
| 选择性暂存、index-only commit、bounded diff 是下一步 | [`git.rs`](../../../crates/core/src/git.rs)、[`SourceControl.tsx`](../../../apps/desktop/src/git/SourceControl.tsx) 已实现 literal path、显式 index、`--no-ext-diff` 和资源上限 | **已吸纳** |
| 文件浏览/命令面板代表已有“项目搜索” | 初始审计时 [`workspace.rs`](../../../crates/core/src/workspace.rs) 的 `list_files` 只按路径 substring；本轮新增 [`workspace_search.rs`](../../../crates/core/src/workspace_search.rs)、Tauri request-scoped cancellation、`⌘⇧F` UI 与 Monaco reveal | **已吸纳正文搜索**；常驻索引仍明确不引入 |
| transcript 已有 rich markdown | [`TurnCard.tsx`](../../../apps/desktop/src/session/TurnCard.tsx) 对 agent text 使用 `whitespace-pre-wrap` 的 `<p>` | **未吸纳** |
| model picker 已足够完整 | [`Composer.tsx`](../../../apps/desktop/src/session/Composer.tsx) 能显示动态 models/config options；[`models.ts`](../../../apps/desktop/src/session/models.ts) 能折叠 effort family，但没有 query/favorite state，而且 `hasSession=false` 时 picker 直接隐藏 | **部分吸纳**；首轮选择也缺失 |
| diagnostics 已由 tracing 覆盖 | [`acp/mod.rs`](../../../crates/core/src/acp/mod.rs) 只逐行 `tracing::debug!` provider stderr；Settings 没有导出入口 | **部分吸纳** |
| execution mode 已完整持久化 | 初始复核时只存 `permission_mode`；本轮已加入 `ExecutionPolicy`、`sandbox_policy` migration、`initial_policy`、原子 `SetExecutionPolicy`、相关联权威回执，并让 Desktop/TUI/remote 创建、切换与 revive 使用同一双轴策略 | **已吸纳核心正确性与跨客户端对账** |
| PR 创建仍完全硬编码在 Git helper | 当前工作树新增 [`source_control.rs`](../../../crates/core/src/source_control.rs)，分离 Git 与 hosted operation，识别并脱敏 remote，只接受 provider 的 authoritative public host，不支持的 provider 会在 push 前失败；[`git.rs`](../../../crates/core/src/git.rs) 已委托给它，Desktop 也显示 provider/capability/CLI 状态 | **core seam + Desktop capability 已吸纳**；auth/non-GitHub adapter 仍部分 |

这些判定针对当前未提交工作树，不把 detached `HEAD` 的旧快照冒充当前实现。

## v0.0.20–v0.0.31 逐版本差距矩阵

| 版本 | 一手功能证据 | 当前 C2 判定 | 仍需处理 / 明确不适配 |
| --- | --- | --- | --- |
| [`v0.0.20`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.20) | client setting fallback [#2099](https://github.com/pingdotgg/t3code/pull/2099) 与 release finalize [#2100](https://github.com/pingdotgg/t3code/pull/2100) | 没有新的产品能力可吸纳 | release 工程 **不适配为功能** |
| [`v0.0.21`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.21) | OpenCode [#1758](https://github.com/pingdotgg/t3code/pull/1758)、Cursor ACP [#1355](https://github.com/pingdotgg/t3code/pull/1355)、model search/favorites [#2153](https://github.com/pingdotgg/t3code/pull/2153)、dynamic permission [#2311](https://github.com/pingdotgg/t3code/pull/2311) | providers、arbitrary ACP option routing 与 execution policy 完整性 **已吸纳**；model/config capability **部分吸纳** | 新会话模型预选/search/favorites 仍列候选 4 |
| [`v0.0.22`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.22) | multi-provider [#2277](https://github.com/pingdotgg/t3code/pull/2277)、VCS seam [#2435](https://github.com/pingdotgg/t3code/pull/2435)、GitLab [#2462](https://github.com/pingdotgg/t3code/pull/2462)、Bitbucket/Azure [#2473](https://github.com/pingdotgg/t3code/pull/2473)、remote discovery [#2482](https://github.com/pingdotgg/t3code/pull/2482)、diff collapse/whitespace [#2502](https://github.com/pingdotgg/t3code/pull/2502) / [#2389](https://github.com/pingdotgg/t3code/pull/2389) | ACP multi-provider、diff scope、exact-host detection、provider-aware core seam 与 Desktop capability **已吸纳**；auth probe、GitLab/Bitbucket/Azure create adapter **部分/未吸纳** | seam 当前状态见候选 5；Tailscale/SSH hosted frontend 属于另一部署模型，**不直接移植** |
| [`v0.0.23`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.23) | keymap [#2533](https://github.com/pingdotgg/t3code/pull/2533)、process/trace diagnostics [#2532](https://github.com/pingdotgg/t3code/pull/2532)、skill chips [#2572](https://github.com/pingdotgg/t3code/pull/2572)、auto fetch [#2605](https://github.com/pingdotgg/t3code/pull/2605)、long prompt collapse [#2180](https://github.com/pingdotgg/t3code/pull/2180) | keymap、skills、长 prompt 折叠 **已吸纳**；diagnostics **部分吸纳** | 可导出诊断 **未吸纳**，列为候选 6；后台自动 fetch 会偷偷改变网络/refs，**不适配** |
| [`v0.0.24`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.24) | VCS diff loading [#2586](https://github.com/pingdotgg/t3code/pull/2586)、resource history [#2685](https://github.com/pingdotgg/t3code/pull/2685) | bounded diff 与迟到请求淘汰 **已吸纳**；资源诊断 **未吸纳** | resource history 只作为候选 6 的可选、按需层；不复制上游性能百分比 |
| [`v0.0.25`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.25) | Mobile WIP [#2013](https://github.com/pingdotgg/t3code/pull/2013)、Cursor model probe [#2428](https://github.com/pingdotgg/t3code/pull/2428)、reasoning selection [#2760](https://github.com/pingdotgg/t3code/pull/2760) | ACP-reported model/config option 优先、fallback model 与 effort grouping **部分吸纳** | 独立 provider preflight/probe 仍弱；原生 Mobile WIP **不适配当前交付面**，不能据合入推断成熟 |
| [`v0.0.26`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.26) | relay/APNs [#2837](https://github.com/pingdotgg/t3code/pull/2837)、Grok ACP [#2809](https://github.com/pingdotgg/t3code/pull/2809)、space-aware file mention [#2625](https://github.com/pingdotgg/t3code/pull/2625)、multi-account/self-hosted SCM [#2480](https://github.com/pingdotgg/t3code/pull/2480) | Grok 与文件 mention **已吸纳**；SCM 能识别 host/provider，但 account/auth 与 non-GitHub create **未完成** | SCM 归入候选 5；托管 relay/APNs **不适配**，继续 local server + explicit endpoint |
| [`v0.0.27`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.27) | T3 Cloud → Connect rename [#3011](https://github.com/pingdotgg/t3code/pull/3011) | 无同类产品概念 | 品牌变更 **不吸纳** |
| [`v0.0.28`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.28) | browser/annotations/agent automation [#3053](https://github.com/pingdotgg/t3code/pull/3053)、workspace files [#3087](https://github.com/pingdotgg/t3code/pull/3087)、right panel [#3116](https://github.com/pingdotgg/t3code/pull/3116)、origin worktree [#3157](https://github.com/pingdotgg/t3code/pull/3157)、diff scope [#3169](https://github.com/pingdotgg/t3code/pull/3169)、timeline minimap [#3587](https://github.com/pingdotgg/t3code/pull/3587)、WSL picker [#2751](https://github.com/pingdotgg/t3code/pull/2751) | browser UI/annotations、files/right dock、origin baseline、diff scope **已吸纳**；可操作同一可见页面的 authenticated agent broker **未吸纳**，所以整项只算 **部分** | content search 仍缺（后来由 nightly #4855 补齐）；agent browser automation 需单独 threat model，当前 catalog 中的 MCP command 不是实现证据；timeline minimap **未吸纳、低优先**；native mobile/WSL picker **不直接移植** |
| [`v0.0.29`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.29) | snooze [#4311](https://github.com/pingdotgg/t3code/pull/4311)、Auto approvals [#4272](https://github.com/pingdotgg/t3code/pull/4272)、`t3.json` [#4317](https://github.com/pingdotgg/t3code/pull/4317)、prompt stash [#4453](https://github.com/pingdotgg/t3code/pull/4453)、SCM settings [#4204](https://github.com/pingdotgg/t3code/pull/4204)、diff totals [#4674](https://github.com/pingdotgg/t3code/pull/4674)、MCP credential lifetime [#4659](https://github.com/pingdotgg/t3code/pull/4659)、mobile/PiP/remote service [#3579](https://github.com/pingdotgg/t3code/pull/3579) / [#4397](https://github.com/pingdotgg/t3code/pull/4397) / [#4286](https://github.com/pingdotgg/t3code/pull/4286) | `.codetwo.json`、diff totals、core-owned permission state 与 durable/atomic ACP tool-kind ceiling **已吸纳**；prompt stash **未吸纳** | stash 降为 P2 backlog；Auto 没有 provider-neutral 可审计 reviewer contract，**不适配**；mobile/PiP/managed service 后置；MCP credential lifetime 由 ACP provider ownership 决定，不伪造 app 层保活 |
| [`v0.0.30`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.30) | inline-code file links [#4726](https://github.com/pingdotgg/t3code/pull/4726)、stash survives provider switch [#4787](https://github.com/pingdotgg/t3code/pull/4787)、Appearance [#4715](https://github.com/pingdotgg/t3code/pull/4715)、snapshot gzip [#4788](https://github.com/pingdotgg/t3code/pull/4788)、WS deflate [#4705](https://github.com/pingdotgg/t3code/pull/4705)、mobile thread/OTA [#4717](https://github.com/pingdotgg/t3code/pull/4717) / [#4686](https://github.com/pingdotgg/t3code/pull/4686) | theme + terminal typography **部分吸纳**；snapshot 内容投影已做，但 transport compression 没做 | Markdown/file links 列为候选 3；stash 为 P2 backlog；interface/prompt/code fonts **部分吸纳、P2**；gzip/deflate 需先量测，不为对齐而加；mobile OTA **不适配** |
| [`v0.0.31`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.31) | file focus/highlighting [#3979](https://github.com/pingdotgg/t3code/pull/3979)、thread shell [#4830](https://github.com/pingdotgg/t3code/pull/4830)、resource diagnostics [#2679](https://github.com/pingdotgg/t3code/pull/2679)、markdown choice [#4853](https://github.com/pingdotgg/t3code/pull/4853)、no external diff [#4854](https://github.com/pingdotgg/t3code/pull/4854)、app size [#4824](https://github.com/pingdotgg/t3code/pull/4824) | editor/LSP、shell/detail 分层、`--no-ext-diff` **已吸纳**；diagnostics **部分**；rendered markdown **未吸纳** | candidates 3/6；不复述“减少约 300MB”为 C2 收益，必须单独量测自己的 bundle |

## Nightly 1015 的增量审计

127 个 commit 按 C2 结果归为以下组：

| 增量组 | 上游一手证据 | C2 当前状态 |
| --- | --- | --- |
| 项目文件 picker + repo content search | [#4855](https://github.com/pingdotgg/t3code/pull/4855) / [`abc409c2`](https://github.com/pingdotgg/t3code/commit/abc409c2d4a072c2de46c9015f5cffff00dcc46b) | 路径 picker 与有界、可取消的 **正文 search 已吸纳** |
| thread content search、durable title、pin | [#4959](https://github.com/pingdotgg/t3code/pull/4959)、[#5357](https://github.com/pingdotgg/t3code/pull/5357)、[#5312](https://github.com/pingdotgg/t3code/pull/5312) | search/title/pin **已吸纳**；sidebar 手工 regenerate title [#4810](https://github.com/pingdotgg/t3code/pull/4810) 未吸纳、低优先 |
| font families/sizes | [#5103](https://github.com/pingdotgg/t3code/pull/5103) / [`8eca2000`](https://github.com/pingdotgg/t3code/commit/8eca20005b47e197b3610f7996f3fd02355c1891)，terminal 修正 [#5444](https://github.com/pingdotgg/t3code/pull/5444) | terminal 已有，interface/prompt/code **部分吸纳** |
| native subagent/workflow observability | [#5219](https://github.com/pingdotgg/t3code/pull/5219) / [`a2ca89aa`](https://github.com/pingdotgg/t3code/commit/a2ca89aa10f13a2222e08afd98c66285121d5ba2) | bounded ACP launch metadata + Desktop roster **部分吸纳**；没有 provider-native lifecycle、聚合 usage、interrupt-all |
| endpoint-aware pairing | [#5360](https://github.com/pingdotgg/t3code/pull/5360) / [`fff6a5b0`](https://github.com/pingdotgg/t3code/commit/fff6a5b028f85122ffef8d3636f390f95ade5172) | endpoint picker、loopback exclusion、signed fragment **已吸纳** |
| bounded replay / renderer OOM containment | [#5147](https://github.com/pingdotgg/t3code/pull/5147)、[#5148](https://github.com/pingdotgg/t3code/pull/5148) | transcript page/high-water、history projection、`content-visibility` **已吸纳同等不变量**；不照搬 Electron crash recovery |
| MCP/tool snapshot payload projection | [#5482](https://github.com/pingdotgg/t3code/pull/5482)、[#5483](https://github.com/pingdotgg/t3code/pull/5483) / [`b7d1981b`](https://github.com/pingdotgg/t3code/commit/b7d1981b57f1c30908808d1939fd4edbc781de12) | snapshot-only terminal projection **已吸纳**；live events 保持完整 |
| Ghostty terminal、managed tunnel/self-update、mobile-only UX | [#4860](https://github.com/pingdotgg/t3code/pull/4860)、[#5470](https://github.com/pingdotgg/t3code/pull/5470)、[#5053](https://github.com/pingdotgg/t3code/pull/5053) | C2 使用 xterm + direct local server；这些实现栈 **不直接适配** |
| settings sidebar search 与 UI polish | [#4682](https://github.com/pingdotgg/t3code/pull/4682) 及 [1015 compare](https://github.com/pingdotgg/t3code/compare/v0.0.31...v0.0.32-nightly.20260806.1015) | settings 仅三页，search **未吸纳、低优先**；局部视觉修复只按 C2 rendered QA 采纳 |

## Nightly 之后 `main` 的 5 个 commit

| Commit | 上游行为 | C2 处理 |
| --- | --- | --- |
| [`ab3b55e2`](https://github.com/pingdotgg/t3code/commit/ab3b55e29ac20a6212f09e38f1983b856fd77695) | 澄清 Auto permission fallback 文案 | C2 没有 Auto reviewer；现有 Ask/AcceptEdits/Yolo + ACP tool-kind ceiling 双轴更明确，**不移植 Auto 文案** |
| [`99d91dda`](https://github.com/pingdotgg/t3code/commit/99d91ddaa4996203b675cbd086d5acaa642d4827) | unknown ACP approval 仍可操作 | C2 保留 provider 给出的任意 option、durable FIFO 和 request-id routing；双轴 execution policy 也已持久化并在首轮生效，**已吸纳** |
| [`470d4eb9`](https://github.com/pingdotgg/t3code/commit/470d4eb993eccd7d33cc9ad6f282c684d6760ac8) | mobile pending card 不遮正文 | 原生 mobile surface 不存在，**不适配** |
| [`aa16c180`](https://github.com/pingdotgg/t3code/commit/aa16c180e5850ab94c022d3e41e18350c2117deb) | composer inline chip 对齐 | C2 使用 BlockNote 自有 inline nodes；只能在 rendered QA 中核对，不照搬 CSS |
| [`4f5834ba`](https://github.com/pingdotgg/t3code/commit/4f5834ba72c5905a318c00456dd21271b2fa9d6f) | 显式 thread 操作清除 `woke` | C2 没有 snooze/woke 状态，**不虚构迁移** |

## 下一批 6 个实现候选

### 1. P0 硬门槛（本轮已落地）：原子、持久、首轮生效的 execution policy

**上游证据。** v0.0.21 的 dynamic permission [#2311](https://github.com/pingdotgg/t3code/pull/2311) 把 adapter
返回的选项作为用户可操作能力；审计时 `main` 的 [`99d91dda`](https://github.com/pingdotgg/t3code/commit/99d91ddaa4996203b675cbd086d5acaa642d4827)
又修复 unknown approval 不能操作的问题。两者共同要求“用户选择的策略在实际 turn 上生效”，而不只是把控件画出来。

**C2 初始差距与本轮结果。** C2 把 approval `mode` 与先行 veto 的 ACP tool-kind ceiling（兼容字段名仍是 `sandbox`）正交；
这是 ACP permission mediation，不是 OS、容器或路径隔离。初始审计时，
[`Session`](../../../crates/core/src/session.rs) 和 SQLite [`sessions`](../../../crates/core/src/store.rs) 只存 `permission_mode`；
[`revive_session`](../../../crates/core/src/engine.rs) 把 sandbox 恢复为默认 `workspace_write`，`SetSandbox` 只改 live runtime；
[`NewSession`](../../../crates/core/src/event.rs) 不携带初始 policy，Desktop 首轮立即提交，而且更新双轴使用两次 fire-and-forget。
最终实现加入 `ExecutionPolicy`、durable `sandbox_policy` migration、`initial_policy`、原子 op 与相关联权威回执；engine/store、
[`SessionInfo`](../../../apps/desktop/src/bridge.ts)、Desktop/TUI/remote 的创建、切换与 revive 全链已完成。最终 `cargo test --workspace`
共 337/337 通过（core 270 个 unit + 28 个 integration、Tauri 4、Server 10 + WebSocket 2、TUI 23）；Desktop Bun 60/60
测试、176 个 assertions 通过。明确边界是 tool-kind ceiling 只约束 provider 发给 C2 的 ACP permission request；不能拦截
provider 未上报的 syscall、验证任意 request 内路径，或代替真实进程/文件系统隔离。UI 与文档均已按这个边界更正。

**用户价值。** 用户选择 Read-only/Full access 的 ACP 权限策略后，第一轮、重启后和切回会话时都得到同一 pair；失败时相关联恢复
core 的权威值，而不是 UI 显示一种策略、core 实际执行另一种策略。这是一致性不变量，不应排在视觉功能之后。

**C2 落点。** 给 `Session`/SQLite 加 versioned `sandbox_policy`（旧行迁移为当前兼容默认）；新增单一
`SetExecutionPolicy { mode, sandbox, request_id? }` 与 store transaction，成功持久化后发布 `execution_policy_changed`；失败发相关联
非终止 error 且不发布假成功；`NewSession` 接收可选初始双轴策略并在
runtime、durable row、首个 `session/new` 之前一次建立。`SessionInfo` 暴露两轴；Desktop 在创建回执前冻结已捕获 pair，后续
Desktop/TUI/remote 都从 core 权威事件或 session projection 对账；旧 client 省略字段时保留明确兼容默认。

**依赖。** 无新依赖；这是 core/store/协议迁移，不应由前端 localStorage 兜底。

**安全/兼容不变量。** ACP tool-kind ceiling 始终先于 approval mode；Read-only/Workspace-write 对未知、缺失或 provider 自定义 kind
fail-closed，但不得把它宣称成 OS sandbox；两轴要么一起成功，要么保持旧值；持久化失败不得只改内存；
初始策略必须先于首个 prompt/permission request；旧数据库与旧客户端只能迁移到已文档化默认，不能静默放宽；未知 enum
fail-closed；事件/request id 要让 frontend 能确认是哪次更新；切换/重连不得用上一会话的 React state 覆盖当前会话。

**最低验证。** 三个 preset 的首轮 tool call、重启 revive、会话 A/B 切换、旧 schema 迁移、第二轴/SQLite 故障原子回滚、
并发更新的 last-authoritative-result、TUI/Desktop/remote contract、未知 enum 拒绝，以及 Read-only + Yolo 仍拒绝已报告 mutation。

### 2. P0（本轮已落地）：有界、可取消的项目正文搜索

**上游证据。** [#4855](https://github.com/pingdotgg/t3code/pull/4855) 已进入 nightly 1015；其
[`WorkspaceSearchIndex.ts@abc409c2`](https://github.com/pingdotgg/t3code/blob/abc409c2d4a072c2de46c9015f5cffff00dcc46b/apps/server/src/workspace/WorkspaceSearchIndex.ts)
把路径索引与按需正文索引分开，并显式设 25,000 entries、15 秒 scan、250ms 单次搜索、每文件 100 matches 等上限；
[`project.ts@abc409c2`](https://github.com/pingdotgg/t3code/blob/abc409c2d4a072c2de46c9015f5cffff00dcc46b/packages/contracts/src/project.ts)
把 query 限到 256 字符、结果限到 500，并返回 `truncated`。

**用户价值。** 当前 `⌘P/@` 能找到文件名，却不能回答“这个函数/错误文本在哪里”；正文搜索补上工作区最基本的
发现路径，并能直接打开文件到行。

**C2 落点。** [`workspace_search.rs`](../../../crates/core/src/workspace_search.rs) 已增加 `WorkspaceContentMatch` 与异步
`search_contents_with_cancellation(cwd, query, options, limit, cancellation)`；Tauri/bridge 增加只读 command；
`crates/core/src/keymap.rs` 增加 `search_workspace`；Desktop 新增对话框并复用
`App.tsx::openFileTab`/Monaco line reveal。Tauri 按 `(window, request_id)` 保存取消 token，并只接受已登记 project/session/worktree
的 canonical 根目录；新查询和关闭对话框都会 kill + wait 前一个 `rg`。session FTS 没有混成 repo search。

**依赖选择。** 第一版优先无 shell 的 `rg --json` argv 调用，并对“未安装 rg”给明确降级；若要内置，则使用 Rust
`ignore` + `regex`，但仍保留相同预算。不要引入常驻全文索引，直到量测证明必要。

**安全/兼容不变量。** canonical cwd 必须精确匹配登记时的 project/worktree；登记根被 symlink 替换后必须拒绝，不能在请求时把
stored root 与 request 一起重新 canonicalize 到攻击者目标；不跟随内容 symlink；query ≤256；
match ≤500、每文件/单行/总 stdout/time 均有上限；binary、`.git`、ignored/generated trees 默认跳过；regex 错误显式返回，
不悄悄当 literal；切项目或改 query 必须取消/淘汰旧结果；打开结果前再次验证 workspace-relative path。

**验证结果。** 12 个 core 定向测试覆盖 Unicode/UTF-16 column、CRLF、whole-word/regex、invalid regex、binary/巨文件、nested generated、
symlink/路径逃逸、malformed/partial NDJSON、timeout/result/output/per-file truncation 与显式取消；Tauri 4 个测试覆盖 exact root、
child/sibling 拒绝、登记根 symlink 替换拒绝、linked worktree 与未知 sandbox enum；Desktop 另覆盖 truncation reason 投影、
快捷键与构建。浏览器预览的 1440×1000 与 390×844 两种真实布局、快捷键、命令面板入口、toggle、focus、空状态和无横向溢出均已验收；
由于 Vite fallback 不返回原生搜索结果，Tauri IPC 到 Monaco 精确行列 reveal 没有被冒充为浏览器 E2E，仍由 core/Tauri contract、编译与代码路径覆盖。

### 3. P0：安全 Markdown transcript + 工作区文件跳转

**上游证据。** v0.0.30 的 [#4726](https://github.com/pingdotgg/t3code/pull/4726) 已把 inline code 路径做成文件跳转；
[`markdown-links.ts@55dd0161`](https://github.com/pingdotgg/t3code/blob/55dd01612efc51e19de479da5a0e348cbe2521e3/apps/web/src/markdown-links.ts)
区分 URL、host/version、相对/绝对路径和 `:line:column`；
[`ChatMarkdown.tsx@55dd0161`](https://github.com/pingdotgg/t3code/blob/55dd01612efc51e19de479da5a0e348cbe2521e3/apps/web/src/components/ChatMarkdown.tsx)
使用 sanitize schema、有限协议与 bounded highlight cache。v0.0.31 又让 rendered-markdown 选择跨 thread 保留
[#4853](https://github.com/pingdotgg/t3code/pull/4853)。

**用户价值。** C2 当前 answer 中的标题、列表、表格、代码块都只是纯文本；用户也不能从 `` `src/foo.rs:42` ``
跳到已有 Monaco/file pane。这是可读性和“回答 → 代码”闭环的共同缺口。

**C2 落点。** 新建 `apps/desktop/src/session/Markdown.tsx`，让 `TurnCard` 传 `cwd` 和受控
`onOpenFile(path,line,column)`；`App.tsx` 只通过现有 file pane 打开 workspace-relative file。依赖可选
`react-markdown + remark-gfm + rehype-sanitize`；syntax highlight 复用现有 Shiki/Monaco 语言映射并设置 LRU byte/entry cap。

**安全/兼容不变量。** raw HTML 默认禁用（若启用必须 sanitize）；禁止 `javascript:`、任意 command/file URL 与远程图片自动加载；
外链走 `openExternal` 并显示 host；文件链接只解析到当前 canonical workspace，绝不把 assistant 文本当 OS 任意路径权限；
不存在、目录、escape、超长 path 均降为普通 code；streaming 时不得反复高亮整段造成 O(n²)；复制仍保留原始 Markdown。

**最低验证。** XSS payload、混淆 scheme、`../`/symlink/Windows drive/UNC、host 与版本号误判、Unicode path、line/column、
超长 code fence、streaming rerender、复制，以及 Desktop/narrow 两种真实渲染。

### 4. P1：新会话模型预选 + 搜索与 provider-scoped 收藏

**上游证据。** v0.0.21 的 [#2153](https://github.com/pingdotgg/t3code/pull/2153) 已交付；
[`modelPickerSearch.ts@66c326b8`](https://github.com/pingdotgg/t3code/blob/66c326b8c424ca1e3702232a4fe5a06f6ba2a525/apps/web/src/components/chat/modelPickerSearch.ts)
按 name/shortName/sub-provider/provider 做 token ranking，并只给 favorite 排序加权；
[`settings.ts@66c326b8`](https://github.com/pingdotgg/t3code/blob/66c326b8c424ca1e3702232a4fe5a06f6ba2a525/packages/contracts/src/settings.ts)
把 favorite 保存为 `(provider, model)`，没有把同名模型跨 provider 合并。

**用户价值。** ACP provider 尤其 OpenCode 可能返回大量模型；C2 已能动态展示它们，却会形成没有检索能力的长菜单。
更基础的问题是新建草稿把 picker 隐藏到 durable session 创建之后，所以用户不能决定第一轮模型。

**C2 落点。** 先让 draft 使用 provider manifest 中现有 builtin choices；`NewSession` 增加可选初始 model，并在首个
ACP `session/new` 发送。custom 或只能在 session initialize 后动态报告的 provider，草稿阶段明确显示“provider default”，不得伪造列表；
若需求证明值得，再参考 v0.0.25 的 Cursor model probe [#2428](https://github.com/pingdotgg/t3code/pull/2428) 设计有界 preflight。
随后在 `Composer.tsx::ModelPicker` 增加本地 query 和 star action；在 `models.ts` 先按 adapter authoritative id 建 stable key，
再在 family 层展示；用现有 persist helper 新增 versioned favorites schema。仅当可见 row 超过合理阈值（例如 8）时自动聚焦搜索，
短列表仍保持轻量。

**依赖。** 不需要新运行时依赖；排序函数保持纯函数并单测。

**安全/兼容不变量。** initial model 要在 durable session/首个 turn 上一致，ACP 拒绝时明确回退或失败，不能 UI 假成功；key 必须包含
provider id + adapter model id，不能只存 display name；provider 不再报告某 model 时保留为 orphaned preference 但不伪造可选项；
搜索只能重排/过滤 provider/builtin 的真实 choices，不能创造 model；切 provider/config option 时旧异步结果不能覆盖新菜单；
收藏不改变当前 model，选择才调用 ACP。

**最低验证。** 新草稿首轮选定 model、provider default/custom 无 preflight、ACP 拒绝、同名跨 provider、effort family、
dynamic config option 与 fallback list、orphan favorite、Unicode/fuzzy query、键盘导航、窄 popover，以及 provider 快速切换竞态。

### 5. P1（本轮完成 core seam + Desktop capability）：完成 Git VCS 与 hosting provider 的 driver seam

**上游证据。** v0.0.22 先合并 [VCS foundation #2435](https://github.com/pingdotgg/t3code/pull/2435)，再加入
[GitLab #2462](https://github.com/pingdotgg/t3code/pull/2462)、[Bitbucket/Azure #2473](https://github.com/pingdotgg/t3code/pull/2473)
与 [remote discovery #2482](https://github.com/pingdotgg/t3code/pull/2482)。其
[`VcsDriver.ts@6d7fe2e`](https://github.com/pingdotgg/t3code/blob/6d7fe2eeb7d2731da3f7f69988056ff7a5d3b921/apps/server/src/vcs/VcsDriver.ts)
只处理 repository/files/remotes/process；
[`SourceControlProvider.ts@6d7fe2e`](https://github.com/pingdotgg/t3code/blob/6d7fe2eeb7d2731da3f7f69988056ff7a5d3b921/apps/server/src/sourceControl/SourceControlProvider.ts)
另管 change request。这个分层比“一次支持四家”更值得吸纳。

**当前吸纳进展与用户价值。** 当前工作树的 [`source_control.rs`](../../../crates/core/src/source_control.rs) 已把 hosted change request
从纯 Git helper 分出：优先 `origin`/唯一 remote，解析 HTTPS/SSH/self-hosted host，展示 URL 前移除 credential/query，识别
GitHub/GitLab/Azure/Bitbucket/Unknown；只为 authoritative `github.com` 宣告 create capability，识别为其他 provider 时会在 push 前
fail-closed。`gitCreatePr` 已通过 [`git.rs`](../../../crates/core/src/git.rs) 委托该 seam；`notgithub.example`、`github.example`、
`gitlab.attacker.test`、`bitbucket.internal.example` 等 adversarial host 也有 Unknown 回归测试。core 分层与默认拒绝已吸纳。
Desktop 现在显示 sanitized provider/remote/host/repository URL、provider-native PR/MR 文案、CLI capability 与不可用原因；无 remote、
检测失败、不支持或缺 CLI 时禁用 change request；当前 workspace 是 Git repo 时独立 Push 始终保留，非 repo 则连同其他 mutation
一起禁用并显示真实原因。Git status/diff/checkpoint/provider state 均按 cwd identity scope，切仓库不会用 A 的 row 操作 B。
尚缺显式 self-hosted allowlist/config、认证预检，以及
真正的非 GitHub adapter。

**剩余 C2 落点。** 保持 `crates/core/src/git.rs` 只做 local Git；下一片把 auth probe 做成显式、可失败状态，并允许用户明确配置
self-hosted provider host。第二个真实需求出现后再加 GitLabCli，不因 enum 已能识别四家就声称四家都能创建。

**依赖。** 继续使用明确 argv 的 `gh`；GitLab adapter 才按需依赖 `glab`。不要嵌入 vendor token SDK。

**安全/兼容不变量。** parse SSH/HTTPS/self-hosted remote 时不打印 credentials；host allow/selection 与 remote name 显式；
provider detection 用 exact public host 或用户配置的 self-hosted allowlist，绝不能用 substring 把未知 host 当 GitHub；push 与 create PR 是两个可见阶段，push 失败绝不调用 provider CLI；title/body 使用 file/argv，
不经 shell；多 remote/detached/unborn branch fail-closed；generic fallback 不能偷偷发布。

**最低验证。** GitHub HTTPS/SSH、GitLab/self-hosted、credential-bearing URL redaction、`notgithub.example` 等 adversarial unknown host、多 remote、无 CLI/未登录、
push failure、恶意 title/body，以及 driver contract tests。

### 6. P1：按需采集、可导出、默认脱敏的诊断包

**上游证据。** v0.0.23 [#2532](https://github.com/pingdotgg/t3code/pull/2532) 增加 process/trace diagnostics；v0.0.24
[#2685](https://github.com/pingdotgg/t3code/pull/2685) 增加 resource history；v0.0.31 [#2679](https://github.com/pingdotgg/t3code/pull/2679)
进一步用 native telemetry 降低 idle polling/disk churn。早期
[`ProcessDiagnostics.ts@a2ff50db`](https://github.com/pingdotgg/t3code/blob/a2ff50dbba0725a53dfdb76184a54a621645ddd5/apps/server/src/diagnostics/ProcessDiagnostics.ts)
已经有 1 秒查询 timeout 与 2MiB output cap；
[`ProcessResourceMonitor.ts@9e632f5c`](https://github.com/pingdotgg/t3code/blob/9e632f5cec7315d65c2df4d3bc7be49bfe1385f3/apps/server/src/diagnostics/ProcessResourceMonitor.ts)
有 5 秒 sample、1 小时 retention、20,000 samples cap。

**用户价值。** “GUI 能开但 provider/ACP/PTY 不工作”目前只能让用户翻控制台；导出一份有限、可读的诊断包能显著缩短定位，
也能量测资源问题而不是复述上游百分比。

**C2 落点。** 新增 core diagnostics ring：provider spawn/exit、ACP initialize capabilities、最后 N 行已脱敏 stderr、
pending input/activity revision、PTY/remote 状态；Settings 增加 Preview + Export JSON。资源 sample 作为用户打开 Diagnostics 后才启动的可选层，
不要默认常驻。Tauri 用 save dialog 写用户选定路径。

**依赖。** 第一片无需 `sysinfo`：进程 ownership/exit/stderr 已在 core 手中。只有确认需要 CPU/RSS history 后再加跨平台 `sysinfo`
或平台 native helper。

**安全/兼容不变量。** 默认不收 env、prompt/transcript、文件正文、bearer/pairing token、完整 HOME 路径；command args 与 URL 先 redact；
ring 有 byte/entry/time cap；export 前展示内容与敏感性说明；采样失败不影响 engine；不得通过 shell 执行 `ps`/PowerShell 拼接；
remote client 无权读取 host diagnostics，除非新增单独授权。

**最低验证。** token/API key/credential URL/path redaction、UTF-8/超长 stderr、crash/rapid respawn、ring eviction、export failure、
Windows/macOS/Linux capability absence，以及开启/关闭 diagnostics 时的 idle CPU/RSS 对照。

### P2 backlog：显式、原子、有限额的 prompt stash

**上游证据。** v0.0.29 的 [#4453](https://github.com/pingdotgg/t3code/pull/4453) 增加 per-provider queue；
[`promptStashStore.ts@200fa826`](https://github.com/pingdotgg/t3code/blob/200fa826b02cf0503c6f6c2bd7250a58747bff2d/apps/web/src/promptStashStore.ts)
把每 queue 限到 20，并要求 durable write 成功后才能清空 composer；v0.0.30 的
[#4787](https://github.com/pingdotgg/t3code/pull/4787) 修复 provider switch 后 stash 消失。

**用户价值。** 用户可把一段未准备发送的复杂 prompt 暂存，先处理另一会话，再准确恢复，不必复制到外部便签。

**C2 落点。** 给 `DocEditor` 增加 `replaceBlocksRef`/serialize ref；新建 versioned local store，scope 至少包含
canonical project/worktree identity + provider id（比上游仅 provider 更严，避免跨 repo 泄露）；Composer 增加 Save/Restore badge，
Command Palette/keymap 增加 stash action。首版只保存 `DocBlock` 与创建时间，不保存文件正文或截图 bytes。

**依赖。** 无新依赖；若 localStorage quota/availability 不可靠，再迁移 SQLite，但不能假装内存 fallback 是 durable。

**安全/兼容不变量。** persist 成功后才 clear；每 scope ≤20、单 entry/总字节 cap；schema decode fail-closed；恢复 file/image/session
mention 时重新验证存在性与当前 scope，不把旧绝对路径带入新 worktree；restore 是 consume 还是 copy 必须明确；删除/eviction 可见；
prompt 含敏感内容，设置中提供 clear-all，不跨远程 client 同步。

**最低验证。** quota/storage denial、crash between write/clear、provider/project/worktree switch、corrupt schema、orphan mention、
FIFO/eviction、restore-vs-newer-draft 冲突、Unicode/大 prompt，以及 reload persistence。

## 尚未吸纳、部分吸纳与明确不适配：汇总

### 尚未吸纳

- v0.0.30 #4726 / v0.0.31 #4853 的安全 Markdown、inline file links 与渲染选择。
- v0.0.21 #2153 的 model search/favorites，以及新草稿首轮 model preselection。
- v0.0.22 source-control seam 的认证预检、显式 self-hosted 配置与非 GitHub change request adapter。
- v0.0.23–v0.0.31 的用户可见、可导出 diagnostics。
- v0.0.29–v0.0.30 的 prompt stash。
- settings search、title regenerate、timeline minimap、snooze、transport gzip/deflate；均低于六个候选。

### 已部分吸纳

- model capability：已有 ACP dynamic models/config options 和 fallback，但没有首轮 preselection、search/favorites、独立 provider preflight。
- source control：exact public-host detection、provider-aware core seam、remote redaction、GitHub adapter 与 Desktop capability surface 已有；self-hosted config、auth probe 与非 GitHub create 尚未实现。
- agent/workflow observability：已有 bounded launch metadata/Desktop roster，没有完整 provider-native lifecycle/usage/interrupt-all。
- appearance：已有 theme 和 terminal family/size，没有 interface/prompt/code typography。
- diagnostics：已有 tracing 与 provider stderr drain，没有 bounded preview/export/resource history。
- browser/workspace：已有 browser annotation、files/editor/right dock 与有界 repo content search；没有 #3053 那种对同一可见页面的 authenticated agent automation broker 或 background PiP。[`market.rs`](../../../crates/core/src/market.rs) 中一个 MCP command catalog 条目本身不能证明该 executable/runtime 已交付。
- remote scale：已有 bounded transcript + snapshot projection，没有 transport compression；是否需要必须先量测。

### 明确不适配或当前不应吸纳

- Clerk/T3 Connect、managed relay/tunnel/APNs、remote self-update/service management、原生 iOS/Android/iPad/OTA。
- 无 provider-neutral、可审计 reviewer contract 的 AI `Auto` approvals。
- t3code 的 Effect service/error 大重构、Electron lifecycle、Ghostty vendor、native resource-monitor 整套架构。
- 后台自动 fetch、根据猜测默认分支、未知 host 自动当 GitHub、未经明确动作的 push/publish。
- 上游具体模型版本、性能百分比、包体减少数字；只作为量测假设，不写成 C2 已获收益。
- snooze/woke 的状态机，直到 C2 真正决定需要时间调度语义；不能为了跟随最新 main 先造字段。

## 推荐实施顺序与完成证据

| 波次 | 能力 | 为什么这样排 | 必须拿到的完成证据 |
| --- | --- | --- | --- |
| 0（已完成） | execution policy 完整性 | 先修正首轮/重启/切换漂移 | schema migration、atomic store/runtime contract、相关联权威回执、首轮/revive/session-switch/rollback/多客户端 tests 已通过 |
| A（已完成） | 项目正文搜索 | 独立、只读、价值最高；还能成为 Markdown 跳转的验证底座 | core budget/escape/cancel tests 与 Tauri contract 已完成；最终宽/窄渲染见本轮验收 |
| A | 安全 Markdown + file links | 直接改善每个 turn；复用现有 file pane | sanitize/XSS/path tests、streaming 性能、复制语义、真实渲染 |
| A | 首轮 model + search/favorites | 先让第一轮可选，再改善大菜单；主要是协议与本地状态 | first-turn/provider-default contract、ranking/schema tests、provider switch race、键盘与窄视口 QA |
| B（部分完成） | 完成 SourceControlProvider seam | core exact-host + fail-closed 分层和 Desktop capability 已完成；再补 self-hosted config/auth，按需求加 vendor | 尚需 explicit self-hosted allowlist、auth probe、GitHub 外部 E2E 与非 GitHub adapter |
| B | diagnostics export | 为后续性能/兼容问题提供证据 | redaction corpus、bounded ring、export preview、三平台 capability 结果 |

P2 backlog 的 prompt stash 只有在以上六项之后再进入：完成证据仍应包括 durable write-before-clear、
project/worktree/provider scope、quota/corruption/reload 与 restore conflict tests。

“完成”不能由一个 happy-path 单测代替：每项都要有对应的资源上限、逃逸/竞态/兼容测试；涉及 UI 的前三项还要做
Desktop 与窄 viewport 的真实渲染和交互。原生 Tauri file open/save、provider process 和 SCM CLI 行为不能仅用 Vite fallback 声称 E2E。

## 本轮最终验证

- `cargo test --workspace`：337/337 通过；包含 270 个 core unit、28 个 core integration、4 个 Tauri boundary、
  10 个 Server unit、2 个真实本机 WebSocket roundtrip 与 23 个 TUI 测试。
- `cargo check --workspace`、本 PR Rust 文件逐文件 `rustfmt --check`、`git diff --check`：通过；仓库级
  `cargo fmt --all -- --check` 仍被 `origin/main` 已有的格式漂移阻断，本 PR 未为此扩大范围。
- `apps/desktop` 的 `bun run test`：60/60、176 assertions；`bun run build`：通过（仅保留既有 bundle-size warning）。
- `website` 的 `bun run docs:build`：通过。
- 真实渲染 QA：1440×1000 与 390×844 下，Workspace Search 和 Source Control 均无 document/dialog 横向溢出；
  `⌘⇧F` 与 Command Palette 入口可用，search option 的 pressed 状态、输入 focus、空状态可读；浏览器 fallback 的非 repo 状态会
  禁用所有 Git mutation，并明确显示 Push/change request 均不可用；纯函数测试覆盖“真实 Git repo 但无 remote”时独立 Push 不被
  hosted-provider 限制；权限菜单也显示 ACP permission-request 边界；console warning/error 为 0。
- 证据边界：浏览器 fallback 没有原生 `rg` 结果和 provider metadata，所以没有声称原生 IPC → Monaco reveal 或 provider 分支 E2E；
  也没有调用真实外部 `gh`，避免未经授权 push/创建 PR。对应的 parser/budget/cancellation/root authorization、exact-host、
  redaction、CLI-before-push 与 push-failure-before-provider 行为由 Rust/Tauri/纯函数测试覆盖。

## 许可证与吸纳方式

t3code 当前仓库的 [`LICENSE`](https://github.com/pingdotgg/t3code/blob/4f5834ba72c5905a318c00456dd21271b2fa9d6f/LICENSE)
是 MIT。本文仍建议吸收产品行为和经过验证的不变量，按 C2 的 Rust core + ACP + Tauri 边界重写；如果后续直接复制
上游的 substantial source，则必须保留相应版权与许可声明，并重新核对当时目标 commit 的许可证。
