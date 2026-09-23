# Phase 0 — 接管现有 follow-builders

> 目标：让 fork 具备独立运转能力——CI 在 fork 上真实运行并回写数据；消费端读取 fork 自身的 prompts 与 blog feed。
> **完成定义：「仓库与安全链路接管完成」，不是「全部数据源完全独立」。**
> 前置：无。

---

## 0. 执行进展（截至 2026-09-23）

| 步骤 | 状态 | 证据 |
|---|---|---|
| Step 1 确认 fork CI 状态 | ✅ Done | 确认 `actions/workflows total_count: 0`、`secrets: 0` |
| Step 2 启用 fork workflow | ✅ Done | fork Actions 页面点击 enable，`Generate Feeds` 出现 |
| Step 3 显式启用 `Generate Feeds` | ✅ Done | 状态由 `disabled_fork` → **`active`**（API 复核） |
| Step 4 无 key 冒烟测试 | ✅ Done | `workflow_dispatch` / `blogs-only` → run **success**；回写提交 `d50ebfe`；`feed-blogs.json` 的 `generatedAt` → `2026-09-23T03:53:16Z` |
| **Gate G1** | ✅ **PASS** | 四条信号全部成立；`contents: write` 实测有效（仓库默认 `read` 不构成阻碍） |
| Step 5 确认 key 可得性 | ✅ Done | 两个 key 均无；决定**暂不注册**，改走 §6 无 key 路径 |
| Step 6 重指向安全 URL | ✅ Done | `FEED_BLOGS_URL`(31)、`PROMPTS_BASE`(33) → 自有仓库；29 / 30 保持上游 |
| Step 7 文档引用修正 | ⏳ Pending | 见 §5「建议修改（文档级）」 |
| Step 8 确认 CI 定时运行 | ⏳ Pending | 观察次日 06:17 UTC 的 cron |

### 已知的、预期内的失败

workflow 已启用，因此每日 **06:17 UTC** 的 cron 会以 `all` 模式运行，而仓库仍无 secrets
→ 该 run 会在 `generate-feed.js:1020-1027` 的 key 检查处 `exit(1)` **失败**。

**这是预期行为，不是故障**：脚本在抓取与写入之前就退出，不会写坏任何数据。
它会在 Actions 页面留下红色记录，直到 Phase 1/2 处理 key 为止。

### Temporary upstream dependency（临时上游依赖）

| feed | 来源 | 原因 |
|---|---|---|
| `FEED_X_URL` (29) | ❗ **上游** `zarazhangrui/follow-builders` | 无 `X_BEARER_TOKEN`（X 读取需付费档，暂不注册） |
| `FEED_PODCASTS_URL` (30) | ❗ **上游** `zarazhangrui/follow-builders` | 无 `POD2TXT_API_KEY`（第三方服务，暂不依赖） |
| `FEED_BLOGS_URL` (31) | ✅ 自有仓库 | — |
| `PROMPTS_BASE` (33) | ✅ 自有仓库 | — |

> 该依赖在 **Phase 1 / Phase 2** 建立自有 Source Registry 与 Signal Feed 后移除。
> 代码中已就地标注（`scripts/prepare-digest.js` 常量区注释）。

---

## 1. 背景与关键事实

以下均为直接核实的结论，不是推断。

**仓库 / CI**

