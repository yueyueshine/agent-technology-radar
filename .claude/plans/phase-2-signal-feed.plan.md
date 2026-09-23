# Phase 2 — Signal Feed

> 目标：把三个形状各异的 feed 归一为**结构化、来源可追溯的 Signal 流**，并给出确定的去重规则。
> **完成定义：「Normalize + Deduplicate 的规范落地且可验证」，不是「所有源都接进来了」。**
> 前置：Phase 1A / 1B Done（registry 提供 `id` / `role` / `channel` / `tier` + fail-fast loader）。

**本阶段交付与不做：**

| | 内容 |
|---|---|
| ✅ 交付 | ① signal schema；② Normalize 规则（含时间归一）；③ 去重键与去重状态设计；④ 可追溯性强制；⑤ **输出分区**（public / internal-only） |
| ❌ 不做 | 主题判断 / 聚类 / 权重（→ Phase 3、Phase 4） |
| ❌ 不做 | 飞书投递（→ Phase 6） |
| ⚠️ 待裁决 | **新渠道 fetcher 归属**（见 §2）—— 这是本方案能否成立的前提 |

---

## 0. 执行进展（截至 2026-09-23）

| 步骤 | 状态 | 备注 |
|---|---|---|
| Step 0 生成本方案 | ✅ Done | 本文件 |
| **D1 — fetcher 缺口归属** | ⬜ **待 owner 裁决** | 见 §2；**不裁决则 Phase 2 无输入可处理** |
| D2 — signal `id` 形态 | ⬜ 待裁决 | 见 §3.2 |
| D3 — 去重状态保留策略 | ⬜ 待裁决 | 见 §5.2（含一个已确认的 bug） |
| Step 1 定稿 signal schema | ⬜ Not Started | 见 §3 |
| Step 2 定稿 Normalize 规则 | ⬜ Not Started | 见 §4 |
| Step 3 定稿 Deduplicate 规则 | ⬜ Not Started | 见 §5 |
| Step 4 输出分区（public / internal） | ⬜ Not Started | 见 §7；**AIHOT 启用的前置** |
| Step 5 实现 + 验证 | ⬜ Not Started | 见 §9 |

---

## 1. 背景与关键事实（均为实测）

### 1.1 三个 feed 的形状**互不相同**

| feed | 顶层 | 条目字段 | 嵌套 |
|---|---|---|---|
| `feed-x.json` | `generatedAt` / `lookbackHours` / `stats` / `x` | `source` / `name` / `handle` / `bio` / `tweets[]` | **按账号分组，推文嵌在 `tweets[]` 里** |
| `feed-podcasts.json` | `generatedAt` / `lookbackHours` / `stats` / `podcasts` | `source` / `name` / `title` / `guid` / `url` / `publishedAt` / `transcript` | 平铺 |
| `feed-blogs.json` | `generatedAt` / `lookbackHours` / `stats` / `blogs` | `source` / `name` / `title` / `url` / `publishedAt` / `author` / `description` / `content` | 平铺 |

→ Normalize 的第一个动作就是把 X 的**嵌套结构拍平**，三条线产出同一种条目。

### 1.2 时间字段**跨源不一致**（实测）

| 源 | 字段 | 实测值 | 是否 ISO 8601 |
|---|---|---|---|
| X | `createdAt` | `2026-09-21T03:16:49.000Z` | ✅ |
| Podcast | `publishedAt` | `2026-09-10T10:00:00.000Z` | ✅ |
| Blog | `publishedAt` | **`"Aug 26, 2026"`** | ❌ **不是 ISO** |

Blog 的 `publishedAt` 直接透传了来源页面 JSON-LD 里的 `datePublished` 原样字符串。这正是 PLAN.md 里「时间字段跨源解析一致」这条退出标准要解决的问题 —— 它是**真实存在的缺陷，不是假想**。

### 1.3 可追溯性的现状

- **三个 feed 的条目 100% 都有 `url`**（实测：0 条缺失）—— 可追溯的基础是好的。
- 但**没有 `source_id`**：现有条目只有 `source`（`"x"` / `"blog"` / `"podcast"` 这种**通道名**）和 `name`（展示名）。**没有任何字段能把一条内容指回 registry 条目的 `id`。** 这是 Phase 2 必须补的核心缺口。

### 1.4 去重状态现状

`state-feed.json`：`seenTweets`(138) / `seenVideos`(4) / `seenArticles`(3)，每个值是时间戳。

### 1.5 ⚠️ 已确认的 bug：播客内容会重复发出

