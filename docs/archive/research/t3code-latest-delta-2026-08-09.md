# t3code 最新增量调研与 C2 吸纳建议

> 调研日期：2026-08-09（Asia/Singapore）
>
> 上游冻结时间：2026-08-09 11:58:47 UTC
>
> 上游：[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code)
>
> 增量边界：不含 [`a2ca89aa10f1`](https://github.com/pingdotgg/t3code/commit/a2ca89aa10f13a2222e08afd98c66285121d5ba2)，至含 [`1a003e383ac6`](https://github.com/pingdotgg/t3code/commit/1a003e383ac6b10258b8100c2617d938c4f06c69)
>
> C2 对照基线：`origin/main` [`e83de033886b`](https://github.com/IchenDEV/codeTwo/commit/e83de033886b4265e0f03f363080893727de30a8)，含 [PR #21](https://github.com/IchenDEV/codeTwo/pull/21) 与 [PR #23](https://github.com/IchenDEV/codeTwo/pull/23)
>
> 证据口径：只采用 GitHub release/tag、已合并 PR、commit 与两边源码；PR 正文里的实测数字只代表上游样本，不外推成 C2 收益

## 结论

机械边界内共有 **96 个 commit**。其中前 56 个进入稳定版
[`v0.0.32`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.32)（tag
[`239ef1c54df2`](https://github.com/pingdotgg/t3code/commit/239ef1c54df2f657912ccb5b8e25193d49d90417)），
接着 39 个进入最新预发布
[`v0.0.33-nightly.20260809.1042`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.33-nightly.20260809.1042)（target
[`963ebf5bd7cc`](https://github.com/pingdotgg/t3code/commit/963ebf5bd7cce00d40ff60c258b34c12dcab271e)，
最后一项是 CI-only hosted-web preview）。只有最新的
[`1a003e383ac6`](https://github.com/pingdotgg/t3code/commit/1a003e383ac6b10258b8100c2617d938c4f06c69)
React Native mobile Usage dashboard 尚未进入 release。调研末次远端复核
（2026-08-09 11:58:47 UTC）时 upstream `main` 为该 commit。
完整机械差异见
[`a2ca89a...1a003e3`](https://github.com/pingdotgg/t3code/compare/a2ca89aa10f13a2222e08afd98c66285121d5ba2...1a003e383ac6b10258b8100c2617d938c4f06c69)。

这轮不应再重复建设 thread 分页、滚动跟随、历史 tool payload 投影或 inline plan：C2
PR #21 已有按完整 user turn 的分页与 snapshot/live 合并，PR #23 已有 reader-intent
滚动，当前 `TurnCard` 也已把 plan、thinking、tools 与 agents 折叠在 turn 内。

建议吸纳顺序：

1. **P0：修正 Usage 的计数正确性并让扫描有界、可增量。** C2 已有本地 Usage，缺的不是再造页面，而是 Claude 重复 usage 去重、Codex delta/model 归属、provider 原始时间戳和 `(size, mtime)` 文件缓存。
2. **P0：加入项目级新会话工作区默认。** 吸收“显式草稿选择 > 项目本地设置 > `.codetwo.json` > 全局默认”的决策层；继续保持 C2 的 Off / Current / Local origin default 三态、固定 SHA、绝不隐式 fetch/fallback。
3. **P1：给有内容的未发送草稿稳定身份和返回入口。** 当前单个常驻编辑器会保留文字，但没有按项目/会话保存正文、provider、policy 与 worktree 选择，也不能同时恢复多个草稿。
4. **P1：补齐图片从“模型看得到”到“agent 工具可读/可复制”的闭环。** C2 core 已支持 ACP image block，但 Desktop 没有图片 paste/attach 入口；路径授权必须局限于受控附件目录。
5. **P2：项目级 Browser 最近站点与 pinned session 手工排序。** 两项都应做成有界、可删除、稳定持久化的小能力，不复制 t3code 的多环境/事件溯源实现。

不建议吸纳模块化主题库、多设备 provider settings、legacy sidebar、原生 mobile、managed tunnel/self-update、systemd 服务模板，或 t3code 的 Effect/event-sourced 内部架构。它们与 C2 的 Tauri/Rust、local-first、单 server ownership 边界不同。

## 一手事实：上游实际新增了什么

### 1. 会话读取、计划与输出策略

- [`#5493`](https://github.com/pingdotgg/t3code/pull/5493) 给 thread detail 加入 opt-in、capability-gated 的 user-anchored keyset pagination：首屏 10 个 user turns、向前每页 20 个，fan-out/subagent turns 随所属 user turn 一起返回，并以 150 raw turns 设异常上限。核心实现位于 [`ProjectionSnapshotQuery.ts@6b73b3d`](https://github.com/pingdotgg/t3code/blob/6b73b3defe1dfb365de3b7bbb97ca56a26b50a43/apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts)。
- [`#5566`](https://github.com/pingdotgg/t3code/pull/5566) 与 [`#5449`](https://github.com/pingdotgg/t3code/pull/5449) 先后修复“运行中向上阅读被拉回底部”和 prepend/展开时的 timeline 定位。它们是 reader-intent 与 visible-position maintenance 修复，不是新的业务数据模型。
- [`#5558`](https://github.com/pingdotgg/t3code/pull/5558) 删除会自动抢占 340px 的 Plan sidebar，改为 turn 内折叠 plan chip；运行时一度把当前 plan step 放进 sidebar，随后 [`#5776`](https://github.com/pingdotgg/t3code/pull/5776) 又恢复显示 branch。最终产品结论是“plan 留在对话上下文里”，不是“让 plan step 取代 branch”。
- [`#5551`](https://github.com/pingdotgg/t3code/pull/5551) 默认隐藏 Build/Plan toggle；[`#5664`](https://github.com/pingdotgg/t3code/pull/5664) 又把 plan mode 与 token-by-token output 一并折进 Legacy，并把默认输出改成 buffered。PR 没有给出可外推的性能基准，所以只能确认上游选择了这个默认，不能据此声称 C2 也一定更快。
- [`#5593`](https://github.com/pingdotgg/t3code/pull/5593) 只是向匿名 analytics 的 `provider.turn.sent` 加 `runtimeMode`，并新增 `provider.runtime_mode.changed`；它没有把 mode 写进用户 transcript，也不是新的权限状态机。

### 2. Usage：从“有没有”推进到“怎么算才可信”

[`#5684`](https://github.com/pingdotgg/t3code/pull/5684) 新增跨已连接环境的 Usage 页面和 server-side transcript scanner：

- Claude 逐条读取 `~/.claude/projects/**/*.jsonl`，按 `message.id + requestId` 去掉同一 assistant message 因多个 content block 重复的完整 `usage`；上游在自己的 30 天样本里报告约 2.4 倍的 naive overcount，这个倍数不能外推，但“必须按消息去重”是由文件格式决定的正确性条件。实现见 [`usageTranscripts.ts@8101cd0`](https://github.com/pingdotgg/t3code/blob/8101cd044911c7dc2a2adf7c7a9ba7962abf57b6/apps/server/src/usage/usageTranscripts.ts)。
- Codex 使用 `event_msg/token_count.info.last_token_usage` 的逐 turn delta，丢弃连续相同事件，并从前一个 `turn_context` 继承 model；reasoning 是 output 子集，不重复求和。
- scanner 按 provider/model/day 在 server 聚合，原始 transcript 不出 server；每个文件以 path/size/mtime 缓存解析结果，缓存损坏退化为冷扫描而不是坏页面。实现见 [`usageScanCache.ts@8101cd0`](https://github.com/pingdotgg/t3code/blob/8101cd044911c7dc2a2adf7c7a9ba7962abf57b6/apps/server/src/usage/usageScanCache.ts)。
- 多个环境可能指向同一 provider home，client 以 host/path fingerprint 让一个环境 claim 每个来源，避免重复合并。
- 成本来自 LiteLLM rate table，只能称 API-equivalent estimate；未知 model 会进入 token totals 并显式标为 unpriced，不能静默按 0 美元处理。

最终 UI 又经过三次修正：[`#5697`](https://github.com/pingdotgg/t3code/pull/5697) 把 provider chart 从误导性的 stacked band 改为共同零基线；[`#5756`](https://github.com/pingdotgg/t3code/pull/5756) 删除噪声较大的 cost-quality side panel；[`#5772`](https://github.com/pingdotgg/t3code/pull/5772) 在所有设备成功、失败或 stale 前只显示稳定 skeleton，避免总数逐台跳变。

冻结点最后新增的 [`#5743`](https://github.com/pingdotgg/t3code/pull/5743) 把既有 Usage
汇总呈现在 React Native iOS/Android Settings，并把 web 已有的 `usageMerge` / `usageFormat`
移动到 shared package 供两端复用；它没有再改变 transcript scanner 的计数或缓存语义。C2
当前没有 mobile client，本轮已吸纳的 Desktop Usage correctness 也不依赖这次文件移动，因此将该
commit 归入 mobile-only，而不复制一套无交付面的 dashboard。

### 3. 项目设置与新会话工作区默认

- [`#5768`](https://github.com/pingdotgg/t3code/pull/5768) 把隐藏在 sidebar 菜单里的 project modal 扩成 Settings → Projects，暴露 default model、scripts、`t3.json` invalid/import 状态和多 checkout 管理。实现入口为 [`ProjectSettingsPanel.tsx@288d8e3`](https://github.com/pingdotgg/t3code/blob/288d8e3457f0466da2cbef2eab648331c969b8a7/apps/web/src/components/settings/ProjectSettingsPanel.tsx)。
- [`#5766`](https://github.com/pingdotgg/t3code/pull/5766) 增加 per-project `defaultThreadEnvMode`，最终优先级为 **explicit composer pick > per-project setting > `t3.json` > global setting**。项目 setting 可清空，wire 字段均 optional；shared resolver 还要求异步 project-file 读取 settle 前不能把 provisional default 固化进 draft。源码见 [`threadEnvMode.ts@6dbffa0`](https://github.com/pingdotgg/t3code/blob/6dbffa022d9e44091d0edc496181011e3acfb695/packages/shared/src/threadEnvMode.ts)。
- [`#5556`](https://github.com/pingdotgg/t3code/pull/5556) 在缺少 `origin` 时跳过 fetch 并回退 local base branch。这解决的是上游“start from origin 默认会主动 fetch”的模型；它与 C2 “只认本地 ref、选择不可用就明确失败”的安全边界相反。

### 4. 未发送草稿、图片与 Browser 最近站点

- [`#5777`](https://github.com/pingdotgg/t3code/pull/5777) 给有正文或 attachment 的 draft 保留稳定 draft-session identity，并在离开后把它显示在 sidebar 顶部；send/discard 删除，点击恢复正文、model、permission、branch/worktree/env mode。其 store 是按 draft/thread key 持久化而非一个全局 textarea，见 [`composerDraftStore.ts@05eb051`](https://github.com/pingdotgg/t3code/blob/05eb051184ac4d486795ac6f8be29129b8b8845f/apps/web/src/composerDraftStore.ts)。
- [`#5757`](https://github.com/pingdotgg/t3code/pull/5757) 保留原有 inline image block，同时只在 provider-bound turn text 追加受控附件的磁盘路径；Claude 只额外授权 attachments leaf directory，`secrets/` 与 SQLite sibling 不进入 grant。实现见 [`ProviderService.ts@a6c9b41`](https://github.com/pingdotgg/t3code/blob/a6c9b41f902fba2a4137806c09e829935e91baac/apps/server/src/provider/Layers/ProviderService.ts)。
- [`#5270`](https://github.com/pingdotgg/t3code/pull/5270) 按 logical project 保存成功打开的 URL/title/last-visited；去除 URL credentials、规范 loopback aliases、每项目最多 50 条/最多 20 个项目，重载时重新校验，且允许逐条删除。源码见 [`browserHistoryStore.ts@72d673a`](https://github.com/pingdotgg/t3code/blob/72d673a855c730536f0cf3bb964ba523e0af9e2e/apps/web/src/browserHistoryStore.ts)。

### 5. Sidebar、pin、agent 可见性与外观

- [`#5581`](https://github.com/pingdotgg/t3code/pull/5581) 用 per-thread fractional `pinOrderKey` 实现跨 server/client 的 pinned thread 拖拽排序；旧 server capability-gated、相等 key 以 id 稳定破同序。[`#5767`](https://github.com/pingdotgg/t3code/pull/5767) 随后修正落库过程中 UI 被写回重排，所以两者必须视为一个最终能力。
- [`#5592`](https://github.com/pingdotgg/t3code/pull/5592) 把 rename/pin/snooze/settle/archive 等 thread actions 加到 chat header title；[`#5745`](https://github.com/pingdotgg/t3code/pull/5745) 在 Agents panel 未打开时给右 panel toggle 加 live subagent count。
- [`#5672`](https://github.com/pingdotgg/t3code/pull/5672) 把原 Sidebar V2 设为默认，把旧 sidebar 降为 Legacy。这是上游自身两套 sidebar 的收敛，不是一个可单独移植的功能。
- 先前仍 open 的模块化主题 PR [`#5226`](https://github.com/pingdotgg/t3code/pull/5226) 已在本增量进入 stable：57 个 semantic color roles、六套内置主题、light/dark 混搭、个人主题、JSON/VS Code import/export。它是一次全应用 token migration，不是“小加几个配色”。
- [`#5775`](https://github.com/pingdotgg/t3code/pull/5775) 允许从 workspace image 选择 project icon，并通过 server-authoritative path 与签名 asset URL 跨 client 同步；不是接受 client 任意路径。

### 6. 可靠性修复：应吸收不变量，不照搬 provider/runtime 代码

本轮有一组真实生命周期事故，但大部分依赖 t3code 的 Claude/Codex adapter、T3 Connect 或 service manager：

- [`#5561`](https://github.com/pingdotgg/t3code/pull/5561) / [`#5572`](https://github.com/pingdotgg/t3code/pull/5572)：容忍短时 event-loop stall，避免断线重做昂贵 bootstrap；只缓存成功的 editor discovery，interrupt 不能污染 TTL cache。
- [`#5568`](https://github.com/pingdotgg/t3code/pull/5568)：Claude `stopTask` acknowledgement 到达时立即写 durable stopped completion，不能等待可能被 parent interrupt 截断的晚到 notification。
- [`#5677`](https://github.com/pingdotgg/t3code/pull/5677)：provider session reaper 必须把 background agent/workflow/monitor liveness 当成“仍在使用”，不能只看 active foreground turn。
- [`#5710`](https://github.com/pingdotgg/t3code/pull/5710)：Claude resume 的 zero-turn handshake 不能发无 turn id 的 completion；ingestion 也拒绝没有目标 turn 的 terminal event。
- [`#5762`](https://github.com/pingdotgg/t3code/pull/5762)：Codex 有 queued follow-up 时，interrupt 仍必须指向当前 active turn id，不能被 queued id 覆盖。
- [`#5774`](https://github.com/pingdotgg/t3code/pull/5774)：settle 只在 idle 且仍 settled 时停止 provider process，清理 monitor/dev server；terminal 仍保留。
- [`#5788`](https://github.com/pingdotgg/t3code/pull/5788)：上游生成的 Linux systemd unit 加 `OOMPolicy=continue`，避免一个被 OOM killer 杀掉的 agent child 让整个 server unit 停止。它只适用于该 service 模型。

可迁移的不变量只有三条：terminal event 必须关联仍 active 的 turn；stop/settle 后 durable UI 与真实 process 一致；任何 idle cleanup 都必须先检查背景 liveness。是否需要实现，应由 C2 的 ACP/runtime 测试或事故证据触发。

## 对照事实：C2 当前 main 已有什么

下列判定只针对 `origin/main` `e83de033`，不把本轮并行工作树中的未提交实现算成“当前已有”。

| 上游能力 | C2 当前一手证据 | 判定 |
| --- | --- | --- |
| user-anchored transcript pagination | [`session.rs`](../../../crates/core/src/session.rs) 定义 20-turn default / 50-turn hard max；[`store.rs`](../../../crates/core/src/store.rs) 以 user seq cursor 分页；Desktop/remote 都有 load-earlier | **已吸纳**，不重复做 #5493 |
| reader-intent scroll / prepend anchor | [PR #23](https://github.com/IchenDEV/codeTwo/pull/23)、[`useTranscriptScroll.ts`](../../../apps/desktop/src/session/useTranscriptScroll.ts) | **已吸纳**，不重复做 #5566/#5449 |
| inline plan 与 agent roster | [`TurnCard.tsx`](../../../apps/desktop/src/session/TurnCard.tsx) 把 plan/thinking/tools/agents 作为 turn 内可折叠 detail | **已吸纳核心结果**；没有必要复制 plan sidebar 的兴废 |
| Stop while awaiting input | `AwaitingInput` 进入统一 busy state，Composer 的 `running` 分支始终显示 Stop | **已吸纳** #5554 的用户结果 |
| historical tool payload projection | [PR #21](https://github.com/IchenDEV/codeTwo/pull/21) 与 [`store.rs`](../../../crates/core/src/store.rs) 已只在 snapshot 折叠 superseded non-terminal tool updates | **已吸纳** cutoff 后最初的 #5482/#5483 |
| Usage | [`usage.rs`](../../../crates/core/src/usage.rs) 已扫描 Codex/Claude JSONL；[`Usage.tsx`](../../../apps/desktop/src/usage/Usage.tsx) 已有 5h/week/month modal | **部分吸纳**；Claude 无 message/request 去重、Codex 只取 cumulative max、整文件 `read_to_string`、按文件 mtime 归窗、无 scan cache/model/day/cost quality |
| 项目配置 | [`project.rs`](../../../crates/core/src/project.rs) 的 `ProjectConfig` 只有 scripts；Desktop `Project` 只有 path/name/last-opened | **部分吸纳**；没有 project default model/worktree 设置，也没有 invalid-config 可操作反馈页 |
| worktree 选择 | [`worktree.rs`](../../../crates/core/src/worktree.rs) 与 Composer 支持 Off / Current / Local origin default，固定完整 SHA，明确禁止 fetch/猜 branch/fallback | **能力更严格，但缺项目默认** |
| invested drafts | [`App.tsx`](../../../apps/desktop/src/App.tsx) 维持一个常驻 BlockNote；导航会改变 cwd/session/policy，但没有按 project/session 的 draft store 或 sidebar row | **未吸纳** #5777；当前只保住“一份文字”，保不住多个草稿及其配置身份 |
| pasted images | [`bridge.ts`](../../../apps/desktop/src/bridge.ts) / [`engine.rs`](../../../crates/core/src/engine.rs) / [`skill.rs`](../../../crates/core/src/skill.rs) 已有 `DocBlock::Image` 与 ACP image content block；[`Editor.tsx`](../../../apps/desktop/src/editor/Editor.tsx) 明确过滤 media block，Composer 只有文件 mention 入口 | **core seam 已有、Desktop 闭环未吸纳** |
| Browser recent sites | [`Browser.tsx`](../../../apps/desktop/src/browser/Browser.tsx) 只有当前 mounted tabs 与 webview back/forward；没有按项目的持久 recent store | **未吸纳** |
| pinned reorder | [`store.rs`](../../../crates/core/src/store.rs) 只有 boolean `pinned`，排序为 `pinned DESC, created_at DESC`；[`SessionRail.tsx`](../../../apps/desktop/src/sidebar/SessionRail.tsx) 无 reorder | **未吸纳**；pin/unpin 本身已完成 |
| full modular themes | [`theme.tsx`](../../../apps/desktop/src/theme.tsx) 只管理 system/light/dark，设计 token 固定在 [`styles.css`](../../../apps/desktop/src/styles.css) | **有意不适配**，不能把 #5226 当小补丁 |
| per-device providers / managed service | C2 当前一个 local core ownership，remote client 连接同一 server；没有 t3code environment registry 或 generated systemd unit | **不适配** |

## 本轮实际吸纳

本节描述当前实现分支，不回写上面的 `origin/main` 基线判断；范围与上游能力并非一比一复制。

1. **Usage correctness 与有界扫描。** [`usage.rs`](../../../crates/core/src/usage.rs) 现在只计
   Claude assistant usage，并以 `message.id + requestId`（缺一侧时用可用 identity）在文件内及
   跨文件去重，rolling window 使用 provider timestamp。Codex 改为逐条累计
   `last_token_usage`、去连续重复，并与最后 `total_token_usage` 核对：缺 delta 时只在最后时间点
   补 residual，delta 已超过权威 total 时才退化为单条 total。scanner 使用 `BufReader`，只解析
   mtime 落在最大 30 天窗口内的文件；进程内 LRU 最多 1024 项，以 canonical path、provider、
   size、mtime 为 identity。冷扫描放到 Tauri blocking worker，UI 的 transcript 数改为文件数。
2. **Desktop 项目级新会话工作区默认。** SQLite project row 与
   [`SettingsPage.tsx`](../../../apps/desktop/src/settings/SettingsPage.tsx) 新增 automatic、当前项目检出、
   从 HEAD 新建 worktree、从**本地** origin 默认 ref 新建 worktree四态。项目偏好只初始化新草稿的
   picker kind；当前草稿的显式选择优先，真正创建前仍重新解析本地 ref、固定 SHA 并复核，不 fetch、
   不猜 branch、不 fallback。automatic 在新选项目上从项目检出开始，从 durable session 点 New 时
   沿用已验证的 baseline kind。设置写入期间禁用离开并丢弃并发旧 project-list snapshot。
3. **按项目的 Browser 最近站点。** [`history.ts`](../../../apps/desktop/src/browser/history.ts) 使用
   versioned、rehydration 时重新校验的最小 localStorage schema；只记录原生 webview 成功 load 的
   HTTP(S) URL，去 credentials 与 fragment、规范 loopback、按 URL 去重，并限制为每项目 8 条、
   最多 24 个项目。blank tab 可打开或逐条删除，项目从列表移除时同步清理该项目的历史。
4. **让现有 `@` 工作区图片引用同时可见、可操作。** 支持格式的 file mention 会降为
   `DocBlock::Image`；core canonicalize workspace 与目标，拒绝越界 symlink，以 16 MB 为硬上限，
   并要求扩展名 MIME 与 PNG/JPEG/GIF/WebP signature 或 UTF-8 SVG root 相符。验证后既发送 ACP
   pixels，也只向 provider-bound prompt 追加 JSON-quoted 的 workspace-relative path。canonical
   用户文档仍保留 `[img:path]`，不会把 provider hint 写回 transcript。

边界必须说清：项目默认目前只初始化 **Desktop** 新草稿，未加入 `.codetwo.json` / global fallback，
TUI 与 remote client 也不读取该字段。Usage cache 是进程内而非 durable cache，本轮也没有加入
provider/model/day/cost UI、跨环境 fingerprint 或 LiteLLM 价格。图片改动利用的是已经位于 workspace
内的 `@` 文件；本轮没有新增任意 clipboard/drag paste、app-owned attachment directory 或
workspace 外目录授权。invested drafts 与 pinned reorder 仍留待后续。
这里的内容校验是格式签名与 SVG root 校验，不是完整图片解码；canonicalize 到实际 open 之间仍有
本地恶意并发替换文件的通用 TOCTOU 边界。

## 本轮实现验证

- 上游边界再次读取 GitHub API：`main` 为 `1a003e383ac6`，相对 cutoff 的 compare 是
  96 commits；最新 prerelease 为 `v0.0.33-nightly.20260809.1042`，target 为
  `963ebf5bd7cc`。
- `cargo test --workspace`：349 tests passed，0 failed；`cargo check --workspace` 与选定 Rust
  文件的 `rustfmt --check` 通过。新增图片测试覆盖正常 PNG、symlink escape、oversize 与
  extension/content mismatch。
- Desktop `bun run test`：10 files、72 tests、208 assertions 全部通过；`bun run build`
  （`tsc --noEmit` + Vite production build）通过。
- Desktop 前端在默认宽度与 680px 窄宽度渲染检查了 Project settings、Browser 空白页与 fallback
  状态，console 无 warning/error。普通浏览器环境没有 Tauri project/native webview，因此带真实项目的
  下拉项、recent-site populated state 与原生 load 回调没有被这次渲染证据覆盖；相应状态由单元测试与
  Rust/TypeScript build 覆盖。
- `git diff --check`、本文相对链接全量解析及 96 个短 SHA 覆盖检查通过。实现位于从最新
  `origin/main` 建立的隔离分支，原 detached 脏工作树未被修改。

## 推断：哪些变化值得 C2 借鉴

以下是基于两边产品边界的推断，不是上游明确要求，也不是已完成声明。

1. **Usage 当前存在计数偏差与规模风险。** 上游已经证明其 Claude transcript 会重复完整 message usage；C2 的非 cumulative 分支逐行求和且不保留 message/request identity，因此遇到同型记录会重复计数。`read_to_string` 全量读取每个 JSONL、每次打开都重扫，也会随历史线性变重。
2. **项目默认应是“决策层”，不是暗中执行 Git。** C2 已有比上游更严格的 local ref/SHA contract；加入默认只需决定初始 UI 选择，不能借机引入 fetch 或缺失-origin fallback。
3. **一个全局编辑器草稿会把“文字没丢”与“草稿身份正确”混为一谈。** 当用户切到另一 session 后，provider/policy/worktree 已跟随新 target，而文字仍在同一个 editor；稳定 draft id 可以同时保住内容和执行上下文，并允许多个 invested drafts 共存。
4. **图片能力的最后一公里是文件权限，不是再编码一份 pixels。** 只发 image block 让模型看见像素，但用户说“把这张图放进 repo”时，agent 工具仍需要一个可验证、可授权的路径。
5. **Browser history 适合 C2 的 local-first 模型。** 它不需要 server schema；只要按真实 project path 分区、保存成功导航、去凭证、设上限并可删除即可。
6. **pin 排序不需要复制 fractional cross-server 协议。** C2 的单 SQLite authority 可用事务内位置或稳定 rank；只有未来多 writer 确有冲突时才需要 lexorank/capability negotiation。

## 吸纳建议

### P0-A：Usage correctness hardening

建议修改既有 Usage，而不是新增第二套页面：

- Claude parser 只接收 assistant usage，记录 provider timestamp/model/session，并以 `(message.id, requestId)` 去重；两者都缺失时保留但标记不可去重。
- Codex parser 累加 `last_token_usage` delta、丢弃连续重复 payload，并从 `turn_context` 继承 model；测试最终 delta sum 与 `total_token_usage` 能对账。
- reasoning 明确是 output 子集；cache read、cache creation、uncached input 分列，headline total 的定义写进 UI。
- scanner 改为 line streaming；至少按 `(canonical path, size, mtime)` 缓存文件结果，并限制扫描 window、递归深度、文件数、单文件 bytes 与总 bytes。超限/损坏必须返回 coverage warning，不能静默当 0。
- 继续默认 local-only。若以后引入 LiteLLM pricing，必须缓存、可关闭、显式显示“API 等价估算 / 非账单支出”，unknown model 进入 unpriced totals。

验收硬门槛：重复 Claude content-block fixture 不重复；Codex repeated token event 不重复；model switch 从切换点生效；cache warm path 不重读未变文件；截断/损坏/未知 model 可见。

### P0-B：项目级新会话默认

建议把 #5766 的优先级迁移成 C2 三态：

`本草稿显式选择 > 本机项目 override > .codetwo.json > app default`

- `Off / Current / Local origin default` 均为合法值；project override 可清除为 inherit。
- `.codetwo.json` 只提供受版本控制的建议值，invalid 文件在 Project settings 显示错误；不能像当前 `ProjectConfig::load` 一样只 warning 后伪装成空配置。
- `origin_default` 缺失、dangling 或 stale 时继续显示 unavailable，不回退 Current，不 fetch。
- async project config 尚未 settle 时，不创建 session，也不把 provisional choice 写进 draft。
- 只做一个窄的 Projects settings section：先暴露 workspace default、scripts 与 config health；不复制 t3code 的多机器 checkout grouping。

### P1-A：有身份的 invested drafts

- 为 pre-session draft 生成稳定 id，以 project 为默认映射，但允许同一项目保留多个有内容 draft。
- 持久化 canonical `DocBlock[]`、provider/model/config options、execution policy、worktree baseline kind、memory policy 与创建时间；图片只持久安全 metadata/受控 attachment id，不能把任意绝对路径当 durable authority。
- 只有正文或 attachment 算 invested；仅切换一个 ambient setting 不应制造 sidebar 垃圾。
- 离开 invested draft 后显示 row；click 恢复；send 成功或显式 discard 删除。New 在当前 invested 时创建新 id，而不是覆盖旧映射。
- 加 storage version、rehydration validation、per-project/total 上限和 crash/before-unload flush；恢复时重新验证 project 与 worktree availability。

### P1-B：图片 paste/attach 到文件工具闭环

- Desktop 接 paste/drag/file picker，先做 MIME、尺寸、像素与总量上限，再落到 app-owned per-session attachment directory。
- provider prompt 同时发送 image content block 与受控路径提示；路径只出现在 provider-bound input，不回显到 user transcript，也不泄漏 server sibling paths。
- 只给 provider exact attachment leaf 的 read access；若 ACP/provider 无法表达该 grant，UI 必须诚实说明“可看但不可复制”，不能扩大到整个 temp/home。
- 任何 client-provided id/path 都由 server 重新解析；拒绝 traversal、symlink escape、unsupported MIME 与过期 attachment。

### P2：Browser recent、pin reorder 与轻量可见性

- Browser recent：只在 successful navigation 后记录；去 URL credentials；规范 loopback aliases；每项目 50、项目 20 可作为起始上限；row 可删除，项目移除时清理。
- pin reorder：在 boolean pin 之外增加稳定 rank；拖拽只更新被移动 row，写入期间保持 optimistic order，ack/revision 到达后对账；stable id 破同序。
- agent count/header actions：C2 已有 inline roster 与 rail hover actions。只有实际用户难以发现后台 agents 时，再给现有 panel toggle/rail row加静态 count；不要为一个 badge先造整套 Agents panel。
- buffered streaming：先量测 Tauri renderer 的 chunk rate、React commit 与 scroll cost；若有问题优先 16–50ms frame coalescing，不能只因为上游把 streaming 放进 Legacy 就直接移除 live feedback。

## 明确排除

| 排除项 | 一手状态 | 不吸纳理由 |
| --- | --- | --- |
| 模块化主题库 [`#5226`](https://github.com/pingdotgg/t3code/pull/5226) | 已进 v0.0.32 stable | 57-role token migration、editor/import/export 与全 surface 重绘；会冲击 C2 固定 Dialog/token 语言，收益不成比例 |
| per-device provider settings [`#4479`](https://github.com/pingdotgg/t3code/pull/4479) | 已进 stable | 依赖 t3code 多 environment registry；C2 remote 不是多 backend control plane |
| Sidebar V2/Legacy inversion [`#5672`](https://github.com/pingdotgg/t3code/pull/5672) | nightly | 上游内部迁移，没有独立产品能力；C2 已有单一 rail |
| t3code 缺 origin fallback [`#5556`](https://github.com/pingdotgg/t3code/pull/5556) | stable | 会削弱 C2 显式 local ref、no fetch、no silent fallback contract |
| runtime-mode analytics [`#5593`](https://github.com/pingdotgg/t3code/pull/5593) | stable | C2 没有相同 analytics contract；若要审计，应设计 durable user-visible provenance，而不是复制匿名 event |
| diff view persistence [`#5731`](https://github.com/pingdotgg/t3code/pull/5731) | nightly | C2 当前没有 stacked/split renderer，无法只移植“记住选择” |
| T3 Connect、cloudflared update、generated systemd/OOM policy | stable/nightly | 部署与进程 ownership 不同；只保留生命周期测试不变量 |
| mobile-only fixes 与 Usage dashboard [`#5743`](https://github.com/pingdotgg/t3code/pull/5743) | stable/nightly/unreleased | C2 当前交付面是 Tauri Desktop/TUI/remote web，不把 React Native/iOS/Android 功能冒充桌面功能；#5743 的 shared 文件移动没有新增 scanner 语义 |
| dev cold-start、vouch、release/version、marketing 文案、label-gated Vercel PR preview [`#5465`](https://github.com/pingdotgg/t3code/pull/5465) | stable/nightly/unreleased | 维护与 CI 材料，不是终端用户能力；预览 workflow 还绑定上游 hosted-web/Vercel/T3 pairing 架构。截至冻结时间，[workflow](https://github.com/pingdotgg/t3code/actions/workflows/web-preview.yml) 尚无运行记录，且 PR 留有一个[未解决的 workflow-level concurrency 风险](https://github.com/pingdotgg/t3code/pull/5465#discussion_r3725689534)，没有成功证据可供复用 |
| open PR [`#5471`](https://github.com/pingdotgg/t3code/pull/5471)、[`#5446`](https://github.com/pingdotgg/t3code/pull/5446) | 2026-08-09 仍 open | 尚未进入 `main`/nightly，不能称为最新已交付功能；自动 labels [`#5461`](https://github.com/pingdotgg/t3code/pull/5461) 已 closed 未合并 |

## 96 个 commit 的全量归类

下表每个短 SHA 均属于上述
[`a2ca89a...1a003e3`](https://github.com/pingdotgg/t3code/compare/a2ca89aa10f13a2222e08afd98c66285121d5ba2...1a003e383ac6b10258b8100c2617d938c4f06c69)，
各组互斥，合计 96；不是抽样。重点项已在正文给永久 commit/PR/source 链接。

| 归类 | Commit（按上游顺序） | C2 处理 |
| --- | --- | --- |
| payload / pagination / transfer budget | `3da315e7b` `b7d1981b5` `e4abc31f1` `6b73b3def` `ddfe45c66` | payload projection、pagination 已吸纳；CI transfer harness 不照搬 |
| plan / composer / timeline | `1ffba7093` `aa16c180e` `1c7d059f5` `2288d416a` `a8cd2ad2e` `48aa875c0` `3ffe84f96` `2e66b1fdf` `b792ed9f7` `45d9aa90b` `31891a1a0` `ed886fe18` `be01b287b` `6f69b4407` | inline plan、Stop、reader-intent 已有；buffering 仅量测后评估；其余是上游 polish |
| sidebar / thread / draft / icon | `a483337a0` `4f5834ba7` `6da92244c` `23f0a1ae3` `b2ee17d7c` `61b51ae0e` `239ef1c54` `5661c6116` `f0fb406ac` `0de954073` `c2f8cb7ca` `5208bdeb0` `05eb05118` `076e9048d` | draft P1、pin order P2；header/count/icon 后置；snooze/woke/legacy sidebar 不适配 |
| managed update / tunnel / T3 Connect | `80720ad59` `808d68535` `8f341f20c` `f9e823689` `df2f1273e` `8b2ea5721` `48e2c27f2` `64a3cd6d7` `ea50b695a` `4a07c1ca9` `b98a0f0d2` | 部署栈不同，全部排除 |
| provider lifecycle / orchestration / process | `ab3b55e29` `99d91ddaa` `0ec4fbc4a` `c471145e9` `7aad7911f` `ae7b27de8` `6fa457607` `9547cf246` `cf5c9948c` `7963cc70f` `2c7267ad4` `e70cdb478` `89c320df0` `5bb8c0366` `ba9c9ae81` | unknown approval 已吸纳；其余只迁移 active-turn/liveness/terminal-event 不变量，provider-specific 代码不搬 |
| project / environment / Browser | `331c6dce7` `64a991ad4` `95305c36f` `72d673a85` `7a84f6cf1` `288d8e345` `6dbffa022` `ddaa6afef` | project default P0、recent sites P2、窄 project settings；origin fallback/multi-device/dev-db 排除 |
| Usage | `8101cd044` `a20923ce4` `70c423a5e` `886195ec1` | 计数/缓存 P0；图表与多设备 gate 只借最终原则 |
| Git / diff | `4eaf5ef8b` `89ee692bf` | PR polling 当前不存在；split-mode persistence 当前无对象 |
| Desktop-specific / attachment | `064041072` `a6c9b41f9` | Electron preview zoom 不适配；attachment path P1 |
| theme / typography | `85b1734d4` `daf8ee0b2` | theme library 排除；terminal 字体行为 C2 已有独立实现 |
| mobile-only | `470d4eb99` `8100062a7` `a17459e8a` `33a03c8a7` `bd422fd8d` `af281c9fc` `bfc69e4b4` `6d70e6d77` `30164cb1b` `1a003e383` | 当前交付面不适配；最后一项为 [#5743](https://github.com/pingdotgg/t3code/pull/5743) 的 React Native Usage dashboard |
| dev / release / CI maintenance | `220efad62` `388b43a27` `a1762fdd7` `be1a83674` `e2cd2383c` `82406bce9` `49964e38c` `7b2cf4374` `963ebf5bd` | 非产品能力，不吸纳；最后一项为 [#5465](https://github.com/pingdotgg/t3code/pull/5465) 的 opt-in hosted-web PR preview workflow |

## 最终摘要与证据入口

本轮增量真正改变 C2 优先级的不是更大的 UI，而是四个用户结果：**Usage 必须可信且扫描可控、每个项目记得新会话落在哪里、离开的草稿能完整回来、图片能被 agent 工具真正使用**。当前分支已落地 Usage correctness/有界扫描、项目默认、Browser recent 和已有工作区图片引用的路径闭环；invested drafts 与 pin reorder 留待后续。分页、滚动、inline plan、Stop 和历史 tool projection 已有，不应再做一遍。

一手入口：

- [完整 96-commit compare](https://github.com/pingdotgg/t3code/compare/a2ca89aa10f13a2222e08afd98c66285121d5ba2...1a003e383ac6b10258b8100c2617d938c4f06c69)
- [v0.0.32 stable release](https://github.com/pingdotgg/t3code/releases/tag/v0.0.32)
- [v0.0.33 nightly 1042 release](https://github.com/pingdotgg/t3code/releases/tag/v0.0.33-nightly.20260809.1042)
- [Usage #5684](https://github.com/pingdotgg/t3code/pull/5684) · [project defaults #5766](https://github.com/pingdotgg/t3code/pull/5766) · [drafts #5777](https://github.com/pingdotgg/t3code/pull/5777) · [image paths #5757](https://github.com/pingdotgg/t3code/pull/5757) · [recent sites #5270](https://github.com/pingdotgg/t3code/pull/5270)
- C2 [PR #21](https://github.com/IchenDEV/codeTwo/pull/21) · [PR #23](https://github.com/IchenDEV/codeTwo/pull/23) · [`origin/main` baseline](https://github.com/IchenDEV/codeTwo/commit/e83de033886b4265e0f03f363080893727de30a8)
