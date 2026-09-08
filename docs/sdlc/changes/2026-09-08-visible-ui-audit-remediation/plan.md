---
id: 2026-09-08-visible-ui-audit-remediation
schema: 5
stage: plan
status: accepted
owner: codex
created: 2026-09-08
based_on: spec.md
scope: docs/sdlc/changes/2026-09-08-visible-ui-audit-remediation/, apps/desktop/src/, apps/desktop/tests/, crates/plugins/src/app/plugins/utility.rs, crates/plugins/src/app/plugins/library.rs
---

# Plan: 逐项修复清单

## Plan

实施 owner：codex。先将 P1 原症状转为回归检查，再处理共享修复和页面改进。按用户“全部修复”继续完整清单；首轮原生验证已覆盖所有设置及场景子页。状态仅在验证后勾选；无法复现的观察记录复核结果，不能假装修复。每组关联 Spec 的验收编号，Verification 是结果的唯一归属。

检查：受影响的 Bun 渲染/行为测试、TypeScript、桌面 lint/build；实际窗口检查 light/dark 和适用窄宽度。文档与 handoff 执行 docs、SDLC worktree 和 diff 检查。无权限/协议/发布修改，故不运行无关 lifecycle Eval 或全 Rust suite。Profile 统计复现出请求 90 天却返回 30 天，以及图表/供应商起点不同；该只读统计修复同时运行 utility 模块 Rust 测试。

### A · 工作区与共享交互（AC-1）

- [x] A01: 侧栏授权提示与任务辨识信息。
- [x] A02: 新建编辑区引导与布局。
- [x] A03: 会话阅读宽度与失败回合反馈。
- [x] A04: Dock 标签与内容横向裁切。
- [x] A05: 文件树与文件编辑器空间分配。
- [x] A06: 内置网页 bounds 与面板同步。
- [x] A07: Git/PR 面板内容完整可见。

### B · 任务与搜索（AC-2）

- [x] B01: 任务总控关闭按钮与 Esc。
- [x] B02: 任务总控项目/时间/context 辨识。
- [x] B03: 全局搜索同名选中与项目时间信息。

### C · 终端（AC-3）

- [x] C01: 尺寸与重绘去重。
- [x] C02: 终端主题可读性及生命周期复核。

### D · 看板（AC-4）

- [x] D01: 看板检查器可收起与列宽。
- [x] D02: 列表状态/更新时间不碎行。
- [x] D03: Agent/详情任务身份与状态名称。
- [x] D04: 洞察展示实际可操作信息。
- [x] D05: 新建任务标签与状态一致。

### E · PR 与自动化（AC-5）

- [x] E01: PR 正文宽度与 Markdown。
- [x] E02: PR 变更文件名与浏览。
- [x] E03: 检查结果来源/时间辨识。
- [x] E04: 自动化启用/执行状态。
- [x] E05: 运行记录失败与启动反馈。
- [x] E06: 新建自动化时间/权限摘要。

### F · 插件（AC-6）

- [x] F01: 功能零缺失与技术详情分层。
- [x] F02: MCP 未配置/无匹配引导。
- [x] F03: 技能内容检查与使用说明。
- [x] F04: Hook 空态与场景关系。
- [x] F05: 市场不可用原因与文件导入命名。

### G · 设置基础（AC-7）

- [x] G01: 通用语言名称/恢复范围/字体。
- [x] G02: 导入文件查找指引。
- [x] G03: Profile 统计口径与热图图例。
- [x] G04: 外观颜色格式/字体预览/常用项。
- [x] G05: 宠物搜索与固定行为设置。
- [x] G06: 快捷键搜索与紧凑行。
- [x] G07: 用量指标布局与额度条含义。复核确认条表示剩余；原生 Codex 显示剩余 16%、已用 84%，不改正确语义。

### H · 工作区及集成设置（AC-8）

- [x] H01: 项目上下文与选择。
- [x] H02: Worktree 查找/状态/删除视觉。
- [x] H03: 记忆统计/筛选名称/项目路径。
- [x] H04: 设备同步直达配对。
- [x] H05: 供应商安装/启用/检测状态。
- [x] H06: Computer Use 安装与检测指引。
- [x] H07: Appshots 捕获/发送目标。
- [x] H08: Browser Use 检测与连接状态。
- [x] H09: 浏览器权限中文与空态。
- [x] H10: 开发者说明可读性。复核未发现独立功能缺陷，沿用共享字体及间距。

### I · 场景（AC-9）

- [x] I01: 无场景行为命名。
- [x] I02: 场景配置预览。
- [x] I03: 基础字段人类可读顺序。
- [x] I04: 执行配置使用已有选项。
- [x] I05: 技能/工具引用选择。
- [x] I06: 简报预览与错误定位。
- [x] I07: 产物可视化配置说明。
- [x] I08: Hook 字段标签/跨页错误。
- [x] I09: JSON 编辑空间与应用状态。

### J · 辅助界面（AC-10）

- [x] J01: 轨迹空间与未知统计。
- [x] J02: 侧边对话模型与上下文。
- [x] J03: 快捷对话关闭/隐藏区分。
- [x] J04: 设备配对方向与本地化。
- [x] J05: Issue 空态/错误区别。
- [x] J06: 工作区搜索范围/匹配可读性。
- [x] J07: 文件引用意图与噪声过滤。
- [x] J08: 项目动作窗口高度与效果。
- [x] J09: 环境无本地改动/远端状态。

Temporary resources: `.codex/run/ui-audit/` 保存本地验证日志；截图位于 `/Users/chenli/.codex/visualizations/2026/09/08/01a08172-715c-73c3-8f1c-cb8fdd6f7ff4/ui-audit/`。复用唯一开发 Core；只清理本任务终端、预览和重复启动进程，保留用户数据库、飞书登录和宠物选择。具体处置和保留归属见 Verification。

Rollback: 仅回退本变更的源码和文档 diff；不回滚或删除用户数据。运行中实例重启仅限本任务原 launcher，先复核 ownership 与当前活动；渲染验证优先使用隔离、无真实 agent turn 的路径。