| 事实 | 值 | 含义 |
|---|---|---|
| fork 状态 | `isFork: true`，parent `zarazhangrui/follow-builders`，创建于 `2026-09-22T03:56:17Z` | 公开 fork |
| `pushedAt` | `2026-09-21T06:52:55Z`（**早于创建时间**） | **fork 自创建以来从未被推送过** |
| Actions 全局开关 | `enabled: true` | 总开关开着 |
| 已注册 workflow | `total_count: 0`（上游为 1，`state: active`） | **fork 上没有任何已注册 workflow** |
| Secrets | `total_count: 0` | fork 不继承上游 secrets，当前无 key |
| workflow 运行记录 | 0 次 | 从未运行 |
| workflow 文件 | `.github/workflows/generate-feed.yml`（1468 bytes）**已在 fork main 上** | 文件在，只是没被注册 / 启用 |
| cron | `17 6 * * *`（每天 06:17 UTC）；支持 `workflow_dispatch`，模式 `all` / `tweets-only` / `podcasts-only` / `blogs-only` | |
| 权限 / 提交 | 声明 `permissions: contents: write`，以 `github-actions[bot]` 提交，message `chore: update feeds [skip ci]` | 需要写权限才能回写 feed |
| 所需 secrets | 恰为 `X_BEARER_TOKEN`、`POD2TXT_API_KEY`；`GITHUB_TOKEN` 自动注入 | 只需手工配 2 个 |
| 上游状态 | 上游仓库活跃，feed 每日更新 | 解释了「现在看起来健康」 |
| fork 自身 raw feed | 未认证可访问（HTTP 200） | 消费端可改读 fork 的 raw |

**代码**

| 事实 | 含义 |
|---|---|
| `scripts/generate-feed.js`（1138 行）是生产者；X / podcast / blog 三条抓取链路 | 三条链路相互独立 |
| **缺任一必需 secret 时，脚本在抓取与写入之前就 `process.exit(1)`（`generate-feed.js:1020-1027`）** | 后果：run 会**红**且**不产出**任何数据 |
| `--blogs-only` 不需要任何 key；`--tweets-only` 只需 X key；`--podcasts-only` 只需 pod2txt key | 决定了 §6 fallback 的分阶段策略 |
| `scripts/prepare-digest.js`（180 行）是消费者，**第 29-33 行硬编码上游 URL** | 消费端当前在读上游数据 |
| `feed-blogs.json` | 曾判为「已死」——**该判断已被 Step 4 推翻**：实跑产出了 1 条（Claude Blog, *Claude in Chrome is generally available*）。真实情况是**很少触发但能触发**（Claude Blog 索引页解析出的 `publishedAt` 为 `null`，代码对无日期条目不施加 72h 窗口过滤）。本阶段不修其逻辑 |
| `~/.follow-builders` 在本机**不存在** | 没有现存安装会被破坏 |

### 关键排序洞察（本方案的核心约束）

> 现在系统「看起来健康」，只是因为消费端还在读**上游**仓库的 feed，而上游每天更新。
> 如果只把 `prepare-digest.js` 重指向自有仓库、而**没有先把 CI 恢复**，结果会从
> 「在跑、但在吃别人的数据」退化为「**坏掉、且冻结在上游 `2026-09-21` 的陈旧数据**」。
>
> 因此：**恢复 CI 与重指向消费端 URL 属于同一个变更单元，必须一起落地，绝不能 URL 先行。**
> 二者之间设一个强制验证 Gate（**Gate G1**），G1 未通过不得合入 URL 改动。

---

## 2. 工作总览与依赖顺序

```
[用户操作 A] 启用 workflow
   → [用户操作 B] 配置 secrets
   → [用户操作 C] 手动触发 run
   → ══ Gate G1 ══ 验证 CI 真的跑通、数据真的写回 fork
   → [代码改动 D] 重指向 prepare-digest.js 的 URL
   → [文档改动 E] 修正数据链路相关引用
   → [验证 F] 证明消费端读的是自有数据
   → 合入
```

- **A / B / C** 是**用户必须在 GitHub 上操作**的事。
- **D / E** 是**代码 / 文档改动**。
- **Gate G1** 卡在 C 与 D 之间：**D 不得在 G1 通过前合入**。

---

## 3. (a) 需要在 GitHub 上操作的事（用户执行）

> 以下操作在网页上完成。每步给出「做什么」与「怎么验证成功」。

### 动作 A — 启用 fork 的 workflow

- **为什么**：fork 默认不注册 / 不运行 workflow，这正是当前 `actions/workflows total_count: 0` 的原因。文件已在 main 上，只差启用。
- **做什么**：
  1. 打开 `https://github.com/yueyueshine/agent-technology-radar/actions`。
  2. 若出现「Workflows aren't being run on this forked repository」类提示，点击 **I understand my workflows, go ahead and enable them**。
  3. 在左侧列表确认出现该 workflow。
