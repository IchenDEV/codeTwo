# CodeTwo 研发工作流

Status: **current operator guide**.

[`workflow.md`](workflow.md) 是生命周期权威文档；本文件说明日常怎么用它。CodeTwo 采用 **schema 3 四阶段 Artifact**（`intent.md` → `spec.md` → `plan.md` → `verification.md`），对齐 doubao-work-skin：一变更一目录、证据并列、Intent/Spec/Plan 必须依次批准后才能实现与合并。

Agent 可安装 [`IchenDEV/sdlc-skill`](https://github.com/IchenDEV/sdlc-skill) 中的 `ai-native-sdlc` skill，用于 Bootstrap、推进变更、审计链路或处理事故改进。仓库内的 [artifact-contracts.md](references/artifact-contracts.md) 把通用契约映射到 CodeTwo 的 schema-3 字段。

## 状态环

```text
需求 / Issue / 事故
        │
        ▼
intent.md（draft → accepted）
        │ 强制审批
        ▼
spec.md（draft → accepted）
        │ 强制审批
        ▼
plan.md（draft → accepted，含 scope）
        │ 强制审批 → 实现
        ▼
verification.md（证据与 verdict）
        │
        ▼
PR 审查 + CI ─── 人工合并决策
        │
        ▼
发布准备 ─── 人工发布授权
        │
        ▼
生产观察 / 事故 ─── 新 bundle + 永久 Eval
```

每个 Gate 仍是人工决策。审查者可以直接编辑 stage 文件，或在对话中明确确认后，由 Agent 调用 `devflow approve` 记录审批者与日期。Agent 不得从沉默、模糊回应或自行判断中推断批准。

## 开始一项变更

使用小写 slug：

```bash
./script/devflow new improve-task-board user medium
```

这会创建 `docs/sdlc/changes/<date>-improve-task-board/intent.md`。填写 Intent 章节后，在明确人工确认后记录批准：

```bash
./script/devflow approve 2026-09-02-improve-task-board intent "product owner"
```

Intent 已 `accepted` 后才能创建 Spec：

```bash
./script/devflow design 2026-09-02-improve-task-board
./script/devflow approve 2026-09-02-improve-task-board spec "product owner"
```

Spec 已 `accepted` 后才能创建 Plan（并在 frontmatter 填写精确 `scope`）：

```bash
./script/devflow plan 2026-09-02-improve-task-board
./script/devflow approve 2026-09-02-improve-task-board plan "engineering lead"
```

实现完成后创建 Verification：

```bash
./script/devflow verify 2026-09-02-improve-task-board
```

随时检查状态：

```bash
./script/devflow status
./script/devflow status 2026-09-02-improve-task-board
./script/devflow validate
./script/devflow validate --worktree
```

## 各 Gate 决定什么

| Gate | 所需 stage | 人工决策 |
| --- | --- | --- |
| Intent | `intent.md` accepted | 问题是否真实、有价值、有边界？ |
| Spec | `spec.md` accepted | 验收标准是否可测、风险是否可接受？ |
| Plan | `plan.md` accepted + scope | 实现是否足够小、可回滚、路径是否完整？ |
| 验证 | `verification.md` + 每条 AC 证据 | 命令输出与真实行为是否证明 Plan？ |
| 合并 | PR + CI + 三阶段均已 accepted | 残余风险是否可接受、证据是否可信？ |
| 发布 | verification `passed` + 发布授权 | 是否现在发布这个 commit？ |

风险等级为 `low`、`medium`、`high`、`critical`：

- **Low**：文档、局部样式、已有测试路径的隔离改动。
- **Medium**：常规产品行为、跨模块但可逆的 UI 或配置。
- **High**：数据迁移、安全边界、协议、发布控制、持久化 schema。
- **Critical**：凭据、破坏性操作、可能暴露私有用户内容。

`high` 和 `critical` 的 approver 与 verifier 必须不同于 implementation owner。

## 构建与验证循环

实现中使用最小相关循环，交付前跑完整 Gate：

```bash
bun test script/verify/checks.test.ts script/devflow.test.ts
bun script/verify/docs.ts
bun script/verify/sdlc.ts --worktree
```

桌面 UI 变更：编译成功不等于验收——需要真实渲染窗口证据（light / dark / narrow）。服务或协议变更：需要契约、集成或运行时证据。在 `verification.md` 记录实际命令与结果；截图放在同 bundle 的 `evidence/` 目录。

## Pull Request

PR 正文必须链接 canonical bundle 路径，例如：

```text
docs/sdlc/changes/2026-09-02-improve-task-board
```

Draft PR 可在 verification 未完成时存在；Ready PR 要求 `intent.md`、`spec.md`、`plan.md` 均为 `accepted`，且 plan scope 覆盖所有改动路径。CI 的 `SDLC contract` job 会运行 `bun script/verify/sdlc.ts --base "$BASE_SHA"`。

本地 PR Gate 检查：

```bash
PR_BODY="$(cat .github/pull_request_template.md)" PR_IS_DRAFT=true ./script/devflow check-pr
```

## 事故与维护循环

确认事故后，同时创建 incident 与 follow-up change：

```bash
./script/devflow incident gallery-health monitor
./script/devflow new gallery-health-follow-up incident medium
```

incident 关闭前必须链接 follow-up bundle 与 regression Eval，或在对应章节记录 `Blocked:` 原因。永久 Eval：

```bash
./script/devflow add-eval gallery-health incident
```

Eval 在 fixture、oracle 和最新结果就绪前保持 `draft`；`active` 后每次相关 Skill、Hook、生命周期 enforcement 或 Agent 配置变更都应重跑。

## Skill 与学习循环

- 安装：`npx skills add IchenDEV/sdlc-skill -a cursor -y`（或其他 Agent）。
- 项目级改进记录：`.agent-learning/ai-native-sdlc/`（proposal-only，不自动改 skill）。
- 生命周期回归：[`evals/ai-native-sdlc-gates.md`](evals/ai-native-sdlc-gates.md)。

## 运营指标

每月用 Git / GitHub 时间戳回顾（不用自报估算）：

- Intent 创建到 accepted 的时间；
- Plan accepted 到 verification `passed` 的时间；
- 首次 CI 通过率与实现到合并时间；
- 每个 PR 的 review 轮数与 Plan 偏差；
- 逃逸缺陷、containment 时间、永久 Eval 建立时间；
- 生命周期或 Agent 规则回归是否在合并前被 Eval 捕获。

指标变差时，改最小的 policy、check、template 或 devflow 命令，并补 Eval；不要为了偶发失败叠新的流程层。

## 与相邻项目的对齐

| 方面 | doubao-work-skin | CodeTwo |
| --- | --- | --- |
| Artifact 形态 | `intent.md` / `spec.md` / `plan.md` / `verification.md` | 同上（schema 3） |
| 强制审批 | Intent → Spec → Plan 依次 accepted | 同上，由 `bun script/verify/sdlc.ts` 强制 |
| CLI | `./scripts/devflow` | `./script/devflow` |
| 强制检查 | `./scripts/check.sh workflow` | `bun script/verify/sdlc.ts` |
| Skill | 内嵌 workflow 文档 | 外置 `sdlc-skill` + 本仓库 learning loop |

Authority 边界不变：产品 Issue/PR、ADR、设计文档、CI、Release 各自拥有事实；stage 文件只拥有生命周期状态与下一触发条件。
