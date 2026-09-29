# Phase 4 — Technology Radar

> 目标：把 Phase 3 的主题与权重映射成 **Radar 视图（扇区 × 环）**，让「生态里什么在动、动到什么程度」一眼可见。
> **完成定义：「能从主题产出确定、可复现的 Radar 视图，且环的归属由显式规则算出」** —— 不是「雷达好看」。
> 前置：Phase 3 Done。

---

## 0. 执行进展与决策记录（2026-09-29）

| 步骤 | 状态 | 备注 |
|---|---|---|
| Step 0 生成本方案 | ✅ Done | 本文件 |
| **D1 — 环的语义** | ✅ **已裁决（2026-09-29）** | **成熟度环**：环 = 生态注意力的成熟度，由「源广度 × 窗口内动量」两条规则算出。**不是**「该不该用」的技术推荐 —— 见 §2 |
| **D2 — 象限/扇区模型** | ✅ **已裁决（2026-09-29）** | **9 个 Phase-3 主题 = 9 个扇区**（极坐标雷达），不做 9→4 人工映射 —— 见 §3 |
| D3 — 动量来源 | ✅ 已定（未单独上会） | **窗口内前后半段对比**，而非跨 run 快照序列 —— 后者今天只有 1 个可用数据点（§1.4），是唯一可行选项 |
| 实现 | ✅ Done | `lib/radar.js` · `build-radar.js` |
| Gate `scripts/gate-4.js` | ✅ Done | **11 项检查**，已接入 CI。**两轮共 15 条注入违规全部被对应检查捕获**（见 §7.3） |

### 0.1 两个裁决为什么这样定

**D1 成熟度环。** 经典 ThoughtWorks 雷达的环是「该不该用」，那是**团队的采用建议** —— 它要求对每个条目做价值判断。本项目的主题不是可「采用」的东西（`safety-and-governance` 谈不上 adopt），而且 Exit Criteria 明确要求「环的归属有**明确规则**支撑」：人工逐主题标注不可 gate、不可复现，直接落选。

**判断留在哪一层，是被全局约束决定的**：PLAN.md 全局约束 4（「Radar ≠ 新闻摘要」）要求 Radar 表达判断，而 Phase 3 §6 把「这个主题重不重要」划给了 Phase 4。于是 Phase 4 的判断必须是**规则化的判断** —— 「生态注意力处在什么成熟阶段」。人工的、逐条的、叙述性的判断属于 Phase 5 文案层。

**D2 九个扇区。** 9→4 的人工映射有损且武断（`product-and-business`、`safety-and-governance` 都不属于 Technique/Tools/Platforms/Languages 任何一格），而且会造出**第二个需要冻结的东西**。直接沿用 9 个主题：零新映射、信息无损、`taxonomyVersion` 自动把历史可比性绑住。

**被否掉的第三个选项**：按 registry 的 `role`（builder/official/researcher/…）分扇区。`role` 是**源的**属性，不是主题的属性；Phase 3 plan §0.2 约束 1 与 5 明确禁止按源/按人加成，拿 `role` 当雷达轴等于把这条禁令绕回来。

### 0.2 上游已固定、本阶段不得违反的约束

| # | 约束 | 来源 |
|---|---|---|
| 1 | **不得因个人历史背景硬编码提权** | PLAN.md 全局约束 1；Phase 3 plan §0.2 |
| 2 | **`tier` 不得换算成任何权重或环归属** | PLAN.md 全局约束 5；Phase 3 plan §10 |
| 3 | **Radar ≠ 新闻摘要** | PLAN.md 全局约束 4。**本阶段的核心验收对象** |
| 4 | 环的归属必须由**显式规则**算出，不是人工标注 | 本阶段 Exit Criteria |
| 5 | 沿用 Phase 3 权重，**不重算、不再施加一次衰减** | PLAN.md Phase 4 Scope |
| 6 | 必须**确定、可复现** | 沿用 Phase 3 Exit Criteria 的口径 |
| 7 | 不得引入新的 secrets 依赖 | 仓库今天零 secrets（Phase 3 plan §1.4） |

> **第 5 条是本阶段最容易写错的一条**，也是 §4 动量定义的全部理由 —— 详见 §4.2。

### 0.3 首版实测（CI 产物，2026-09-29，172 signal）

