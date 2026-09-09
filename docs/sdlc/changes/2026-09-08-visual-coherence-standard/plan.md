---
id: 2026-09-08-visual-coherence-standard
schema: 5
stage: plan
status: accepted
owner: codex
created: 2026-09-08
based_on: spec.md
scope: Design.md, docs/design/system.md, docs/design/README.md, docs/sdlc/changes/2026-09-08-visual-coherence-standard/, apps/desktop/src/, apps/desktop/tests/
---

# Plan: Visual Coherence Standard

## Plan

Owner: codex。先落标准并同步组件契约，然后更新主题/字体 resolver、共享控件、设置和工作区布局。前一轮未提交的修复保留；本记录负责新增协调性改动。相关 Bun 回归、TypeScript、lint/build/stylelint、原生深浅色与窄宽度、可控交互预览及 docs/SDLC/diff 检查。没有 Rust、权限、生命周期规则修改，不运行无关 Rust 或 lifecycle Eval。

Temporary resources: `.codex/run/visual-coherence/` 日志及 renderer-only 预览；截图保存在本任务 visualization 目录。复用已追踪 launcher 78071/Core 78079，重启前检查没有用户任务在执行。临时预览和测试草稿验收后关闭，保留构建、证据和用户数据。

Rollback: 回退本记录对应 diff；不覆盖前序修复或用户配置。
