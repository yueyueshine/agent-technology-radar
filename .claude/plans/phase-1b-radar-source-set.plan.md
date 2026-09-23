# Phase 1B — Radar Source Set

> 目标：定义「**哪些源值得长期追踪**」，以及这些源在 registry 中如何表达。
> **完成定义：「Source Set 定型 + Registry 表达升级落地」，不是「所有源都能抓」** —— 新渠道的 fetcher 不在本阶段。
> 前置：Phase 1A Done（`id` / schema / loader 机制已就绪）。

**本阶段交付两件事，不做第三件：**

| | 内容 |
|---|---|
| ✅ 交付 | ① role × channel 两维度模型；② 选源标准与 tier；③ 第一版 Source Set；④ registry 表达升级（schema v2） |
| ❌ 不做 | **Signal Feed 设计**（Normalize / Deduplicate / signal schema → Phase 2） |
| ❌ 不做 | **新渠道 fetcher 实现**（rss / github / hn / arxiv / hf 的抓取代码）—— 新源先以 `active: false` 登记 |

---

## 0. 执行进展（截至 2026-09-23）

| 步骤 | 状态 | 备注 |
|---|---|---|
| Step 0 生成本方案 | ✅ Done | 本文件 |
| Step 1 定稿 role / channel 模型 | ⬜ Not Started | 见 §1；**含一处待 owner 裁决的建模冲突（§1.3）** |
| Step 2 定稿选源标准与 tier | ⬜ Not Started | 见 §2 / §3 |
| Step 3 registry 表达升级（schema v2，扁平化） | ⬜ Not Started | 见 §4 |
| Step 4 迁移现有 34 条 → v2 并分配 role | ⬜ Not Started | 见 §6 |
| Step 5 登记第一版 Source Set（新源 `active: false`） | ⬜ Not Started | 见 §5 / §6 |
| Gate G1-P1B 迁移后现有 3 渠道行为无回退 | ⬜ Not Started | 见 §7 |
| Gate G2-P1B role / channel 取值合法性 | ⬜ Not Started | 见 §7 |

---

## 1. 建模原则：role × channel 是两个正交维度

### 1.1 为什么必须分开

**role 回答「为什么值得追踪」（Radar 语义）；channel 回答「怎么拿到」（抓取实现）。二者正交。**

一旦合并成单一 `type`，会立刻在两处崩掉：

| 场景 | 合并成 `type` 的后果 |
|---|---|
| Karpathy 的 X 与某个 OpenAI 的 GitHub repo | 无法表达「一个是独立研究者、一个是厂商」—— 二者都是「技术源」，但 Radar 语义完全不同 |
| 同一个人既写博客又发 X | 只能选一个 type，另一个维度信息丢失 |
| 给某个渠道换抓取实现（如 blog 从 HTML 抓改成 RSS） | role 被迫跟着变，历史可追溯性断裂 |

**决定性理由：channel 决定写什么代码，role 决定 Radar 怎么解读它。** 前者是工程维度，后者是语义维度，变更节奏完全不同。

### 1.2 取值

**`role`（为什么值得追踪）**

| 取值 | 含义 | 例 |
|---|---|---|
| `official` | 厂商 / 机构的一手发布 | Anthropic Engineering、OpenAI News、`anthropics/claude-code` |
| `builder` | 一线实践者（做产品 / 工程的人） | Karpathy、Simon Willison、swyx |
| `researcher` | 做研究的人（论文 / 方法） | Lilian Weng、Nathan Lambert、Jack Clark |
| `community` | 第三方开源项目 / 社区工程 | `langchain-ai/langchain` |
| `aggregator` | 聚合 / 发现面，非一手 | Hacker News、arXiv 列表、HF Papers |

**`channel`（怎么拿到）**