```
9 sector(s) · adopt=3 trial=1 assess=2 hold=3 · span=336.9h
  model-capability       adopt   w=22.594 breadth=13 clusters=26/11 momentum=+0.405
  dev-tooling            adopt   w=12.959 breadth=7  clusters=15/6  momentum=+0.429
  safety-and-governance  adopt   w= 5.484 breadth=5  clusters=6/3   momentum=+0.333
  context-and-memory     trial   w= 2.087 breadth=3  clusters=3/0   momentum=+1.000
  agent-framework        assess  w= 0.871 breadth=1  clusters=1/0   momentum=+1.000
  inference-and-cost     assess  w= 1.620 breadth=2  clusters=2/2   momentum= 0.000
  product-and-business   hold    w= 4.154 breadth=4  clusters=4/5   momentum=-0.111
  eval-and-benchmark     hold    w= 1.357 breadth=3  clusters=1/2   momentum=-0.333
  tool-and-protocol      hold    w= 0.271 breadth=1  clusters=0/1   momentum=-1.000
```

三件必须如实说明的事：

1. **`measuredSpanHours ≈ 337h`**（取决于构建时刻，实测 336.9–337.0h），与声明的 `336h` 在 1h 容差内一致 —— §1.5 的担心在 CI 上**不成立**（标签是诚实的）。反例在本地：陈旧 feed 文件使跨度变 473.1h，雷达退化成 8 hold / 0 adopt。**这正是把跨度写进产物的价值**。
2. **`trial` 只有 1 个，且它的 `+1.000` 只来自 3 个 cluster 对 0** —— 前半段样本为 0，动量在这个扇区上统计很弱（§9 已记）。这是当天语料的形状，不是规则的缺陷。
3. **`adopt` 的三个扇区动量都是温和正值**（+0.33 ~ +0.43）—— 即「广且在缓慢升温」。真正的「广且稳」（动量 ≈ 0）今天没有出现。`hold` 的三个里混着两种不同的沉寂：`tool-and-protocol` 是窄且降（0/1），`eval-and-benchmark` 是变窄（1/2）—— 四环语义把它们合并了，这是规则的容量上限（§9）。

---

## 1. 背景与关键事实（均为实测）

### 1.1 输入：`topics.json`（CI 产物，2026-09-29）

| 项 | 实测值 |
|---|---|
| 输入规模 | **172 signal → 170 cluster → 9 topic** |
| `unclassified` | 82 signal（**47.7%**） |
| 窗口 | `windowHours = 336`（14 天） |
| `taxonomyVersion` | `v1` |
| 每个 topic 携带 | `weight` · `signalCount` · `clusterCount` · **`sourceDiversity`** · `undatedClusters` · `signalIds` |
| 每个 cluster 携带 | `clusterId` · `topic` · `signalIds` · `primaryUrl` · `sourceDiversity` · **`publishedAtLatest`** · `weight` |

**本阶段只读这个文件。** 不读 `signals.json`（体积无界、含 `text`），不读 `signals-internal.json`（internal 无下游通路，Phase 3 plan §4.3）。

### 1.2 窗口的时间分布是干净的（实测，推翻了一个中途的怀疑）

对 CI 产物按 `publishedAtLatest` 的年龄分桶：

```
age(days) -> cluster count   [0 = 最近 24h]
  0: 15   1: 8   2: 1   3: 16  4: 17  5: 22  6: 22
  7: 19   8: 6   9: 5  10: 5  11: 5  12: 13 13: 16
 14+: 0    实际跨度 = 14.0 天
```

**中途我怀疑过窗口边界被 clamp**（本地跑出来的直方图有 34 个 cluster 堆在第 14 天边界）。查了 `lib/signal.js` 的 `normalizePublishedAt` —— **没有任何 clamp**，它要么解析成功要么返回 `null`。本地那个异常是**本地工作区里陈旧的 feed 文件**（`feed-rss.json` 是 9-23 的）造成的，CI 产物正常。

> **这条写进来的理由**：如果没查，Phase 4 的动量规则会建立在一个不存在的 clamp 上。**怀疑要落到代码上验证，不能靠直方图猜。**

### 1.3 动量轴是可用的（实测，这是本阶段的主要可行性依据）

把 336h 窗口对半切（中点在 168h），对每个主题数**前后半段的 cluster 数**：

| 主题 | 后半段 cluster | 前半段 cluster | 动量 |
|---|---|---|---|
| agent-framework | 1 | 0 | **+1.000** |
| context-and-memory | 3 | 0 | **+1.000** |
| dev-tooling | 15 | 6 | +0.429 |
| model-capability | 26 | 11 | +0.405 |
| safety-and-governance | 6 | 3 | +0.333 |
| *unclassified* | 43 | 39 | +0.049 |
| inference-and-cost | 2 | 2 | 0.000 |
| product-and-business | 4 | 5 | −0.111 |
| eval-and-benchmark | 1 | 2 | −0.333 |
| tool-and-protocol | 0 | 1 | **−1.000** |

