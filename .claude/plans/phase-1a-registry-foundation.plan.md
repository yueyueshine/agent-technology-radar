# Phase 1A — Registry Foundation

> **Phase 1 已拆分为两个子阶段：**
> - **Phase 1A（本文件）— Registry Foundation**：稳定源身份 `id`、registry schema、loader、唯一性 fail-fast 校验、`active` 状态管理。**只搭机制 + 无损迁移现有 34 条源**，不改变抓取行为。
> - **Phase 1B — Radar Source Set**：把源集合真正做成「Radar 的源集合」—— 官方一手源 / Builder / Researcher / GitHub / Aggregator / Discovery。方案见 `.claude/plans/phase-1b-radar-source-set.plan.md`（待撰写）。
>
> **现有 34 条 follow-builders 源只是 1A 的迁移起点，不是 Phase 1 的最终 source set。**
> **1A 完成定义：「机制落地 + 现有源无损迁移」，不是「源集合定型」。**

> 目标：把数据源从写死的 config 升级为可维护的注册表，携带源身份（`id`）与元数据，作为后续 Signal 可追溯性的锚点。
> 前置：Phase 0 Done（执行顺序依赖，非设计约束）。

---

## 0. 执行进展（截至 2026-09-23）

| 步骤 | 状态 | 证据 / 备注 |
|---|---|---|
| Step 0 生成本方案 | ✅ Done | 本文件 |
| Step 1 定稿 registry schema 与 `id` 约定 | ✅ Done | 见 §2;实施期修正：`id` 字符集放开 `_`（3 个真实 handle 含下划线） |
| Step 2 迁移 `config/default-sources.json`（34 条） | ✅ Done | 34 条全部带唯一 `id` + `active: true`；`schemaVersion: 1`。**迁移起点，不是最终 source set**（选型与扩充 → Phase 1B） |
| Step 3 新增 registry schema 文件 | ✅ Done | `config/source-registry.schema.json`，顶部声明与 `config/config-schema.json` 无关；三个未使用字段标 `deprecated` |
| Step 4 改造 `loadSources()` loader | ✅ Done | 校验字面 `id` + 全局唯一 fail-fast + `active` 过滤；三个抓取调用点未改 |
| **Gate G1-P1** blog 端到端可跑（无 key） | ✅ **PASS** | `--blogs-only` exit 0；Anthropic 3 篇 / Claude 走 dedup 判定无新 → 两个解析器分发均验证；`feed-blogs.json` 顶层键与条目字段**均未变** |
| **Gate G2-P1** X / podcast 字段静态等价 | ✅ **PASS** | 34 条原字段值字节等价、无字段丢失、无条数增减、id 唯一 |
| Step 5 说明文档 | ✅ Done | 由 `config/source-registry.schema.json` 承载（字段表 + `id` 规则 + deprecated 标注） |
| 附加：fail-fast 实证 | ✅ Done | 临时注入重复 `id` → `exit 1` + `Source registry: duplicate id "x:karpathy" ...`，随后还原 |

**Phase 1A 实质完成。** 未决：待提交推送；`X_BEARER_TOKEN` / `POD2TXT_API_KEY` 仍缺（X / podcast 只有静态验证，见 §7.2）。

---

## 1. 背景与关键事实

以下均为直接核实的结论。

**当前「registry」就是一份写死的 config**

| 事实 | 值 |
|---|---|
| 文件 | `config/default-sources.json` |
| `podcasts` | 6 条，字段 `name` / `rssUrl` / `url` |
| `blogs` | 2 条，字段 `name` / `type` / `indexUrl` / `articleBaseUrl` / `fetchMethod` |
| `x_accounts` | 26 条，字段 `name` / `handle` |
| **`id`** | **任何条目都没有** —— 全仓没有稳定的源身份 |

**唯一消费者**

| 位置 | 用途 |
|---|---|
| `scripts/generate-feed.js:78` | `loadSources()` 读取该文件（`join(SCRIPT_DIR, "..", "config", "default-sources.json")`） |
| `SKILL.md:53`、`SKILL.md:151` | onboarding 向用户展示源数量 / 清单 |

**字段消费面（registry schema 必须与之逐字对齐）**