代码实测比对：

| 参数 | 值 |
|---|---|
| `PODCAST_LOOKBACK_HOURS` | **336（14 天）** |
| `state-feed.json` 的去重条目 TTL | **7 天**（`saveState` 裁剪 `ts < now - 7d`） |

**14 天的回顾窗口 > 7 天的去重记忆** → 一集 8 天前看过、仍在 14 天窗口内的播客，其去重记录已被裁剪，**会被当作新内容再次发出**。

X（24h 窗口）与 Blog（72h 窗口）都 < 7 天，**不受影响**；**只有播客受影响**。

> 这不是理论推演，是两个常量的直接比较。Phase 2 必须修掉（见 §5.2）。

### 1.6 本阶段可处理的数据量（现实约束）

| 通道 | 今天能产出数据? |
|---|---|
| `blog` | ✅ 零 Key，可跑（2 个源） |
| `x` | ❌ 缺 `X_BEARER_TOKEN` |
| `podcast` | ❌ 缺 `POD2TXT_API_KEY` |
| 其余 8 个通道（rss / github / api / …） | ❌ **fetcher 尚不存在** |

**即：Phase 2 设计的 Normalize 规则针对 3 种输入形态，但今天只有 1 种能真跑；去重规则可覆盖 3 种，但只有 blog 能端到端验证。**

---

## 2. ⚠️ D1 — 关键范围问题：新渠道 fetcher 归属（**需 owner 裁决**）

目标链路是 `Sources → **Fetch** → Normalize → Deduplicate → Signal Feed`。

- **Sources** 已由 Phase 1A/1B 完成（registry，69 条）。
- **Fetch**：只有 `x` / `blog` / `podcast` 三个通道有实现。**Phase 1B 登记的 35 条新源，其 8 个通道全部没有 fetcher。**
- **Normalize / Deduplicate** 是本阶段。

**当前 phase 列表里没有任何一个 phase 承载「新通道的 fetch 实现」。** 这不是措辞问题 —— 它意味着 **Phase 1B 策展出来的 35 个源，无论 Phase 2 怎么做都不会有数据进入**。

三个选项：

| 选项 | 说明 | 代价 |
|---|---|---|
| **A. 新增 Phase 1C — Channel Fetchers**（推荐） | 在 Phase 2 之前，为 rss / github / hackernews / arxiv / huggingface / api / web / reddit 实现抓取，各自产出与现有 feed 同构的数据 | 多一个阶段；但边界最干净 —— 「抓」与「归一」分开 |
| B. 并入 Phase 2 | Phase 2 = Fetch(new) + Normalize + Dedup | Phase 2 变大；且一旦某通道 fetcher 出问题，Phase 2 的完成判定会与它耦合 |
| C. 推迟到 Phase 2 之后 | Phase 2 只归一现有 3 种输入 | 35 个源长期空转；Phase 3 的聚类没有素材 |

**我的推荐：A。** 理由：Fetch 的失败模式（网络、限流、解析漂移）与 Normalize 的失败模式（字段缺失、时间格式）完全不同，混在一个 phase 里会让验收标准互相污染。而且给 8 个通道各写 fetcher 的工作量，本身就不小于一个 phase。

**但这是你的决定。** 不裁决的话，Phase 2 只能在「只有 blog 能跑」的输入上设计与验证。

---

## 3. Signal schema

### 3.1 目标形态（草案）

```jsonc
{
  "id": "blog:claude-blog#https://claude.com/blog/claude-in-chrome-generally-available",
  "source_id": "blog:claude-blog",          // 指回 registry（Phase 1B 建立的稳定身份）
  "channel": "blog",
  "type": "blog_post",                       // tweet | podcast_episode | blog_post | release | paper | story | …
  "title": "Claude in Chrome is generally available",
  "url": "https://claude.com/blog/claude-in-chrome-generally-available",
  "original_url": "https://claude.com/blog/claude-in-chrome-generally-available",
  "published_at": "2026-08-26T00:00:00.000Z",  // ← 归一后的 ISO 8601，不是原始字符串
  "fetched_at": "2026-09-23T03:53:16.995Z",
  "text": "…"                                  // 下游要用的正文/转写；通道决定来源
}
```

对齐 PLAN.md 原定的字段（`id` / `source_id` / `type` / `published_at` / `url` / `title` / `raw_text`），并补充三个：