- **怎么验证成功**：Actions 左侧列表出现该 workflow 且为启用状态；`gh api repos/yueyueshine/agent-technology-radar/actions/workflows` 的 `total_count` 由 `0` 变为 `1`（未装 `gh` 则用网页确认列表非空）。

### 动作 B — 配置 2 个 secrets

- **为什么**：fork 不继承上游 secrets，当前为 0；缺 key 会让 `generate-feed.js` 直接 `exit(1)`。
- **做什么**：`Settings → Secrets and variables → Actions → New repository secret`，添加：
  - `X_BEARER_TOKEN`
  - `POD2TXT_API_KEY`
- **不要**添加 `GITHUB_TOKEN`（自动注入）。
- **怎么验证成功**：secrets 计数由 `0` 变为 `2`（网页确认 2 条，或 `gh api .../actions/secrets` 显示 `total_count: 2`）。
- **若拿不到 key**：直接跳到 §6，**不要**继续做动作 D。

### 动作 C — 手动触发 workflow（`workflow_dispatch`）

- **做什么**：`Actions → Generate Feed → Run workflow`，选择模式后运行。
- **建议触发顺序**（与 §6 的分阶段一致）：
  1. 先跑 `blogs-only`（**不需要任何 key**）做冒烟，验证 CI 机制本身可用。
  2. 再按实际可得 key 触发 `tweets-only` / `podcasts-only`。
  3. key 齐全后跑 `all`。
- **怎么验证成功**：见 Gate G1。

### Gate G1 — 验证 CI 真的跑通且数据写回 fork（**硬门槛**）

在合入任何消费端 URL 改动**之前**，必须同时观察到：

1. **run 变绿**：该次 run 状态为 success（`gh run list --limit 5` 可见最近 run 成功）。
2. **产生回写提交**：fork main 出现新的 `github-actions[bot]` 提交，message 为 `chore: update feeds [skip ci]`。
3. **数据真的更新**：触发前记录 `raw.githubusercontent.com/yueyueshine/agent-technology-radar/main/feed-*.json` 的内容或最后提交时间；触发后再取一次，确认目标 feed 前进。
4. **写权限有效**：run 成功产生了回写提交，即证明 `permissions: contents: write` 生效（否则会在 push 步骤报权限错误）。

> 若 `blogs-only` 因输出为空（`feed-blogs.json` 仍为 `"blogs": []`，已知）而未产生回写提交，
> 属预期；此时以**第 1 条 run 变绿**证明 CI 机制可用，第 2、3 条改由有 key 的链路触发来满足。

**G1 未通过 → 禁止进入 §4 的动作 D。**

---

## 4. (b) 代码 / 文档改动

> D 与 E 属于**同一个变更单元**（同一 branch / PR），在 G1 通过后才创建，且必须在 G1 通过后合入。
> **绝不允许「先合 URL 改动、再补 CI」。**

### 动作 D — 重指向消费者 URL（`scripts/prepare-digest.js`）✅ 已完成

**实际执行结果（2026-09-23）**：仅重指向 **31** 与 **33** 两行；**29、30 保持上游不动**。

| 行 | 常量 | 处置 |
|---|---|---|
| 29 | `FEED_X_URL` | ⏸ **保持上游**（无 key，重指向会导致数据冻结） |
| 30 | `FEED_PODCASTS_URL` | ⏸ **保持上游**（同上） |
| 31 | `FEED_BLOGS_URL` | ✅ 已改为自有仓库 |
| 33 | `PROMPTS_BASE` | ✅ 已改为自有仓库 |