| 抓取函数 | 读取的字段 | 调用点 |
|---|---|---|
| `fetchXContent` | `handle`、`name` | `generate-feed.js:1037`（`sources.x_accounts`） |
| `fetchPodcastContent` | `name`、`rssUrl`、`url` | `generate-feed.js:1080`（`sources.podcasts`） |
| `fetchBlogContent` | `name`、`indexUrl`（**解析器按 URL 子串分发**） | `generate-feed.js:1105,1107`（`sources.blogs`） |

- X 数值 user id **不需要入库**：`fetchXContent` 在运行时通过批量 username 查询（5 个一批）从 API 解析，registry 不承载它。
- blog 解析器分发靠字符串匹配：索引页 `generate-feed.js:912-916`（`indexUrl.includes("anthropic.com")` / `.includes("claude.com")`），正文抽取 `generate-feed.js:961-965`（按 `article.url` 子串）。**这是 registry 与抓取逻辑最强的耦合点**，见 §5 / §9。

**去重状态的键（与 registry 无交集）**

| state 键 | 来源 | 与 `id` 的关系 |
|---|---|---|
| `seenTweets` | tweet ID | 无关 —— 键里不含账号身份 |
| `seenVideos` | episode GUID | 无关 —— 键里不含 podcast 身份 |
| `seenArticles` | article URL | 无关 —— 键里不含 blog 身份 |

> `state-feed.json` 的条目在每次保存时裁剪 7 天前的记录（`generate-feed.js:60-72`）。本阶段**不重键**（见 §2.4）。

### 1.1 命名陷阱（必须显式规避）

仓库里存在 `config/config-schema.json`，它**不是**源注册表的 schema —— 它是**终端用户**配置 `~/.follow-builders/config.json` 的 JSON Schema（字段 `platform` / `language` / `timezone` / `frequency` / `deliveryTime` / `weeklyDay` / `delivery{method,chatId,email}` / `onboardingComplete`），且**全仓零代码引用**。

- 新增的源 schema **不得**并入 `config/config-schema.json`，也**不得**命名与之相似。
- 建议命名：`config/source-registry.schema.json`（见 §3）。
- `config/config-schema.json` 本阶段**原样不动**。

### 1.2 已确认未使用字段（经代码复核，共 3 个）

`blogs[]` 条目中有 **三个字段在任何代码里都零引用**（已逐个 grep 复核）。**本阶段保留、不删除**（决策与理由见 §2.3）：

| 字段 | 代码引用数 | 说明 |
|---|---|---|
| `type`（值 `"scrape"`） | **0** | 未被读取 |
| `fetchMethod`（值 `"http"`） | **0** | 未被读取 |
| `articleBaseUrl` | **0** | 未被读取 —— 文章 URL 由代码**硬编码**拼接（`generate-feed.js:686,709` 的 `https://www.anthropic.com/engineering/${slug}`；`:734` 的 `https://claude.com/blog/${slug}`） |

处置建议见 §2.3。

### 1.3 可用性现实（本阶段可验证面的天花板）

| 模式 | 需要 key | 今天能否端到端跑 |
|---|---|---|
| `--blogs-only` | 无 | ✅ 能（可达 `loadSources()`，`generate-feed.js:1029`） |
| `--tweets-only` | `X_BEARER_TOKEN` | ❌ 无 key |
| `--podcasts-only` | `POD2TXT_API_KEY` | ❌ 无 key |
| `all`（cron 默认） | 两者 | ❌ 无 key |

owner 已决定**暂不注册两个 key、不查 X 定价**，且不因此阻塞主线。本方案的验证设计必须建立在「只有 blog 路可实跑」这一硬约束上（§6、§7）。

---

## 2. Registry schema 设计

### 2.1 顶层结构与字段

**推荐：在 `config/default-sources.json` 原地演进，保留 `podcasts` / `blogs` / `x_accounts` 三个键名与数组结构**，每条记录补齐 `id` 与 `active`。理由见 §3。

| 类型 | 每条的字段 | 必填 |
|---|---|---|
| 所有类型 | `id`（string）、`name`（string）、`active`（boolean） | ✅ |
| `podcasts[]` | `rssUrl`、`url` | ✅（沿用现有字段名） |
| `blogs[]` | `indexUrl`；其余现有字段见 §2.3 的处置 | ✅ |
| `x_accounts[]` | `handle`（无前导 `@`） | ✅ |

