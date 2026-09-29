# Phase 3 — Topic Clustering

> 目标：把 Signal 归类到主题，并给出**主题权重规则**，供 Radar（Phase 4）使用。
> **完成定义：「对给定 signal 集产出稳定、可复现的主题分组与权重，且权重可解释」** —— 不是「聚类质量好」。
> 前置：Phase 2 Done。

---

## 0. 执行进展与决策记录（2026-09-29）

| 步骤 | 状态 | 备注 |
|---|---|---|
| Step 0 生成本方案 | ✅ Done | 本文件 |
| **D1 — 主题体系** | ✅ **已裁决（2026-09-29）** | **采用 §2.2 的 9 个固定主题**，含 `unclassified` 兜底桶。理由见 §2.1 |
| **D2 — 聚类方法** | ✅ **已裁决（2026-09-29）** | **首版规则/词表**（零 key、完全确定）；embedding 作为明确升级路径 —— §5 的输出接口已按「可替换」设计 |
| D3 — 权重公式 | ✅ 已实现 | `weight = Σ (source_diversity × recency)`，半衰期 168h，见 §4 |
| 实现 | ✅ Done | `lib/taxonomy.js` · `lib/topics.js` · `cluster-signals.js` |
| Gate `scripts/gate-3.js` | ✅ Done | 9 项检查，已接入 CI。**10 条注入违规全部被对应检查捕获**（见 §7.3） |

### 0.3 首版实测（2026-09-29，本地 148 条 signal）

```
148 signal → 145 cluster → 8 topic
  model-capability       weight=15.172  signals=36  clusters=33  sources=13
  dev-tooling            weight= 9.290  signals=21  clusters=21  sources= 7
  safety-and-governance  weight= 3.147  signals=11  clusters=11  sources= 6
  product-and-business   weight= 2.167  signals= 8  clusters= 8  sources= 4
  inference-and-cost     weight= 1.270  signals= 4  clusters= 4  sources= 3
  context-and-memory     weight= 0.783  signals= 2  clusters= 2  sources= 1
  tool-and-protocol      weight= 0.428  signals= 2  clusters= 2  sources= 2
  eval-and-benchmark     weight= 0.305  signals= 1  clusters= 1  sources= 1
  unclassified             63 signal(s) (42.6%)   <-- 主题表老化指标
```

三件必须如实说明的事：

1. **`unclassified` 占 42.6%** —— 这是 §3.1 预告过的低召回代价，不是意外。**调词表是后续的常规维护，不是本阶段的缺陷。** 这个数字从此每次运行都会打印出来。
2. **`agent-framework` 一条都没有。** 今天的语料里没有一个信号同时命中它的词表条目。可能说明词表不对，也可能说明这批源当天确实没聊这个 —— 单次快照无法区分，需要看几天。
3. **含 `unclassified` 共 9 个主题全部出现在实跑中，但分布极度不均**（前 2 个主题占 63% 的 signal）。这是语料的真实形状，不是权重公式的问题。

### 0.1 为什么 D1 风险高、D2 风险低

**D2（方法）是可换的**：Phase 4 依赖的是**输出形状**（signal → topic + weight），不是生成它的算法。先把形状和 gate 定下来，之后把规则版换成 embedding 版，只替换 §3 的实现，**接口与验收条件都不动**。

**D1（主题体系）不可换**：主题一旦发布，历史 signal 就是按旧体系标的。改体系 = 历史全作废 = Phase 4 失去跨时间比较能力。**这是唯一需要一次做对的地方。**

### 0.2 上游已固定、本阶段不得违反的约束

| # | 约束 | 来源 |
|---|---|---|
| 1 | **不得因个人历史背景硬编码提权**（如"做过 Eval"就给 Eval 主题加分） | PLAN.md Phase 3 Scope。**硬约束**，且**可 gate**（静态检查代码里有无按人/按源的加成） |
| 2 | 权重必须**可解释、可复现** | PLAN.md Phase 3 Exit Criteria |
| 3 | 分组必须**稳定** | 同上 |
| 4 | 聚类是**跨源**的 —— 同一事件的多源报道要归到一起 | plan §3.4 / §10。**Phase 2 刻意把跨源去重划给了本阶段**，这不是可选优化 |
| 5 | `tier` **不是权重**，是人工分类标签 | plan §10 明确禁止把 `tier` 换算成权重 |
| 6 | 不得引入新的 secrets 依赖而不加说明 | 本仓库今天**零 secrets**，CI 每天因缺 key 变红（见 §1.4） |