**10 个主题得到 9 个不同的动量值，从 −1.00 到 +1.00。** 动量轴能区分，不是摆设 —— 这是「环的归属不是简单按时间排序」能够成立的前提。

### 1.4 跨 run 的权重序列**今天几乎不存在**（实测）

`git log -- topics.json` → **3 个提交版本，其中 2 个是同一天的修复**。也就是说「对比上一份 `topics.json`」在今天只有 1 个可用数据点。

**含义**：任何依赖跨 run 趋势的环规则，在头两周会输出不了有意义的东西。**动量必须来自窗口内的前后半段**（D3）。

> Phase 3 plan §5.1 曾说「`topics.json` 的 git 历史就是 Phase 4 需要的权重序列」—— **那句话在方向上对、在今天不成立**：序列需要时间累积。本阶段不依赖它；它仍是将来做「跨 run 趋势」的现成料。

### 1.5 一个上游观察（不是本阶段的缺陷，但要记录）

`topics.json` 的 `windowHours: 336` 是一个**标签**，不是被强制执行的约束 —— 真正的 lookback 切断发生在 **fetcher 里**（`fetch-channels.js` / `generate-feed.js` 各自的 cutoff），`normalize-signals.js` 本身不做窗口过滤。CI 里 feed 每轮重抓，所以标签与现实一致（实测 14.0 天）。本地工作区存在陈旧 feed 时两者会背离（本地实测跨度 20 天）。

**处置**：本阶段不修上游，但**测量并输出真实的跨度**（`measuredSpanHours`），跨度超出窗口时**打 warning 而不是失败** —— 静默信任标签才是错的。

---

## 2. 环的语义（D1 — 已裁决：成熟度环）

| 环 | 含义 | 一句话 |
|---|---|---|
| `adopt` | **已确立** | 覆盖广、仍在或仍在维持 —— 生态已经收敛 |
| `trial` | **试用中** | 覆盖广、且在快速升温 —— 共识形成前的活跃试验期 |
| `assess` | **待观察** | 有苗头但**源太少** —— 只够放进观察位 |
| `hold` | **沉寂** | 动量转负，或窗口内完全没有活动 |

**这不是「该不该用」。** 环回答的是「生态注意力的成熟度」，不是「你该不该采用这项技术」。后者是人的价值判断，不在本阶段（§6 / §10）。

**四环的强度顺序**：`adopt` > `trial` > `assess` > `hold`（沿用经典雷达的读法：越靠内越成熟）。这个顺序在输出里被用作扇区的稳定排序键的**语义依据**，但扇区位置实际按 §3 的冻结顺序排 —— 见 §5.2。

---

## 3. 扇区模型（D2 — 已裁决：9 个主题即 9 个扇区）

扇区 = Phase 3 的 9 个主题，**顺序 = `lib/taxonomy.js` 里 `TOPICS` 的声明顺序**，永久固定。

```
model-capability · agent-framework · tool-and-protocol · context-and-memory
inference-and-cost · dev-tooling · product-and-business
safety-and-governance · eval-and-benchmark
```

**为什么顺序必须冻结**：雷达的全部价值在于「同一个扇区跨时间的位置可比」。如果扇区按 `weight` 排序（Phase 3 的 `topics` 数组就是按 weight 排的），扇区**每天都会换位置**，读者无法追踪任何东西。这是 Phase 4 与 Phase 3 在输出排序上的**有意分歧**，gate `G3` 专门守它。

**两个必须处理的边界情况**：

1. **窗口内零活动的主题**（本次本地实测 `agent-framework` 曾为 0）。Phase 3 只输出出现过 cluster 的主题，所以这种主题在 `topics.json` 里**根本不存在**。Radar **必须从主题表补齐这一格**，输出 `signalCount: 0`、`momentum: null`、环按 §4 判为 `hold` —— 让「这一格今天没动静」可见，而不是让扇区消失。gate `G9` 守它。
2. **`unclassified` 不是扇区。** 它是 Phase 3 §2.2 定义的健康指标，不是主题。Radar 把它作为**顶层的健康指标**原样带出（`unclassified.ratio`），不放进 `sectors[]`。gate `G2` 守它。

