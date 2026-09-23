# Phase 2 — Signal Feed

> 目标：把源产出的原始内容归一为**结构化、来源可追溯的 Signal 流**，并给出确定的去重与输出规则。
> **完成定义：「2A 批次 1 的通道可抓 + 2B 的归一/去重规范落地 + 2C 的分区生效」，不是「全部 69 条源可抓」。**
> 前置：Phase 1A / 1B Done。

**Phase 2 分三个子阶段，各自独立可验收：**

| | 子阶段 | 内容 | 对应链路阶段 |
|---|---|---|---|
| **2A** | **Channel Fetchers** | 为 rss / github / api / web 实现抓取（**批次 1**） | Fetch |
| **2B** | **Signal Pipeline** | Signal Schema、Normalize（含时间统一）、traceability、dedup | Normalize + Deduplicate + Signal Feed |
| **2C** | **Output** | public Signal Feed + private / internal-only Signal Feed | （输出侧） |

**明确不做：** 主题判断 / 聚类 / 权重（→ Phase 3、4）；飞书投递（→ Phase 6）。

---

## 0. 执行进展与决策记录（2026-09-23）

| 步骤 | 状态 | 备注 |
|---|---|---|
| Step 0 生成本方案 | ✅ Done | 本文件 |
| **D1 — fetcher 归属** | ✅ **已裁决** | **并入 Phase 2**，内部分 2A。**不新增 Phase 1C**（见 §0.1） |
| **D2 — signal `id` 形态** | ✅ **已裁决** | schema 拆 `id` / `source_id` / `native_id`；`id` = 确定性 hash（见 §3.1） |
| **D3 — 去重状态策略** | ✅ **已裁决** | TTL 提到 **30 天** + 运行时约束 fail-fast（见 §3.4） |
| 2A 实现（批次 1：rss / github / api / web） | ⬜ Not Started | 见 §2 |
| 2B 实现 | ⬜ Not Started | 见 §3 |
| 2C 实现 | ⬜ Not Started | 见 §4 |

### 0.1 决策记录

| # | 决定 | 依据 |
|---|---|---|
| 1 | **Fetch 本来就是 Phase 2 的职责**，并入 Phase 2，不新增 Phase 1C | 原始总路线 `Sources → **Fetch** → Normalize → Deduplicate → Signal Feed` 已把 Fetch 放在 Signal Feed 之内 |
| 2 | **分批**：2A 第一批只做 **零 Key、高价值** 的 rss / github / api / web；**不要求一次做完 8 个 channel** | 控制单批风险；X / podcast 因缺 Key 保持 blocked，**不作为 2A 的完成条件** |
| 3 | **`id` 不承载语义** | 主键应稳定且与展示解耦；可读性由 `source_id` / `native_id` 承担 |
| 4 | **dedup TTL = 30 天** | 覆盖当前最长 lookback（播客 14 天）并留余量 |
| 5 | **时间归一不得让 pipeline 崩，也不得静默** | 不可解析 → `published_at = null` + 记 warning |

---

## 1. 背景与关键事实（均为实测）

### 1.1 三个 feed 形状互不相同

| feed | 条目结构 | 嵌套 |
|---|---|---|
| `feed-x.json` | `{source, name, handle, bio, tweets[]}` | **按账号分组，推文嵌套在 `tweets[]`** |
| `feed-podcasts.json` | `{source, name, title, guid, url, publishedAt, transcript}` | 平铺 |
| `feed-blogs.json` | `{source, name, title, url, publishedAt, author, description, content}` | 平铺 |

### 1.2 时间字段跨源不一致（实测）

| 源 | 字段 | 实测值 | ISO? |
|---|---|---|---|
| X | `createdAt` | `2026-09-21T03:16:49.000Z` | ✅ |
| Podcast | `publishedAt` | `2026-09-10T10:00:00.000Z` | ✅ |
| Blog | `publishedAt` | **`"Aug 26, 2026"`** | ❌ |

### 1.3 可追溯性缺口

三 feed 的条目 **100% 都有 `url`**（实测 0 缺失），但**没有任何字段能把内容指回 registry 的 `id`** —— 现有 `source` 字段是通道名（`"x"` / `"blog"`），不是源身份。