- 不新增 `type` 字段：条目类型**由所在数组键**（`podcasts` / `blogs` / `x_accounts`）表达，`id` 前缀再冗余编码一次类型（§2.2），避免出现第二处需同步的真相。
- `active` 即 scope 里要求的「活跃度标签」：**纯布尔**，`true` = 参与抓取，`false` = 保留记录但不抓取。**不做任何评分 / 权重**（那是 Phase 3/4）。全量迁移时 34 条一律置 `true`，保证行为零变化。
- 可选顶层 `schemaVersion: 1`，为 registry 自身的结构演进留标记（成本近零，建议加）。

### 2.2 稳定身份 `id` 的约定

Phase 2 的 Signal Feed 要给每条 signal 一个 `source_id` 以回溯来源，因此 `id` 是本阶段最重要的产物。

**格式：`<type-prefix>:<slug>`**

| 类型 | 前缀 | slug 取法 | 示例（取自现网真实条目） |
|---|---|---|---|
| X 账号 | `x:` | `handle` 小写 | `x:karpathy`、`x:swyx`、`x:zarazhangrui` |
| Podcast | `podcast:` | `name` 的 kebab-case slug | `podcast:latent-space`、`podcast:mad-podcast`（源自 "The MAD Podcast with Matt Turck"，可人工缩短） |
| Blog | `blog:` | `name` 的 kebab-case slug | `blog:anthropic-engineering`、`blog:claude-blog` |

**规则（写进 schema 文档）**

1. 字符集 `[a-z0-9_-]`（小写 ASCII 字母、数字、`-`、`_`）。
   > **实施期修正**：原定为 `[a-z0-9-]`，实际迁移时发现 **3 个真实 X handle 含下划线** —— `_catwu`、`alexalbert__`、`ryolu_`（分别对应 Cat Wu、Alex Albert、Ryo Lu）。若不允许 `_`，就得做有损归一化（如 `_catwu` → `catwu`），使 `id` 与 handle 的对应关系变得不可预期。故放开 `_`，直接用小写 handle 作 slug。
2. `id` **人工指派、字面存储**；**严禁在运行时从 `name` / URL 派生**（那会让展示名或 URL 的变更静默改身份）。
3. 全局唯一：loader **fail-fast** 检测重复 `id`，发现即报错退出（不静默）。
4. `id` **一旦发布即不可改** —— 它是 Phase 2 `source_id` 的取值，改动等于切断历史 signal 的可追溯性。改展示名不影响 `id`；`rssUrl` / `handle` 变化也不影响 `id`，这正是把 `id` 与 URL 解耦的意义。
5. 前缀不参与「类型推断以外」的逻辑，仅供人读与防范跨类型撞名。

> X 的 `handle` 是天然键且足够稳定，直接复用为 slug；**不额外存 X 数值 id**（运行时解析，见 §1）。

### 2.3 `type` / `fetchMethod` / `articleBaseUrl`：保留，记录为 cleanup deferred

**决策（owner 已确认）：本阶段保留，不删除。**

| 字段 | 代码引用 | 状态标记 | 本阶段处置 |
|---|---|---|---|
| `type`（值 `"scrape"`） | **0** | `confirmed unused` | 原样保留 |
| `fetchMethod`（值 `"http"`） | **0** | `confirmed unused` | 原样保留 |
| `articleBaseUrl` | **0** | `confirmed unused` | 原样保留 |

**为什么不删**：删除它们虽能消除「误导性元数据」，但属于**与本阶段目标无关的 churn** —— 1A 的目标是建立源身份与 loader 机制，删字段既非必需，又会扩大 diff 面与回归面（仓库无测试兜底）。

**怎么避免它们继续误导人**：

- 在 `config/source-registry.schema.json` 中对三者显式标注 `deprecated`，并注明理由
  「已确认未被任何代码读取 —— 抓取策略实际由 `generate-feed.js:912-916` / `:961-965` 的 URL 子串匹配决定；文章 URL 由 `:686,709,734` 硬编码拼接。清理推迟。」
- 这样「未使用」这一事实**可见且被记录**，而无需在本阶段承担删改风险。

**清理时机**：留到 **Phase 1B** 重做源集合时一并处理 —— 那时源集合本身要重构，删除属于该阶段的内生工作，而非无谓 churn。

### 2.4 与去重状态 `state-feed.json` 的向后兼容

**结论：加入 registry `id` 对去重状态零影响，`state-feed.json` 不需迁移、不需重键。**

