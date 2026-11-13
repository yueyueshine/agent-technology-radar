# Agent Technology Radar — 周报 — 2026-11-13

> 生态注意力视角。环 = 生态注意力的成熟度，不是「该不该用」。

窗口 336h · 输入 189 signal · 未归类 93 / 189（49.2%）

## 环的移动

对比基线：2026-11-12T15:15:19.771Z

- context-and-memory：试用中 → 已确立（动量 +0.14，源 5）
- inference-and-cost：已确立 → 沉寂（动量 -0.20，源 4）
- product-and-business：已确立 → 试用中（动量 +0.56，源 3）
- eval-and-benchmark：待观察 → 沉寂（动量 -0.50，源 2）

## 扇区全貌

### 已确立（adopt）

#### model-capability —— 模型能力与发布

9 个独立源 · 24 个事件（近 16 / 远 8）· 动量 +0.33

覆盖广（9 个独立源）、动量温和为正（+0.33）—— 生态已收敛且仍在缓升。

- **Release v0.27.3** — github:qwen-code · https://github.com/QwenLM/qwen-code/releases/tag/v0.27.3
- **llama.cpp v1.0.0 : A stronger foundation for the local AI ecosystem** — rss:huggingface-blog · https://huggingface.co/blog/ggml-org/llama-cpp-v1
- **Qwen Code Desktop v0.27.3** — github:qwen-code · https://github.com/QwenLM/qwen-code/releases/tag/desktop-v0.27.3
- **llm-gemini 0.37** — rss:simon-willison · https://simonwillison.net/2026/Nov/12/llm-gemini/
- **Introducing Gemini 4 Hydrogen** — rss:google-deepmind · https://deepmind.google/blog/introducing-gemini-4-hydrogen/
- 还有 19 条

#### context-and-memory —— 上下文与记忆

5 个独立源 · 7 个事件（近 4 / 远 3）· 动量 +0.14

覆盖广（5 个独立源）、动量温和为正（+0.14）—— 生态已收敛且仍在缓升。

- **Token Pooling-Aware Training for Multi-Vector Embedding Models** — rss:huggingface-blog · https://huggingface.co/blog/token-pooling
- **From Full to Hybrid Attention in LLMs** — rss:sebastian-raschka · https://sebastianraschka.com/blog/2026/full-to-hybrid-attention.html
- **Weighted State Souping for Efficient Long-Context Retrieval** — rss:apple-ml · https://machinelearning.apple.com/research/weighted-state-souping
- **On the Importance of Gating: Memorization vs. In-Context Learning in State Space Models** — rss:apple-ml · https://machinelearning.apple.com/research/gating-memorization-in-context
- **[AINews] Inkling 2 Small: 17A-594B trained in 68 hours on 12T tokens, beating Muse Spark** — rss:latent-space · https://latent.space/p/ainews-inkling-2-small-17a-594b-trained-in-68-hours-on-12t-tokens-beating-muse-spark/
- 还有 2 条

#### dev-tooling —— 开发者工具与实践

8 个独立源 · 33 个事件（近 21 / 远 12）· 动量 +0.27

覆盖广（8 个独立源）、动量温和为正（+0.27）—— 生态已收敛且仍在缓升。

- **0.169.0** — github:openai-codex · https://github.com/openai/codex/releases/tag/rust-v0.169.0
- **0.168.0** — github:openai-codex · https://github.com/openai/codex/releases/tag/rust-v0.168.0
- **SDK TypeScript Release v0.1.33** — github:qwen-code · https://github.com/QwenLM/qwen-code/releases/tag/sdk-typescript-v0.1.33
- **v2.1.323** — github:anthropic-claude-code · https://github.com/anthropics/claude-code/releases/tag/v2.1.323
- **Gondola doubles revenue as its team builds more with Codex** — rss:openai-news · https://openai.com/business/customer-stories/gondola
- 还有 28 条

### 试用中（trial）

#### tool-and-protocol —— 工具与协议

3 个独立源 · 3 个事件（近 3 / 远 0）· 动量 +1.00

覆盖达标（3 个独立源）且动量急升（+1.00）—— 共识形成前的活跃试验期。

- **v2.4.0** — github:mcp-servers · https://github.com/modelcontextprotocol/servers/releases/tag/v2.4.0
- **v2.1.321** — github:anthropic-claude-code · https://github.com/anthropics/claude-code/releases/tag/v2.1.321
- **v2.14.0** — github:google-adk-python · https://github.com/google/adk-python/releases/tag/v2.14.0

#### product-and-business —— 产品与商业

3 个独立源 · 9 个事件（近 7 / 远 2）· 动量 +0.56

