---
id: 2026-09-08-visual-coherence-standard
schema: 5
stage: spec
status: accepted
owner: codex
created: 2026-09-08
based_on: intent.md
---

# Spec: Visual Coherence Standard

## Design

[Design.md](../../../../Design.md) 是视觉值与状态规则的唯一权威；现有组件契约保留技术架构。使用已有主题和字体 resolver，保持自定义主题与保存的字号设置。

## Acceptance criteria

- [x] AC-1: Design.md 定义范围、圆角、配色、状态、字号、间距和验收，与现有文档没有冲突。
- [x] AC-2: 中性控件 hover、selected、selected-hover、pressed 区分，焦点可叠加，禁用不可操作；深浅色及自定义主题实际渲染。
- [x] AC-3: 正文 15/24px，提示文字清楚，UI 密度和保存字号保留；编辑区和操作栏对齐，展开不丢草稿。
- [x] AC-4: 设置统一间距、侧栏选中态可辨认、资源默认折叠而保存偏好不被覆盖。
- [x] AC-5: 相关回归、构建、样式、文档及 SDLC 检查通过，原生实例和临时资源完成归属清理。