---

## 4. 环规则与阈值（D1 的落地）

### 4.1 规则

对每个扇区 T，从 `topics.json` 的 clusters 里算三个量：

```
mid      = windowHours / 2                              // 168h，从输入的标签取，不硬编码
recent   = |{ cluster ∈ T : publishedAtLatest >= now - mid }|
prior    = |{ cluster ∈ T : publishedAtLatest <  now - mid }|
breadth  = T.sourceDiversity                            // Phase 3 已算好，直接沿用

momentum = (recent + prior) === 0 ? null : (recent - prior) / (recent + prior)
```

环的判定是**有序的、首个命中即返回**（顺序本身是规则的一部分）：

```
1. clusterCount === 0          → hold    // 窗口内一条 cluster 都没有
2. dated === 0（有 cluster 但全无 published_at）→ assess  // 方向不可测，只够观察
3. momentum <  M_RISE          → hold    // 动量转负
4. breadth  <  B_NARROW        → assess  // 有升势但源太少
5. momentum >= M_SURGE         → trial   // 广且急升
6. 否则                         → adopt   // 广且稳
```

> **第 1、2 条是独立审查后从原来一条拆开的（2026-09-29）。** 原版把「`recent + prior === 0`」一律判为 `hold`，但它把两件不同的事合成了一个判断：「窗口内什么都没发生」与「有东西、但一条都读不出时间」。后者判 `hold`（沉寂）是在**声称一个测不出来的趋势**，而 `assess`（待观察）才是诚实的。代码一直按拆开后的语义跑，**是本文件落后于代码** —— 现在两者一致。
>
> 这次拆分的直接后果：原版 G4 的「独立重算」把这条拆分支**照抄了一遍**，于是它验证的是实现、不是方案 —— 把 gate 改成符合旧版文字反而会红。G4 已改为**从输入的时间戳重算**，见 §7.1 与 §7.3。

阈值是**选择，不是事实**，按 Phase 3 §9 的同类处置**显式写在常量里**（`lib/radar.js` 顶部），不埋进算法：

| 常量 | 初值 | 依据 |
|---|---|---|
| `M_RISE` | `0` | 「动量 = 0」不算上升。取 0 而不是某个正数，是为了不引入第二个凭空阈值 |
| `B_NARROW` | `3` | 实测广度分布为 1..13；3 是「至少三个独立源互相印证」的最低线 |
| `M_SURGE` | `0.5` | 实测动量在 {0, ±0.11, ±0.33, +0.41, +0.43, ±1.0}；0.5 把「翻倍级上升」与「温和上升」分开 |

### 4.2 动量**必须**用未衰减的量（本阶段最关键的一条）

Phase 3 §4 的 `weight = source_diversity × recency`，**已经含指数衰减**。如果动量拿 `weight` 前后半段相减，算出来的东西约等于「后半段更近」，**等于把 recency 换个名字**，正好撞上 Exit Criteria 的「不是简单按时间排序」。

所以动量用**未衰减的 cluster 计数**：`recent` / `prior` 是**事件个数**，与 `weight` 无关。

**两个轴的职责划分**（避免两个轴变成同一个轴）：

| 轴 | 回答 | 用的量 |
|---|---|---|
| `breadth` | 有多少**独立的源**在讲这件事 | `sourceDiversity`（源数，不含时间） |
| `momentum` | 这件事**在变多还是变少** | cluster 计数前后半段对比（不含衰减） |

**没有选「用 `Σ sourceDiversity` 当动量」**：那样动量会掺进广度，两个轴共线，`broad × rising` 的 2×2 会退化。牺牲一点「被多源报道的事件更重」的表达力，换两个轴正交。

**未采用的第三条路**：`weight` 直通当动量 —— 被 §4.2 的理由否掉，且 gate `G5` 会专门用一个「两种定义会得出不同答案」的夹具把它钉死。

### 4.3 环的判定必须可解释

输出里每个扇区带 `ringReason`，把三个量与原值写全，例如：

```
"momentum +0.405 >= 0; breadth 13 >= 3; momentum 0.405 < 0.5 -> adopt"
```

这是 Phase 3「权重可解释」原则的延续：**读者要能自己复核环的归属，不需要读代码。**

---

## 5. 输出形态

### 5.1 `radar.json`

