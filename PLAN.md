# Agent Technology Radar — 项目总路线图

> 本文件是全局路线图。每个阶段的详细实施方案放在 `.claude/plans/<phase>.plan.md`，
> 目前存在 `phase-0-takeover.plan.md`（Done）、`phase-1a-registry-foundation.plan.md`（Done）、
> `phase-1b-radar-source-set.plan.md`（Done）、与 `phase-2-signal-feed.plan.md`（方案待裁决）。
> 任何新 session 从这里开始。

---

## 0. 快速上手（给新 Claude Code Session）

| 项 | 内容 |
|---|---|
| 项目目标 | 把一个 `zarazhangrui/follow-builders` 的公开 fork 改造为自有的 **Agent Technology Radar**，追踪 AI Agent 技术生态，最终经**飞书**投递 |
| 当前位置 | Phase 0 / 1A / **1B 全部 Done**；Phase 2–6 Not Started |
| 下一步 | **Phase 2 实施**（方案已定稿，D1/D2/D3 均已裁决）：按 **2A → 2B → 2C** 顺序推进。2A 批次 1 只做 `rss` / `github` / `api` / `web`（31 源）；`x` / `podcast` 缺 Key 保持 blocked。**Phase 2 完成后预期 runnable 33 / 69** |
| 交付渠道（终态） | 飞书；第一版用 **Group Bot Webhook** |
| 仓库 | `yueyueshine/agent-technology-radar`（public fork of `zarazhangrui/follow-builders`） |
| 状态词表 | `Not Started` / `In Progress` / `Blocked` / `Done` |

**全局硬约束（所有阶段都受约束）**

1. **先接管，再扩展。** Phase 0 只做仓库接管，不引入任何新功能。
2. **先稳住数据链路，再做智能判断。** Radar / 聚类之前，Signal 必须已经稳定、可追溯。
3. **Signal 必须来源可追溯。** 每条 signal 可回溯到 source registry 条目与原始 URL。
4. **Radar ≠ 新闻摘要。** Radar 表达技术判断，不是事件罗列。
5. **不因创始人做过 Eval 就提高 Eval 权重。** 所有主题按「当前 Agent 技术生态中的实际活跃度与影响力」处理；该规则体现在 Phase 3/4 的 scope 内，不单独造 eval 相关 phase。

### Temporary upstream dependency（临时上游依赖）

| feed / 资源 | 当前来源 | 原因 | 移除时机 |
|---|---|---|---|
| X (`feed-x.json`) | ❗ **`zarazhangrui/follow-builders`（上游）** | fork 无 `X_BEARER_TOKEN`（X 读取需付费档，暂不注册） | Phase 1 / Phase 2 建立自有 Source Registry 与 Signal Feed 后 |
| Podcast (`feed-podcasts.json`) | ❗ **`zarazhangrui/follow-builders`（上游）** | fork 无 `POD2TXT_API_KEY`（第三方服务，暂不依赖） | 同上 |
| Blog (`feed-blogs.json`) | ✅ 自有仓库 | — | — |
| Prompts (`prompts/*.md`) | ✅ 自有仓库 | — | — |

> **Phase 0 的完成定义是「仓库与安全链路接管完成」，不是「全部数据源完全独立」。**
> 为避免「为了形式上的独立而弄坏数据链路」，X / podcast 两条 feed 在拿到可用 key 之前**保持读上游**。
> 代码中已就地标注该临时依赖（见 `scripts/prepare-digest.js` 常量区注释）。

---

## 1. 目标链路

```
Sources → Fetch → Normalize → Deduplicate → Signal Feed
        → Topic Clustering → Technology Radar
        → Daily/Weekly Digest → Feishu
```

阶段与链路阶段的对应关系（非 1:1）：

| 链路阶段 | 承载 Phase |
|---|---|
| Sources / Fetch | Phase 0（打通现有链路）、Phase 1A（Registry Foundation）、Phase 1B（Radar Source Set） |
| Normalize / Deduplicate / Signal Feed | Phase 2 |
| Topic Clustering | Phase 3 |
| Technology Radar | Phase 4 |
| Daily/Weekly Digest | Phase 5 |
| Feishu | Phase 6 |

---

## 2. 阶段总览

| Phase | 名称 | 状态 |
|---|---|---|
| Phase 0 | 接管现有 follow-builders | **Done**（含 Known Limitations，见该阶段） |
| Phase 1A | Registry Foundation | **Done** |
| Phase 1B | Radar Source Set | **Done** |
| Phase 2 | Signal Feed | In Progress（2A / 2B / 2C 待实施） |
| Phase 3 | Topic Clustering | Not Started |
| Phase 4 | Technology Radar | Not Started |
| Phase 5 | Daily / Weekly Digest | Not Started |
| Phase 6 | Feishu Delivery | Not Started |