| 取值 | 含义 | 抓取方式 |
|---|---|---|
| `x` | X / Twitter | 现有 `fetchXContent`（需 `X_BEARER_TOKEN`） |
| `blog` | 站点 HTML 索引 + 域名专用解析器 | 现有 `fetchBlogContent`（零 Key，但解析器按域名硬编码） |
| `podcast` | RSS 发现 + pod2txt 转写 | 现有 `fetchPodcastContent`（需 `POD2TXT_API_KEY`） |
| `rss` | 通用 RSS / Atom 文章源 | **新 fetcher（待建）** |
| `github` | GitHub REST API | **新 fetcher（待建）**，零 Key |
| `hackernews` | HN Algolia API | **新 fetcher（待建）**，零 Key |
| `arxiv` | arXiv Atom API | **新 fetcher（待建）**，零 Key |
| `huggingface` | HF API | **新 fetcher（待建）** |
| `web` | 通用网页抓取 | **新 fetcher（待建）** |

> **现有 3 个 channel（x / blog / podcast）是唯一有 fetcher 的**，其余全部需要新代码。这是本阶段最重要的现实约束（§5 每一条都标注了）。

### 1.3 ⚠️ 待裁决：`github` 不能当 role

你的 role 示例里同时列了 `github`。但按「role = 为什么值得进入 Radar」这个定义，**`github` 回答不了「为什么」—— 它回答的是「从哪拿」，那是 channel。**

同一个 GitHub repo，role 可能是：
- `anthropics/claude-code` → **official**（厂商官方产物）
- `langchain-ai/langchain` → **community**（第三方开源项目）

若把 `github` 当 role，「官方 SDK 仓库」和「社区框架仓库」就没法区分了 —— 而这恰恰是 Radar 最需要区分的。

**我的建议**：role 取值收敛为 `official` / `builder` / `researcher` / `community` / `aggregator`（比你的列表多一个 `community`，用来承接第三方开源项目），`github` 只作 channel。

**若你不同意**，请告诉我你希望 `github` 作为 role 表达什么语义，我按你的定义重写。

---

## 2. Source Selection Criteria

一个源要进入 Radar，**必须同时通过 P1（硬性门槛）**，再按 P2 排序。

### P1 — 硬性门槛（任一不满足即不入选）

| # | 标准 | 判定方式 |
|---|---|---|
| 1 | **可追溯到原始来源** | 每条内容有稳定 URL，且指向**一手发布处**（不是转载页） |
| 2 | **可稳定获取** | 有公开、无需登录的获取端点（RSS / API / 公开页面）；不依赖爬虫对抗 |
| 3 | **与 Agent / LLM 相关** | 主要内容面属于 agent、LLM、工具使用、评测、推理等范畴 |

### P2 — 排序标准（用于分层与取舍）

| # | 标准 | 说明 |
|---|---|---|
| 4 | **一手性 / 权威性** | 原始发布 > 转述。厂商一手 > 二手解读 > 聚合 |
| 5 | **更新活跃度** | 有稳定更新节奏（周更以上为佳）。长期停更则降级或移出 |
| 6 | **信号密度** | 单位内容的信息量。**低产但高密度 > 高产但注水** |
| 7 | **可获取性成本** | 零 Key > 需免费 Key > 需付费 Key。仅用于排序，不用于永久排除（§5） |

### 明确排除（负面清单）

- ❌ 内容农场 / SEO 站 / 无原始链接的转述
- ❌ 纯营销号、以人格化情绪输出为主的账号
- ❌ 无法稳定获取、需要对抗反爬的站点
- ❌ 无法回溯一手来源的聚合内容（可入 Discovery，但**不得**作为事实来源）

### ⚠️ 明确禁止的排序依据

**不得因 owner 有 Eval 背景而对 Eval / benchmark 相关源提权。** 所有源一律按 §2 P2 的活跃度与影响力判据处理；Eval 主题不因其个人背景获得额外权重，也不因其背景被降权。此规则同样适用于 Phase 3 的主题权重。

---

## 3. Source Tier

| Tier | 定义 | 处理 |
|---|---|---|
| **Core** | 必须长期跟踪。缺了 Radar 就不完整 | 每次抓取都覆盖；停更即触发复核 |
| **Extended** | 有价值，但非每日必需 | 可降频抓取；纳入 digest 时优先级低于 Core |
| **Discovery** | **只用于发现线索** | **不得作为最终事实来源**：其产出的线索必须回溯到一手源才能进入 Radar |