- `seenTweets` 键是 tweet ID、`seenVideos` 键是 episode GUID、`seenArticles` 键是 article URL —— **三者都不含源身份**，因此新增 `id` 是纯增量字段。
- **本阶段明令禁止**把 state 重键为 `source_id + ...`。若真这么做，后果是：整个 `state-feed.json` 的去重记忆作废（等价于清空 7 天窗口内的已见集合），旧内容会被当新内容重新抓取并再次发出。这与 Phase 2「去重不产生重复 id」直接冲突，属于**必须避免的动作**。
- 因此本阶段的兼容性声明应当是：**registry `id` 只服务于 Phase 2 的 `source_id`，不进入 Phase 1 的去重键。**

---

## 3. 文件位置：原地演进 vs 替换

**推荐：文件名与路径保持不变 —— 继续用 `config/default-sources.json`，原地演进。**

| 方案 | 说明 | 裁决 |
|---|---|---|
| **原地演进（选）** | 保留路径 + 三键结构，逐条补 `id` / `active` | `loadSources()` 的路径不必改；`SKILL.md` 读取的形状不变 |
| 换新文件（如 `config/sources.json`）并删旧 | 更「registry」，但需改路径 + 兼容 `SKILL.md` | ✗ 无收益的 churn |
| 改为扁平 `sources[]` + `type` 判别 | 更理想的通用 registry，但改了 `SKILL.md` 依赖的键结构 | ✗ 本阶段不做（见下） |

**为什么本阶段不扁平化**：`SKILL.md:53,151` 会读取该文件向用户展示清单，其逻辑对「三键数组」形状敏感；仓库**无测试**兜底；改动形状 = 把一处无测试保护的行为暴露在回归风险下，而扁平化并不带来本阶段任何必需能力。**留作 Open Question**（§9）：若将来第 4 类源真正落地、且 `SKILL.md` 的读取方式已解耦，再考虑扁平化。

**新增 schema 文件**：`config/source-registry.schema.json` —— JSON Schema 描述 §2.1 的字段与约束（含 `id` 的 pattern、`active` 默认值、各类型必填字段），并**在文件顶部注释区显式声明「本文件与 `config/config-schema.json` 无关」**，防止未来读者混淆（§1.1）。本阶段对 registry 的校验可先靠 loader fail-fast（§4），schema 文件先作为规范与文档落地，不强制引入校验依赖。

---

## 4. Loader 改动（函数级，不写代码）

改动集中在**一个函数**，三个调用点**保持不变**。

| 位置 | 现状 | 改动 |
|---|---|---|
| `loadSources()`（`generate-feed.js:77-80`） | 读文件 → 直接 `JSON.parse` 返回 | 读取路径**不变**；解析后增加一步**规范化 + 校验**：① 校验每条含有字面 `id`（无则报错退出）；② 校验 `id` 全局唯一（重复则报错退出）；③ 过滤 `active === false` 的条目（本阶段全为 `true`，行为不变）；④ 返回结构与现状**逐字相同**（仍含 `podcasts` / `blogs` / `x_accounts` 三个数组，条目仍带原有字段） |
| `fetchXContent(sources.x_accounts, …)`（`:1037`） | — | **不改** |
| `fetchPodcastContent(sources.podcasts, …)`（`:1080`） | — | **不改** |
| `fetchBlogContent(sources.blogs, …)`（`:1105,1107`） | — | **不改** |

- 关键设计点：**改动止于 loader**。只要 loader 输出的条目形状与现状逐字一致（`handle`/`name`、`name`/`rssUrl`/`url`、`name`/`indexUrl`），三条抓取链路与各自的分发逻辑都不必感知 registry。这正是「最小耦合面」的落点。
- 可选（服务 Phase 2）：loader 额外导出一个「扁平视图」（把三条数组合并、每条带 `id`），供未来 `source_id` 使用。**本阶段可只留接口、不接线** —— 属 Phase 2 scope。
- `id` 的**派生**不放进 loader：loader 只读取字面 `id`，不做 slug 生成（§2.2 规则 2）。
- 注意 `generate-feed.js` 是**无 exports 的 CLI 单文件脚本**，loader 仍是脚本内部函数；不改其模块形态（不引入 exports / 不拆分文件，避免无关重构）。

---

## 5. 源类型泛化的程度：留缝但不建