### 1.4 ⚠️ 已确认的 bug：播客会重复发出

`PODCAST_LOOKBACK_HOURS = 336`（**14 天**）> 去重状态 TTL **7 天** → 8 天前看过、仍在 14 天窗口内的播客，去重记录已被裁剪，**会再次发出**。X（24h）与 Blog（72h）不受影响。

### 1.5 现实约束

| 通道 | 今天能产出数据? |
|---|---|
| `blog` | ✅ 零 Key |
| `x` / `podcast` | ❌ 缺 Key |
| `rss` / `github` / `api` / `web` / 其余 | ❌ **fetcher 不存在**（本阶段 2A 要建） |

---

## 2. Phase 2A — Channel Fetchers

### 2.1 范围

**批次 1（本阶段做）：4 个通道，31 个源。**

| 通道 | 源数 | 权威/成本 | 信号形态 |
|---|---|---|---|
| `rss` | **19** | 零 Key，标准 RSS/Atom | 文章条目 |
| `github` | **9** | 零 Key（未认证 60 req/h） | **release 发布** |
| `api` | **1** | 零 Key（AIHOT v1 API） | 精选/热点条目 |
| `web` | **2** | 零 Key，HTML 抓取 | 页面变更 |
| **合计** | **31** | | |

**批次 2（本阶段不做）：** `hackernews`、`arxiv`、`huggingface`、`reddit`（共 4 源）。

**不在 2A 完成条件内：** `x`(26) 与 `podcast`(6) —— 缺 `X_BEARER_TOKEN` / `POD2TXT_API_KEY`，**保持 blocked**。

### 2.2 输出约定

**批次 1 的 4 个 fetcher 产出统一形状**（与既有 3 个 feed 的"三种形状"不同 —— 新建的通道不必继承历史形状）：

```jsonc
// feed-rss.json / feed-github.json / feed-api.json / feed-web.json
{
  "generatedAt": "2026-09-23T06:17:00.000Z",
  "channel": "rss",
  "lookbackHours": 72,
  "items": [
    {
      "source_id": "rss:simon-willison",   // 必填，来自 registry
      "native_id": "<该通道的天然标识>",      // 必填
      "title": "…",
      "url": "…",
      "original_url": "…",                  // 一手源与 url 相同；aggregator 必须解析出一手链接
      "published_at": "…",                  // 原始值，2B 负责归一
      "text": "…"
    }
  ],
  "stats": { "items": 1 },
  "errors": ["…"]                           // 可选
}
```

> **`native_id` 按通道定义**：rss → item guid 或 link；github → release tag（或 release id）；api → 条目 public id；web → 页面 URL。

### 2.3 各通道的已知实现注意

| 通道 | 注意 |
|---|---|
| `github` | `gemini-cli` 每日发 nightly、`qwen-code` 发 preview —— **必须按 tag 模式 / `prerelease` 标志过滤**，否则 feed 被 nightly 淹没 |
| `github` | 未认证 60 req/h；9 个仓库每次约 9 次请求，安全。增长后再评估引入免费 token |
| `api`（AIHOT） | `s-maxage=60` 为最小轮询间隔；**必须带 `If-None-Match`**（未变化返回 304）；429/503 按 `Retry-After` 等待；**只用 `/api/v1/*`**（旧 `/api/public/*` 2026-12-31 停服） |
| `rss` | `sebastianraschka.com` 实测 **406**，需调 Accept header；Meta / Mistral / HF 三个源**本地不可达，未实测**，须在 CI 复核 |
| `web` | `semantic-scholar` 有速率限制（实测 429） |

### 2.4 2A 的先后顺序

```
RSS（19 源，收益最大、最标准）
  → GitHub（9 源，信号密度最高）
  → Web（2 源）
  → API / AIHOT（1 源）—— 但 AIHOT 的 active 还受 2C 约束（§6）
```

---

## 3. Phase 2B — Signal Pipeline

### 3.1 Signal Schema（终稿）