> **Discovery 的硬约束**：Discovery 源产出的条目，若无法回溯到一手源，则**不进入 Radar**，只在 digest 中作为「值得看一眼」出现，且必须显式标注其为二手线索。这是 §2 P1-1 在 tier 层的延伸。

> **tier 是人工指派的分类标签，不是评分、不是权重。** 任何加权都是 Phase 3 的决策，本阶段不得引入。

---

## 4. Registry 表达：升级为 schema v2（扁平化）

### 4.1 问题：现有结构把 channel 编码进了「容器」

v1 用三个数组键表达源：`podcasts[]` / `blogs[]` / `x_accounts[]`。**数组键本身就是 channel** —— 这与 §1「channel 应是显式数据」相冲突，且新增 `rss` / `github` / `hackernews` 等渠道时必须不断加新数组键。

1A 已把「扁平化」记为 Open Question 并推迟；**1B 必须处理它，因为 1B 正是要引入跨渠道的 role 语义。**

### 4.2 目标形态

```jsonc
{
  "schemaVersion": 2,
  "sources": [
    {
      "id": "blog:anthropic-engineering",   // 见 §4.3
      "name": "Anthropic Engineering",
      "role": "official",
      "channel": "blog",
      "tier": "core",
      "active": true,
      "indexUrl": "https://www.anthropic.com/engineering"
    },
    {
      "id": "x:karpathy",
      "name": "Andrej Karpathy",
      "role": "builder",
      "channel": "x",
      "tier": "core",
      "active": true,
      "handle": "karpathy"
    },
    {
      "id": "github:modelcontextprotocol-servers",
      "name": "MCP Servers",
      "role": "official",
      "channel": "github",
      "tier": "core",
      "active": false,                       // fetcher 未实现
      "repo": "modelcontextprotocol/servers"
    }
  ]
}
```

- `role` / `channel` / `tier` 为**必填**；`active` 必填。
- 渠道专属字段（`handle` / `rssUrl` / `repo` / `query` …）按 `channel` 决定。
- **扁平化的收益**：加源 = 改数据。加渠道 = 加一个 fetcher + 一条分发分支，**不再加数组键**。

### 4.3 `id` 前缀：保持 channel 前缀不变

**1A 已发布的 id 不可改**（`x:karpathy`、`podcast:latent-space`、`blog:claude-blog`）。前缀是 id 这个**不透明字符串**的一部分，不参与类型推断（1A 已如此规定）。

因此：**前缀沿用 channel**（`x:` / `podcast:` / `blog:` / 新增 `rss:` / `github:` / `hackernews:` / `arxiv:` / `huggingface:`）。`role` 是独立字段，不进 id。这样 Karpathy 的 X 与另一个官方 X 账号前缀都是 `x:`，靠 `role` 区分 —— 正是分离两维度的目的。

### 4.4 影响面（必须一并处理，否则留下坏掉的中间态）

| 位置 | 现状 | v2 下的改动 |
|---|---|---|
| `config/default-sources.json` | 三键数组，34 条 | 迁移为扁平 `sources[]`，每条补 `role` / `channel` / `tier` |
| `config/source-registry.schema.json` | 描述 v1 三键结构 | 重写为 v2；`schemaVersion` 升为 `2` |
| `scripts/generate-feed.js` `loadSources()` | 返回 `{podcasts, blogs, x_accounts}` | 改为读 `sources[]`，**内部按 channel 重新分组**后返回同一形状 |
| `scripts/generate-feed.js` 三个调用点 | 读 `sources.podcasts` 等 | **不改**（loader 保持返回形状不变） |
| `SKILL.md:53, 151` | 读取该文件向用户展示源清单 | 需适配扁平结构（纯展示逻辑） |

> **关键设计**：`loadSources()` 对外仍返回 `{podcasts, blogs, x_accounts}` 这一形状，**把扁平化完全吸收在 loader 内部**。这样三个 fetcher 与它们的调用点一行都不用改 —— 与 1A「改动止于 loader」的原则一致。

---

## 5. 第一版 Source Set

**说明**：

