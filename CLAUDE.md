# Agent Technology Radar — 开发规则

> 本仓库的开发流程约定，每个 session 自动加载。路线图在 `PLAN.md`，
> 各阶段方案在 `.claude/plans/phase-*.plan.md`（**实现细节以方案为准**）。

## 1. 每个阶段的固定交付物

一个 phase（以及 phase 内的每个子阶段）必须交付**三件**，缺一件不算完成：

| # | 交付物 | 要求 |
|---|---|---|
| 1 | 方案文档 `.claude/plans/phase-<n>-<slug>.plan.md` | 用 §2 的固定骨架 |
| 2 | 可执行验收 gate `scripts/gate-<n>.js` | 接进 `.github/workflows/generate-feed.yml`。全绿退 0，任一红退 1 |
| 3 | 验收清单（方案 §8 Exit Criteria） | **每一条都要挂 gate 检查编号**（如 `— gate G7`）。没编号的那条是承诺，不是证据 |

## 2. 方案文档骨架

phase-0 / 1a / 1b / 2 四份文档共用的形状，沿用：

```
§0 执行进展与决策记录        §7  验证（Verification）
§1 背景与关键事实（实测）     §8  Exit Criteria（Checklist）
§2..§6 本阶段内容             §9  Risks / Open Questions
                             §10 明确不在本阶段范围内
```

**§10 是交付物的一部分，不是可选项** —— 它的作用是防止后续 session 漂移进本阶段已明确排除的范围。

## 3. Gate 的两条硬规则

1. **新增检查必须先证明它会红。** 写进 gate 的每条新检查，都要拿**改动前**的代码跑一遍，确认它确实失败、且失败信息指向正确的缺陷。没做这一步的检查一律视为虚测试，不计入覆盖率。（反例见 `.claude/plans/phase-2-signal-feed.plan.md` §8.1 #4：原 gate 7 项里有 3 项是虚的。）
2. **测试与实现同源时，必须引入独立验证。** 由写实现的一方写的 gate，只能证明"按作者的设想跑通了"。交付前要有一次**无作者上下文的独立审查**，指令是**证伪**而非确认；每条发现须带可复现步骤，且**由我本人重跑复现后才采信**。

## 4. 汇报与分块纪律

- **区分「我验过的」和「我还没验的」。** 转述不算验证，"应该没问题"不算"我跑过"。
- **实测数字优先于形容词**：写 `rss 152 item / 0 error`，不写"抓取正常"。
- **不要为了汇报而分块。** 一个阶段内能一口气做完就做完再汇报；只在**需要董事裁决**、或有**不可逆动作**（推远端、删除、改共享状态）时才停。
- 已知偏离要写进文档，不要静默绕过。

## 5. 本仓库的事实速查

- **无测试框架。** `scripts/gate-*.js` 就是测试套件：纯 Node、零依赖、用 fixture 驱动真实子进程。
- **不提交**：`signals.json`、`signals-window.json`、`signals-internal.json`、`feed-<channel>.json`（派生产物）。
  **要提交**：`state-signals.json`、`state-feed.json`（跨 run 去重状态）、`topics.json`（Phase 3 产物，其 git 历史是权重序列）、`radar.json`（Phase 4 产物，其 git 历史是主题在环之间移动的记录）。
- **registry 两处必须同步改**：`config/default-sources.json` + `config/source-registry.schema.json`。
- **CI 每天红是预期的**（缺 `X_BEARER_TOKEN` / `POD2TXT_API_KEY` → `Generate feeds` 失败）。**看步骤级结论，不要看 run 级结论** —— 否则真正的 gate 失败会被淹没。
- registry 的 `id` **一旦发布不可改**（signal 的 `source_id` 指向它）；例外仅限从未产出过 signal 的条目。