```jsonc
{
  "id": "6b1f0a9c4e2d7a38",                    // sha256(source_id + "\n" + native_id) 的确定性哈希
  "source_id": "blog:claude-blog",             // 必填，必须命中 registry
  "native_id": "https://claude.com/blog/claude-in-chrome-generally-available",
  "channel": "blog",
  "type": "blog_post",
  "title": "Claude in Chrome is generally available",
  "url": "https://claude.com/blog/claude-in-chrome-generally-available",
  "original_url": "https://claude.com/blog/claude-in-chrome-generally-available",
  "published_at": "2026-08-26T00:00:00.000Z",  // ISO 8601 UTC 或 null，二选一，不允许其他格式
  "collected_at": "2026-09-23T03:53:16.995Z",  // 必填，始终存在
  "text": "…"
}
```

**字段规则**

| 字段 | 规则 |
|---|---|
| `id` | **确定性哈希**：`sha256(source_id + "\n" + native_id)` 取前 16 位十六进制。**不承载语义**；同一 (source_id, native_id) 永远产出同一 id |
| `source_id` | 必填，必须能在 registry 中命中；命中失败 → 该条**不得进入 signal feed** |
| `native_id` | 必填，该通道的天然标识；与 `source_id` 一起构成"这条内容是谁的哪一条" |
| `channel` / `type` | 必填；`type` ∈ `tweet` / `podcast_episode` / `blog_post` / `release` / `paper` / `story` / `page` |
| `title` | 可空（部分源的条目无标题） |
| `url` | **必填**；缺失 → 剔除并计入错误 |
| `original_url` | **必填**。一手源与 `url` 相同；**`role=aggregator` 的源必须解析出一手链接**，否则该条降级（§3.5） |
| `published_at` | **只能是合法 ISO 8601 UTC 或 `null`**。不可解析 → `null` + normalization warning（§3.3） |
| `collected_at` | **始终必填**。与 `published_at` 分离，用于排查"为什么这条现在才出现" |
| `text` | 下游使用的正文；通道决定来源（推文正文 / 转写 / 文章正文 / release notes） |

> 命名说明：PLAN.md 原写的 `raw_text` 改为 `text` —— `raw_` 前缀暗示"未经处理"，而此处内容可能已剥 HTML。以本表为准。

### 3.2 Normalize 规则

| # | 规则 |
|---|---|
| N1 **拍平** | `feed-x.json` 的 `x[].tweets[]` 嵌套拍平为逐条 signal。父级字段（`name` / `handle` / `bio`）**不再随条目走** —— 改由 `source_id` 回查 registry |
| N2 **来源注入** | 每条补 `source_id`（来自 registry 条目）、`channel`、`type` |
| N3 **`id` 生成** | 按 §3.1 的哈希规则生成；同一输入必得同一输出 |
| N4 **链接** | `url` = 内容本身；`original_url` = 一手来源。一手源两者相同 |
| N5 **失败可见** | 缺 `url` / `source_id` 命中失败 / 时间不可解析 —— **一律计入 `normalization_warnings` 或 `errors`，不得静默**。这是 1B「fail-fast」原则在数据层的延续 |
| N6 **`type` 映射** | x → `tweet`；podcast → `podcast_episode`；blog → `blog_post`；github → `release`；api → `story`；web → `page` |

> **N5 是对现有代码的修正方向**：`fetchBlogContent` 目前对"无日期"是**静默接受**，这正是 blog 链路行为不可预测的根源。Phase 2 不沿用这种静默。

### 3.3 时间归一（含"不崩也不静默"）

```
原始值
  ├─ 已是合法 ISO 8601 ──────────────→ 保留（统一为 UTC，毫秒精度）
  ├─ 是源格式（如 "Aug 26, 2026"）───→ 解析成功 → 转 ISO 8601 UTC
  └─ 不可解析 / 缺失 ────────────────→ published_at = null
                                        + 记一条 normalization warning
                                        （条目仍保留，pipeline 不中断）
```

**硬性约束：**

- `published_at` **只能是 ISO 8601 UTC 或 `null`** —— **不允许保留 `"Aug 26, 2026"` 这类源格式**
- 不可解析时**不得静默**（必须记 warning）
- 但**不得让整条 pipeline 崩溃** —— 该条降级为 `published_at = null` 并继续
- `collected_at` **始终必填**，不受此影响

**normalization warning 的形状**（放在 feed 层，保持 signal 干净）：

