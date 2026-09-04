# Artifact Contracts（CodeTwo 映射）

本文档把 AI-Native SDLC 的通用 Artifact 契约映射到 CodeTwo 的 schema-3 四阶段 bundle。完整生命周期权威仍是 [`workflow.md`](../workflow.md)。

## 总览

CodeTwo 用**一个 bundle 目录**承载一项 material change，拆成四个 stage 文件：

```text
docs/sdlc/changes/<date>-<slug>/
  intent.md          ← Intent Gate（问题与边界）
  spec.md            ← Spec Gate（需求与 AC-N）
  plan.md            ← Plan Gate（scope 与执行顺序）
  verification.md    ← 证据、verdict、发布交接
  evidence/          ← 可选运行时或视觉证据
```

强制审批链：

```text
intent.md accepted → spec.md accepted → plan.md accepted → 实现 / verification.md
```

Incidents 与 Evals 仍使用独立文件：

```text
docs/sdlc/incidents/<date>-<slug>.md
docs/sdlc/evals/<slug>.md
```

## Stage 文件（schema 3）

### 共有 frontmatter

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 与目录名一致：`<date>-<slug>` |
| `stage` | ✅ | `intent` / `spec` / `plan` / `verification` |
| `schema` | ✅ | `3` |
| `status` | ✅ | 见各 stage |
| `owner` | ✅ | 实现负责人 |
| `created` | ✅ | `YYYY-MM-DD` |
| `risk` | ✅ | `low` / `medium` / `high` / `critical` |
| `approved_by` / `approved_at` | 按 stage | 进入 `accepted` 时必填 |
| `based_on` | spec/plan/verification | 上一 stage 文件名 |

### intent.md

| 状态 | 含义 | 下一触发 |
| --- | --- | --- |
| `draft` | Intent 草稿 | owner 请求审查 |
| `in-review` | 待批准 | 命名 approver 接受/驳回 |
| `accepted` | Intent 已批 | `./script/devflow design` 创建 spec |

必需章节：Problem、Proposed outcome、Constraints、Decision 等（见模板）。

### spec.md

| 状态 | 含义 | 下一触发 |
| --- | --- | --- |
| `draft` / `in-review` | 待完善或审查 | approver 接受 |
| `accepted` | Spec 已批 | `./script/devflow plan` 创建 plan |

**前置条件**：同 bundle 的 `intent.md` 必须为 `accepted`。

验收标准：

- 使用稳定唯一的 `AC-N` 标识；
- 每条 criterion 在 `verification.md` 中有且仅有一条 `PASS` / `FAIL` / `BLOCKED` 映射。

### plan.md

| 状态 | 含义 | 下一触发 |
| --- | --- | --- |
| `draft` / `in-review` | 待完善或审查 | approver 接受 |
| `accepted` | Plan 已批 | 实现与 verification |

**前置条件**：同 bundle 的 `spec.md` 必须为 `accepted`。

额外 frontmatter：

| 字段 | 说明 |
| --- | --- |
| `scope` | 逗号分隔的精确路径或目录前缀；PR 中每个改动路径必须被至少一个 accepted plan 覆盖 |

### verification.md

| 状态 | 含义 |
| --- | --- |
| `draft` / `in-progress` | 验证进行中 |
| `passed` | 全部 AC 有 PASS 证据，`Verdict: verified` |
| `failed` | 保留 FAIL 映射 |

额外 frontmatter：`verification_mode`、`verified_by`、`verified_at`、`release_target` 等。

`passed` 要求：

- 所有 AC checkbox 勾选；
- `Verdict: verified`；
- 具体残余风险；
- `high`/`critical` 时 verifier ≠ owner。

## PR Gate

- 含仓库实现改动的 PR：`intent.md`、`spec.md`、`plan.md` 必须均为 `accepted`；
- 每个改动路径须落在 accepted plan 的 `scope` 内；
- 禁止新增或修改 legacy `change.md`。

创建 Intent：`./script/devflow new <slug> [source] [risk]`

记录审批：`./script/devflow approve <change-id> <intent|spec|plan> <approver>`

## Incident

| 字段 / 章节 | 关闭前要求 |
| --- | --- |
| `status: resolved` / `closed` | 恢复证据完整 |
| Follow-ups | 链接 follow-up bundle（`intent.md`），或 `Blocked:` |
| Regression eval | 链接 Eval，或 `Blocked:` |

创建：`./script/devflow incident <slug> [source]`

## Eval

| 字段 / 章节 | `active` 前要求 |
| --- | --- |
| Provenance | 链接真实 task / defect / bundle / Incident |
| Last result | `Result:` + `Revision:` + 证据 |

创建：`./script/devflow add-eval <slug> [source]`

## 按风险压缩

| 风险 | 最小 Artifact |
| --- | --- |
| Low | 四 stage 文件；验收写在 spec；验证在 verification |
| Medium | 同上 + 明确 plan scope |
| High / Critical | 同上 + 独立 approver 与 verifier + 链接 ADR/设计证据 |

压缩的是**并行维护成本**（单文件多章节），不是链路环节：Intent（为何改）、强制审批、Verification（证据）、Review（人判断）始终存在。

## 与 sdlc-skill 的对应

| sdlc-skill 模式 | CodeTwo 操作 |
| --- | --- |
| Bootstrap | 已有 workflow + checker；用 devflow 创建 intent |
| Intent → Spec → Plan | `new` → `approve intent` → `design` → `approve spec` → `plan` → `approve plan` |
| Verification | `verify` + `bun script/verify/sdlc.ts` |
| Incident → improvement | `incident` + `new` follow-up bundle + `add-eval` |
| Audit | `devflow validate` + lifecycle Eval |

历史 schema-2 `change.md` 已批量迁移为四文件；checker 拒绝 legacy 单文件。