阶段边界总原则：每个 phase 都必须能独立交付；后一阶段不依赖前一阶段「全部打磨完毕」，
只依赖其 Exit Criteria 达成。

---

## 3. 各阶段详情

### Phase 0 — 接管现有 follow-builders

- **Goal**：让 fork 具备独立运转能力——CI 在 fork 上真实运行并回写数据；消费端读取 fork 自身的 prompts 与 blog feed。**本阶段不追求「全部数据源完全独立」**，X / podcast 两条 feed 按临时上游依赖约定保留（见 §0）。
- **Scope**：启用 fork 的 `generate-feed.yml`；实证 CI 可独立运行并回写；把消费端中**不依赖 API key** 的引用（`PROMPTS_BASE`、`FEED_BLOGS_URL`）改为自有仓库；修正文档引用。**不含** Source Registry 改造、blog 链路逻辑、UI、评分算法、无关重构、品牌/文档改名，**也不含** X / podcast 两条 feed 的接管（缺 key，推迟到 Phase 1/2）。
- **Deliverables**：fork Actions 上 `generate-feed.yml` state=active；至少一次成功 run 并在 fork main 产生 `chore: update feeds [skip ci]` 提交；`scripts/prepare-digest.js` 的 `FEED_BLOGS_URL`(36) 与 `PROMPTS_BASE`(38) 指向自有仓库；文档中的上游引用按清单修正。
- **Dependencies**：无。
- **Exit Criteria**：**「仓库与安全链路接管完成」**——① CI 在 fork 上运行成功且产生回写提交；② 消费端的 prompts 与 blog feed 来自自有仓库；③ X / podcast 两条 feed 按临时上游依赖约定继续读上游，且**这是预期状态、不是缺口**；④ 未为形式上的独立而破坏任何现有数据链路。
- **Risks & Open Questions**：见下方 **Known Limitations**。
- **Status**：**Done**（2026-09-23）

**Known Limitations（Phase 0 结束时明确未解决、且被 owner 接受的事项）**

| # | 限制 | 影响 | 处置 |
|---|---|---|---|
| L1 | **X / podcast 的 runtime validation deferred** | 无 key，无法端到端验证这两条链路在自有仓库下工作 | 相关 Exit Criteria 按「静态等价」口径成立；runtime 验证 defer 到 key 到位 |
| L2 | **临时上游依赖仍然存在** | `prepare-digest.js` 的 `FEED_X_URL`(34) / `FEED_PODCASTS_URL`(35) 仍读 `zarazhangrui/follow-builders` | 按 §0「临时上游依赖」；约定 Phase 2 后移除 |
| L3 | **当前没有 `X_BEARER_TOKEN` / `POD2TXT_API_KEY`** | 仓库 secrets 为 0；每日 cron 的 `all` 模式 run 会在 key 检查处失败（预期内、无害） | owner 已决定暂不注册；不阻塞主线 |
| L4 | **cron 定时触发未经验证**（Step 8） | 无法确认 schedule 在 fork 上真的会触发 | 被动观察；若未触发，用 `workflow_dispatch` 兜底 |

### Phase 1A — Registry Foundation

- **Goal**：建立源注册表的**机制** —— 稳定源身份 `id`、registry schema、registry 驱动 loader、唯一性 fail-fast 校验、`active` 状态管理。**只搭机制 + 无损迁移现有 34 条源，不改变抓取行为。**
- **Scope**：定义 registry schema（`id` / `name` / `active` + 各类型字段）与 `id` 约定；把现有 6 podcast + 26 X + 2 blog 补上 `id` / `active`；改造 `loadSources()` 做规范化 + 唯一性校验 + `active` 过滤。**不含** Source set 的选型与扩充、UI、评分算法、主题判断、blog 链路逻辑、无关重构、品牌改名。
- **Deliverables**：注册化后的 `config/default-sources.json`（34 条带唯一 `id`）；`config/source-registry.schema.json`；改造后的 `loadSources()`；字段与 `id` 规则说明文档。
- **Dependencies**：Phase 0 Done。**执行顺序依赖，非设计约束** —— 先完成仓库与数据链路接管，是为了避免后续迁移出现重复改造。
- **Exit Criteria**：详见 `.claude/plans/phase-1a-registry-foundation.plan.md` §8。核心：34 条源全部带唯一稳定 `id`；新增 / 删除**同类型（含同 blog 域）**源无需改代码；抓取行为无回退 —— **blog 路实跑验证，X / podcast 路仅静态等价（无 key，runtime 验证 defer）**。
- **Risks & Open Questions**：① key 缺位压缩了可验证面（X / podcast 只能静态验证）；② registry 与 `generate-feed.js` 的 URL 子串分发耦合，「新增源无需改代码」仅在同一 blog 域内成立；③ 仓库无测试无 lint，回归靠人肉 Gate。详见 plan §9。
- **Status**：In Progress

