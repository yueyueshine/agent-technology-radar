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
| Step 1 定稿 role / channel 模型 | ✅ Done | 见 §1.3 / §1.4 / §1.5（owner 已确认） |
| Step 2 定稿选源标准与 tier | ✅ Done | 见 §2 / §3；tier 定义已修订 |
| Step 3 registry 表达升级（schema v2，扁平化） | ⬜ Not Started | 见 §4；owner 已接受 v2，**loader 须保持三 fetcher 兼容接口** |
| Step 4 迁移现有 34 条 → v2 并分配 role | ⬜ Not Started | 见 §6 |
| Step 5 登记第一版 Source Set（新源 `active: false`） | ⬜ Not Started | 见 §5 / §6 |
| Gate G1-P1B 迁移后现有 3 渠道行为无回退 | ⬜ Not Started | 见 §7 |
| Gate G2-P1B role / channel 取值合法性 | ⬜ Not Started | 见 §7 |

### 0.1 决策记录（owner 已确认，2026-09-23）

| # | 决定 | 落点 |
|---|---|---|
| 1 | **`github` 是 channel，不是 role** | §1.3 |
| 2 | **role 接受 `community`；第一版枚举冻结为 5 值**，暂不扩建 | §1.4 |
| 3 | **AIHOT**：`aggregator` / `api` / `Extended` / `active: false`；使用策略 (a) 仅个人自用 | §5.4.2 |
| 4 | **tier 进 registry**，性质 = 人工 attention classification，**非评分非权重** | §1.5 |
| 5 | **接受 schema v2 扁平化**，但 **loader 保持三 fetcher 兼容接口**，1B 不重写抓取逻辑 | §4.4 |
| 6 | **新增 Core 源**：OpenAI Codex / Qwen Code / Cursor Changelog / Google coding-agent / GitHub Copilot Changelog | §5.1 / §5.3 |
| 7 | **`openai/openai-python` 与 `anthropics/anthropic-sdk-python` 移出** —— 本项目不是通用 LLM SDK Radar | §5.3-C |
| 8 | **AIHOT 启用 gate 在 Phase 2**（需 private / internal-only 输出路径）；不转私有仓库、不申请商业授权 | §5.4.2 |

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
| `api` | 通用 JSON API（结构化字段，如原文链接 / 发布时间） | **新 fetcher（待建）**，零 Key |
| `web` | 通用网页抓取 | **新 fetcher（待建）** |

> **现有 3 个 channel（x / blog / podcast）是唯一有 fetcher 的**，其余全部需要新代码。这是本阶段最重要的现实约束（§5 每一条都标注了）。

### 1.3 已裁决：`github` 是 channel，不是 role

**裁决（owner 确认）：`github` 归 channel，role 中不出现 `github`。**

理由（保留记录，避免未来重提）：role 回答「为什么值得追踪」，`github` 回答「从哪拿」。同一个 GitHub repo，role 可能是 `official`（如 `anthropics/claude-code`）或 `community`（如 `langchain-ai/langchain`）—— 若把 `github` 当 role，这两者无法区分，而这恰是 Radar 最需要区分的。

### 1.4 role 枚举冻结（第一版）

**第一版 role 固定为 5 个值，不再扩充：**

| `official` | `builder` | `researcher` | `community` | `aggregator` |
|---|---|---|---|---|

新增枚举须有明确理由并记录在 phase plan 中 —— 防止枚举随源数量增长而无限膨胀、丧失分类意义。

### 1.5 tier 的性质（owner 确认）

`tier` **进入 registry**，但它的语义被严格限定为：

> **人工指派（human-assigned）的 attention classification** —— 回答「给多少注意力」。

**它不是评分，不是权重，不参与任何计算。** 具体地：

- 不得把 `tier` 换算成分数或系数
- 不得用 `tier` 做排序打分
- Radar 的权重与动态判断**留到 Phase 3 / Phase 4**

这条限制写进 §8 的 Exit Criteria，可核验。

---

## 2. Source Selection Criteria