```jsonc
"normalization_warnings": [
  { "source_id": "blog:claude-blog",
    "native_id": "https://claude.com/blog/…",
    "field": "published_at",
    "reason": "unparseable: \"Aug 26, 2026\"" }
]
```

### 3.4 Deduplicate

**去重键 = signal 的 `id`**（即 `(source_id, native_id)` 的哈希）。它已编码"哪个源的哪条内容"，天然唯一且稳定；用内容哈希会引入"改标题就重发"或"不同内容撞哈希"两种错误。

**TTL 修正（修掉 §1.4 的 bug）：**

```
DEDUP_TTL_DAYS = 30
```

**运行时约束（fail-fast）：**

> **`DEDUP_TTL >= 所有 fetcher 的 max lookback`** —— 启动时校验，**违反即抛错退出**。

理由：§1.4 的 bug 根源是"TTL 与 lookback 是两个各自演化的常量，没有任何地方约束它们的关系"。**只调大 TTL 而不加约束，等于把同一个 bug 留给下一次调整 lookback 的人。** 约束必须写成代码里的断言 + 注释。

**跨源重复：本阶段不解决。** 同一事件多源报道（模型发布同时出现在官方博客、多人推文、HN 首页）属**语义判断**，是 Phase 3 聚类的职责。Phase 2 只保证**同源同内容不重复**。此边界写进 §10，避免 Phase 3 误以为已处理。

### 3.5 可追溯性强制

原则 3「**Signal 必须来源可追溯**」在 2B 的具体落地：

| 要求 | 强制方式 |
|---|---|
| 回溯到 registry 条目 | `source_id` 必填且必须命中；命中失败 → **不得进入 signal feed** |
| 有可点击原始链接 | `url` 必填；缺失 → 剔除 + 计入错误 |
| **非一手内容必须回溯到一手源** | `role=aggregator` 的源，其 `original_url` **必须存在且指向非本站**；解析不出 → 该条**降级为线索**（标 `is_secondary: true`），不参与 Radar 事实层 |

> 第三条是 1B 修订过的模型（**可追溯性来自 `role`，不来自 `tier`**）在数据层的落地。

---

## 4. Phase 2C — Output

### 4.1 分区

| 分区 | 含义 | 去向 |
|---|---|---|
| **public** | 可公开再分发的内容 | `signals.json`，照旧 commit 回仓库 |
| **internal** | 受再分发限制的源 | `signals-internal.json`，**绝不 commit** |

### 4.2 registry 需要新增字段

| 字段 | 取值 | 默认 |
|---|---|---|
| `redistribution` | `"public"` \| `"internal"` | `"public"` |

`api:aihot` 置 `internal`。

> ⚠️ 这是 registry 的**第三次结构变更**（v1 → v2 → 加字段）。1B 的 schema 文件需同步。

### 4.3 internal 产物的落地形态

| 要求 | 做法 |
|---|---|
| **绝不进入 public 仓库** | 文件写入 `.gitignore`；且**写入 `$RUNNER_TEMP` 而非工作树**（双保险：即使有人 `git add -A` 也不会带上） |
| 可被后续阶段取用 | 作为 **GitHub Actions artifact** 上传 |
| 实际投递到飞书 | **不在本阶段**（→ Phase 6）。2C 只负责"分区正确" |

---

## 5. Runnable 账目（算出来的，不是估的）

**当前 69 条源的状态：**

| 状态 | 数量 | 构成 |
|---|---|---|
| ✅ 今天已可跑 | **2** | `blog` 2 条 |
| 🔜 **2A 批次 1 完成后可跑** | **+31** | rss 19 + github 9 + api 1 + web 2 |
| ⏸ blocked（缺 Key） | 32 | x 26 + podcast 6 |
| ⏸ 批次 2 通道（本阶段不做） | 4 | hackernews / arxiv / huggingface / reddit 各 1 |
| | **69** | |

### 5.1 第一批从 blocked/inactive 变 runnable 的源清单（31 条）

**RSS（19）**
`rss:openai-news` · `rss:google-deepmind` · `rss:github-copilot-changelog` · `rss:karpathy` · `rss:simon-willison` · `rss:latent-space` · `rss:lilian-weng` · `rss:interconnects` · `rss:import-ai` · `rss:google-ai` · `rss:apple-ml` · `rss:nvidia-blog` · `rss:meta-ai` · `rss:mistral-news` · `rss:huggingface-blog` · `rss:chip-huyen` · `rss:sebastian-raschka` · `rss:eugene-yan` · `rss:jay-alammar`