> **第 4 条最容易被漏掉**：Phase 2 明确只保证"同源同内容不重复"。**同一件事被 5 个源报道，现在是 5 条 signal。** 把它们合成一件事，是本阶段的职责。

---

## 1. 背景与关键事实（均为实测）

### 1.1 输入规模与形态（2026-09-29 本地实测，148 条）

| 项 | 实测值 |
|---|---|
| signal 总数 | 148（rss 128 + github 20） |
| `type` 分布 | `blog_post` 128 · `release` 20 |
| `text` 字数 | 中位 **1612**，上限 2000（Phase 2B 的截断策略） |
| `title` | **100% 有**，中位 **46** 字 |
| `text` 缺失 | 2 条 |

**含义**：`text` 中位 1612 字 ≈ 一篇正文。**逐条送进任何模型都很贵**（148 条 × 1.6k 字 ≈ 24 万字/天）。`title` 短、结构好、100% 覆盖，是更经济的入口 —— 代价是信息损失。**分类用哪一层，是 §3 的一个子问题。**

### 1.2 仓库现在**没有任何主题体系**

对全部 `*.js` / `*.json` / `*.md` grep `topic|theme|cluster|主题|聚类`：命中的只有本阶段的 plan 文档自身，其余是 podcast 标题里的巧合。**没有现成主题表、没有分类器、没有相关代码。** 本阶段从零建立。

### 1.3 上游消费侧的既有分工：代码收集，LLM 判断

`scripts/prepare-digest.js` 的注释写明：**"LLM 的唯一工作是读这个 JSON、remix、输出文案。其他一切都由这里确定性地处理。"** `prompts/` 下是 summarize-blogs / summarize-podcast / summarize-tweets / translate。

**含义 + 张力**：项目惯例是把"判断"交给 LLM。但本阶段 Exit Criteria 要求**可复现**，而 LLM 判断天然不满足。**这个张力就是 D2 的核心**，见 §3。

### 1.4 本仓库今天**零 secrets**

CI 每天在 `Generate feeds` 失败（缺 `X_BEARER_TOKEN` / `POD2TXT_API_KEY`）。**任何依赖外部 API key 的聚类方法，都会把 Phase 3 加到同一张阻塞清单上** —— 那意味着"实现了但永远在 CI 上跑不出结果"。

---

## 2. 主题体系（**D1 — 待裁决**）

### 2.1 三个选项

| 选项 | 做法 | 利 | 弊 |
|---|---|---|---|
| **A. 固定主题表**（推荐） | 手工定 9–12 个主题，冻结 | 跨时间可比（Phase 4 的全部基础）；可解释；可 gate；新话题进"未分类"桶时**桶的大小本身就是健康指标** | 表会过时；语义相近但用词不同会漏；需要人工维护 |
| **B. 开放聚类** | 每次跑聚类，让主题自己长出来 | 不遗漏；能发现意外结构 | **主题每次都变** → 无法跨时间比较 → 直接违反约束 3；plan §9 已把"主题漂移"列为风险 |
| **C. 固定顶层 + 开放次级** | 顶层 9–12 固定（供 Radar 比较），每个顶层内部允许自由子话题 | 兼顾可比与细致 | 复杂度翻倍；次级不稳定仍会使报告漂移；**第一版没有证据表明需要这一层** |

**推荐 A。** 理由：Phase 4 要回答的是"某个主题这周比上周更活跃了吗"—— **这需要主题身份稳定**。C 把复杂度提前引入了，而我们现在连顶层都还没有，没有证据表明需要子层。**B 直接与 Exit Criteria 矛盾，不应考虑。**

### 2.2 建议的初版主题表（9 个，待你增删改）

| # | 主题 | 覆盖的信号形态 |
|---|---|---|
| 1 | `model-capability` | 新模型发布、能力升级、多模态 |
| 2 | `agent-framework` | agent 框架、多智能体、编排 |
| 3 | `tool-and-protocol` | MCP、tool use、function calling、互操作协议 |
| 4 | `context-and-memory` | 长上下文、RAG、记忆、prompt caching |
| 5 | `inference-and-cost` | 推理优化、量化、serving、定价 |
| 6 | `dev-tooling` | IDE、CLI、coding agent、工程实践 |
| 7 | `product-and-business` | 产品发布、融资、采用率、生态 |
| 8 | `safety-and-governance` | 安全、对齐、监管 |
| 9 | `eval-and-benchmark` | 基准、评测方法 |
| — | `unclassified` | 兜底桶。**不是主题，是健康指标** —— 占比持续上升说明表过时 |

