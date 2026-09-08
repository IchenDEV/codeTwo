---
id: 2026-09-08-visible-ui-audit-remediation
schema: 5
stage: intent
status: accepted
owner: codex
created: 2026-09-08
source: user
risk: medium
approved_by: user
approved_at: 2026-09-08
approval_source: "Current conversation: 开始列一下清单，几套文件里头去，然后逐项修复。"
---

# Intent: 修复可见界面审查问题

## Intent

用户要求把上一轮逐页审查形成仓库清单，并逐项修复。覆盖已经实际检查的桌面页面、设置、场景编辑与工作区面板；优先消除裁切、无法关闭、重绘和误导状态，其次完善可发现性、文案与可读性。

本地修改和验证已获授权。保持既有设计系统和业务边界，不改变权限策略、账号授权、持久化协议或场景架构；不安装插件、不发送外部消息、不创建自动化、不合并或发布。尚未进入的已登录飞书、Docker 和真实审批状态不冒充已验证。

原始证据来自本会话的原生 macOS 应用审查，基线 `6a2884ce`；截图保存在本机 UI audit evidence directory，验证记录引用需要的具体截图。既有用户数据、运行中的 Core 和其他工作目录必须保留。