一个源要进入 Radar，**必须同时通过 P1（硬性门槛）**，再按 P2 排序。

### P1 — 硬性门槛（任一不满足即不入选）

| # | 标准 | 判定方式 |
|---|---|---|
| 1 | **可追溯到原始来源** | 每条内容有稳定 URL，且指向**一手发布处**（不是转载页、不是聚合站站内页）。聚合类源必须能**提供或可解析出 `original_url`**，否则不满足本条 |
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
| **Discovery** | **只用于发现线索** | 只作为线索呈现；不单独支撑 Radar 判断 |

> **重要澄清（1B 修订）：可追溯性约束来自 `role`，不是来自 `tier`。**
>
> 早期草案把「不得作为最终事实来源」挂在 Discovery tier 上 —— 这是**不准确的建模**。真正的判据是
> **内容的 role 是否为 `aggregator`**：凡「非一手发布」的源（**任何 tier**），其条目**必须回溯到
> 一手来源**（`original_url` / 原始发布链接）才可进入 Radar；回溯不到的，只能作为线索出现并显式标注为二手。
>
> 这样两个维度各司其职：`tier` 只回答「**给多少注意力**」，`role` 回答「**内容能不能直接当事实**」。
> 因此 `role=aggregator` + `tier=extended` 的源（如 AIHOT）是**合法组合**：它值得常规关注，
> 但它的内容永远不是事实来源。

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

> **关键设计（owner 确认）**：`loadSources()` 对外仍返回 `{podcasts, blogs, x_accounts}` 这一形状，**把扁平化完全吸收在 loader 内部**。三个 fetcher 与它们的调用点**一行都不改**。
>
> **1B 明确不重写抓取逻辑** —— 扁平化只改「源怎么存」与「loader 怎么读」，不改「怎么抓」。与 1A「改动止于 loader」的原则一致。

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

**补充：Agent / 编程工具产品线的官方 changelog（owner 指定，Core）**

| 源 | role | channel | 端点 | 需 Key? | 当前能抓? | 实测 | tier |
|---|---|---|---|---|---|---|---|
| **Cursor Changelog** | official | **web** | `https://cursor.com/changelog` | 否 | ❌ 需 web fetcher | ✅ 200（HTML，**无 RSS** —— `/changelog/feed.xml` 实测 404） | **Core** |
| **GitHub Copilot Changelog** | official | **rss** | `https://github.blog/changelog/label/copilot/feed/` | 否 | ❌ 需 rss fetcher | ✅ 200 | **Core** |

> `blog/changelog` 还有一个全量 feed `https://github.blog/changelog/feed/`（实测 200）。此处只登记 **Copilot 标签**的 feed，以贴合「Agent 产品线」定位；若后续需要 GitHub 平台级动态，再另立条目。

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

> **选取原则（owner 明确）：本项目是 Agent Technology Radar，不是通用 LLM SDK Radar。**
> GitHub 条目一律以 **agent / coding-agent** 为准入判据。通用 LLM SDK 仓库**无论厂商多权威都不入选** —— 它们不承载 agent 技术的演进。

**A. Coding agent（一手、官方）**

| 源 | role | channel | 需 Key? | 当前能抓? | 实测 | 最新 release | tier |
|---|---|---|---|---|---|---|---|
| `anthropics/claude-code` | official | github | 否（未认证 60 req/h） | ❌ | ✅ 200 | — | **Core** |
| `openai/codex` | official | github | 否 | ❌ | ✅ 200 | `rust-v0.156.1` @ 2026-09-23 | **Core** |
| `QwenLM/qwen-code` | official | github | 否 | ❌ | ✅ 200 | `v0.24.5-preview.0` @ 2026-09-22 | **Core** |
| `google-gemini/gemini-cli` | official | github | 否 | ❌ | ✅ 200 | `v0.62.0-nightly.*` @ 2026-09-23 | **Core** |

**B. Agent 协议 / 框架**