> **关于主题 8 / 9 的特别说明**：约束 1 要求"不因个人历史背景硬编码提权"。**主题 9 能存在，但它不能因为"项目创始人做过 Eval"而获得高于其他主题的权重。** 这一点会在 §4 与 gate 里各查一次。

**需要你决定的**：主题数量（9 个够吗）、命名、以及 `eval-and-benchmark` 是否应与 `model-capability` 合并（二者的信号在实践中高度重叠）。

---

## 3. 聚类方法（**D2 — 待裁决**）

### 3.1 三个选项

| 选项 | 做法 | 确定/可复现 | 需要 key | 可解释性 | 质量 |
|---|---|---|---|---|---|
| **A. 规则 / 词表**（推荐首版） | 每个主题一张关键词 + 权重表，对 `title`（必要时 `text`）计分，取最高分 | ✅ 完全确定 | ❌ 不需要 | ✅ 能指出命中哪些词 | 精确率尚可，**召回率低**（语义相近但用词不同会漏） |
| **B. Embedding 对固定锚点** | 每个主题一段描述 → 向量；signal 向量与 9 个锚点算余弦，取最高 | ✅ 同一模型同一输入必得同一输出 | ✅ **需要**（API key 或本地模型） | ✅ 能给出相似度 | 明显好于 A |
| **C. LLM 直接分类** | 把 signal 喂给模型选主题 | ❌ **除非**温度 0 + 模型版本钉死 + 结果缓存 | ✅ 需要 | ⚠️ 只能给理由，难复现 | 最好 |

**推荐：首版 A，B 作为明确的升级路径。**

理由：
1. **A 不需要 key。** 选 B/C 会让 Phase 3 和 X / podcast 一样卡在 secrets 上 —— **实现了但 CI 上跑不出东西**，这与仓库现状（§1.4）冲突。
2. **A 的确定性是免费的**，而 C 要额外做温度、版本、缓存的工程才能勉强满足约束 2/3。
3. **方法可换（§0.1）** —— 用 A 把 §5 的输出接口和 gate 定下来，之后换 B 只动 §3。

**A 的代价必须说清**：召回率低。用词不同的同类内容会进 `unclassified`。**这不是 bug，是首版的已知上限**，要写进 §9，并且 `unclassified` 占比要作为**可见指标**输出，让这个代价可测量而不是靠感觉。

### 3.2 无论选哪个，都必须先定的一件事：跨源合并

约束 4 要求把同一事件的多源报道合成。**这一步与分类是两个独立动作，顺序不能反**：

```
signals[] → ① 跨源合并（同一事件 → 一个 cluster）
          → ② 主题分类（cluster → topic）
          → ③ 主题权重（topic → weight）
```

先在 signal 层做主题分类、再尝试合并，会得到"同一主题下的一堆重复项"，而**那不是合并**。**① 的方法同样待定**（标题相似度？URL 规范化？还是也交给 embedding？）—— 这是 D2 的一部分，但容易被漏，所以单列出来。

---

## 4. 主题权重规则（D3，待 D1/D2 定后）

**先明确"权重"是什么、不是什么**：

| 是 | 不是 |
|---|---|
| 一个主题在**当前窗口**内的活跃程度 | 一个主题的**重要性**评分（那是人的判断，Phase 4 的职责） |
| 由**可数的事实**算出（signal 数、源的多样性、时间衰减） | 由 `tier` 换算而来（**约束 5 明确禁止**） |
| **可复现**：同样的输入必得同样的数 | 需要人工调参才像样 |

**建议的初版定义**（待 D1/D2 后细化）：

```
topic_weight = Σ over clusters in topic of (
      source_diversity(cluster)      // 覆盖了多少个不同 source_id —— 单一源刷屏不应等于热度
    × recency(cluster)               // 按 published_at 衰减，半衰期待定
)
```

