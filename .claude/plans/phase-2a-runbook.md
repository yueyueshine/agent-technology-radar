# Phase 2A — Loop Runbook

> **状态：✅ 已完成（2026-09-23）** —— 停止条件「2A 完成」满足，正常终止，未触发任何异常停止条件。
>
> 批次结果：**批次 1 的 4 个通道全部处置完毕 —— 3 个实现（`rss` / `github` / `api`），1 个证否（`web` 不需要）。**
> CI 终态：`rss` 18 源 / **148 item** / 0 error；`github` 9 源 / 20 item / 0 error。
> 本次 loop 未发生「无实质进展的空转」或「同根因重试」—— ECC 列出的两类失败模式均未出现。

> ECC `/loop-start sequential --mode safe` 生成的运行手册。
> 目的：把 2A 剩余工作**一次跑完**，只在真正卡住时才回到 owner。

---

## 1. 模式与分支策略

| 项 | 值 |
|---|---|
| pattern | `sequential` |
| mode | `safe` |
| 分支 | `main`（本仓库无分支工作流，CI 也推 main） |
| 提交粒度 | **每个逻辑单元一次 commit**（一个通道 / 一个决策 = 一次 commit） |
| 推送 | 每个 commit 后 `pull --rebase` + push |
| CI 验证 | **批次末跑一次**（见 §3 规则②），不逐源往返 |

---

## 2. ⚠️ 安全要求：一项不满足（已替代，非掩盖）

ECC `--mode safe` 要求 **「迭代前测试通过」**。**本项目从无测试套件** —— 这条**无法满足**。

**替代门（项目真实存在的验证手段）**，每轮迭代必须全绿：

| # | 门 | 命令 |
|---|---|---|
| G1 | 语法 | `node --check scripts/*.js` |
| G2 | loader 正确性 | 离线直调真实 `loadSources()` → 期望 `podcasts=6 blogs=2 x_accounts=26` 且无渠道泄漏 |
| G3 | 现有链路无回退 | `node scripts/generate-feed.js --blogs-only` 正常 |
| G4 | 新通道端到端 | `node scripts/fetch-channels.js` 零 error（或错误均有明确归因） |
| G5 | CI | `gh workflow run` → 步骤 `Fetch keyless channels` 绿 + 远端无意外 bot commit |

> **这不是"有测试"，是"有可执行的门"。** 差异必须保留在案。

其余安全检查：

- ✅ `ECC_HOOK_PROFILE` 未设置 → 未被全局禁用
- ✅ GATEGUARD 豁免仅限 `.claude/plans/**` 与 `PLAN.md`（`config/**`、`scripts/**` **不豁免**）

---

## 3. 本 loop 补齐的两条规则（ECC 没有的）

### ① 批量决策

- **有明确建议的，我直接定**，并记为**可回滚的显式决策**（记录理由 + 回滚方式）
- 你在**阶段边界批量复核**，而不是每步打断
- **只有两类才停下**：不可逆的操作（推送/删除/强制）、纯偏好无技术优劣的

### ② 批量 CI

- 一个批次的全部改动**累积后跑一次 CI**
- 本地只跑 G1–G4 的**快速子集**；对本地不可达的源**直接交给 CI**，不在本地反复重试

---

## 4. 明确的停止条件（迭代终止）

| 条件 | 动作 |
|---|---|
| **2A 完成**：API 通道实现 + 两个待裁决项落地 + CI 绿 | 正常停止，汇报 |
| **同一根因连续失败 2 次** | 停止，带证据回 owner（ECC: "repeated retries with same root cause"） |
| **出现不可逆操作的需求**（强推 / 删分支 / 改 CI 密钥） | 停止，回 owner |
| **G1–G4 任一无法修复** | 停止，回 owner |
| **需要 owner 偏好且无技术优劣** | 停止，回 owner |
| **成本/轮次异常**（如 CI 连续失败 3 次） | 停止，回 owner |

**禁止**：为了让循环继续而降低门标准、跳过 CI、或把失败改写成"预期内"。

---

## 5. 本批次的工作清单（一次跑完）

| # | 项 | 决策 |
|---|---|---|
| 1 | `web:semantic-scholar` | **退休**（决策①，见 §6） |
| 2 | `RSS_LOOKBACK_HOURS` | **168h → 336h**（决策②，见 §6） |
| 3 | `api` 通道 fetcher（AIHOT） | 实现；**AIHOT 保持 `active: false`**（三重前置，第三条本阶段不满足） |
| 4 | CI 验证 | 批次末一次 |

---

## 6. 本批次的两个显式决策（可回滚）

### 决策① 退休 `web:semantic-scholar`

- **理由**：通道错配（注册的 `url` 是 API 端点，非网页）+ 匿名首击 429，**不满足 §2 P1-2「可稳定获取」**；`tier=discovery` 价值边际，arXiv 与 HF Papers 已覆盖发现层
- **回滚**：一条 commit revert；条目内容记录在 plan §2.7.2。将来若需要，应以 `api:semantic-scholar` 重新登记
- **影响**：`web` 通道归零，批次 1 由 4 通道收缩为 3

### 决策② `RSS_LOOKBACK_HOURS` 168h → 336h

- **理由**：18 个 active RSS 源里 **7 个在 168h 内产出 0 条**，含 Lilian Weng / Chip Huyen / Eugene Yan / Jay Alammar 这类**季更高价值源** —— 7 天窗口等于让它们几乎永远沉默
- **代价**：中间产物变大（**不提交**）；2B 会去重，故无重复风险
- **回滚**：改一个常量

---

## 7. 监控

```bash
# 观察 loop 是否停滞（ECC 提供的 transcript 观测）
node ~/.claude/plugins/cache/ecc/ecc/2.2.2/scripts/loop-status.js --json --limit 5
```