| 源 | role | channel | 需 Key? | 当前能抓? | 实测 | tier |
|---|---|---|---|---|---|---|
| `modelcontextprotocol/servers` | official | github | 否 | ❌ | ✅ 200 | **Core** |
| `google/adk-python` | official | github | 否 | ❌ | ✅ 200 | Extended ⚠️ |
| `microsoft/autogen` | official | github | 否 | ❌ | 未测 | Extended |
| `langchain-ai/langchain` | **community** | github | 否 | ❌ | 未测 | Extended |
| `run-llama/llama_index` | **community** | github | 否 | ❌ | 未测 | Extended |

> ⚠️ `google/adk-python`（Google Agent Development Kit）是 Google 一手 agent 框架。此处按「框架 = Extended」处理；若你认为它与 coding agent 同属 Core，告知即可上调。

**C. 已移除（及原因）**

| 移除项 | 原因 |
|---|---|
| `openai/openai-python` | **通用 LLM SDK**，非 agent 技术。owner 明确：它不应替代 `openai/codex` |
| `anthropics/anthropic-sdk-python` | 同上 —— 通用 SDK，不承载 agent 演进 |

**D. github channel 的实现注意（供后续 fetcher 设计，本阶段不做）**

- **release 噪音**：`gemini-cli` 每日发 nightly、`qwen-code` 发 `preview`、`openai/codex` 用 `rust-v*` 前缀 —— 不做过滤会让 feed 被 nightly 淹没。fetcher 需支持按 tag 模式 / `prerelease` 标志过滤。
- **限流**：未认证 **60 请求/小时**。当前 6 个仓库每次约 6 次请求，安全；仓库数继续增长时需评估引入 **免费** token（非付费 Key）—— 列为 Open Question。
- **信号选择**：**release 发布**优先；commit / star 变化信噪比过低，不建议。

### 5.4 Aggregator / Discovery

| 源 | role | channel | 需 Key? | 当前能抓? | 实测 | tier |
|---|---|---|---|---|---|---|
| **AIHOT** | aggregator | **api**（备选 rss） | 否 | ❌ 需新 fetcher | ✅ 200 | **Extended** |
| Hacker News（`points > N` 过滤） | aggregator | hackernews | 否 | ❌ | ✅ 200 | **Discovery** |
| arXiv（cs.AI / cs.CL / cs.LG，按提交日） | aggregator | arxiv | 否 | ❌ | ✅ 200 | **Discovery** |
| Hugging Face Daily Papers | aggregator | huggingface | 否 | ❌ | ⚠️ 000 未实测 | **Discovery** |
| Semantic Scholar | aggregator | web | 否（有速率限制） | ❌ | ⚠️ 429 限流 | Discovery |
| Reddit r/LocalLLaMA | aggregator | reddit | 否 | ❌ | ⚠️ 000 未实测 | Discovery |

> 以上全部 `role=aggregator` → 一律受 §3 的可追溯性约束：**其内容永远不是事实来源**，
> 进入 Radar 前必须回溯到一手源。

#### 5.4.1 AIHOT 端点清单（逐个实测 200，零 Key、匿名只读）

权威来源：`https://aihot.news/llms.txt`，OpenAPI：`https://aihot.news/openapi-v1.json`。

| 端点 | 用途 | 实测 |
|---|---|---|
| `https://aihot.news/api/v1/items` | 最近资讯 JSON。支持 `mode=selected/all`、`window=24h/7d`、`by=timeline/published`、`category`、`q`、`limit`、`cursor` | ✅ 200 |
| `https://aihot.news/api/v1/hot-topics` | 热点榜 Top 10；每条含从 1 起的 `rank` 与 `links.story` | ✅ 200 |
| `https://aihot.news/api/v1/stories/{publicId}` | 事件时间线 + AI 综述 | 未单测 |
| `https://aihot.news/api/v1/dailies/latest`、`/dailies` | 日报（每日 08:00 北京时间发布） | ✅ 200 |
| `https://aihot.news/api/v1/selected/snapshot`、`/selected/changes` | 精选全量快照 / cursor 驱动增量 | 未单测 |
| `https://aihot.news/feed.xml` | 精选摘要 RSS（最新 50 条） | ✅ 200 |
| `https://aihot.news/feed/daily.xml` | 日报 RSS（保留 30 期） | ✅ 200 |
| `https://aihot.news/feed/category/{slug}.xml` | 分类 RSS：`ai-models` / `ai-products` / `industry` / `paper` / `tip` | ✅ 200 |
| `https://aihot.news/api/mcp` | MCP server（5 个只读工具） | — |