两个设计点，都在防同一类错误：
- **`source_diversity`**：同一事件被 5 个源报道 ≠ 1 个源连发 5 条。不做这个区分，权重就退化成"谁发得多"。
- **`recency` 用 `published_at` 而不是 `collected_at`**：Phase 2B 特意把两者分开，就是为了这一刻。用 `collected_at` 会把"我们才第一次抓到"误当成"刚发生"。**`published_at` 可为 `null`** —— 那部分怎么算，需定义（建议：排除出权重、但计入 `unclassified` 之外的可见指标，不静默丢弃）。

---

## 5. 输出形态（先定这个，再定方法）

Phase 4 依赖的是这个形状。**它一旦定下，§3 的方法就是可换的。**

```jsonc
// topics.json（派生产物，是否提交待定 —— 见 §5.1）
{
  "generatedAt": "…",
  "windowHours": 336,
  "taxonomyVersion": "v1",           // D1 的版本号。改主题表必须改它 —— 这是历史可比性的锚
  "topics": [
    {
      "topic": "tool-and-protocol",
      "weight": 12.5,                 // §4 的公式
      "signalCount": 14,
      "clusterCount": 9,              // 合并后的"事件"数
      "sourceDiversity": 6,           // 覆盖的 source_id 数
      "signalIds": ["…"]              // 可回溯，沿用 Phase 2 的可追溯性原则
    }
  ],
  "unclassified": {
    "signalCount": 21,
    "ratio": 0.14                     // 健康指标，必须可见
  },
  "clusters": [
    {
      "clusterId": "…",               // 确定性哈希，规则同 signalId
      "topic": "tool-and-protocol",
      "signalIds": ["…"],             // 同一事件的多源 signal
      "primaryUrl": "…"
    }
  ]
}
```

### 5.1 `topics.json` 提交（已定）

**提交。** 它小且有界（当前窗口的快照），而**它的 git 历史就是 Phase 4 需要的历史权重序列** —— 每次 bot 提交给出一份带时间戳的快照，不需要再单独造一份历史文件。

已加进 `.github/workflows/generate-feed.yml` 的 `git add` 列表。`signals.json` 仍然不提交（体积无界）。

---

## 6. 与其他阶段的边界

| 阶段 | 边界 |
|---|---|
| Phase 2 | 提供 `signals[]`。Phase 3 **不修改** signal 的生成、归一、去重 |
| **Phase 4（Radar）** | Phase 3 交付**数值与分组**；Radar 的**呈现与解读**是 Phase 4 的。**Phase 3 不做任何"这个主题重要/有意思"的判断** |
| Phase 5（Digest） | 文案生成，完全不属本阶段 |
| Phase 6（飞书） | 投递，完全不属本阶段 |

**最容易越界的一处**：把"权重高"当成"值得讲"。**权重只回答"多不多"，不回答"重不重要"。** 这个区分是整个 Radar 项目的第 4 条全局硬约束（"Radar ≠ 新闻摘要"）在数据层的落点。

---

## 7. 验证

### 7.0 ⚠️ 首次 CI 运行暴露的缺陷（已修）：gate 测了模块，没测管线

**gate 9/9 全绿，但 CI 提交出去的 `topics.json` 是全空的**（0 signal / 0 cluster / 0 topic）。

**原因**：`normalize-signals.js` 产出的是**去重后**的 `signals.json`。跨 run 去重意味着它只装"上次以来新增的"——安静的 run 就是空的。而聚类的输入是 `signals.json`，于是它拿到空集。**权重被定义成"窗口内的活跃度"（§4），实际算出来的却是"本次运行新增了多少"。**

**gate 为什么没发现**：gate 把 fixture **直接喂给 `cluster-signals.js`**，从不走 CI 的真实顺序（normalize → 聚类）。它验证的是模块，不是管线。**这是"测试与实现同源"之外的另一种盲区 —— 测试覆盖了错误的边界。**

**修法**：给 normalize 加 `--out`，CI 里多一步产出**未去重的窗口产物** `signals-window.json`（`--no-dedup` 不写 state，无副作用），聚类读它而不是读去重后的 delta。并加一条**集成断言**：窗口非空而聚类输入为空即失败 —— 这是唯一能拦住这类静默错误的东西。

**教训写死在这里**：`CLAUDE.md` §3.2 要求"测试与实现同源时引入独立验证"。本条目补充了它的一个近亲 —— **当产物是多个阶段串起来的，gate 必须至少验证一次真实的阶段顺序**，否则每个模块各自绿，接起来是坏的。