**推荐：只留「数据形状 + 一处分发」的缝，不建任何插件 / 解析器注册表抽象。**

具体：

- 缝一（数据）：schema 允许未来新增第 4 个顶层数组键（如 `newsletters`）或新类型前缀，**而不破坏既有三键**。加一个类型 = 加一段数据 + 一条读取分支。
- 缝二（代码）：`main()` 里已有现成的按类型 fan-out 形态（`:1034 / :1077 / :1105` 三段）。第 4 类源届时在此加一段 `if (runXxx)` 即可，无需抽象层。
- **不建**：不引入 `fetchers` 映射表、不把 blog 的 URL 子串分发重构成「parser registry」、不定义通用 `Source` 基类。

**为什么反对过度抽象**：

1. 仓库**无测试无 lint**，任何抽象层都是「无网可依的重构」，回归风险由人肉承担。
2. 项目硬约束含「不做无关重构」；把 blog 分发改造成注册表会**触碰 blog 链路**，直接越界。
3. 只有 3 类源、且第 4 类尚不存在（属 Open Question，非已确认需求）。**为一个假设中的第 4 类源预先抽象，是把不确定性固化成长期维护负担。**
4. 「新增 / 删除源无需改代码」的退出标准，**在同一类型 / 同一 blog 域内即可满足**；跨类型或跨 blog 域的新源本就伴随新解析逻辑，天然需要代码 —— 不应把退出标准误读为「任意新源都零代码」。

> **与 Phase 1B 的关系**：1B 要引入的新类型（官方一手源 / GitHub / Aggregator 等）**正是这些「缝」的用武之地** —— 届时每加一类源 = 加一段数据 + 一条读取分支。1A 只负责把缝留好，**不预建任何抽象**。若 1B 证明某类源需要更重的机制，那属于 1B 的设计决策，不在 1A 提前承担。

---

## 6. 迁移 / 上线顺序与验证 Gate

> 单次 PR 内可完成；若求稳，Step 2 与 Step 4 可拆两个 commit。**CI 定时 run 的现状见 §6.1。**

```
Step 1 定稿 schema + id 约定                       （文档）
  → Step 2 迁移 config/default-sources.json        （数据：补 id/active、删 3 个死字段）
  → Step 3 新增 config/source-registry.schema.json （规范）
  → Step 4 改造 loadSources()                       （代码）
  → ══ Gate G1-P1 ══  blogs-only 端到端跑通、无异常、无回退
  → ══ Gate G2-P1 ══  X/podcast 字段静态等价（值逐字一致）
  → Step 5 说明文档 → 合入
```

| Gate | 检查内容 | 通过条件 |
|---|---|---|
| **G1-P1**（实跑） | 本地 / CI 触发 `--blogs-only` | loader 正常执行、blog 分发选中正确解析器、**无新增异常**；`feed-blogs.json` 结构不变 |
| **G2-P1**（静态） | 迁移前后，`x_accounts` / `podcasts` 每条被代码读取的字段逐字对比 | `handle`/`name`、`name`/`rssUrl`/`url` **字节等价**；无条数增减 |

**回滚**：改动面 = 1 个 JSON + 1 个新 schema 文件 + 1 个函数的规范化段。`git revert` 单 commit 即回到旧态，成本极低。

### 6.1 关于 CI 定时运行（必须诚实说明）

cron（`17 6 * * *`）= `all` 模式 = 同时需要两个 key。而 key 检查（`generate-feed.js:1020-1027`）发生在 `loadSources()`（`:1029`）**之前** —— 因此**今天**，每日 cron 会在加载 registry 之前就 `exit(1)`，**根本走不到 Phase 1 的代码**。

- 结论：**本阶段不能依赖「CI 每天在跑」来获得回归覆盖。** 定时 run 今天是红且空转的（Phase 0 已记录为预期行为）。
- 只有在 key 到位后，cron 的 `all` 模式才会真正执行 registry 驱动的 X / podcast 路径；blog 路径也会随之被覆盖。
- 今天唯一能实跑 registry 的路径是**手动 `--blogs-only`**（`runTweets` / `runPodcasts` 均为 false，跳过 key 检查，抵达 `loadSources()`）。
- 以上写入 §7 验证策略，避免把「CI 在跑」误当成 Phase 1 已验证。

---

## 7. 验证（Verification）

### 7.1 今天可完整验证（端到端）