- **「实测」列** = 我在本机直接探测的结果。⚠️ **我的网络在国内，若干域名（Meta / Mistral / HuggingFace / Reddit 等）本地不可达，但不代表 CI（GitHub Actions，美国）不可达。** 因此「✅ 实测」可信度高，「000 未实测」**不等于不可用**，须在 CI 上复核。
- **「能抓?」列**指**当前代码**能否抓到，与实测可达性是两件事。

### 5.1 Official（一手源）

| 源 | role | channel | 需 Key? | 当前能抓? | 实测 | tier |
|---|---|---|---|---|---|---|
| Anthropic Engineering | official | blog | 否 | ✅ 已有解析器 | ✅ 200 | **Core** |
| Claude Blog | official | blog | 否 | ✅ 已有解析器 | ✅ 200 | **Core** |
| OpenAI News | official | rss | 否 | ❌ 需 rss fetcher | ✅ 200 | **Core** |
| Google DeepMind Blog | official | rss | 否 | ❌ 需 rss fetcher | ✅ 200 | **Core** |
| Google AI (The Keyword) | official | rss | 否 | ❌ | ✅ 200 | Extended |
| Apple Machine Learning | official | rss | 否 | ❌ | ✅ 200 | Extended |
| NVIDIA Blog | official | rss | 否 | ❌ | ✅ 200 | Extended |
| Meta AI Blog | official | rss | 否 | ❌ | ⚠️ 000 未实测 | Extended |
| Mistral News | official | rss/web | 否 | ❌ | ⚠️ 000 未实测 | Extended |
| Hugging Face Blog | official | rss | 否 | ❌ | ⚠️ 000 未实测 | Extended |

### 5.2 Builder / Researcher

| 源 | role | channel | 需 Key? | 当前能抓? | 实测 | tier |
|---|---|---|---|---|---|---|
| Karpathy 博客 | builder | rss | 否 | ❌ | ✅ 200 | **Core** |
| Simon Willison | builder | rss | 否 | ❌ | ✅ 200 | **Core** |
| Latent Space (swyx) | builder | rss | 否 | ❌ | ✅ 200 | **Core** |
| Lilian Weng | researcher | rss | 否 | ❌ | ✅ 200 | **Core** |
| Interconnects (Nathan Lambert) | researcher | rss | 否 | ❌ | ✅ 200 | **Core** |
| Import AI (Jack Clark) | researcher | rss | 否 | ❌ | ✅ 200 | **Core** |
| Chip Huyen | researcher | rss | 否 | ❌ | ✅ 200 | Extended |
| Sebastian Raschka | researcher | rss | 否 | ❌ | ⚠️ 406（需调 header） | Extended |
| Eugene Yan | researcher | rss | 否 | ❌ | ✅ 200 | Extended |
| Jay Alammar | researcher | rss | 否 | ❌ | ✅ 200 | Extended |
| **现有 26 个 X 账号** | builder / researcher / official（逐个指派） | x | **是** `X_BEARER_TOKEN` | ⭕ 代码已有，缺 Key | 需 Key | 按人分层 |

> X 账号的 role 需逐个指派：`x:claudeai`、`x:googlelabs` 这类机构号 → `official`；`x:karpathy`、`x:swiyx` 等 → `builder` 或 `researcher`。**这是登记工作，不是评分。**

### 5.3 GitHub（信号 = release / 版本发布）

| 源 | role | channel | 需 Key? | 当前能抓? | 实测 | tier |
|---|---|---|---|---|---|---|
| `anthropics/claude-code` | official | github | 否（未认证 60 req/h） | ❌ | ✅ 200 | **Core** |
| `modelcontextprotocol/servers` | official | github | 否 | ❌ | ✅ 200 | **Core** |
| `anthropics/anthropic-sdk-python` | official | github | 否 | ❌ | 未测 | Extended |
| `openai/openai-python` | official | github | 否 | ❌ | ✅ 200 | Extended |
| `microsoft/autogen` | official | github | 否 | ❌ | 未测 | Extended |
| `langchain-ai/langchain` | community | github | 否 | ❌ | 未测 | Extended |
| `run-llama/llama_index` | community | github | 否 | ❌ | 未测 | Extended |