### 7.1 可完整验证（9 项，全部已 gate）

| gate | 对象 | 成功信号 |
|---|---|---|
| `G1` | **确定性** | 同一输入 + 同一 `--now` 跑两次，`topics.json` **逐字节**相同 |
| `G2` | **主题合法性** | 每个 `topic` ∈ 主题表；`unclassified` 不作为主题出现；`taxonomyVersion` 匹配 |
| `G3` | **完整性 / 总数守恒** | 每条 signal 恰好归属一次；`Σ topic.signalCount + unclassified.signalCount = 输入数`；无发明、无丢失 |
| `G4` | **权重可复现** | 按 §4 公式**独立重算**每个 cluster 与每个 topic 的权重，与输出一致 |
| `G5` | **权重可解释** | `sourceDiversity` 由 signal 的 `source_id` 独立数出，与输出一致（topic 为各 cluster 的并集） |
| `G6` | **无硬编码提权** | `taxonomy.js` / `topics.js` 的**代码**中不出现 `tier`，也不出现任何具体 registry 源 id |
| `G7` | **`tier` 未进入阶段 3 计算** | `cluster-signals.js` + `lib/topics.js` + `lib/taxonomy.js` 的代码中不出现 `tier` |
| `G8` | **跨源合并生效** | 同一事件的 3 条不同源 signal → 1 个 cluster，`sourceDiversity = 3` |
| `G9` | **`unclassified` 可见** | 桶存在、`ratio` 算术正确、不被静默丢弃 |

> **G6 / G7 先剥离注释再扫描。** 否则"在注释里写明 `tier` 不得使用"这件事本身会触发检查，而显而易见的"修法"就变成了删掉解释。扫描器是刻意朴素的，它是防字面量复现的护栏，不是解析器。
>
> **G7 的范围刻意不含 `generate-feed.js`** —— 它用 `tier` 校验 registry schema，那是合法的，不该被禁。被禁的是 `tier` **进入主题或权重的计算**。

### 7.3 检查是否可信：注入验证（2026-09-29 实测）

按 `CLAUDE.md` §3.1，每条新检查都必须证明**它在被违反时会红**。用 10 条注入违规逐个验证：

| 注入的违规 | 应红 | 实际红 |
|---|---|---|
| `tier` 进入权重代码 | G6, G7 | G6, G7 ✅ |
| 按具体源加成（`SOURCE_BOOST`） | G6 | G6 ✅ |
| 主题表外 id 被放行 | G2 | G2 ✅ |
| 合并阈值设为不可达 | G8 | G8 ✅ |
| 悄悄丢一条 signal | G3 | G3, G8, G9 ✅ |
| 输出层排序随机化 | G1 | G1 ✅ |
| 主题数组排序随机化 | G1 | G1 ✅ |
| 权重漏乘 `source_diversity` | G4 | G4 ✅ |
| `unclassified` 的 signalIds 被静默清空 | G3 | G3 ✅ |
| `sourceDiversity` 恒为 1（数错） | G5 | G5, G8 ✅ |

**这个过程抓到两个真实的夹具缺陷，都已修**：

1. **夹具太薄，G1 测不到主题数组排序。** 最初的夹具只产出 1–2 个主题，打乱主题数组等于没打乱 —— G1 通过了，但那是因为无东西可乱。夹具加厚到跨 7 个主题后，注入被抓住。
2. **夹具里没有任何合并，G4 测不到 `source_diversity` 乘法。** 每个 cluster 的 diversity 都是 1，`weight = diversity × recency` 与 `weight = recency` 数值相同，注入不被发现。夹具加入一对同标题异源 signal 后，注入被抓住。

> **未被抓住的一条不算通过**：单独注入"只破坏内层排序"时 G1 不红 —— 这是**正确的**，因为输出层的排序把它归一了，可观察的产物仍然确定。G1 的职责是产物的确定性（Exit Criteria 的原文是"稳定的主题分组与权重"），不是算法内部的纯性。这个边界写在 `gate-3.js` 的注释里，不要误读成 G1 能证明算法无副作用。

### 7.2 无法验证（必须诚实标注）

- **聚类质量**：分组是否"合理"、主题命名是否贴切 —— 无法 gate，也不在 Exit Criteria 里
- **主题表的完备性**：只会通过 `unclassified` 占比间接暴露
- **权重是否"正确"**：公式只能保证可复现，不能保证符合任何人的直觉

