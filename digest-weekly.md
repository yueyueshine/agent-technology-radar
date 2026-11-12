# Agent Technology Radar — 周报 — 2026-11-12

> 生态注意力视角。环 = 生态注意力的成熟度，不是「该不该用」。

窗口 336h · 输入 183 signal · 未归类 94 / 183（51.4%）

## 环的移动

对比基线：2026-11-11T14:23:40.901Z

- model-capability：沉寂 → 已确立（动量 +0.20，源 8）
- agent-framework：沉寂 → 待观察（动量 +1.00，源 1）
- dev-tooling：试用中 → 已确立（动量 +0.48，源 7）
- product-and-business：待观察 → 已确立（动量 +0.33，源 3）
- safety-and-governance：已确立 → 沉寂（动量 -0.67，源 3）

## 扇区全貌

### 已确立（adopt）

#### model-capability —— 模型能力与发布

8 个独立源 · 20 个事件（近 12 / 远 8）· 动量 +0.20

覆盖广（8 个独立源）、动量温和为正（+0.20）—— 生态已收敛且仍在缓升。

- **Release v0.27.1** — github:qwen-code · https://github.com/QwenLM/qwen-code/releases/tag/v0.27.1
- **Gemini Omni 1.2 Flash: Fast and cost-effective with longer clips** — rss:google-deepmind · https://deepmind.google/blog/gemini-omni-12-flash-fast-and-cost-effective-with-longer-clips/
- **Gemini Decisions API** — rss:simon-willison · https://simonwillison.net/2026/Nov/11/gemini-decisions-api/
- **Gemini Decisions API: Fast, calibrated multimodal decisions** — rss:google-ai · https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/
- **llm-gemini 0.36** — rss:simon-willison · https://simonwillison.net/2026/Nov/10/llm-gemini/
- 还有 15 条

#### inference-and-cost —— 推理与成本

4 个独立源 · 5 个事件（近 3 / 远 2）· 动量 +0.20

覆盖广（4 个独立源）、动量温和为正（+0.20）—— 生态已收敛且仍在缓升。

- **NaiveAI Promises 2,100 Tokens per Second. How Well Does It Code?** — rss:latent-space · https://latent.space/p/naiveai/
- **NVIDIA Dynamo Recipes Bring Korea’s Leading Open Models to Production** — rss:nvidia-blog · https://blogs.nvidia.com/blog/nvidia-dynamo-korea-open-models/
- **Vera Delivers the Best of Both Worlds: Highest Throughput and Fastest Agents** — rss:nvidia-blog · https://blogs.nvidia.com/blog/vera-cpu-highest-throughput-fastest-agents/
- **Attention to Mamba: A Recipe for Cross-Architecture Distillation** — rss:apple-ml · https://machinelearning.apple.com/research/attention-mamba-distillation
- **Import AI 479: Spacewar; low-latency tasks versus LLMs; Genie 4** — rss:import-ai · https://jack-clark.net/2026/11/02/import-ai-479-spacewar-low-latency-tasks-versus-llms-genie-4/

#### dev-tooling —— 开发者工具与实践

7 个独立源 · 31 个事件（近 23 / 远 8）· 动量 +0.48

覆盖广（7 个独立源）、动量温和为正（+0.48）—— 生态已收敛且仍在缓升。

- **Holiday Extras is rethinking what it can build with Codex** — rss:openai-news · https://openai.com/business/customer-stories/holidays-extras-codex
- **0.167.2** — github:openai-codex · https://github.com/openai/codex/releases/tag/rust-v0.167.2
- **AI Engineer Code Summit: OpenAI on New Ways of Working With Codex** — rss:latent-space · https://latent.space/p/codex-work/
- **GitHub App support for Enterprise Copilot seat management** — rss:github-copilot-changelog · https://github.blog/changelog/2026-11-10-github-app-support-for-enterprise-copilot-seat-management
- **0.167.1** — github:openai-codex · https://github.com/openai/codex/releases/tag/rust-v0.167.1
- 还有 26 条

#### product-and-business —— 产品与商业

3 个独立源 · 9 个事件（近 6 / 远 3）· 动量 +0.33

覆盖广（3 个独立源）、动量温和为正（+0.33）—— 生态已收敛且仍在缓升。

- **[AINews] D-Day (Decision Models Day)** — rss:latent-space · https://latent.space/p/ainews-d-day-decision-models-day/
- **Anthropic's IPO roadshow video** — rss:simon-willison · https://simonwillison.net/2026/Nov/11/anthropic-ipo-roadshow/
- **[AINews] Mercor $750m Series D at $20B valuation, $3B run rate** — rss:latent-space · https://latent.space/p/ainews-mercor-750m-series-d-at-20b-valuation-3b-run-rate/
- **What Frontier Labs Buy: A Data Deep Dive with Handshake AI — Garrett Lord & Team** — rss:latent-space · https://latent.space/p/handshake/
- **NVIDIA Announces New Planned Investments in Korean Startups at the MSIT-NVIDIA AI Startup Partnership Forum** — rss:nvidia-blog · https://blogs.nvidia.com/blog/korean-startup-investments-msit/
- 还有 4 条