### Phase 1B — Radar Source Set

- **Goal**：把源集合真正做成「**Radar 的**源集合」—— 服务于技术雷达判断，而不是沿用 follow-builders 的 builder 名单。
- **Scope**：**① role × channel 两维度建模**（`source_role` = 为什么值得追踪；`source_channel` = 怎么拿到。**二者正交，不得合并成单一 type**）；**② 选源标准与 tier**（Core / Extended / Discovery）；**③ registry 表达升级**（schema v2 扁平化为 `sources[]`）；**④ 第一版 Source Set 登记**。**不含** Signal Feed 设计、新渠道 fetcher 实现。
- **Deliverables**：`.claude/plans/phase-1b-radar-source-set.plan.md`；**registry 已升 schema v2 扁平 `sources[]`（69 条）**；schema 文件重写为 v2；`loadSources()` 读 v2 并按 channel 分组（三个 fetcher 调用点未改）；`SKILL.md` 展示逻辑已适配。
- **Dependencies**：Phase 1A Done。
- **Exit Criteria**：详见 plan §8（**16/16 已达成**）。核心：role/channel 模型定稿；69 条源带完整 `role`/`channel`/`tier`（新 35 条 `active: false`）；`--blogs-only` 无回退；取值全部合法；Eval 相关源未因 owner 背景提权。
- **Risks & Open Questions**：① **新渠道全部无 fetcher**，69 条中今天只有 2 条能抓 —— 交付的是策展结果，不是可用摄取；② 26 个 X 账号中有 **6 条的 role 待 owner 复核**（枚举无「投资人/评论者」档，部分身份我只有弱了解）；③ 可达性验证受本地网络限制，须在 CI 复核；④ **AIHOT 启用 gate 在 Phase 2**。详见 plan §9。
- **Status**：**Done**（2026-09-23）。**未自动进入 Phase 2。**

### Phase 2 — Signal Feed

- **Goal**：把源产出的原始内容归一为**结构化、来源可追溯的 Signal 流**，并给出确定的去重与输出规则。**Fetch 并入本阶段**（不新增 Phase 1C）。
- **Scope**：分三个子阶段 —— **2A Channel Fetchers**（批次 1：`rss` / `github` / `api` / `web`，共 **31 源**；`x` / `podcast` 缺 Key 保持 blocked，**不作为完成条件**）、**2B Signal Pipeline**（Signal Schema / Normalize / 时间统一 / traceability / dedup）、**2C Output**（public + internal-only 分区）。不做主题判断、不做飞书投递。
- **Deliverables**：`.claude/plans/phase-2-signal-feed.plan.md`；4 个新 fetcher；Signal Schema 与归一 / 去重规则；public + internal 双输出；registry 新增 `redistribution` 字段。
- **Dependencies**：Phase 1A / 1B Done。
- **Exit Criteria**：详见 plan §8。核心：4 个 fetcher 产出统一 `items[]`；**`published_at` 只能是 ISO 8601 或 `null`**（blog 路实测）；`id` 用确定性哈希、`source_id` 100% 命中；aggregator 必有可解析 `original_url`；**`DEDUP_TTL_DAYS = 30` 且运行时校验 `TTL ≥ max lookback` fail-fast**；播客重复发出的 bug 已修；internal 源绝不进 public 产物。
- **Risks & Open Questions**：① **已确认 bug：播客因 7 天 TTL < 14 天 lookback 会重复发出**；② AIHOT 有**双重前置**（`api` fetcher + internal 分区），缺一不可；③ 36 条源（x / podcast / 批次 2）本阶段无法端到端验证，验证面集中在 blog + 批次 1；④ registry 第三次结构变更（新增 `redistribution`）。详见 plan §9。
- **Status**：In Progress（2A / 2B / 2C 待实施）。**Phase 2 完成后预期 runnable：33 / 69。**

### Phase 3 — Topic Clustering