---

## 8. Phase 3 Exit Criteria

全部达成 2026-09-29。可执行证据 = `scripts/gate-3.js`，**9/9 green**，已接入 CI。

**判定原则**
- [x] 聚类方法已选定并记录（D2）—— 首版规则/词表，见 §0 / §3
- [x] 主题体系已冻结并打上 `taxonomyVersion`（D1）—— 9 个主题 / `TAXONOMY_VERSION = "v1"` —— gate `G2`

**产出**
- [x] 主题表落地（§2），每个主题有覆盖边界说明 —— `lib/taxonomy.js`
- [x] `topics.json` 形态按 §5 落地 —— `cluster-signals.js`
- [x] 跨源合并生效 —— gate `G8`
- [x] `unclassified` 占比作为可见指标输出 —— gate `G9`；首版实测 42.6%（§0.3）

**确定性（本阶段的可 gate 核心）**
- [x] 同输入两次运行 `topics.json` 逐字节相同 —— gate `G1`
- [x] 每条 signal 恰好归属一次，总数守恒 —— gate `G3`

**权重**
- [x] 权重可由可数事实解释与重算 —— gate `G4`（重算公式）、gate `G5`（重算 `source_diversity`）
- [x] `tier` 未进入本阶段任何计算 —— gate `G7`
- [x] 无按人 / 按源的硬编码提权 —— gate `G6`

**本阶段不以其为条件**
- 聚类质量达某个人工标准（无法验证，见 §7.2）

> **检查可信度已单独验证**：10 条注入违规全部被对应检查捕获，过程中抓出并修掉了两个真实的夹具缺陷。见 §7.3。

---

## 9. Risks / Open Questions

| 级别 | 风险 / 问题 | 说明与处置 |
|---|---|---|
| ⚠️ **高** | **D1 一旦发布就难以更改** | 见 §0.1。这是本阶段唯一不可逆的决定，**必须在实现前冻结** |
| ⚠️ **高** | **规则版召回率低** | §3.1 的已知代价。处置：`unclassified` 占比作为**可见指标**（§1.2），让代价可测量；升级路径 = 换 embedding（§3.1 B） |
| ⚠️ 中 | **跨源合并的误合** | 把两件不同的事合成一件，比漏合更隐蔽。处置：cluster 必须保留全部 `signalIds` 供人工复核 |
| ⚠️ 中 | **`published_at` 为 `null` 的 signal 如何计入权重** | §4。不得静默丢弃 |
| ⚠️ 中 | **主题漂移** | 语料随时间演化，冻结的表会老化。处置：`taxonomyVersion` + `unclassified` 占比监控；改表要走显式流程 |
| ⚠️ 中 | **权重公式的主观性** | 半衰期、`source_diversity` 的具体形式都是选择。处置：写成本文件里的显式数字（可改、可追溯），不要埋在代码里 |
| 开放问题 | 主题 9 是否应与主题 1 合并 | §2.2。二者信号高度重叠，待看到真实分布再定 |
| 开放问题 | `topics.json` 的提交策略 | §5.1，建议"当前窗口快照 + 极小的历史权重序列" |
| 已知（本阶段不解决） | 单个 signal 的主题多义性 | 现在每个 signal 只归一个主题。多标签留待有证据说明需要时再谈 |

---

## 10. 明确不在 Phase 3 范围内

（按 `CLAUDE.md` §2，本节是交付物的一部分，用于防止后续 session 漂移）

- ❌ **"这个主题重不重要"的判断** —— 那是 Phase 4 的解读层。权重只回答"多不多"
- ❌ **Radar 的可视化与呈现**（→ Phase 4）
- ❌ **Digest 文案生成**（→ Phase 5）
- ❌ **飞书投递**（→ Phase 6）
- ❌ **把 `tier` 换算成任何权重** —— 全局约束 5 明确禁止
- ❌ **按源 / 按个人背景的主题加权** —— 全局约束 1，且是 Exit Criteria 的一条
- ❌ 修改 signal 的生成、归一、去重（Phase 2 已完成，不改）
- ❌ 引入需要新 secrets 的依赖而不在 §3 里显式说明代价
- ❌ 多标签分类（单标签尚无问题证据）
- ❌ 主题的层级化（§2.1 C，无证据需要）