- 计数核对：自有仓库引用 2 处、上游引用 2 处；`node --check` 语法通过。
- **约束**：第 26 行 `USER_DIR = ~/.follow-builders` **未改**（见 §5 defer）。
- **prompt 查找优先级**：用户本地 `~/.follow-builders/prompts/` > GitHub（`PROMPTS_BASE`）> 仓库本地 `prompts/`。本机不存在 `~/.follow-builders`，因此落到 `PROMPTS_BASE`，即自有仓库——符合预期。
- 代码中已在常量区就地标注该临时上游依赖（含"Phase 1/2 后移除"），避免未来读者把 29 / 30 误判为漏改。

### 动作 E — 修正文档引用

见 §5「必须修改」清单。**逐行修改，禁止批量替换**（见 §5 陷阱）。

---

## 5. 上游引用改动清单（含 MUST NOT CHANGE 陷阱）

### 代码改动 — 已完成 / 已推迟

| 文件:行 | 内容 | 状态 |
|---|---|---|
| `scripts/prepare-digest.js:31` | `FEED_BLOGS_URL` | ✅ 已改为自有仓库 |
| `scripts/prepare-digest.js:33` | `PROMPTS_BASE` | ✅ 已改为自有仓库 |
| `scripts/prepare-digest.js:29` | `FEED_X_URL` | ⏸ **推迟**（临时上游依赖，Phase 1/2 移除） |
| `scripts/prepare-digest.js:30` | `FEED_PODCASTS_URL` | ⏸ **推迟**（同上） |

### 建议修改 — 文档级（不阻塞 CI，但属于「接管」的一部分）

| 文件:行 | 内容 | 影响 |
|---|---|---|
| `prompts/digest-intro.md:58` | digest 页脚里的上游 GitHub URL | 会出现在每份 digest 的输出中 |
| `README.md:93, 99` | `git clone https://github.com/zarazhangrui/follow-builders.git ...` | 照 README 操作会装成上游仓库 |
| `README.zh-CN.md:86, 92` | 同上 | 同上 |
| `SKILL.md:420` | `open an issue at https://github.com/zarazhangrui/follow-builders.` | 纯 issue 链接（**该行不含任何 `~/.follow-builders` 或品牌内容**，见本节日末说明） |

### **MUST NOT change（改了就损坏源列表）**

| 文件:行 | 原因 |
|---|---|
| `config/default-sources.json:70` | 这里的 `zarazhangrui` 是**被追踪的 X 账号（一个真人）**，不是仓库引用 |
| `README.md:79` | 同上，是 X 账号 |
| `README.zh-CN.md:72` | 同上，是 X 账号 |

> **陷阱警告**：一次天真的全局 find-and-replace（`zarazhangrui/follow-builders` → `yueyueshine/agent-technology-radar`，
> 或更宽的 `zarazhangrui` → 新名）会**污染 `config/default-sources.json:70` 等源清单**，
> 导致追踪的 X 账号被改坏。**必须逐行、按语义判断，不得使用批量替换。**

### Defer（身份 / 品牌，本阶段不改）

| 范围 | 说明 |
|---|---|
| `SKILL.md:2` | skill 名称 `follow-builders`（品牌，不阻塞数据链路） |
| `SKILL.md` 中使用 `~/.follow-builders` 的行：`38, 132, 133, 170, 313, 437, 441, 442, 445, 450` | 不改目录名（破坏性变更、零收益） |
| `scripts/prepare-digest.js:26` | `USER_DIR = ~/.follow-builders` |
| `scripts/deliver.js:31` | `~/.follow-builders` 本地路径 |
| `scripts/package.json:2` | 包名 |
| `config/config-schema.json:3` | 品牌元数据 |
| `README.md` / `README.zh-CN.md` 的其余品牌性文案 | 非数据链路必需 |

> **关于 `SKILL.md:420` 的归类说明**：该行实际内容为
> `open an issue at https://github.com/zarazhangrui/follow-builders."`，
> 是**单一的 issue URL**，不含 `~/.follow-builders` 路径，也不含 skill 名称。
> 因此归类为**文档级修改项**（见上表），不存在「同属两个清单、需要拆分」的情况。

---

## 6. Fallback / 中止策略（key 不可得时）