| 补充字段 | 为什么必须 |
|---|---|
| `channel` | 去重与后续处理需要；也是「输出分区」与「无 fetcher 通道」判定的依据 |
| `original_url` | **落实 §6 的可追溯性硬约束** —— `role=aggregator` 的源必须能给出或解析出一手链接 |
| `fetched_at` | 与 `published_at` 分开（同 AIHOT 的 `publishedAt` / `discoveredAt` 区分）；排查「为什么这条现在才出现」时需要 |

> `raw_text` 在草案里叫 `text`。**建议改名 `text`** —— `raw_` 前缀暗示"未经处理"，但这里的内容可能已做轻度清洗（如剥 HTML）。若你坚持 `raw_text`，我改。

### 3.2 ⚠️ D2 — `id` 形态（需裁决）

**候选**：`<source_id>#<native_key>`

| 通道 | native_key | 例 |
|---|---|---|
| x | tweet id | `x:swyx#2101873256097804529` |
| podcast | episode guid | `podcast:no-priors#2ecd3b38-aca0-11f1-b6c4-13e4bbce7d30` |
| blog | article url | `blog:claude-blog#https://claude.com/blog/…` |

| 方案 | 优点 | 缺点 |
|---|---|---|
| **组合式（推荐）** | 可读、可就地看出属于哪个源、天然全局唯一 | blog 的 id 很长（把整条 URL 塞进去） |
| 哈希式 `sha1(source_id+key)[:16]` | 长度固定 | 不可读，排查时要反查 |
| 纯 native_key（不带 source_id） | 最短 | 跨通道可能撞车；且 id 里看不出源 |

**推荐组合式**：可调试性 > 长度。id 是给人排查用的，长一点无妨。

---

## 4. Normalize 规则

**目标：三条形状各异的输入 → 同一种 signal。**

| 规则 | 内容 |
|---|---|
| N1 拍平 | `feed-x.json` 的 `x[].tweets[]` 嵌套结构拍平为逐条 signal；`tweets[]` 的父级字段（`name` / `handle` / `bio`）不再随条目走，改为通过 `source_id` 回查 registry |
| N2 时间归一 | **所有 `published_at` 统一为 ISO 8601 UTC**。Blog 的 `"Aug 26, 2026"` 必须解析为 ISO；**解析失败的条目不得静默丢弃，也不得保留原字符串** —— 应记为 `null` 并计入错误（见 N5） |
| N3 来源注入 | 每条 signal 补 `source_id`（来自 registry 条目）、`channel`、`type` |
| N4 链接 | `url` = 内容本身的规范链接；`original_url` = 一手来源链接。**对一手源两者相同**；对 `role=aggregator` 的源，`original_url` 必须由解析得出（见 §6） |
| N5 失败可见 | 任何字段归一失败（时间解析不了、缺 url、缺 source_id）**必须计入 `errors` 并让该条降级或剔除，不得静默**。这是 1B「fail-fast」原则在数据层的延续 |
| N6 `type` 映射 | X → `tweet`；Podcast → `podcast_episode`；Blog → `blog_post`。新通道的 `type` 在实现时确定 |

> **N5 是对现有代码的修正方向**：现有 `fetchBlogContent` 对「无日期」是**静默接受**（这正是 blog 链路不可预测的根源）。Phase 2 不应沿用这种静默。

---

## 5. Deduplicate

### 5.1 去重键

**建议：直接用 signal 的 `id`（= `<source_id>#<native_key>`）作为去重键。**

理由：`id` 已经编码了「哪个源 + 该源的哪条内容」，天然唯一且稳定。用别的键（如内容哈希）会引入「同一内容改了标题就重发」或「不同内容撞哈希」两种错误。

### 5.2 ⚠️ D3 — 去重状态保留策略（需裁决，含必修 bug）

**必修**：§1.5 已确认 —— 7 天 TTL < 14 天播客窗口，**播客会重复发出**。

| 方案 | 说明 | 评价 |
|---|---|---|
| **A. TTL ≥ 最长 lookback + 余量**（最小修正） | 把 TTL 从 7 天提到 ≥ 21 天 | 改动最小、立刻修掉 bug；但状态文件会变大 |
| **B. 每源水位线（watermark）** | 为每个 `source_id` 记「见过的最大 `published_at`」，只接受更新的；配一个有限 id 集合处理同时间戳 | 状态 O(源数) 而非 O(条数)；**但会漏掉「早发布、晚发现」的历史补录** |
| **C. 按 `source_id` 分桶的 id 集合** | 每源保留最近 N 个 id | 状态有界；实现适中 |