**为什么推荐 `channel=api` 而不是 `rss`**（brief 里写的是「rss 或 api」，以下是我的判断）：

| | RSS | API |
|---|---|---|
| **原文 URL** | ❌ `<link>` 指向 **AIHOT 站内页**；原文 URL 埋在 `<description>` 的 HTML 里（`<a>阅读原文</a>`），需二次解析 | ✅ `links.original` 为**结构化字段** |
| 时间字段 | 只有 `pubDate` | ✅ `publishedAt`（原文发布）与 `discoveredAt`（AIHOT 收录）**分开** |
| 增量抓取 | 每次重读 50 条自行比对 | ✅ `cursor` + `selected/changes` + `ETag`/304 |
| 成本 | 可复用计划中的 `rss` fetcher | 需新增 `api` fetcher |

**决定性理由**：「**Signal 必须来源可追溯**」是本项目的硬原则。RSS 路线下原文链接要从中文锚文本里从 HTML 抠出来；API 直接给结构化字段。**在唯一一个以「可追溯」为核心诉求的源上省一个 fetcher，不划算。**

**RSS 仍为备选**：若你倾向控制 channel 数量，可降级为 `channel=rss`，代价是原文 URL 需从 description 解析。**这个取舍请你定。**

**tier 建议 = Extended**（你 brief 默认给的是 Discovery）。理由：AIHOT 不止是原始聚合 —— 它有 LLM 打分精选、日报，以及**热点榜要求「多个独立信源共同印证」**的多源佐证机制，比纯聚合高一档。而按 §3 的修订，它的 `role=aggregator` 已保证内容**永不作为事实来源**，所以放进 Extended 不会污染事实层。

**抓取注意**：响应 `Cache-Control` 的 `s-maxage=60` 为最小轮询间隔；必须带 `If-None-Match`，未变化返回 304；遇 429 / 503 按 `Retry-After` 等待。旧 `/api/public/*` 接口 2026-12-31 停服，**只用 `/api/v1/*`**。

#### 5.4.2 AIHOT 已定结论（owner 确认）

| 项 | 决定 |
|---|---|
| `role` | `aggregator` |
| `channel` | **`api`** —— API 优先于 RSS：结构化提供 `original_url` 与发布时间，更契合「Signal 来源可追溯」原则 |
| `tier` | **`Extended`** |
| `active` | **`false`** |

**为什么保持 `active: false` —— 一个跨阶段依赖**

owner 选择的使用策略是 **(a) 仅个人自用，不允许 AIHOT 派生数据进入公开 feed**。这与当前生产端架构存在冲突：

- 现有 CI 会把 `feed-*.json` **提交并推送到 public 仓库**（`generate-feed.yml` 的 commit/push 步骤）。
- AIHOT 使用规则禁止「公开镜像 / 批量公开再分发」。若 AIHOT 内容进入被提交的 feed，即可能触线。

**因此 AIHOT 的启用被显式 gate 在 Phase 2 之后：**

| 阶段 | 动作 |
|---|---|
| **Phase 1B（本阶段）** | 只登记，`active: false`。**不修改生产端架构** |
| **Phase 2** | 设计 Signal Feed 时，增加 **private / internal-only 输出路径** —— 使这类源的内容不进入公开 feed |
| Phase 2 之后 | 该路径就绪后，才把 AIHOT 置为 `active: true` |

**明确不做**：现在**不**把仓库转私有，**不**申请商业授权。owner 已裁决。