```jsonc
{
  "generatedAt": "…",
  "radarVersion": "v1",              // 环语义/阈值的版本号。改规则必须改它
  "taxonomyVersion": "v1",           // 从输入原样带出 —— 主题表一变，雷达不可比
  "sourceGeneratedAt": "…",          // 输入的 generatedAt。用于识别「陈旧产物」：信号数可能相同，来源时间不会
  "windowHours": 336,
  "inputSignalCount": 172,
  "measuredSpanHours": 336.1,        // §1.5：真实的年龄跨度，不信任标签
  "ringRule": {                      // 把当次生效的阈值原样刻进产物，便于日后解释历史
    "momentumMidpointHours": 168,
    "narrowBreadth": 3,
    "surgeMomentum": 0.5
  },
  "sectors": [
    {
      "topic": "model-capability",
      "ring": "adopt",
      "weight": 22.594,              // Phase 3 原值直通，不重算、不再衰减（约束 5）
      "signalCount": 39,
      "clusterCount": 37,
      "breadth": 13,
      "recentClusters": 26,
      "priorClusters": 11,
      "momentum": 0.405,
      "ringReason": "momentum +0.405 >= 0; breadth 13 >= 3; momentum 0.405 < 0.5 -> adopt",
      "signalIds": ["…"]
    }
    // 9 个，顺序固定 = taxonomy 声明顺序
  ],
  "unclassified": { "signalCount": 82, "ratio": 0.477 },   // 健康指标，不是扇区
  "summary": { "adopt": 3, "trial": 1, "assess": 2, "hold": 3 }
}
```

### 5.2 排序规则（两处，都是确定性的）

| 位置 | 排序 | 理由 |
|---|---|---|
| `sectors[]` | **taxonomy 声明顺序** | §3：位置必须跨时间稳定 |
| 环的强度 | `adopt > trial > assess > hold` | §2，只用于 `summary` 与文档表述 |

### 5.3 `radar.json` 提交（决定）

**提交。** 与 `topics.json` 同理：**小且有界**（恒 9 个扇区），且它的 git 历史是「主题在环之间移动」的唯一记录 —— 那正是雷达图想讲的事。加进 workflow 的 `git add` 列表。

`signals.json` / `signals-window.json` / `signals-internal.json` 仍然不提交。

---

## 6. 与其他阶段的边界

| 阶段 | 边界 |
|---|---|
| Phase 3 | 提供 `topics.json`。Phase 4 **不修改** signal 的生成、归一、去重、分类、权重 |
| **Phase 5（Digest）** | Phase 4 交付**结构与环归属**；把雷达**讲成人话**是 Phase 5 的 |
| Phase 6（飞书） | 投递，完全不属本阶段 |

**最容易越界的两处**：

1. **把「环 = adopt」讲成「推荐采用」。** 环只说生态注意力成熟度（§2），不说该不该用。
2. **做可视化/渲染。** 本阶段产出 `radar.json` 与说明文档；**画图、生成图表、写叙述性文案一律不在范围内**（§10）。

---

## 7. 验证

### 7.1 可完整验证（11 项，全部已 gate）

| gate | 对象 | 成功信号 |
|---|---|---|
| `G1` | **确定性** | 同一输入 + 同一 `--now` 跑两次，`radar.json` 逐字节相同 |
| `G2` | **环与扇区合法性** | 每个 `ring` ∈ 四环枚举；9 个主题**恰好各出现一次**；`unclassified` 不作为扇区出现 |
| `G3` | **扇区顺序冻结** | 打乱输入的 `topics` 数组 / 改 weight，`sectors[]` 顺序不变（= taxonomy 顺序） |
| `G4` | **环规则可复现** | 按 §4.1，**从输入的时间戳**独立重算每个扇区的 `recent`/`prior`/环，与输出一致；**中点那条 cluster 必须落在后半段**（`>=` 语义单列断言） |
| `G5` | **动量未衰减** | 夹具构造出「按 weight 算动量」与「按计数算动量」**结论不同**的扇区，输出必须等于后者 |
| `G6` | **weight 与来源直通** | 扇区 `weight` 与输入的 topic weight **精确相等**（不重算、不再衰减）；`sourceGeneratedAt` 与输入的 `generatedAt` 一致 |
| `G7` | **无 tier / 按源加成** | `lib/radar.js` / `build-radar.js` 的**代码**中不出现 `tier` 系标识符（`/\btier/i`，含 `tierBoost`），也不出现具体 registry 源 id |
| `G8` | **健康指标带出** | `unclassified.signalCount` / `ratio` 与输入一致，不被静默丢弃 |
| `G9` | **扇区计数自洽** | 零活动主题仍出扇区（`signalCount=0`、`momentum=null`、`ring=hold`）；**有 cluster 但无 `topics[]` 条目时不得自相矛盾** |
| `G10` | **实测跨度** | `measuredSpanHours` 由 clusters 的 `publishedAtLatest` 独立算出并与输出一致；超窗时**打 warning 不失败** |
| `G11` | **坏 `windowHours` fail-fast** | `windowHours` 缺失 / `0` / 负数 / 非数值时必须**报错退出**，且错误信息点名字段；不得静默产出全 hold |