| 对象 | 成功信号 |
|---|---|
| registry 文件 | JSON 合法；34 条（6+26+2）齐全；每条有唯一 `id`；`SKILL.md` 读取的键结构未变 |
| loader（`:77-80`） | 手动 `--blogs-only` 时正常执行，无报错退出；`active` 过滤生效（当前全 `true` 故行为不变） |
| blog 链路端到端 | `--blogs-only` 后 `feed-blogs.json` 结构不变；解析器分发（`:912-916`、`:961-965`）被正确选中；**无新异常** |

> 注意：blog 链路「很少产出新内容」（且 `seenArticles` 去重），一次 run 可能产出 0 条。**「无回退」的判据是「机制正常、无异常、结构不变」，而非「必须产出新条目」。**

### 7.2 今天只能静态验证（无 key，不能端到端）

| 对象 | 验证方式 | 通过条件 |
|---|---|---|
| X registry 条目 | 迁移前后对 `handle` / `name` 做逐字段 diff | 字节一致，无增删 |
| podcast registry 条目 | 同上，对 `name` / `rssUrl` / `url` | 字节一致，无增删 |
| X / podcast 代码路径 | 确认 `:1037` / `:1080` 的调用与字段读取未变 | 与迁移前逐字相同 |

**运行时端到端验证（X / podcast）明确 defer 到 key 到位之后** —— 本阶段不把它写成已达成，也不为它伪造证据。

### 7.3 机制性验证（补充）

- `node --check scripts/generate-feed.js`：语法通过。
- loader 的 fail-fast：临时制造一次重复 `id`，确认脚本报错退出（验证 §4 的校验真的生效），随后复原。

---

## 8. Phase 1A Exit Criteria（Checklist）

**完成定义：「机制落地 + 现有 34 条源无损迁移」，不是「源集合定型」。**
**Source set 的选型与扩充不在 1A** —— 那是 Phase 1B。

- [x] `config/default-sources.json` 中 34 条源全部迁移，每条带唯一稳定 `id`
- [x] `id` 约定落文档（`<type-prefix>:<slug>`），并经 loader fail-fast 校验唯一性（**已实证**：注入重复 `id` → `exit 1`）
- [x] `config/source-registry.schema.json` 落地，且与 `config/config-schema.json` 命名 / 职责清晰区分
- [x] `loadSources()` 完成规范化 + 校验 + `active` 过滤；三条抓取调用点（`:1037` / `:1080` / `:1105,1107`）**未改**
- [x] 新增 / 删除一个**同类型（含同 blog 域）源**无需改代码（编辑 JSON 即可）—— 由 registry 驱动的 loader 结构性保证
- [x] **抓取行为无回退（分档表述）**：
  - [x] blog 路：`--blogs-only` 实跑 `exit 0`，两个解析器分发均正确，`feed-blogs.json` 顶层键与条目字段均未变
  - [x] X / podcast 路：registry 字段与迁移前**静态逐字等价**，代码路径未变；**运行时验证按 §7.2 defer 到 key 到位**
- [x] `active` 过滤**已实证**：把 `blog:claude-blog` 置 `active: false` 后，该 blog 被完全跳过
- [x] 去重状态 `state-feed.json` **未重键**，兼容性不受影响
- [x] 说明文档给出字段表与 `id` 规则（由 schema 文件承载）

**不计入本阶段退出条件**（诚实降级）：
X / podcast 两条 feed 的**运行时**无回退验证、`X_BEARER_TOKEN` / `POD2TXT_API_KEY` 的配置。

---

## 9. Risks / Open Questions