**推荐 A 作为 Phase 2 的最小修正**（先修 bug、保持行为可预测），把 B/C 列为 Phase 2 之后的优化。

**必须同时明确**：TTL 与各源的 lookback 之间要有**显式的约束关系**（TTL ≥ max(lookback) + 余量），并写进代码注释与校验 —— 否则下次有人调大 lookback 会静默重新引入同一个 bug。

### 5.3 跨源重复（开放问题）

同一条内容可能由多个源产出（例：某模型发布同时出现在 Anthropic 官方博客、多人推文、HN 首页）。**本阶段不解决跨源去重** —— 那是「同一事件」的语义判断，属 Phase 3 聚类。Phase 2 只保证**同源同内容不重复**。此边界必须写清楚，避免 Phase 3 误以为 Phase 2 已处理。

---

## 6. 可追溯性强制（本阶段的核心原则落地）

原则 3「**Signal 必须来源可追溯**」在 Phase 2 的具体含义：

| 要求 | 强制方式 |
|---|---|
| 每条 signal 能回溯到 registry 条目 | `source_id` **必填**，且必须能在 registry 中命中；否则该条**不得进入 signal feed** |
| 每条 signal 有可点击的原始链接 | `url` **必填**；缺失即剔除并计入错误 |
| **非一手内容必须能回溯到一手源** | `role=aggregator` 的源，其 signal 的 `original_url` **必须**能解析出，且指向**非本站**的一手发布处；解析不出则该条降级为「线索」而非事实（§7 的 internal 分区或标注 `is_secondary`） |

> 第三条是 Phase 1B 修订过的模型（可追溯性来自 `role`，不来自 `tier`）在数据层的落地。

---

## 7. 输出分区：public / internal-only

### 7.1 为什么必须做

Phase 1B 记录了一个跨阶段依赖：**AIHOT 的使用策略是 (a) 仅个人自用，其派生数据不得进入公开 feed**。而现有 CI 会把产物 commit 到 **public** 仓库。所以 **Phase 2 必须提供分区能力，否则 AIHOT 永远无法从 `active: false` 启用**。

### 7.2 设计

**按「再分发许可」把输出分成两条路径：**

| 分区 | 含义 | 去向 |
|---|---|---|
| **public** | 可公开再分发的内容 | 照旧 commit 回仓库 |
| **internal** | 受再分发限制的源（如 AIHOT） | **不得 commit 到 public 仓库** |

**registry 需要新增一个字段**表达这个分类（建议 `redistribution: "public" | "internal"`，默认 `public`；`api:aihot` 置 `internal`）。

> ⚠️ 这是 Phase 1B 之后对 registry 的**又一次 schema 变更**（v2 → 或在 v2 上加字段）。是否引入、用什么字段名，**需 owner 确认**。

**internal 分区的实际投递机制不在本阶段** —— Phase 2 只负责**分区正确**（确保受限内容绝不落入 public 文件），Phase 6 负责怎么把它送到飞书。

---

## 8. 跨阶段：AIHOT 的启用

| 阶段 | 动作 |
|---|---|
| Phase 1B | ✅ 已登记 `api:aihot`，`active: false` |
| **Phase 2** | 实现 §7 的 public / internal 分区 |
| Phase 2 之后 | 分区就绪且 AIHOT 的 **fetcher 存在**（见 §2 的 D1）后，才可置 `active: true` |

> **注意双重前置**：AIHOT 启用同时依赖 ① internal 分区就绪 ② `api` 通道的 fetcher 就绪。**两者缺一，AIHOT 都启不了。** 依赖 §2 的裁决。

---

## 9. 验证

### 9.1 可完整验证（今天的输入面）

| 对象 | 成功信号 |
|---|---|
| Normalize（blog 路） | 真实 `--blogs-only` 跑通后，blog signal 的 `published_at` **全部为合法 ISO 8601**（含那条原本是 `"Aug 26, 2026"` 的） |
| X 拍平 | 对现有 `feed-x.json` 做离线归一，得到**逐条平铺**的 signal，条数与 `sum(tweets)` 一致 |
| `source_id` 命中 | 每条 signal 的 `source_id` 都能在 registry 中查到；命中率 **100%** |
| 分片正确 | `role=aggregator` 的源，其 signal 的 `original_url` 均存在且非本站 |
| **输出分区** | 构造一条 `internal` 源的内容，确认它**不出现在** public 产物中 |
| 去重 | 同一 signal 连续跑两次，第二次**不重复产出** |

### 9.2 只能静态/离线验证