> `G7` 先剥离注释再扫描（同 Phase 3：在注释里写明 `tier` 不得使用，不该触发检查）。

### 7.2 无法验证（必须诚实标注）

- **环是否「好看」/ 阈值是否合适** —— 无法 gate，也不在 Exit Criteria 里。`M_SURGE = 0.5` 是**单日数据**上选的值，见 §9。
- **「成熟度」这个语义是否被读者认同** —— 语义是裁决结果（§2），不是可测对象。

### 7.3 检查是否可信：注入验证（2026-09-29 实测）

按 `CLAUDE.md` §3.1，每条新检查都必须证明**它在被违反时会红**。用一个把 `scripts/` 复制到临时树、每次只破坏一处的注入脚本，对**被破坏的副本**跑真实的 `gate-4.js`：

| 注入的违规 | 应红 | 实际红 |
|---|---|---|
| 输出混入随机字段 | G1 | G1 ✅ |
| 环取值越出枚举（`hold` → `dormant`） | G2 | G2, G4, G5, G9 ✅ |
| 扇区按 `weight` 排序而不再按 taxonomy | G3 | G3 ✅ |
| 删掉窄广度分支（`assess` 判定消失） | G4 | G4 ✅ |
| 动量改用带衰减的量（按 recency 计数） | G5 | G4, G5, G9 ✅ |
| 对 `weight` 再施加一次衰减 | G6 | G6 ✅ |
| 出现具体源 id（按源加成的前兆） | G7 | G7 ✅ |
| 丢掉 `unclassified` 健康指标 | G8 | G8 ✅ |
| 零活动扇区被过滤掉 | G9 | G2, G3, G4, G9 ✅ |
| 实测跨度被写死成窗口标签 | G10 | G10 ✅ |
| **〔审查 F3〕** 中点判据 `>=` 改成 `>` | G4 | G4 ✅ |
| **〔审查 F2〕** `clusterCount` 改回从 `topics[]` 条目取 | G9 | G9 ✅ |
| **〔审查 F5〕** 去掉 `windowHours` 校验 | G11 | G11 ✅ |
| **〔审查 F6〕** 加入 `TIER_BOOST` 表 | G7 | G7 ✅ |
| **〔审查 F4〕** `sourceGeneratedAt` 不被带出 | G6 | G6 ✅ |

**15 条注入全部被捕获。** 有几条连带触发多个检查（例如把环改成非法值会同时破坏 G2/G4/G5/G9），这是预期内的重叠，不是误报。

**第一轮抓到 1 个真实的 gate 缺陷，已修**：G10 要检查的是「超窗输入会在 **stderr** 上告警」，而它最初用 `execFileSync` 跑子进程 —— 该 API **只在子进程非零退出时才暴露 stderr**，成功退出时拿不到。于是 G10 永远看不到它要检查的那行警告。改用 `spawnSync` 后才真正测到。

**第二轮（独立审查后的回归）**：表里带〔审查〕前缀的五条，正是审查找出的漏洞。G4 由「从输出重算」改为「**从输入时间戳重算 + 单列中点断言**」，`/\btier\b/` 放宽为 `/\btier/i`，新增 G11。这五条从「gate 全绿放行」变成「gate 变红」。

**审查还顺带抓到一处 CI 缺陷，已修**：给断言加来源校验时，我在 JS 注释里写了 `run's` —— **那个单引号会终止 `node -e '...'` 的 shell 引号**，整个 step 在 CI 上会语法错误退出。是**用真实回放**（把 workflow 里的 `run:` 抽出来用 bash 跑）发现的，不是读出来的。

> **这与 Phase 3 §7.0 的教训是同一类，但发生在更前面一层**：Phase 3 是「gate 测了模块，没测管线」；这次是「**gate 的夹具看不见它的被测量**」。两次都是**检查本身的失败模式**，而不是被测代码的。结论一样：**每条检查都要先证明它会红 —— 而且要确认它红得对**（假红和漏红一样没用）。