> GitHub 未认证限流 **60 请求/小时**。若仓库数继续增长，需评估是否引入 token（**免费**，非付费 Key）—— 列为 Open Question。
> 信号选择：**release 发布**优先；commit / star 变化信噪比过低，不建议。

### 5.4 Aggregator / Discovery

| 源 | role | channel | 需 Key? | 当前能抓? | 实测 | tier |
|---|---|---|---|---|---|---|
| Hacker News（`points > N` 过滤） | aggregator | hackernews | 否 | ❌ | ✅ 200 | **Discovery** |
| arXiv（cs.AI / cs.CL / cs.LG，按提交日） | aggregator | arxiv | 否 | ❌ | ✅ 200 | **Discovery** |
| Hugging Face Daily Papers | aggregator | huggingface | 否 | ❌ | ⚠️ 000 未实测 | **Discovery** |
| Semantic Scholar | aggregator | web | 否（有速率限制） | ❌ | ⚠️ 429 限流 | Discovery |
| Reddit r/LocalLLaMA | aggregator | reddit | 否 | ❌ | ⚠️ 000 未实测 | Discovery |

> **Discovery 一律受 §3 硬约束**：不得作为最终事实来源。

---

## 6. 无 Key 优先原则

**当前没有 `X_BEARER_TOKEN` / `POD2TXT_API_KEY`**（Phase 0 Known Limitation L3）。第一版 Source Set 的构建顺序据此排序：

| 优先级 | 类别 | 理由 |
|---|---|---|
| **1** | 零 Key 且**已有 fetcher** | 今天就能跑：仅 `blog` 渠道 2 个源 |
| **2** | 零 Key、**需新 fetcher** | RSS / GitHub / HN / arXiv —— **占了第一版候选集的绝大多数** |
| **3** | 需免费 Key | RSS 之外若有（如 GitHub token 提升限流） |
| **4** | 需付费 Key | X、podcast 转写 |

**关键**：

- 由 P2-7「可获取性成本」**只用于排序，不用于永久排除**。X 是高价值 channel，**不因缺 Key 而移出 Source Set** —— 它继续以 `active: true` 保留在 registry 中，待 Key 到位即可工作。
- 但**不得**因「X 应该很重要」而给它的 tier 提权到与实际可获取性不符的程度；tier 只按 §2 P2 判据（一手性 / 活跃度 / 信号密度）判定。

---

## 7. 验证（Verification）

### 7.1 本阶段可完整验证

| 对象 | 成功信号 |
|---|---|
| registry v2 结构 | JSON 合法；每条含 `id` / `name` / `role` / `channel` / `tier` / `active`；`id` 仍全局唯一 |
| role / channel 取值合法 | 全部命中 §1.2 的枚举；无 `github` 出现在 `role` |
| **Gate G1-P1B** 现有渠道无回退 | `--blogs-only` 实跑 `exit 0`，`feed-blogs.json` 结构与条目字段不变（loader 内部扁平化对 fetcher 透明） |
| loader 分组正确 | `loadSources()` 返回的 `{podcasts, blogs, x_accounts}` 与 v1 相比，**条数与字段值一致**（X / podcast 无 Key 走静态核对） |
| 新源登记 | 新渠道源存在且 `active: false`；**不会**被任何 fetcher 消费（无静默半生效） |

### 7.2 只有实施后才能验证（本阶段不做）

- 新渠道 fetcher 的真实抓取结果（rss / github / hn / arxiv / hf）
- 本地 000 的域名在 CI 上是否可达 —— **必须在 GitHub Actions 上复核**，不能以我的本地探测为准

### 7.3 机制性验证

- `node --check scripts/generate-feed.js`
- 非法 `role` / `channel` 值应被 loader 拒绝（fail-fast）—— **属本阶段新增校验**，需与 1A 的 `id` 校验一并实现

---

## 8. Phase 1B Exit Criteria（Checklist）

**完成定义：「Source Set 定型 + Registry 表达升级落地」，不是「所有源都能抓」。**

