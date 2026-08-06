# t3code 扩展稳定版历史与 Code2 吸纳候选

> 调研截止：2026-08-06（UTC）
> 上游：[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code)
> 证据范围：只使用官方 GitHub release、tag ref、commit、compare 与已合并 PR；没有采用二手文章、issue 设想或开放 PR。

## 结论先行

1. 截止本次核验，官方最新稳定版是 **v0.0.31**，tag 与 release 都指向
   [`e6987965f65914861f0dabd0db03729fe5cd2508`](https://github.com/pingdotgg/t3code/commit/e6987965f65914861f0dabd0db03729fe5cd2508)，
   发布于 2026-07-29。最新已发布 nightly 是
   [`v0.0.32-nightly.20260806.1012`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.32-nightly.20260806.1012)，
   指向 [`a2ca89aa10f13a2222e08afd98c66285121d5ba2`](https://github.com/pingdotgg/t3code/commit/a2ca89aa10f13a2222e08afd98c66285121d5ba2)。
2. `v0.0.1` 到 `v0.0.31` 不是 31 个连续稳定版。官方当前实际保留 **28 个稳定 tag/release**；
   `v0.0.1`、`v0.0.6`、`v0.0.18` 没有稳定 tag，也没有稳定 release。官方 release 的 compare 链分别直接跨过这些编号，
   因此不能把它们补写成“已发布版本”。
3. 产品能力的主要跃迁不是均匀发生的：
   - v0.0.2–v0.0.9：首发后的兼容性、渲染、安装与 Plan UI 稳定化；
   - v0.0.10–v0.0.15：PR/worktree、选择性暂存、命令面板雏形、归档、自动标题、上下文用量；
   - v0.0.16–v0.0.24：远程配对、多环境、Cursor/OpenCode、多 provider、可插拔源码托管与诊断；
   - v0.0.25–v0.0.27：移动端/relay 基础与 Grok ACP，但 v0.0.25 的移动端 PR 明示 `WIP`，不能据此声称成熟发布；
   - v0.0.28–v0.0.31：浏览器与文件预览、右侧工作区、移动端、Sidebar v2、Auto 审批、共享项目配置、性能和产品化收尾。
4. Code2 已在第三轮吸收 **选择性暂存 + 可见 git 阶段** 与 **禁用 external diff + 有界 diff**。接下来最值得继续吸收的是
   **Awaiting Input 作为一等会话状态**、**可选 origin-based worktree 基线**、**源码托管 driver seam**。这些能力能独立落地，
   不要求照搬 t3code 的 Electron/Effect/event-sourcing 架构。

## 证据口径

- **A（强）**：稳定 release 明列已合并 PR，稳定 tag 的 SHA 与 release `target_commitish` 一致；用户可见行为可由 PR 标题/说明直接确认。
- **B（中）**：稳定 tag 与 commit/compare 可确认，但 release body 为空、过于笼统，或只能确认工程/发行变化，不能扩大解释成完整产品能力。
- **C（弱/成熟度不足）**：代码已合入稳定 tag，但官方标题仍写 `WIP`，或只能确认“基础已落地”，不能确认普通用户已获得成熟入口。
- **A-absence（强缺失证据）**：官方实时 tag refs 与 release inventory 均不存在该稳定版本，同时相邻 release 的官方 compare 链直接跨号。

日期统一取 GitHub release 的 `published_at` UTC 日期；SHA 取官方 `refs/tags`，并逐项核对 release target。v0.0.26–v0.0.29 的
release body 有重复段落，下面按 PR URL 去重；不把重复文字当成重复交付。

## 官方 tag / release 全量范围

截至截止日，官方仓库共有 **302 个 tag refs**：

| 类别 | 数量 | 官方范围 | 日期 / SHA 边界 | 说明 |
| --- | ---: | --- | --- | --- |
| 早期 alpha | 22 | [`v0.0.0-alpha.1`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.0-alpha.1) – [`v0.0.0-alpha.22`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.0-alpha.22) | 2026-03-01 – 2026-03-06；`dca85c4` – `f403b23` | `.1` 与 `.2` 指向同一 SHA，所以是 22 个名字、21 个不同提交。 |
| 额外 alpha | 1 | [`v0.0.4-alpha.1`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.4-alpha.1) | 2026-03-07；[`b74c7a7`](https://github.com/pingdotgg/t3code/commit/b74c7a79abbfbb7f6e8c5c4affb20784cea2b11c) | v0.0.4 前的单独预发布。 |
| 稳定版 | 28 | [`v0.0.2`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.2) – [`v0.0.31`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.31) | 2026-03-07 – 2026-07-29；`8c904ff` – `e698796` | 缺 `1 / 6 / 18`；详见下表。 |
| 旧命名 nightly | 5 | [`nightly-v0.0.17-nightly.20260415.44`](https://github.com/pingdotgg/t3code/releases/tag/nightly-v0.0.17-nightly.20260415.44) – [`nightly-v0.0.21-nightly.20260417.58`](https://github.com/pingdotgg/t3code/releases/tag/nightly-v0.0.21-nightly.20260417.58) | 2026-04-15 – 2026-04-17；`409ff90` – `9df3c64` | 中间存在一个 v0.0.18 nightly，但没有 v0.0.18 稳定版。 |
| 规范命名 nightly | 246 | [`v0.0.21-nightly.20260419.73`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.21-nightly.20260419.73) – [`v0.0.32-nightly.20260806.1012`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.32-nightly.20260806.1012) | 2026-04-19 – 2026-08-06；`c83bc5d` – `a2ca89a` | nightly tag 序号不连续，不能用尾号 1012 推断实际有 1012 个 refs。 |

完整官方入口：[`Tags`](https://github.com/pingdotgg/t3code/tags) · [`Releases`](https://github.com/pingdotgg/t3code/releases)。

### 三个稳定版缺号

| 版本号 | 官方证据 | 结论 | 强度 |
| --- | --- | --- | --- |
| `v0.0.1` | [`v0.0.2` release](https://github.com/pingdotgg/t3code/releases/tag/v0.0.2) 的官方 changelog 从 [`v0.0.0-alpha.22...v0.0.2`](https://github.com/pingdotgg/t3code/compare/v0.0.0-alpha.22...v0.0.2) 直接比较；tag refs 无 `v0.0.1`。 | 没有可证实的稳定发布，不应补造日期、SHA 或功能。 | A-absence |
| `v0.0.6` | [`v0.0.7` release](https://github.com/pingdotgg/t3code/releases/tag/v0.0.7) 的官方 changelog 是 [`v0.0.5...v0.0.7`](https://github.com/pingdotgg/t3code/compare/v0.0.5...v0.0.7)；tag refs 无 `v0.0.6`。 | 稳定编号被跳过。 | A-absence |
| `v0.0.18` | [`v0.0.19` release](https://github.com/pingdotgg/t3code/releases/tag/v0.0.19) 的官方 changelog 是 [`v0.0.17...v0.0.19`](https://github.com/pingdotgg/t3code/compare/v0.0.17...v0.0.19)；只有 [`nightly-v0.0.18-nightly.20260416.46`](https://github.com/pingdotgg/t3code/releases/tag/nightly-v0.0.18-nightly.20260416.46)。 | 有 v0.0.18 nightly，不等于有 v0.0.18 稳定版。 | A-absence |

## 稳定版逐项历史

表内“吸纳”是针对 Code2 产品边界的判断：**是**表示可独立移植行为；**已有/核对**表示当前仓库已出现同类能力，避免重复实现；
**后置**表示需要先有规模或产品需求；**否**表示纯发行/内部重构，不能当作产品功能移植。

### v0.0.2–v0.0.13：首发稳定化与核心工作流成形

| 版本 / 日期 / SHA | 官方可证实变化 | 内部、修复与边界 | Code2 吸纳 | 强度 |
| --- | --- | --- | --- | --- |
| [`v0.0.2`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.2) · 2026-03-07 · [`8c904ffe`](https://github.com/pingdotgg/t3code/commit/8c904ffe340e6a915676fd9b944eeb9366f849f3) | composer focus 边框收敛（[#188](https://github.com/pingdotgg/t3code/pull/188)）、正式 favicon（[#196](https://github.com/pingdotgg/t3code/pull/196)）。 | 视觉/品牌微调，没有新的工作流。 | 否；遵循 Code2 自己的 design law。 | A |
| [`v0.0.3`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.3) · 2026-03-07 · [`04b95e37`](https://github.com/pingdotgg/t3code/commit/04b95e37c582c81c3fd67748dcae40f4b0a56b90) | release body 没有 `What's Changed`；tag commit 只说明 CLI npm publish tag 从 alpha 改为 latest。 | 纯发行姿态，不能外推用户功能。 | 否。 | B |
| [`v0.0.4`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.4) · 2026-03-07 · [`0763a35f`](https://github.com/pingdotgg/t3code/commit/0763a35fbc60d6209209a5545ab64e1631f43d48) | 修复 markdown 列表标记（[#224](https://github.com/pingdotgg/t3code/pull/224)）、不支持语言的代码块崩溃（[#279](https://github.com/pingdotgg/t3code/pull/279)）、Fish PATH（[#323](https://github.com/pingdotgg/t3code/pull/323)）。 | `#320 everything ... reported` 标题过于笼统，不能拆成未明示功能。 | 核对同类渲染/CLI 探测测试；不是新 feature。 | A（明确 PR）/ B（#320） |
| [`v0.0.5`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.5) · 2026-03-08 · [`6271b989`](https://github.com/pingdotgg/t3code/commit/6271b989bc72a255483aa96ccb2868ef4655341d) | 启动前检查最低 Codex CLI（[#404](https://github.com/pingdotgg/t3code/pull/404)）、自定义 binary path 生效（[#493](https://github.com/pingdotgg/t3code/pull/493)）、避免 assistant 完成文本重复（[#465](https://github.com/pingdotgg/t3code/pull/465)）、HTTPS 自动用 WSS（[#391](https://github.com/pingdotgg/t3code/pull/391)）。 | 其余是 label 和 prerelease 发行修复。 | **是：**provider preflight 与清晰版本错误；Code2 已有 PATH availability，可补版本能力探测。 | A |
| [`v0.0.7`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.7) · 2026-03-09 · [`39f65703`](https://github.com/pingdotgg/t3code/commit/39f65703e7bd97df787ba45373ed75dddae9bb2f) | Settings / Add Project flow（[#584](https://github.com/pingdotgg/t3code/pull/584)）、桌面 spellcheck（[#500](https://github.com/pingdotgg/t3code/pull/500)）、删除项目（[#223](https://github.com/pingdotgg/t3code/pull/223)）、可关闭 thread error banner（[#588](https://github.com/pingdotgg/t3code/pull/588)）。 | 同时修复 Windows `.cmd` spawn 与 Intel Mac 更新元数据。 | Spellcheck、可关闭但可追溯的错误提示可后置；项目管理当前已有。 | A |
| [`v0.0.8`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.8) · 2026-03-09 · [`9b9006fe`](https://github.com/pingdotgg/t3code/commit/9b9006fed571dbeb1c810493500a679a49a2ba38) | Plan mode UI overhaul（[#596](https://github.com/pingdotgg/t3code/pull/596)）。 | 另一个 PR 只修 release lockfile。release 标题没有足够细节，不应推断具体交互。 | 已有 Plan mode；只做行为对照，不照搬视觉。 | A（存在）/ B（细节） |
| [`v0.0.9`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.9) · 2026-03-09 · [`4b6a0c43`](https://github.com/pingdotgg/t3code/commit/4b6a0c433cb808a0ebdd30ec48e799b6543d2cc9) | 修桌面外链（[#599](https://github.com/pingdotgg/t3code/pull/599)）、ARM Mac 误装 Intel build（[#641](https://github.com/pingdotgg/t3code/pull/641)）、Windows/Linux sidebar scrollbar 命中区（[#618](https://github.com/pingdotgg/t3code/pull/618)）。 | 大部分是 CI、localStorage、userData 路径修复。 | Packaging 时建立架构/平台校验矩阵；当前不是独立产品功能。 | A |
| [`v0.0.10`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.10) · 2026-03-11 · [`82a50da8`](https://github.com/pingdotgg/t3code/commit/82a50da8b1f72da407a0c596a7be6b62e2ead284) | 桌面文件夹 picker（[#697](https://github.com/pingdotgg/t3code/pull/697)）、`Awaiting Input` rail 状态（[#701](https://github.com/pingdotgg/t3code/pull/701)）、sidebar 项目拖拽（[#185](https://github.com/pingdotgg/t3code/pull/185)）、PR thread local/worktree setup（[#718](https://github.com/pingdotgg/t3code/pull/718)）、thread 多选（[#651](https://github.com/pingdotgg/t3code/pull/651)）、diff panel 跨 thread 保持（[#875](https://github.com/pingdotgg/t3code/pull/875)）、原生/网页主题同步（[#800](https://github.com/pingdotgg/t3code/pull/800)）。 | 同版还有 orchestration/perf、cross-repo PR 等修复。 | **是：Awaiting Input 一等状态。** 其余多项 Code2 已有同类入口；PR-thread bootstrap 后置。 | A |
| [`v0.0.11`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.11) · 2026-03-13 · [`876bbd71`](https://github.com/pingdotgg/t3code/commit/876bbd715ae6aa8e1d663455747e17c92e0a287c) | live activity status pills（[#919](https://github.com/pingdotgg/t3code/pull/919)）、commit dialog 选择性暂存（[#872](https://github.com/pingdotgg/t3code/pull/872)）、workspace fuzzy search（[#256](https://github.com/pingdotgg/t3code/pull/256)）、timestamp 格式（[#855](https://github.com/pingdotgg/t3code/pull/855)）、worktree select（[#1001](https://github.com/pingdotgg/t3code/pull/1001)）、Codex tool-call 详情（[#988](https://github.com/pingdotgg/t3code/pull/988)）。 | ChatView 拆组件、依赖/CI 不是用户功能。 | **是：选择性暂存；**workspace search/tool details 已有同类基础。 | A |
| [`v0.0.12`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.12) · 2026-03-20 · [`77716b4c`](https://github.com/pingdotgg/t3code/commit/77716b4ccb529b635730e30a4ca94f5affe9db24) | scroll-to-bottom pill（[#619](https://github.com/pingdotgg/t3code/pull/619)）、复制 workspace path（[#1128](https://github.com/pingdotgg/t3code/pull/1128)）、git text-generation model 可配置（[#1171](https://github.com/pingdotgg/t3code/pull/1171)）、agent 可读 terminal output（[#1032](https://github.com/pingdotgg/t3code/pull/1032)）、Claude Code adapter（[#179](https://github.com/pingdotgg/t3code/pull/179)）。 | 另含工具链/issue template/焦点修复。 | terminal 可读与 Claude adapter 已是 Code2 架构基础；scroll affordance 可核对长会话 UX。 | A |
| [`v0.0.13`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.13) · 2026-03-20 · [`2a237c20`](https://github.com/pingdotgg/t3code/commit/2a237c20019af8eae1020511b41256ea93127e4c) | 唯一 PR 是 release workflow 使用 secret app ID（[#1217](https://github.com/pingdotgg/t3code/pull/1217)）。 | 纯发行基础设施，没有可见产品功能。 | 否。 | A |

### v0.0.14–v0.0.21：状态、远程连接与 provider 扩展

| 版本 / 日期 / SHA | 官方可证实变化 | 内部、修复与边界 | Code2 吸纳 | 强度 |
| --- | --- | --- | --- | --- |
| [`v0.0.14`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.14) · 2026-03-24 · [`28afb140`](https://github.com/pingdotgg/t3code/commit/28afb14004bbb92a523a87c334de02421f72a627) | base directory 可配置（[#826](https://github.com/pingdotgg/t3code/pull/826)）、resizable chat sidebar（[#1347](https://github.com/pingdotgg/t3code/pull/1347)）、git hook progress stream（[#1214](https://github.com/pingdotgg/t3code/pull/1214)）、terminal header toggle（[#633](https://github.com/pingdotgg/t3code/pull/633)）、word wrap（[#1326](https://github.com/pingdotgg/t3code/pull/1326)）、context-window UI（[#1351](https://github.com/pingdotgg/t3code/pull/1351)）、按最近活动排序（[#1372](https://github.com/pingdotgg/t3code/pull/1372)）。 | Git/service/settings refactor 与 PTY runtime load 是内部支撑。 | **是：git hook/phase 进度；**其余当前大多已有同类能力。 | A |
| [`v0.0.15`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.15) · 2026-03-29 · [`f82bae16`](https://github.com/pingdotgg/t3code/commit/f82bae16680206e4be20baf3d835941aa68611cf) | Claude context 选择（[#1422](https://github.com/pingdotgg/t3code/pull/1422)）、`gh pr checkout` ref（[#1457](https://github.com/pingdotgg/t3code/pull/1457)）、thread archive（[#1359](https://github.com/pingdotgg/t3code/pull/1359)）、首轮自动标题（[#1375](https://github.com/pingdotgg/t3code/pull/1375)）、thread jump shortcuts（[#1456](https://github.com/pingdotgg/t3code/pull/1456)）、超大 diff 截断而不是失败（[#1499](https://github.com/pingdotgg/t3code/pull/1499)）、update overhaul（[#1505](https://github.com/pingdotgg/t3code/pull/1505)）。 | 同版含大量 provider lifecycle 与跨平台修复。 | **是：diff 上限。** archive/title/keymap 当前已有；PR ref 可在 git workflow epic 一并做。 | A |
| [`v0.0.16`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.16) · 2026-04-10 · [`2028d57e`](https://github.com/pingdotgg/t3code/commit/2028d57e88f216491df42d4cf948c85a5aa8d7f4) | WebSocket 断线恢复/慢 RPC UX（[#1730](https://github.com/pingdotgg/t3code/pull/1730)）、git status stream（[#1763](https://github.com/pingdotgg/t3code/pull/1763)）、项目 rename（[#1798](https://github.com/pingdotgg/t3code/pull/1798)）、多选 pending input（[#1797](https://github.com/pingdotgg/t3code/pull/1797)）、server auth/bootstrap/pairing（[#1768](https://github.com/pingdotgg/t3code/pull/1768)）、client settings 与 environment secret 持久化（[#1868](https://github.com/pingdotgg/t3code/pull/1868)）、headless `t3 serve` 配对（[#1871](https://github.com/pingdotgg/t3code/pull/1871)）、分阶段 PR progress（[#1694](https://github.com/pingdotgg/t3code/pull/1694)）。 | 此版本也包含一整批 projection/Effect/perf 重构；它们解释稳定性，不是可单列 UI feature。 | pairing/rename 已有；**git phase + richer pending input 值得吸纳。** | A |
| [`v0.0.17`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.17) · 2026-04-10 · [`e3004ae8`](https://github.com/pingdotgg/t3code/commit/e3004ae806d4e9a81e03ff919f50d2d34c37ffe7) | changed-files 展开状态按 thread 保存（[#1858](https://github.com/pingdotgg/t3code/pull/1858)）。 | secret store hardening/catalog override（[#1891](https://github.com/pingdotgg/t3code/pull/1891)）是安全/内部修复。 | diff UI 状态持久化后置；安全设计只借鉴，不复制实现。 | A |
| [`v0.0.19`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.19) · 2026-04-17 · [`b7df3dfc`](https://github.com/pingdotgg/t3code/commit/b7df3dfca0b6368587ce1c0322111c4df49ff3e8) | provider skill discovery（[#1905](https://github.com/pingdotgg/t3code/pull/1905)）、assistant message copy（[#1211](https://github.com/pingdotgg/t3code/pull/1211)）、command palette（[#1103](https://github.com/pingdotgg/t3code/pull/1103)）、轻量 shell snapshot（[#1973](https://github.com/pingdotgg/t3code/pull/1973)）、filesystem browse/project picker（[#2024](https://github.com/pingdotgg/t3code/pull/2024)）、project grouping（[#2055](https://github.com/pingdotgg/t3code/pull/2055)）、nightly channel（[#2012](https://github.com/pingdotgg/t3code/pull/2012)）、Windows ARM build（[#2080](https://github.com/pingdotgg/t3code/pull/2080)）。 | 还包含 reconnect、provider process leak、PATH 与布局修复。 | skill/palette/files/grouping 已有；Windows ARM 留给 packaging；shell/body 分离是远程规模化的重要不变量。 | A |
| [`v0.0.20`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.20) · 2026-04-17 · [`b2cca674`](https://github.com/pingdotgg/t3code/commit/b2cca674dfdf93430460fe08e1ce0d857e30bd83) | 只有 client setting fallback（[#2099](https://github.com/pingdotgg/t3code/pull/2099)）与 release finalize（[#2100](https://github.com/pingdotgg/t3code/pull/2100)）。 | 修复/发行版，没有新能力。 | 否。 | A |
| [`v0.0.21`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.21) · 2026-04-23 · [`188df6da`](https://github.com/pingdotgg/t3code/commit/188df6da074bf60af765881bdfd6e886ef83e6ee) | OpenCode provider（[#1758](https://github.com/pingdotgg/t3code/pull/1758)）、Cursor ACP provider（[#1355](https://github.com/pingdotgg/t3code/pull/1355)）、model picker 搜索/收藏（[#2153](https://github.com/pingdotgg/t3code/pull/2153)）、dynamic tool-call permission（[#2311](https://github.com/pingdotgg/t3code/pull/2311)）、command palette thread status（[#2107](https://github.com/pingdotgg/t3code/pull/2107)）。 | 另含 app-server binding、OpenCode lifecycle、auth/path/release 修复。 | Cursor/OpenCode 当前已有；**model 搜索/收藏按 provider 返回数量设阈值后再做**；unknown/dynamic permission 必须保可操作 fallback。 | A |

### v0.0.22–v0.0.27：多 provider、源码托管、移动与 relay 基础

| 版本 / 日期 / SHA | 官方可证实变化 | 内部、修复与边界 | Code2 吸纳 | 强度 |
| --- | --- | --- | --- | --- |
| [`v0.0.22`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.22) · 2026-05-05 · [`f4c9418d`](https://github.com/pingdotgg/t3code/commit/f4c9418d40358f61e4e9236992c0620d06c4bea3) | multi-provider（[#2277](https://github.com/pingdotgg/t3code/pull/2277)）、pluggable VCS foundation（[#2435](https://github.com/pingdotgg/t3code/pull/2435)）、GitLab（[#2462](https://github.com/pingdotgg/t3code/pull/2462)）、Bitbucket/Azure DevOps（[#2473](https://github.com/pingdotgg/t3code/pull/2473)）、hosted frontend + Tailscale + SSH launcher（[#2361](https://github.com/pingdotgg/t3code/pull/2361)）、remote repo publish/discovery（[#2482](https://github.com/pingdotgg/t3code/pull/2482)）、hide whitespace diff（[#2389](https://github.com/pingdotgg/t3code/pull/2389)）、collapsible file diffs（[#2502](https://github.com/pingdotgg/t3code/pull/2502)）。官方还报告 startup/memory 降幅（[#2204](https://github.com/pingdotgg/t3code/pull/2204)）。 | 大量 mobile layout、release webhook 与 provider settings refactor；性能数字来自官方 PR，但本报告未独立复跑 benchmark。 | **是：SourceControlDriver seam；**先保持 GitHub + generic git，再按需求增 vendor。 | A（落地）/ B（性能数值未复测） |
| [`v0.0.23`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.23) · 2026-05-09 · [`3c32bc8f`](https://github.com/pingdotgg/t3code/commit/3c32bc8fd1f5970e65988e36937cb8e2921437f9) | keybindings editor（[#2533](https://github.com/pingdotgg/t3code/pull/2533)）、process/trace diagnostics（[#2532](https://github.com/pingdotgg/t3code/pull/2532)）、skill call inline chips（[#2572](https://github.com/pingdotgg/t3code/pull/2572)）、sidebar preview count（[#1856](https://github.com/pingdotgg/t3code/pull/1856)）、自动 git fetch interval（[#2605](https://github.com/pingdotgg/t3code/pull/2605)）、长 user message 折叠（[#2180](https://github.com/pingdotgg/t3code/pull/2180)）。 | Electron→Effect、server CLI 拆分、timeline rerender 优化属于内部。 | keymap/skill 已有；**diagnostics 可作为支持性 P1；**自动 fetch 必须显式、不能偷做网络写状态。 | A |
| [`v0.0.24`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.24) · 2026-05-15 · [`ea20e800`](https://github.com/pingdotgg/t3code/commit/ea20e800216417c8d3b5dfc54a863bbd9e0b3e20) | VCS diff loading 优化，官方 PR 声称最高 98%（[#2586](https://github.com/pingdotgg/t3code/pull/2586)）；diagnostics resource history（[#2685](https://github.com/pingdotgg/t3code/pull/2685)）。 | 其余主要是依赖裁剪、renderer/reconnect/selector 修复。 | **是：**先量测 Code2 diff，再做 path/scope/caching；不要复制未经本地 benchmark 的百分比。 | A（功能）/ B（性能数值未复测） |
| [`v0.0.25`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.25) · 2026-06-04 · [`348a9140`](https://github.com/pingdotgg/t3code/commit/348a9140e9d352fdcb1779d467b4b68000b61bdf) | `T3 Code Mobile [WIP]` 合入（[#2013](https://github.com/pingdotgg/t3code/pull/2013)）、Cursor model probe（[#2428](https://github.com/pingdotgg/t3code/pull/2428)）、多 provider reasoning selection 修复（[#2760](https://github.com/pingdotgg/t3code/pull/2760)）。 | 版本大部分是 Vite+/pnpm 迁移、release packaging、HTTP API/auth 标准化。`WIP` 只证明代码进入稳定 tag，不证明移动产品成熟或上架。 | 移动端否；动态 model probe/option preservation 可核对 ACP capability。 | A（合入）/ C（移动成熟度） |
| [`v0.0.26`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.26) · 2026-06-09 · [`de58ec8e`](https://github.com/pingdotgg/t3code/commit/de58ec8e24088711ebe78ffaa73ee5a57a096120) | managed relay tunnel + APNs（[#2837](https://github.com/pingdotgg/t3code/pull/2837)）、Grok CLI via ACP（[#2809](https://github.com/pingdotgg/t3code/pull/2809)）、带空格的 file mention（[#2625](https://github.com/pingdotgg/t3code/pull/2625)）、self-hosted GitLab/multi-account GitHub/Azure URL（[#2480](https://github.com/pingdotgg/t3code/pull/2480)）。 | 避免 shell spawn、Claude SDK warning、macOS TCC prompt 等是可靠性/安全修复。relay/APNs 与 Code2 当前直连 server 模型不同。 | Grok/file mention 已有；relay 不照搬；**保留“系统 executable 不经 shell”安全法则。** | A |
| [`v0.0.27`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.27) · 2026-06-09 · [`a3422a9b`](https://github.com/pingdotgg/t3code/commit/a3422a9bb51d73724b9b665ae0ef1fb756f753d1) | T3 Cloud 改名 T3 Connect（[#3011](https://github.com/pingdotgg/t3code/pull/3011)）。 | 另一个 PR 仅修 Clerk browser test。是品牌变更，不是新能力。 | 否。 | A |

### v0.0.28–v0.0.31：完整工作区、移动端产品化与性能收口

| 版本 / 日期 / SHA | 官方可证实变化 | 内部、修复与边界 | Code2 吸纳 | 强度 |
| --- | --- | --- | --- | --- |
| [`v0.0.28`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.28) · 2026-06-29 · [`fda64862`](https://github.com/pingdotgg/t3code/commit/fda6486233e0b2f07ecfea166e1a94533cb923c4) | integrated browser preview/annotations/automation（[#3053](https://github.com/pingdotgg/t3code/pull/3053)）、workspace file browser/preview（[#3087](https://github.com/pingdotgg/t3code/pull/3087)）、file preview comments/task toggles（[#3115](https://github.com/pingdotgg/t3code/pull/3115)）、right-panel bulk/tab actions（[#3116](https://github.com/pingdotgg/t3code/pull/3116)）与 inline plan（[#3118](https://github.com/pingdotgg/t3code/pull/3118)）、archive + mobile file viewer（[#3155](https://github.com/pingdotgg/t3code/pull/3155)）、origin-based worktree（[#3157](https://github.com/pingdotgg/t3code/pull/3157)）、Windows/WSL backend picker（[#2751](https://github.com/pingdotgg/t3code/pull/2751)）、native mobile composer/markdown（[#3101](https://github.com/pingdotgg/t3code/pull/3101)）、diff scope（[#3169](https://github.com/pingdotgg/t3code/pull/3169)）、timeline minimap（[#3587](https://github.com/pingdotgg/t3code/pull/3587)）。 | release notes 含上百个 Effect service/error structure PR；它们是内部可观测性/错误建模工程，不应逐条算用户 feature。 | browser/files/right panel 多数已有；**origin-based worktree 与 bounded diff 值得补。** | A |
| [`v0.0.29`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.29) · 2026-07-27 · [`1153afb4`](https://github.com/pingdotgg/t3code/commit/1153afb4fb694944b5c25e2153b904a85cf47d70) | Android（[#3579](https://github.com/pingdotgg/t3code/pull/3579)）、iPad/mobile split view（[#3514](https://github.com/pingdotgg/t3code/pull/3514)）、native share target（[#4021](https://github.com/pingdotgg/t3code/pull/4021)）；Sidebar v2 settled lifecycle（[#4026](https://github.com/pingdotgg/t3code/pull/4026)）与 snooze（[#4311](https://github.com/pingdotgg/t3code/pull/4311)）；AI-reviewed `Auto` approvals（[#4272](https://github.com/pingdotgg/t3code/pull/4272)）；共享 `t3.json`（[#4317](https://github.com/pingdotgg/t3code/pull/4317)）；remote server update/service management（[#4286](https://github.com/pingdotgg/t3code/pull/4286)）；background preview/PiP（[#4397](https://github.com/pingdotgg/t3code/pull/4397)）；per-provider prompt stash（[#4453](https://github.com/pingdotgg/t3code/pull/4453)）；source-control write settings（[#4204](https://github.com/pingdotgg/t3code/pull/4204)）；diff totals（[#4674](https://github.com/pingdotgg/t3code/pull/4674)）；MCP credential 跨 turn 保活（[#4659](https://github.com/pingdotgg/t3code/pull/4659)）。 | 此版跨度近一个月，release notes 同时包含大量 mobile/relay/Clerk/视觉/性能修复；不能把每个内部 PR 都称为独立产品能力。Auto 审批依赖上游 provider-native review 语义。 | project config/diff totals 已有同类；**Auto 不照搬，除非 ACP 给出可审计 reviewer contract；**snooze/PiP/prompt stash 后置。 | A |
| [`v0.0.30`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.30) · 2026-07-29 · [`60af905e`](https://github.com/pingdotgg/t3code/commit/60af905e70c944228cb35a74fa50740ec4b2d1f7) | mobile Thread List v2 默认启用（[#4717](https://github.com/pingdotgg/t3code/pull/4717)）、Connect 移除 waitlist/GA（[#4691](https://github.com/pingdotgg/t3code/pull/4691)）、Appearance category（[#4715](https://github.com/pingdotgg/t3code/pull/4715)）、chat markdown 中 inline code path 可点击（[#4726](https://github.com/pingdotgg/t3code/pull/4726)）、prompt stash 跨 provider 切换保持（[#4787](https://github.com/pingdotgg/t3code/pull/4787)）、mobile OTA check（[#4686](https://github.com/pingdotgg/t3code/pull/4686)）。 | thread snapshot gzip（[#4788](https://github.com/pingdotgg/t3code/pull/4788)）、WebSocket permessage-deflate（[#4705](https://github.com/pingdotgg/t3code/pull/4705)）与 stale row 清理是规模优化；其余多为 UI/relaunch/fs navigation 修复。 | **后置：**remote transcript 变大后再做压缩；inline file path 可作为小切片。 | A |
| [`v0.0.31`](https://github.com/pingdotgg/t3code/releases/tag/v0.0.31) · 2026-07-29 · [`e6987965`](https://github.com/pingdotgg/t3code/commit/e6987965f65914861f0dabd0db03729fe5cd2508) | editable file focus/live highlighting（[#3979](https://github.com/pingdotgg/t3code/pull/3979)）、thread shell 在 detail load 时保留（[#4830](https://github.com/pingdotgg/t3code/pull/4830)）、installed app 约减 300MB（[#4824](https://github.com/pingdotgg/t3code/pull/4824)）、native resource diagnostics 降 idle work/disk churn（[#2679](https://github.com/pingdotgg/t3code/pull/2679)）、跨 thread 记住 rendered-markdown 选择（[#4853](https://github.com/pingdotgg/t3code/pull/4853)）。 | repository detection、numstat 合并、Connect sign-in 等是修复。review diff 明确禁用 external diff（[#4854](https://github.com/pingdotgg/t3code/pull/4854)）。300MB 是官方 PR 口径，未在 Code2 复测。 | **是：禁用 external diff；**shell/detail 分层可作为 remote UI 不变量；包体优化等 Code2 packaging 后量测。 | A（落地）/ B（体积数值未复测） |

## 值得 Code2 吸收的优先级候选

### P0（第三轮已吸收）：选择性暂存 + 发起控件内的 git 阶段

历史证据链：v0.0.11 的 [选择性 file staging #872](https://github.com/pingdotgg/t3code/pull/872) → v0.0.14 的
[git hook progress stream #1214](https://github.com/pingdotgg/t3code/pull/1214) → v0.0.16 的
[PR granular stages #1694](https://github.com/pingdotgg/t3code/pull/1694)。这是连续三个稳定版逐步收敛出的工作流，不是一次 UI 装饰。

调研时 Code2 已经知道文件的 `staged` 状态，但 [Source Control](../../apps/desktop/src/git/SourceControl.tsx) 只把它当 badge，
[Tauri command](../../apps/desktop/src-tauri/src/lib.rs) 固定以 `all=true` 调用 [core commit](../../crates/core/src/git.rs)，
因此普通提交会落到整树 `git add -A`。第三轮按以下最小切片完成：

1. core 增加按 literal path 的 `stage_paths` / `unstage_paths`，始终在 path 前使用 `--`；第一阶段做 file，不先做 hunk。
2. commit 只提交 index；“Stage all & commit”必须是另一个显式动作，不能由普通 Commit 暗中扩大范围。
3. `Committing / Pushing / Creating PR` 显示在原按钮内并保持尺寸；当前 API 不能观测 hook 子阶段，因此不虚构 `Running hooks`。
4. 失败时保留 message 与选择，不因为 refresh 丢掉用户准备好的 index。

实现还覆盖 `MM` 双分区、rename 新旧 literal path、256-path 批量上限、unborn / SHA-256 repo 与真实 Git 回归。普通 Commit
现在只提交 index，stage all 是独立显式动作。

### P0（第三轮已吸收）：禁用 external diff，并给所有 diff/patch 设置资源上限

历史证据链：v0.0.15 [超大 diff 截断 #1499](https://github.com/pingdotgg/t3code/pull/1499)、v0.0.28
[patch 禁用 external diff #2553](https://github.com/pingdotgg/t3code/pull/2553)、v0.0.31
[review preview 禁用 external diff #4854](https://github.com/pingdotgg/t3code/pull/4854)。这既是稳定性问题，也是 repo-local Git 配置可能触发外部程序的边界。

调研时 [core git diff/checkpoint](../../crates/core/src/git.rs) 直接继承 repo Git 配置且不设输出上限。第三轮已将所有 Code2
review/checkpoint diff 路径统一：

- `git --no-pager diff --no-ext-diff ... -- <literal paths>`，并清理/覆盖 `GIT_EXTERNAL_DIFF`、pager 相关环境；
- stdout/stderr 设 byte 上限、文件数上限与超时，截断时返回明确的 `truncated=true`，UI 不伪装成完整 diff；
- status 与 diff 分开取，不能因为一个异常 external helper 让整个 Source Control 卡死；
- 加一个带恶意/失败 external-diff repo config 的回归测试，证明不会执行它。

实现还区分 `all / staged / unstaged`，用隔离临时 index 纳入 untracked 而不污染用户 index，以 2 MiB stdout、64 KiB stderr、
256 files 与 10 秒共享预算返回结构化截断原因；Desktop 另有 4,000 行 DOM 上限和迟到请求淘汰。两阶段读取期间若文件集变化，
结果会明确标记 `working_tree_changed`，不伪装为完整快照。

### P0：把 `Awaiting Input` 建模为 core 会话状态

历史证据链：v0.0.10 [rail `Awaiting Input` #701](https://github.com/pingdotgg/t3code/pull/701)、v0.0.16
[multi-select pending input #1797](https://github.com/pingdotgg/t3code/pull/1797)、v0.0.22
[按 question text 关联答案 #2404](https://github.com/pingdotgg/t3code/pull/2404)。

Code2 不应只让当前打开的 permission dialog 知道“agent 在等人”。建议 core fold 出最小状态
`Idle | Running | AwaitingInput | Failed`，从 permission/question 的创建、回答、取消、turn end 幂等演进；Desktop、TUI、remote 共用。
rail 先显示状态即可，复杂 multi-question UI 等 ACP/adapter 真正提供结构化 contract 后再做，不能解析 assistant 文本猜问题。

### P1：可选的 origin-based worktree 基线

上游在 v0.0.28 通过 [#3157](https://github.com/pingdotgg/t3code/pull/3157) 增加 origin-based worktree，并继续修复
origin worktree 的 PR 创建。Code2 [目前的 worktree](../../crates/core/src/worktree.rs) 从本地当前提交创建，简单但可能把 stale local
default branch 当成新任务基线。

建议不是自动 fetch，而是：

- 新建 thread 明示 `Current checkout` / `origin/<default>` 两种基线；
- 只在 ref 已存在时提供 origin 选项，网络 fetch 是另一个有反馈、可取消的显式动作；
- 保存实际 base SHA 与 branch name，后续 PR/status 不靠重新猜测；
- dirty checkout、detached HEAD、无 origin 各有确定 fallback。

### P1：先抽 SourceControlDriver seam，再决定是否支持 GitLab/Bitbucket/Azure

v0.0.22 的一手链路是 [VCS foundation #2435](https://github.com/pingdotgg/t3code/pull/2435) →
[GitLab #2462](https://github.com/pingdotgg/t3code/pull/2462) →
[Bitbucket/Azure #2473](https://github.com/pingdotgg/t3code/pull/2473) →
[remote discovery #2482](https://github.com/pingdotgg/t3code/pull/2482)。Code2 当前 [PR path](../../crates/core/src/git.rs) 直接调用 `gh`，
先抽接口比立即支持四家更值钱。

最小接口只需 `detect_remote`、`open_or_create_pr`、`pr_status`、`web_url_for_ref`；GitHub 是第一个 driver，未知 host 回退 generic git
而不是报成 GitHub。只有真实用户需求出现后再增加 vendor adapter。

### P1：可导出的 process/provider diagnostics，而不是常驻复杂 telemetry

v0.0.23 的 [process/trace diagnostics #2532](https://github.com/pingdotgg/t3code/pull/2532) 和 v0.0.24 的
[resource history #2685](https://github.com/pingdotgg/t3code/pull/2685) 对“GUI 能启动但 provider/PTY/adapter 不工作”非常有用。
Code2 可做更小版本：最近 provider spawn、exit status、stderr 尾部、ACP initialize capabilities、PTY/remote 状态；敏感字段先 redact，
由用户主动 Export。不要为了对齐上游引入 OTLP/Effect tracing 全栈。

## 已有同类能力，避免重复吸收

以下历史能力在当前 Code2 仓库已出现同类实现或正在本轮并行完善，后续应做差异验证而不是重新立项：

- v0.0.15 自动标题与 archive；
- v0.0.19 command palette、filesystem browse、project grouping；
- v0.0.21 Cursor/OpenCode，加上 Code2 自己更广的 ACP provider registry；
- v0.0.23 keymap editor、skill surface；
- v0.0.26 Grok ACP、带空格/搜索式 file mention 基础；
- v0.0.28 browser/file preview/right panel；
- v0.0.29 shared project config（Code2 使用 `.codetwo.json`）、diff totals；
- 远程 pairing/auth、thread pinning、保守的 agent/workflow observability、选择性暂存与有界 diff 已由同日的最新功能调研覆盖。

## 不应直接吸收的部分

1. **v0.0.28 的大批 Effect service/error refactor**：这是 t3code TypeScript/Electron 运行时的内部设计，Code2 的 Rust core + ACP 边界不同。
2. **v0.0.25 的 Mobile WIP 与后续 Clerk/relay/APNs 全栈**：能证明上游投入方向，不能证明 Code2 现在需要原生移动客户端或云控制面。
3. **v0.0.29 Auto approvals**：没有可审计的 provider-neutral reviewer contract 前，不应把一个 UI mode 伪装成安全边界。
4. **具体模型名和版本号**：Claude/Codex 型号变化快，应来自 provider capability/probe，不从历史 release 硬编码。
5. **官方 PR 中的性能百分比/包体数字**：可作为量测假设，不能在 Code2 没有同环境 benchmark 时复述为自身收益。

## 最终建议顺序

1. 已完成 **selective staging + git phase UI** 与 **`--no-ext-diff`、literal path、diff byte/time limits**，先把误提交、安全与规模边界固化。
2. 下一片把 **AwaitingInput** 放进 core 状态机，再让 Desktop/TUI/remote 消费；不要继续留成当前页面的局部 modal 状态。
3. 随后做 **origin-based worktree（显式、无隐式网络）**。
4. 同步推进按完整 user turn 对齐的 **bounded transcript pagination**；它来自最新 nightly 的规模教训，不由单一稳定版条目驱动。
5. 最后抽 **SourceControlDriver** 与轻量 diagnostics；多 vendor、snooze、PiP、mobile/relay 等到真实需求出现再做。