存在现实风险：`X_BEARER_TOKEN` 通常需要 X 的付费读取 tier；`POD2TXT_API_KEY` 由第三方服务发放，
可能不对外发 key。因此按 key 可得性**分阶段**推进，并把「能否重指向」与「哪条链路可自产」绑定：

| 可用 key | 可验证内容 | 触发模式 | 对 URL 重指向的约束 |
|---|---|---|---|
| 无 | **CI 机制**：workflow 注册、run 成功、写权限、回写提交 | `blogs-only` | **不得**重指向 `FEED_X_URL` / `FEED_PODCASTS_URL`；`PROMPTS_BASE` 与 `FEED_BLOGS_URL` 可重指向（无 key 依赖） |
| 仅 `X_BEARER_TOKEN` | X 链路自产（`feed-x.json` 新鲜） | `tweets-only` | 仅可重指向 `FEED_X_URL` |
| 仅 `POD2TXT_API_KEY` | podcast 链路自产 | `podcasts-only` | 仅可重指向 `FEED_PODCASTS_URL` |
| 两者 | 全量自产 | `all` | 可完整重指向 |

**中止 / 回滚**：

- 若两个 key 都拿不到：**停止动作 D 中涉及 X / podcast 的部分**，保留 `prepare-digest.js` 对上游的相应引用。
  现状是「能跑、但在读上游数据」——这是**安全态**；重指向到无 CI 的自有仓库才是**退化态**。
- 回滚机制：D / E 若已合入但后续发现 CI 失效，`git revert` 相应 commit（或直接不合入该 branch）即可回到安全态。
  **由于 URL 改动集中在 4 行常量 + 少量文档行，回滚成本极低。**
- **部分 key 的处置（需 owner 决策，见 §9）**：若只有部分 key，需决定是
  - (i) **混合来源**：可自产的路重指向自有仓库，缺 key 的路保留上游 fallback；或
  - (ii) **接受该路暂时冻结**并记录为已知缺口。

  **在 owner 决策前，默认一律不重指向缺 key 的路。**

---

## 7. 验证（Verification）

### 7.1 CI 侧 — Gate G1（触发后立即检查）

| 观察对象 | 成功信号 |
|---|---|
| Actions run 状态 | 该次 run 为 success；`gh run list --limit 5` 显示成功 |
| fork main 提交历史 | 出现新的 `github-actions[bot]` 提交，message `chore: update feeds [skip ci]` |
| 目标 feed 文件 | 触发前后对比 `raw.../feed-*.json`，内容或最后提交时间前进 |
| 权限 | 回写提交能产生，即证明 `contents: write` 生效 |

### 7.2 消费端侧（动作 D 合入后）

必须能证明消费端**读的是自有仓库**，而不是仍读上游：

| 观察对象 | 成功信号 |
|---|---|
| 解析出的 URL | 运行 `prepare-digest.js` 后，其引用的 feed 地址为 `raw.githubusercontent.com/yueyueshine/agent-technology-radar/...` |
| 内容来源一致性 | 从自有 raw feed 取「最新一条」，确认其**出现在生成的 digest prompt 中**；同时确认该条在上游 feed 中不存在或更旧 → 证明确实读了自有数据 |
| 时间新鲜度 | 自有 feed 最新条目时间戳晚于接管动作（不再冻结在 `2026-09-21`） |
| 无回退 | 若某条链路无 key，确认其**没有被重指向**（按 §6 约束） |

### 7.3 定时（延后观察）

- 启用后，确认次日 **06:17 UTC** 的 cron 触发出现新 run（fork 的 scheduled workflow 可能默认被禁用，需留意）。
- 若 cron 未如期触发，用 `workflow_dispatch` 兜底，并把它作为 Open Question 跟进。

---

## 8. Phase 0 Exit Criteria（Checklist）

**完成定义：「仓库与安全链路接管完成」**，不是「全部数据源完全独立」。