- **Goal**：把 signal 归类到主题并给出**主题权重规则**，供 Radar 使用。
- **Scope**：聚类方法（规则 or embedding，暂不定）；**主题权重规则**——所有主题按当前 Agent 技术生态中的实际活跃度与影响力计算，**不因个人历史背景（如做过 Eval）硬编码加权**。不单设 eval 相关 phase。
- **Deliverables**：主题定义、聚类输出、可解释的权重规则说明。
- **Dependencies**：Phase 2。
- **Exit Criteria**：对给定 signal 集产出稳定的主题分组与权重；权重可解释、可复现；无任何主题因个人历史被硬编码提权。
- **Risks & Open Questions**：聚类稳定性与主题漂移；权重公式的主观性；方法选型待定。
- **Status**：Not Started

### Phase 4 — Technology Radar

- **Goal**：把主题映射到 Radar 视图（象限 / 环），表达技术判断而非新闻摘要。
- **Scope**：Radar 模型定义（环 / 象限的具体语义）；主题 → Radar 的映射规则；沿用 Phase 3 权重。不负责内容生成与投递。
- **Deliverables**：Radar 数据结构、映射规则、说明文档。
- **Dependencies**：Phase 3。
- **Exit Criteria**：能从主题产出 Radar 视图；环的归属有明确规则支撑，且不是简单按时间排序（体现「Radar ≠ 新闻摘要」）。
- **Risks & Open Questions**：环 / 象限的具体定义尚未确定；与 Phase 5 digest 的职责边界（判断 vs 呈现）。
- **Status**：Not Started

### Phase 5 — Daily / Weekly Digest

- **Goal**：基于 Signal / Topic / Radar 生成日报与周报内容。
- **Scope**：digest 模板与生成流程；沿用现有 `prompts/` 的思路与结构。**不含**投递渠道实现。
  **分级演进（不强制等 Phase 4 才开始）**：
  - Phase 2 完成 → **Digest v1**（基于 Signal）
  - Phase 3 完成 → 升级为 **Topic-aware Digest**
  - Phase 4 完成 → 升级为 **Radar-aware Digest**
- **Deliverables**：daily / weekly digest 产物与生成流程；带来源链接的内容；按上述三级逐步演进。
- **Dependencies**：**Phase 2 完成即可启动**（产出 Digest v1）；Phase 3 / Phase 4 完成后按分级升级，**不强制等待 Phase 4**。
- **Exit Criteria**：能生成含来源链接的日报 / 周报；内容为经过组织的判断，而非新闻条目堆砌。
- **Risks & Open Questions**：日报与周报的内容密度 / 频率设定；与 Phase 4 的职责重叠。
- **Status**：Not Started

### Phase 6 — Feishu Delivery

- **Goal**：把 digest 投递到飞书；第一版使用 **Group Bot Webhook**。
- **Scope**：Group Bot Webhook 集成；消息格式适配；最小化的失败处理。不做复杂告警体系。
- **Deliverables**：飞书投递流程 / 脚本与配置项。
- **Dependencies**：Phase 5。
- **Exit Criteria**：digest 能成功发送到目标飞书群；链接可点击；失败时有可观测的错误输出。
- **Risks & Open Questions**：Webhook 的频率 / 格式 / 长度限制；群消息的内容敏感度；第一版严控范围。
- **Status**：Not Started

---

## 4. 两层计划产物体系

| 层 | 文件 | 职责 |
|---|---|---|
| 全局路线图 | `PLAN.md`（项目根） | 7 个 phase 的目标、边界、依赖、退出标准、状态；不含实现细节 |
| 单阶段方案 | `.claude/plans/<phase>.plan.md` | 该阶段的逐步可执行方案；目前存在 `phase-0-takeover`（Done）、`phase-1a-registry-foundation`（Done）、`phase-1b-radar-source-set`（Done）、`phase-2-signal-feed`（方案待裁决） |

规则：

- 一个 phase 进入 In Progress 之前，应先生成对应的 `.claude/plans/<phase>.plan.md`。
- `PLAN.md` 只维护「状态」与「边界」，实现细节下沉到 per-phase plan。
- 两者冲突时：phase 边界与状态以 `PLAN.md` 为准，实现细节以 per-phase plan 为准。

---

## 5. 状态词表

| 状态 | 含义 |
|---|---|
| `Not Started` | 未开始 |
| `In Progress` | 进行中 |
| `Blocked` | 因外部依赖 / 未决问题停滞，需记录阻塞项 |
| `Done` | 该 phase 的 Exit Criteria 全部满足 |