### 试用中（trial）

#### tool-and-protocol —— 工具与协议

3 个独立源 · 3 个事件（近 3 / 远 0）· 动量 +1.00

覆盖达标（3 个独立源）且动量急升（+1.00）—— 共识形成前的活跃试验期。

- **v2.4.0** — github:mcp-servers · https://github.com/modelcontextprotocol/servers/releases/tag/v2.4.0
- **v2.1.321** — github:anthropic-claude-code · https://github.com/anthropics/claude-code/releases/tag/v2.1.321
- **v2.14.0** — github:google-adk-python · https://github.com/google/adk-python/releases/tag/v2.14.0

#### context-and-memory —— 上下文与记忆

5 个独立源 · 7 个事件（近 6 / 远 1）· 动量 +0.71

覆盖达标（5 个独立源）且动量急升（+0.71）—— 共识形成前的活跃试验期。

- **Token Pooling-Aware Training for Multi-Vector Embedding Models** — rss:huggingface-blog · https://huggingface.co/blog/token-pooling
- **From Full to Hybrid Attention in LLMs** — rss:sebastian-raschka · https://sebastianraschka.com/blog/2026/full-to-hybrid-attention.html
- **Weighted State Souping for Efficient Long-Context Retrieval** — rss:apple-ml · https://machinelearning.apple.com/research/weighted-state-souping
- **On the Importance of Gating: Memorization vs. In-Context Learning in State Space Models** — rss:apple-ml · https://machinelearning.apple.com/research/gating-memorization-in-context
- **[AINews] Inkling 2 Small: 17A-594B trained in 68 hours on 12T tokens, beating Muse Spark** — rss:latent-space · https://latent.space/p/ainews-inkling-2-small-17a-594b-trained-in-68-hours-on-12t-tokens-beating-muse-spark/
- 还有 2 条

### 待观察（assess）

#### agent-framework —— Agent 框架与编排

1 个独立源 · 1 个事件（近 1 / 远 0）· 动量 +1.00

有升势（+1.00）但独立源偏少（仅 1 个）—— 只够放进观察位。

- **aws-emulator** — rss:simon-willison · https://simonwillison.net/2026/Nov/11/aws-emulator/

#### eval-and-benchmark —— 评测与基准

2 个独立源 · 4 个事件（近 3 / 远 1）· 动量 +0.50

有升势（+0.50）但独立源偏少（仅 2 个）—— 只够放进观察位。

- **JioStar’s chief architect on AI discovery at 500M-user scale** — rss:openai-news · https://openai.com/index/jiostar-vijay-seshadri
- **Egyptian and Nigerian English join the Open ASR Leaderboard** — rss:huggingface-blog · https://huggingface.co/blog/open-asr-leaderboard-liva
- **Measuring how AI agents handle everyday wet-lab science** — rss:openai-news · https://openai.com/index/measuring-how-ai-agents-handle-wet-lab-science
- **LifeVal** — rss:openai-news · https://openai.com/index/lifeval

### 沉寂（hold）

#### safety-and-governance —— 安全与治理

3 个独立源 · 6 个事件（近 1 / 远 5）· 动量 -0.67

动量转负（-0.67，3 个源）—— 注意力在退。

- **Cogent and OpenAI build cyber defense factories for enterprises** — rss:openai-news · https://openai.com/index/cogent-security
- **GPT‑6 Cyber: Advancing the frontier of aligned cybersecurity agents** — rss:openai-news · https://openai.com/index/introducing-gpt-6-cyber
- **Setting a new standard for responsible AI infrastructure** — rss:openai-news · https://openai.com/index/setting-new-standard-responsible-ai-infrastructure
- **October sponsors-only newsletter** — rss:simon-willison · https://simonwillison.net/2026/Nov/3/october-newsletter/
- **OpenAI appoints Dan Driscoll as Senior Counselor for National Security Modernization** — rss:openai-news · https://openai.com/index/dan-driscoll-joins-openai
- 还有 1 条

## 健康指标

未归类 94 / 183（51.4%）

---

<!-- digest v1 · radar v1 · taxonomy v1 · generated 2026-11-12T15:15:19.000Z · src 2026-11-12T15:15:19.771Z -->

*Generated through the Follow Builders skill: https://github.com/yueyueshine/agent-technology-radar*