- [x] fork 上 `generate-feed.yml` 已注册且启用（`actions/workflows total_count` 由 0 → 1，state `active`）
- [x] 至少一次 workflow run 成功（Gate G1 第 1 条，2026-09-23 `blogs-only`）
- [x] fork main 出现 `github-actions[bot]` 的 `chore: update feeds [skip ci]` 回写提交（Gate G1 第 2 条，`d50ebfe`）
- [x] `contents: write` 实测有效，仓库默认 `read` 不构成阻碍（Gate G1 第 4 条）
- [x] `FEED_BLOGS_URL`(31) 与 `PROMPTS_BASE`(33) 指向自有仓库
- [x] `config/default-sources.json:70`、`README.md:79`、`README.zh-CN.md:72` 三处 X 账号**未被改动**（陷阱校验）
- [x] X / podcast 两条 feed 按临时上游依赖约定保持读上游，**未为形式上的独立而破坏数据链路**
- [ ] 文档引用已按 §5「建议修改（文档级）」项逐行修正（Step 7）
- [ ] 消费端验证通过：prompts 与 blog feed 确实来自自有仓库（§7.2）
- [ ] CI 定时运行已确认（观察次日 06:17 UTC，Step 8）

**不再作为 Phase 0 退出条件**（已降级为后续阶段事项）：
`X_BEARER_TOKEN` / `POD2TXT_API_KEY` 的配置、X / podcast 两条 feed 的接管。

---

## 9. Risks / Open Questions

| 级别 | 风险 / 问题 | 说明与处置 |
|---|---|---|
| ✅ 已解除 | workflow 写权限（read vs write） | 实测 `contents: write` 生效——回写提交 `d50ebfe` 已产生。仓库默认 `read` **不构成阻碍，无需改设置** |
| ✅ 已决策 | `X_BEARER_TOKEN` / `POD2TXT_API_KEY` 是否获取 | owner 决定**暂不注册**、暂不查价，不让它阻塞主线。X / podcast 按临时上游依赖继续读上游 |
| ⚠️ 预期内 | cron 每日失败 | 每日 06:17 UTC 的 `all` 模式 run 因缺 secrets 会 `exit(1)`。**无害**（抓取前退出，不写数据），会在 Actions 留红色记录。Phase 1/2 处理 key 后消失 |
| ⏳ 待观察 | fork 的 scheduled workflow 是否真按时触发 | 已显式 enable 到 `active`；仍需观察次日 06:17 UTC。若未触发，用 `workflow_dispatch` 兜底 |
| 开放问题 | 临时上游依赖的移除时机 | 约定在 Phase 1 / Phase 2 建立 Source Registry 与 Signal Feed 后移除（见 §0） |
| 已知（已更正） | blog 链路**并非已死** | Step 4 推翻了原判断：它能触发，只是很少。本阶段不修其逻辑 |
| 已知（新发现，→ Phase 2） | 去重状态 7 天 TTL 导致内容可能复现 | `state-feed.json` 条目 7 天后被裁剪，旧内容可能被重新抓取再次发出。与 Phase 2 的「去重不产生重复 id」直接相关 |

---

## 10. 明确不在 Phase 0 范围内（防止未来 session 漂移）

- ❌ Source Registry 改造（→ Phase 1）
- ❌ blog 链路修复 / 重建（已知已死，Phase 0 不碰；仅把它的 URL 重指向自有仓库，不改其逻辑）
- ❌ 任何 UI
- ❌ 复杂评分 / 权重算法（→ Phase 3 / 4）
- ❌ 与接管无关的重构（如清理未被引用的 `proper-lockfile` 死依赖）
- ❌ 重命名 `~/.follow-builders` 目录（破坏性、零收益）
- ❌ 品牌 / 文档改名（`SKILL.md:2` 名称、`package.json:2` 包名、`config-schema.json:3` 描述等），除 §5 列明者外
- ❌ Jev 接入（暂停，不阻塞主线）
- ❌ 飞书投递实现（→ Phase 6）；`deliver.js` 的 telegram / Resend 逻辑不改，其 key 位于用户本地 `~/.follow-builders/.env`，与 CI 无关