| 级别 | 风险 / 问题 | 说明与处置 |
|---|---|---|
| ⚠️ 高（结构性） | **key 缺位压缩了可验证面** | 只有 blog 路可端到端跑；X / podcast 只能静态等价。**不接受**为此伪造「已跑通」结论；按 §7 分档、按 §8 分档表述退出标准 |
| ⚠️ 高（耦合） | registry 与 `generate-feed.js` 的 **URL 子串分发**（`:912-916`、`:961-965`）耦合 | 分发按 URL 子串而非条目序号，故**增删 / 重排 blog 条目不破坏分发**；但**新域名的 blog 仍会落空**（两条 `if` 都不命中 → 无解析器）。故「新增源无需改代码」**仅在同一 blog 域内成立** —— 此限制写入退出标准（§8），不夸大 |
| ⚠️ 中 | **无测试无 lint**，回归只能靠人肉 | 用 §6 的 G1-P1（实跑）+ G2-P1（字段逐字 diff）+ `node --check` 补网；本阶段**不新建测试框架**（属无关扩张，另议） |
| ⚠️ 中 | `SKILL.md:53,151` 形状耦合 | schema 设计**保留三键数组结构**正是为规避此项；扁平化需先解耦 `SKILL.md`，本阶段不做 |
| 开放问题 | 原地演进 vs 扁平化 registry | **推荐原地演进**（§3）；扁平化推迟到第 4 类源真正落地且 `SKILL.md` 解耦后再议 |
| 开放问题 | `active` 标定义 | 本阶段**纯布尔、默认 `true`、全量不变**；是否需要更多标签（如「低频」）留待第 4 类源场景；**严禁**引入权重 |
| 已决（不再开放） | 未使用字段处置 | 经复核共 **3 个**零引用字段（`type` / `fetchMethod` / `articleBaseUrl`，见 §1.2）。**决策：本阶段保留，记录为 `confirmed unused / cleanup deferred`**，在 schema 中标注 `deprecated`；真正清理留到 Phase 1B（§2.3） |
| 已知（继承 Phase 0） | 7 天 TTL 使旧内容可能复现 | 与 Phase 1 无关但相邻；state 键在本阶段**不动**，问题留 Phase 2 处理 |
| 已知 | 定时 cron 今天不覆盖本阶段代码 | §6.1：cron 在 `loadSources()` 之前 `exit(1)`；勿将「CI 在跑」误判为 Phase 1 已验证 |

---

## 10. 临时上游依赖：Phase 1 不解除（明确结论）

`scripts/prepare-digest.js` 的 `FEED_X_URL`（第 34 行）与 `FEED_PODCASTS_URL`（第 35 行）仍指向上游 `zarazhangrui/follow-builders`；`FEED_BLOGS_URL`（第 36 行）与 `PROMPTS_BASE`（第 38 行）已指自有仓库。

**Phase 1 是否移除该依赖？否。** 依据：只有 fork 自己能产出 `feed-x.json` / `feed-podcasts.json` 时才可重指向，而这需要 `X_BEARER_TOKEN` / `POD2TXT_API_KEY` —— owner 已决定暂不注册。Source Registry 只改变「源的表达方式」，不产生 key，也不联网抓 X / podcast。

**结论：该临时上游依赖原样携带到 Phase 2。** 本阶段的产出为它的**移除铺路**（提供 `source_id` 所依赖的源身份），但**不得声称 Phase 1 已移除它**。这与 `PLAN.md` §0「Phase 1 / Phase 2 建立自有 Source Registry 与 Signal Feed 后移除」的表述一致。

---

## 11. 明确不在 Phase 1A 范围内（防止未来 session 漂移）

- ❌ 任何 UI
- ❌ 主题判断 / 聚类 / 权重 / 评分 / Eval 相关内容（→ Phase 3、Phase 4）
- ❌ Blog 链路的功能改动（抓取 / 解析 / 分发逻辑一律不碰；仅允许在 registry 中表达它，并对其未使用字段**标注 deferred —— 不删除**）
- ❌ **Radar Source Set 的选型与扩充**（官方一手源 / Builder / Researcher / GitHub / Aggregator / Discovery）→ **Phase 1B**。1A 只把现有 34 条无损迁入 registry，**不新增、不移除、不重排源**
- ❌ 把 blog 的 URL 子串分发重构为 parser registry / 引入任何插件抽象（§5）
- ❌ 无关重构（清理 `proper-lockfile` 死依赖、拆分 `generate-feed.js`、引入 exports / 模块化）
- ❌ 重命名 `~/.follow-builders` 目录（破坏性、零收益）
- ❌ 品牌改名（skill 名、`scripts/package.json` 包名、`config/config-schema.json` 描述等）
- ❌ 重键 `state-feed.json`（会作废去重记忆，§2.4）
- ❌ 新建测试框架 / lint（属独立议题，本阶段以 §6 Gate 补网）
- ❌ X / podcast 两条 feed 的接管与上游依赖移除（无 key；依赖携带到 Phase 2，§10）
- ❌ 扁平化 registry（推迟，§3 / §9）
- ❌ 飞书投递（→ Phase 6）