- X / podcast 的**真实抓取**归一（无 Key）
- 新通道（无 fetcher）
- 播客去重 bug 的**真实修复验证** —— 需要真实抓到播客；**只能用构造数据模拟「8 天前见过、仍在 14 天窗口内」的场景**

### 9.3 必须诚实标注的

本阶段的端到端验证**只能覆盖 blog 一条线**。X / podcast / 新通道全部只能离线或静态验证。**不得把「离线归一通过」表述为「Signal Feed 已就绪」。**

---

## 10. Phase 2 Exit Criteria（Checklist）

**完成定义：「Normalize + Deduplicate 的规范落地且可验证」，不是「所有源都接进来了」。**

- [ ] D1（fetcher 归属）已裁决
- [ ] signal schema 定稿（含 `id` 形态 D2、`raw_text` vs `text`）
- [ ] Normalize 规则定稿，**时间归一在 blog 路实测通过**
- [ ] 去重键定稿；**播客 TTL bug 已修**，且 TTL 与 lookback 的约束关系写进代码
- [ ] 每条 signal 的 `source_id` 均可命中 registry（100%）
- [ ] `role=aggregator` 的 signal 均带可解析的 `original_url`
- [ ] **输出分区落地**：`internal` 源的内容不出现在 public 产物中（构造用例实测）
- [ ] 归一失败**不静默**：缺 url / 缺 source_id / 时间解析失败均计入错误
- [ ] 跨源去重的边界写清楚（本阶段不做，属 Phase 3）

**不计入本阶段退出条件**：X / podcast 的真实抓取验证、新通道 fetcher、internal 分区的实际投递。

---

## 11. Risks / Open Questions

| 级别 | 风险 / 问题 | 说明与处置 |
|---|---|---|
| ⚠️ **高（阻塞）** | **D1：fetcher 归属未定** | 见 §2。不定则 35 个源永远无数据，Phase 2 只能在 blog 一条线上设计与验证 |
| ⚠️ **高（已确认 bug）** | **播客会重复发出** | §1.5：7 天 TTL < 14 天 lookback。**最小修正是提高 TTL**，但必须同时把「TTL ≥ max(lookback)」写成显式约束 |
| ⚠️ 高 | **AIHOT 启用的双重前置** | 需 ① internal 分区 ② `api` fetcher。任一缺失都启不了（§8） |
| ⚠️ 中 | **registry 又要改 schema** | §7 的 `redistribution` 字段是 1B 之后的第三次变更（v1→v2→+字段）。需评估是否值得，或有别的表达方式 |
| ⚠️ 中 | **验证面极窄** | 今天只有 blog 能端到端跑；X / podcast / 新通道全靠离线或构造数据 |
| 开放问题 | `id` 形态（D2） | 组合式 vs 哈希式，见 §3.2 |
| 开放问题 | 去重状态保留策略（D3） | A/B/C 三选一，见 §5.2 |
| 开放问题 | `raw_text` 还是 `text` | 命名问题；我建议 `text` |
| 开放问题 | internal 分区的落地形态 | Actions artifact？不 commit 的独立分支？→ 本阶段只保证「不落入 public」，机制留给 Phase 6 |
| 已知（本阶段不解决） | 跨源重复 | 属 Phase 3 聚类的语义判断，见 §5.3 |
| 已知（不属任何阶段） | `fetchXWithRetry` 未设超时 | 网络不可达时会无限挂起（1B 实测遇到）。建议补一个 AbortSignal —— 但那是无关修复，需你决定是否纳入 |

---

## 12. 明确不在 Phase 2 范围内（防止未来 session 漂移）

- ❌ 主题判断 / 聚类 / 权重 / 评分（→ Phase 3、Phase 4）
- ❌ 把 `tier` 换算成任何权重（`tier` 只是分类标签）
- ❌ 飞书投递（→ Phase 6）；本阶段只做输出**分区**，不做分区后的**投递**
- ❌ 跨源（同一事件多源）去重 —— 属 Phase 3
- ❌ UI
- ❌ Blog 抓取/解析逻辑的改动（时间归一只在 **Normalize 层**做，不改 `fetchBlogContent` 的解析器）
- ❌ 三个现有 fetcher 的重写
- ❌ 无关重构（清理 `proper-lockfile`、拆分 `generate-feed.js`、引入 exports）
- ❌ 重命名 `~/.follow-builders` 目录；品牌改名
- ❌ X / podcast 的 Key 获取与上游依赖移除（依赖携带中）