**GitHub（9）**
`github:anthropic-claude-code` · `github:openai-codex` · `github:qwen-code` · `github:gemini-cli` · `github:mcp-servers` · `github:google-adk-python` · `github:microsoft-autogen` · `github:langchain` · `github:llama-index`

**Web（2）**
`web:cursor-changelog` · `web:semantic-scholar`

**API（1）**
`api:aihot` —— **但受 §6 双重前置约束，启用晚于其余 30 条**

### 5.2 Phase 2 完成后的预期 runnable 数量

> ## **33 / 69**

**但这个数字有三条必须说清的前提：**

| 前提 | 说明 |
|---|---|
| ① AIHOT 占 1 条 | 它要求 2C 的 internal 分区**已生效**；若 2C 未完成，则只有 **32 / 69** |
| ② 3 条 RSS **未实测** | `meta-ai` / `mistral-news` / `huggingface-blog` 从我的网络不可达（非"不可用"，是本地网络限制）。**须在 CI 复核** |
| ③ 2 条通道存在已知摩擦 | `sebastian-raschka` 实测 406（需调 header）；`semantic-scholar` 有速率限制 |

**因此诚实的表述是**：Phase 2 完成后预期 **33 / 69**，其中 **≥30 条可在 CI 上稳定验证**，其余需现场复核。

---

## 6. 跨阶段：AIHOT 的启用条件

**AIHOT 有双重前置，缺一不可：**

| # | 前置 | 由谁提供 |
|---|---|---|
| 1 | **`api` channel 的 fetcher** | Phase 2A |
| 2 | **internal-only 输出分区生效** | Phase 2C |

> 仅满足其一都不够。**2A 做完但 2C 未做时，`api:aihot` 必须仍保持 `active: false`。**

---

## 7. 验证

### 7.1 可完整验证

| 对象 | 成功信号 |
|---|---|
| 2A 各通道（rss/github/web） | 真实抓取成功，产出 `items[]`，每条含 `source_id` + `native_id` |
| **时间归一** | 真实 `--blogs-only` 后，blog signal 的 `published_at` **全部为合法 ISO 8601 或 null**（含那条原本是 `"Aug 26, 2026"` 的） |
| X 拍平 | 对现有 `feed-x.json` 离线归一 → 逐条平铺，条数 = `sum(tweets)` |
| `source_id` 命中 | 命中率 **100%** |
| aggregator 可追溯 | `role=aggregator` 的 signal 均有非本站 `original_url`，否则 `is_secondary: true` |
| **dedup TTL 约束** | 构造 `TTL < max lookback` → **fail-fast 退出** |
| **去重生效** | 同一 signal 跑两次，第二次不重复产出 |
| **播客 bug 已修** | 构造"8 天前见过"的条目 → **不再重发** |
| **2C 分区** | 构造 `internal` 源的内容 → **不出现在 `signals.json`**；出现在 `signals-internal.json` 且该文件**不在 git 跟踪范围内** |

### 7.2 只能静态 / 离线验证

- `x` / `podcast` 的真实抓取归一（无 Key）
- 批次 2 通道（无 fetcher）
- 本地不可达的 3 条 RSS

### 7.3 必须诚实标注

**端到端验证面** = blog（2 条）+ 2A 批次 1 的 30 条。**`x` / `podcast` 全程只能离线验证。不得把"离线归一通过"表述为"Signal Feed 已就绪"。**

---

## 8. Phase 2 Exit Criteria

**完成定义：「2A 批次 1 可抓 + 2B 规范落地 + 2C 分区生效」。**

**2A**
- [ ] `rss` / `github` / `api` / `web` 四个 fetcher 实现完毕，产出统一的 `items[]` 形状
- [ ] GitHub 的 nightly / preview release 已过滤
- [ ] **`x` / `podcast` 未纳入 2A 完成条件**（缺 Key，保持 blocked）