- [ ] role / channel 两维度模型定稿，§1.3 的 `github` 归属冲突已裁决
- [ ] 选源标准（P1 硬门槛 + P2 排序 + 负面清单）落文档
- [ ] tier 定义落文档，含 Discovery 的「不得作为事实来源」硬约束
- [ ] `config/default-sources.json` 迁移为 schema v2 扁平结构，现有 34 条全部带 `role` / `channel` / `tier`
- [ ] 第一版 Source Set 登记完毕；新渠道源一律 `active: false`
- [ ] `config/source-registry.schema.json` 重写为 v2
- [ ] `loadSources()` 内部完成扁平化吸收，**三个 fetcher 调用点未改**
- [ ] `SKILL.md` 的源清单展示逻辑适配 v2
- [ ] **Gate G1-P1B**：`--blogs-only` 实跑无回退
- [ ] **Gate G2-P1B**：role / channel / tier 取值全部合法；`id` 唯一性保持
- [ ] Eval 相关源**未**因 owner 背景获得提权（需在 Source Set 中可核验）

**不计入本阶段退出条件**：新渠道 fetcher 的实现与真实抓取验证。

---

## 9. Risks / Open Questions

| 级别 | 风险 / 问题 | 说明与处置 |
|---|---|---|
| ⚠️ 高 | **`github` 作为 role 的建模冲突** | 见 §1.3。**需 owner 裁决**，否则 role 枚举无法定稿 |
| ⚠️ 高 | **新渠道全部无 fetcher** | 第一版 Source Set 中**只有 2 个源今天能抓**（Anthropic / Claude Blog）。其余登记为 `active: false`。**本阶段交付的是策展结果，不是可用摄取** —— 不得表述为「源集合已就绪」 |
| ⚠️ 中 | **可达性验证受我的网络限制** | Meta / Mistral / HF / Reddit 本地 000。**必须在 CI 上复核**；不得据本地结果把它们判定为不可用 |
| ⚠️ 中 | 扁平化触及 `SKILL.md` 展示逻辑 | `SKILL.md:53,151` 读三键结构；v2 需适配。无测试兜底 |
| ⚠️ 中 | 迁移破坏 `id` 唯一性 / 现有值 | 处置：迁移脚本化（同 1A），并对现有 34 条做逐字段静态等价核对 |
| 开放问题 | X 账号的 role 逐个指派 | 26 条需人工分类为 official / builder / researcher。**是登记工作，不是评分** |
| 开放问题 | GitHub 是否引入免费 token | 未认证 60 req/h；仓库数增长后可能需 token（免费）。届时再定 |
| 开放问题 | `tier` 是否进 registry | 本方案建议进（它是「哪些源值得长期追踪」的答案）。**但须明确：tier 不是权重**，加权是 Phase 3 的决策 |
| 开放问题 | 一个人多渠道的身份归并 | 现方案 = 一条 registry 条目对应一个 (role, channel) 抓取目标；Karpathy 的 X 与其博客是两条条目。是否需要「人物」聚合层留待 Phase 3 |
| 已知 | Eval 提权风险 | §2 已明令禁止；Exit Criteria 含可核验项 |
| 已知 | Discovery 污染事实来源 | §3 硬约束；Phase 2 需在 signal schema 中体现该约束（**本阶段不做**） |

---

## 10. 明确不在 Phase 1B 范围内（防止未来 session 漂移）

- ❌ **Signal Feed 设计**（Normalize / Deduplicate / signal schema / `source_id` 的写入规则）→ **Phase 2**
- ❌ **新渠道 fetcher 实现**（rss / github / hackernews / arxiv / huggingface / web 的抓取代码）
- ❌ 主题判断 / 聚类 / 权重 / 评分 / tier 加权 → Phase 3、Phase 4
- ❌ 把 `tier` 用作权重或打分
- ❌ UI
- ❌ Blog 链路的抓取 / 解析逻辑改动（仅允许在 registry 中表达；3 个未使用字段的清理见 1A §2.3，推迟）
- ❌ 无关重构（清理 `proper-lockfile`、拆分 `generate-feed.js`、引入 exports）
- ❌ 重命名 `~/.follow-builders` 目录；品牌改名
- ❌ X / podcast 两条 feed 的接管与临时上游依赖移除（仍缺 Key，依赖携带至 Phase 2）
- ❌ 飞书投递 → Phase 6