> ⚠️ 这是一个**跨阶段依赖**，不是本阶段可关闭的开放问题。**Phase 2 的方案必须承接它**，否则 AIHOT 永远无法启用。

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
- [x] **role / channel / tier 全部定稿**（owner 已确认）：role 枚举冻结为 5 值、`github` 归 channel、`tier` 进 registry 且非权重 —— 见 §1.3 / §1.4 / §1.5
- [x] **AIHOT 已定**：`aggregator` / `api` / `Extended` / `active: false` —— 见 §5.4.2
- [ ] AIHOT 的启用条件已登记为 **Phase 2 依赖**（private / internal-only 输出路径），并在 Phase 2 方案中承接
- [ ] `loadSources()` 保持三个 fetcher 的兼容接口 —— **1B 未重写任何抓取逻辑**
- [ ] role / channel 取值校验实现为 fail-fast（含：`github` 出现在 role 应被拒绝）

**不计入本阶段退出条件**：新渠道 fetcher 的实现与真实抓取验证。

---

## 9. Risks / Open Questions

| 级别 | 风险 / 问题 | 说明与处置 |
|---|---|---|
| ✅ **已关闭** | ~~`github` 的 role / channel 归属~~ | 已裁决：**归 channel**，role 中不出现 `github`（§1.3） |
| ⚠️ 高 | **新渠道全部无 fetcher** | 第一版 Source Set 中**只有 2 个源今天能抓**（Anthropic / Claude Blog）。其余登记为 `active: false`。**本阶段交付的是策展结果，不是可用摄取** —— 不得表述为「源集合已就绪」 |
| ⚠️ 中 | **可达性验证受我的网络限制** | Meta / Mistral / HF / Reddit 本地 000。**必须在 CI 上复核**；不得据本地结果把它们判定为不可用 |
| ⚠️ 中 | 扁平化触及 `SKILL.md` 展示逻辑 | `SKILL.md:53,151` 读三键结构；v2 需适配。无测试兜底 |
| ⚠️ 中 | 迁移破坏 `id` 唯一性 / 现有值 | 处置：迁移脚本化（同 1A），并对现有 34 条做逐字段静态等价核对 |
| 开放问题 | X 账号的 role 逐个指派 | 26 条需人工分类为 official / builder / researcher。**是登记工作，不是评分** |
| 开放问题 | GitHub 是否引入免费 token | 未认证 60 req/h；仓库数增长后可能需 token（免费）。届时再定 |
| ✅ **已关闭** | ~~`tier` 是否进 registry~~ | **进 registry**；性质限定为人工 attention classification，**非评分、非权重**（§1.5） |
| 开放问题 | 一个人多渠道的身份归并 | 现方案 = 一条 registry 条目对应一个 (role, channel) 抓取目标；Karpathy 的 X 与其博客是两条条目。是否需要「人物」聚合层留待 Phase 3 |
| 已知 | Eval 提权风险 | §2 已明令禁止；Exit Criteria 含可核验项 |
| 已知 | 聚合内容污染事实层 | §3 已修订：该约束来自 `role=aggregator`，与 tier 无关；Phase 2 需在 signal schema 中体现（**本阶段不做**） |
| ⚠️ **高（法务）→ 跨阶段依赖** | **AIHOT 的启用被 gate 在 Phase 2** | owner 选 (a) 仅个人自用：AIHOT 派生数据**不得进入公开 feed**。而现有 CI 会把 `feed-*.json` 提交到 **public** 仓库，而 AIHOT 条款禁止「公开镜像 / 批量公开再分发」。<br>**处置：AIHOT 保持 `active: false`；启用条件 = Phase 2 提供 private / internal-only 输出路径**（§5.4.2）。**Phase 2 必须承接，否则该源永远无法启用。** 不转私有仓库、不申请商业授权（owner 已裁决） |
| 开放问题 | 其他源的再分发条款 | AIHOT 暴露的是一类**通用风险**：其他聚合类源（HN、arXiv 等）也可能有再分发限制，而生产端会把内容提交到 **public** 仓库。接入每个聚合类源前应核对条款 —— **本阶段不逐个审计** |

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