### 7.4 独立对抗性审查（2026-09-29）

按 `CLAUDE.md` §3.2，交付前做了一次**无作者上下文**的证伪式审查（审查者只有仓库与「假设存在真缺陷」的指令）。它给出 6 条发现，**我逐条重跑复现后才采信**，全部成立、全部已修：

| # | 发现 | 性质 | 处置 |
|---|---|---|---|
| **F1** | G4 的「独立重算」把实现的 `dated === 0 → assess` **照抄了一遍**，于是它验证的是实现而非 §4.1 —— 把 gate 改成符合旧版文字反而变红 | **高** | 方案 §4.1 已补上拆开后的两条（见 §4.1 的说明）；G4 改为从输入时间戳重算 |
| **F2** | 主题有 cluster 但缺 `topics[]` 条目时，`clusterCount` 取条目（0）而 `recent/prior` 取 cluster，产出**自相矛盾**的扇区（reason 写「no clusters」，旁边印着 2 个） | 中 | `clusterCount` 改为从 clusters 数出；G9 增加该场景断言 |
| **F3** | 中点判据 `>=` 改成 `>` **gate 仍全绿** —— 分割线本身无人验（G4 从输出重算，而输出里没有时间戳） | 中 | G4 改为从输入时间戳重算；新增中点夹具 + 中点归属单列断言 |
| **F4** | CI 断言近乎空转：`sectors.length === 9` 由构造保证，`inputSignalCount` 是原样拷贝 —— 把每个环都改成 `hold` 仍通过 | 中低 | `radar.json` 新增 `sourceGeneratedAt`；断言改为校验来源时间 + `summary` 与扇区数一致 |
| **F5** | `windowHours` 缺失 / 为 `0` 时中点变 NaN，所有 cluster 落进前半段，**静默产出全 hold** | 低 | 加 fail-fast 校验；新增 G11 |
| **F6** | G7 的 `/\btier\b/` 可被命名绕过（`TIER_BOOST` 加进去仍全绿） | 低 | 放宽为 `/\btier/i` |

审查同时确认**两件好事**：加 `--now` 后的确定性是真的（输出路径没有 `Date.now()` 泄漏，无 Map/Set 迭代序或键序依赖）；**核心主张成立** —— `breadth` 与 `momentum` 是两个独立输入，同样 2/2 的前后半段、广度 5 与广度 1 会得到 `adopt` 与 `assess`，环不是 recency 的函数。

> **这次审查的价值不在"抓了 6 个 bug"，而在它证明了：由写实现的人写的 gate，会把作者的误解一起固化。** F1 就是最纯的形态 —— G4 不是漏检，是**方向错了**：它把实现当成了标准答案。这也说明 §7.3 的注入验证**再全面也补不上这一层**，因为注入只能验证"检查在预期违反下会红"，而 F1 的违反恰好是"检查符合方案"。

---

## 8. Phase 4 Exit Criteria

可执行证据 = `scripts/gate-4.js`，**11/11 green**，已接入 CI。

**判定原则**
- [x] 环的语义已选定并记录（D1 = 成熟度环）—— §2
- [x] 扇区模型已选定并记录（D2 = 9 主题即 9 扇区）—— §3
- [x] 环的归属由**显式规则**算出，不是人工标注 —— gate `G4`

**产出**
- [x] `radar.json` 形态按 §5 落地 —— `build-radar.js`
- [x] 9 个扇区恒在，零活动者不消失、计数自洽 —— gate `G9`
- [x] `unclassified` 占比作为健康指标带出 —— gate `G8`
- [x] 记录输入的来源时间；CI 断言据此识别陈旧产物 —— gate `G6` + workflow 断言
- [x] 坏输入 **fail-fast**，不静默产出全 hold —— gate `G11`

**「Radar ≠ 新闻摘要」（本阶段的核心验收对象，全局约束 4）**
- [x] 环的归属**不是按时间排序** —— 动量用未衰减计数，gate `G5`
- [x] 分割线本身可被验证（从输入时间戳重算、中点归属单列）—— gate `G4`
- [x] 扇区位置**不随权重漂移** —— gate `G3`
- [x] 环的判定**可被读者复核**（`ringReason` 写全三个量）—— gate `G4`

**确定性**
- [x] 同输入两次运行 `radar.json` 逐字节相同 —— gate `G1`
- [x] 沿用 Phase 3 权重，不重算不再衰减 —— gate `G6`