覆盖达标（3 个独立源）且动量急升（+0.56）—— 共识形成前的活跃试验期。

- **[AINews] Jensen Huang resigns after 33 years leading NVIDIA** — rss:latent-space · https://latent.space/p/ainews-jensen-huang-resigns-after-33-years-leading-nvidia/
- **[AINews] D-Day (Decision Models Day)** — rss:latent-space · https://latent.space/p/ainews-d-day-decision-models-day/
- **Anthropic's IPO roadshow video** — rss:simon-willison · https://simonwillison.net/2026/Nov/11/anthropic-ipo-roadshow/
- **[AINews] Mercor $750m Series D at $20B valuation, $3B run rate** — rss:latent-space · https://latent.space/p/ainews-mercor-750m-series-d-at-20b-valuation-3b-run-rate/
- **What Frontier Labs Buy: A Data Deep Dive with Handshake AI — Garrett Lord & Team** — rss:latent-space · https://latent.space/p/handshake/
- 还有 4 条

### 待观察（assess）

#### agent-framework —— Agent 框架与编排

1 个独立源 · 1 个事件（近 1 / 远 0）· 动量 +1.00

有升势（+1.00）但独立源偏少（仅 1 个）—— 只够放进观察位。

- **aws-emulator** — rss:simon-willison · https://simonwillison.net/2026/Nov/11/aws-emulator/

### 沉寂（hold）

#### inference-and-cost —— 推理与成本

4 个独立源 · 5 个事件（近 2 / 远 3）· 动量 -0.20

动量转负（-0.20，4 个源）—— 注意力在退。

- **NaiveAI Promises 2,100 Tokens per Second. How Well Does It Code?** — rss:latent-space · https://latent.space/p/naiveai/
- **NVIDIA Dynamo Recipes Bring Korea’s Leading Open Models to Production** — rss:nvidia-blog · https://blogs.nvidia.com/blog/nvidia-dynamo-korea-open-models/
- **Vera Delivers the Best of Both Worlds: Highest Throughput and Fastest Agents** — rss:nvidia-blog · https://blogs.nvidia.com/blog/vera-cpu-highest-throughput-fastest-agents/
- **Attention to Mamba: A Recipe for Cross-Architecture Distillation** — rss:apple-ml · https://machinelearning.apple.com/research/attention-mamba-distillation
- **Import AI 479: Spacewar; low-latency tasks versus LLMs; Genie 4** — rss:import-ai · https://jack-clark.net/2026/11/02/import-ai-479-spacewar-low-latency-tasks-versus-llms-genie-4/

#### safety-and-governance —— 安全与治理

4 个独立源 · 7 个事件（近 2 / 远 5）· 动量 -0.43

动量转负（-0.43，4 个源）—— 注意力在退。

- **Theoretical Limits of Language Model Alignment** — rss:apple-ml · https://machinelearning.apple.com/research/theoretical-limits-alignment
- **Cogent and OpenAI build cyber defense factories for enterprises** — rss:openai-news · https://openai.com/index/cogent-security
- **GPT‑6 Cyber: Advancing the frontier of aligned cybersecurity agents** — rss:openai-news · https://openai.com/index/introducing-gpt-6-cyber
- **Setting a new standard for responsible AI infrastructure** — rss:openai-news · https://openai.com/index/setting-new-standard-responsible-ai-infrastructure
- **October sponsors-only newsletter** — rss:simon-willison · https://simonwillison.net/2026/Nov/3/october-newsletter/
- 还有 2 条

#### eval-and-benchmark —— 评测与基准

2 个独立源 · 4 个事件（近 1 / 远 3）· 动量 -0.50

动量转负（-0.50，2 个源）—— 注意力在退。

- **JioStar’s chief architect on AI discovery at 500M-user scale** — rss:openai-news · https://openai.com/index/jiostar-vijay-seshadri
- **Egyptian and Nigerian English join the Open ASR Leaderboard** — rss:huggingface-blog · https://huggingface.co/blog/open-asr-leaderboard-liva
- **Measuring how AI agents handle everyday wet-lab science** — rss:openai-news · https://openai.com/index/measuring-how-ai-agents-handle-wet-lab-science
- **LifeVal** — rss:openai-news · https://openai.com/index/lifeval

## 健康指标

未归类 93 / 189（49.2%）

---

<!-- digest v1 · radar v1 · taxonomy v1 · generated 2026-11-13T14:35:41.000Z · src 2026-11-13T14:35:41.086Z -->

*Generated through the Follow Builders skill: https://github.com/yueyueshine/agent-technology-radar*