**2B**
- [ ] Signal Schema 落地（含 `id` / `source_id` / `native_id` 三字段拆分）
- [ ] `id` 由确定性哈希生成，同输入必得同输出
- [ ] **`published_at` 只能是 ISO 8601 UTC 或 `null`** —— blog 路实测通过
- [ ] 时间不可解析 → `null` + warning，**pipeline 不中断、不静默**
- [ ] `collected_at` 始终必填
- [ ] `source_id` 100% 命中 registry；命不中不进入 feed
- [ ] `role=aggregator` 的条目均有可解析的 `original_url`，否则标 `is_secondary`
- [ ] 去重键 = signal `id`
- [ ] **`DEDUP_TTL_DAYS = 30`**，且**运行时校验 `TTL >= max lookback`，违反即 fail-fast**
- [ ] 播客重复发出的 bug 已修（构造用例验证）
- [ ] 跨源去重边界写清（本阶段不做，属 Phase 3）

**2C**
- [ ] registry 新增 `redistribution` 字段；`api:aihot` 为 `internal`
- [ ] `internal` 源的内容**绝不进入** `signals.json`
- [ ] `signals-internal.json` 写入 `$RUNNER_TEMP` 且被 `.gitignore` 覆盖
- [ ] **AIHOT 仅在 2A + 2C 双双满足后才可置 `active: true`**

**不以本阶段为条件：** X / podcast 的 Key 与真实抓取、批次 2 通道、internal 分区的飞书投递。

---

## 9. Risks / Open Questions

| 级别 | 风险 / 问题 | 说明与处置 |
|---|---|---|
| ⚠️ **高（已确认 bug）** | **播客会重复发出** | §1.4。修正 = TTL 30 天 **+ 运行时约束**（只调大会把 bug 留给下一个人） |
| ⚠️ 高 | **AIHOT 的双重前置** | 需 2A 的 `api` fetcher **且** 2C 的 internal 分区。缺一则永远启不了 |
| ⚠️ 中 | **36 条源（x + podcast + 批次 2）本阶段无法端到端验证** | x/podcast 缺 Key，批次 2 无 fetcher。方案已按 §7.3 分档表述，不夸大 |
| ⚠️ 中 | **3 条 RSS 本地不可达** + 1 条 406 + 1 条限流 | 须在 CI 复核；不得据本地结果判定不可用 |
| ⚠️ 中 | **registry 第三次结构变更** | §4.2 的 `redistribution` 字段。1B schema 文件需同步 |
| 开放问题 | `id` 哈希取多少位 | 方案用 `sha256[:16]`（64 bit）。规模远小于碰撞风险，但若你偏好更长/更短请说 |
| 开放问题 | `type` 是否要做成受控枚举 | 方案列为受控值，但新通道会带来新 `type`，是否要像 `role` 一样冻结需定 |
| 开放问题 | internal 分区的实际投递 | 2C 只保证"不落入 public"；送到飞书是 Phase 6 |
| 已知（本阶段不解决） | 跨源重复 | Phase 3 聚类的职责，§3.4 已划界 |
| 已知（不属任何阶段） | `fetchXWithRetry` 未设超时 | 网络不可达时会**无限挂起**（1B 实测遇到）。建议补 `AbortSignal` —— 属无关修复，需你决定是否纳入 |

---

## 10. 明确不在 Phase 2 范围内

- ❌ 主题判断 / 聚类 / 权重 / 评分（→ Phase 3、Phase 4）
- ❌ 把 `tier` 换算成任何权重（`tier` 只是人工分类标签）
- ❌ **跨源（同一事件多源）去重** —— 属 Phase 3 的语义判断
- ❌ 飞书投递（→ Phase 6）；2C 只做**分区**，不做分区后的**投递**
- ❌ 批次 2 的 4 个通道（hackernews / arxiv / huggingface / reddit）
- ❌ X / podcast 的抓取（缺 Key；保持 blocked，**不是本阶段完成条件**）
- ❌ UI
- ❌ Blog 抓取/解析逻辑改动 —— **时间归一只在 2B 的 Normalize 层做**，不改 `fetchBlogContent` 的解析器
- ❌ 三个现有 fetcher 的重写
- ❌ 无关重构（清理 `proper-lockfile`、拆分 `generate-feed.js`、引入 exports）
- ❌ 重命名 `~/.follow-builders` 目录；品牌改名