**禁止项**
- [x] `tier` 未进入本阶段任何计算 —— gate `G7`
- [x] 无按人 / 按源 / 按 role 的硬编码提权 —— gate `G7`

**本阶段不以其为条件**
- 环的分布是否「合理」、阈值是否最优（无法验证，见 §7.2）

> **检查可信度已双重验证**：（1）两轮共 15 条注入违规全部被对应检查捕获；（2）一次无作者上下文的独立证伪审查给出 6 条发现，**逐条复现后全部成立并已修**。两次验证各抓到对方抓不到的东西 —— 见 §7.3 与 §7.4。

---

## 9. Risks / Open Questions

| 级别 | 风险 / 问题 | 说明与处置 |
|---|---|---|
| ⚠️ **高** | **阈值来自单日数据** | `M_SURGE = 0.5` / `B_NARROW = 3` 是在 2026-09-29 一份快照上选的。处置：常量集中在 `lib/radar.js` 顶部、阈值原样刻进产物（`ringRule`）便于日后解释历史；**不冻结环位置**，改阈值只需升 `radarVersion` —— 与 Phase 3 的 `taxonomyVersion` 不同，环是可重算的派生量，改它不废历史 |
| ⚠️ 中 | **前半段样本少，动量噪声大** | 实测 `agent-framework` 的 +1.0 只来自 1 个 cluster（0 → 1）。处置：`ringReason` 把 `recentClusters` / `priorClusters` 一起带出，读者能看到样本量；不引入「最小样本量」阈值（会给规则再加一层主观） |
| ⚠️ 中 | **窗口标签可能不被上游强制执行** | §1.5。处置：输出 `measuredSpanHours` + 超窗 warning；**不静默信任标签** |
| ⚠️ 中 | **扇区数固定为 9** | 主题表若加主题，扇区自动变多（代码不需要改），但**雷达的整体布局会变**。这是 D1/D2 的直接后果，接受 |
| 开放问题 | 是否引入跨 run 趋势（对比上一份 `radar.json`） | §1.4 今天只有 1 个数据点。**不阻塞**：等 `radar.json` 积累几周再谈，届时是与窗口内动量并用还是替代 |
| 开放问题 | `adopt` / `hold` 的命名在中文语境下是否易误读 | §6 已把「环 ≠ 推荐」写进文档；若仍误读，可在 Phase 5 文案层用中文标签（`已确立` / `试用中` / `待观察` / `沉寂`） |
| 已知（本阶段不修） | **`tier` 静态扫描仍是字面量护栏** | G7 已从 `\btier\b` 放宽到 `\btier/i`（能抓 `TIER_BOOST`），但运行期拼出来的标识符仍可绕过。它是防复现的护栏，不是解析器 —— 同上，真正的保证是「权重公式里没有源/人的输入」这条结构性事实 |
| 已知（本阶段不修，**建议后续修**） | **Phase 3 的 gate-3 有同一个扫描漏洞** | `gate-3.js` 的 G6/G7 仍用 `/\btier\b/`，同样可被 `tierBoost` 之类绕过。Phase 3 已 Done，改它的 gate 需要它自己的注入验证，**不在本阶段范围内**，但这条漏洞是真实存在的，记在这里避免它被忘记 |

---

## 10. 明确不在 Phase 4 范围内

（按 `CLAUDE.md` §2，本节是交付物的一部分，用于防止后续 session 漂移）

- ❌ **可视化与渲染**（画雷达图、生成 SVG/HTML、写叙述性文案）—— 本阶段只产出 `radar.json` 与规则说明
- ❌ **「这个主题重不重要」的价值判断** —— 环只说成熟度（§2）。这是把「重要」留给 Phase 5 文案层的显式选择
- ❌ **把环读成「推荐采用」** —— 语义上不成立，且违反全局约束 1 的精神
- ❌ **Digest 文案生成**（→ Phase 5）
- ❌ **飞书投递**（→ Phase 6）
- ❌ **把 `tier` 换算成任何权重或环** —— 全局约束 5 明确禁止
- ❌ **按源 / 按 role / 按个人背景提权** —— 全局约束 1
- ❌ 修改 signal 的生成、归一、去重、分类、主题权重（Phase 2 / 3 已完成，不改）
- ❌ **重算或再衰减 Phase 3 的 `weight`** —— 约束 5，gate `G6` 守
- ❌ 修改 lookback 窗口或上游 fetcher 的 cutoff（§1.5 的上游观察只记录、不修）
- ❌ 引入需要新 secrets 的依赖
