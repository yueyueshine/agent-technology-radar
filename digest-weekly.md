# Agent Technology Radar — 周报 — 2026-10-06

> 生态注意力视角。环 = 生态注意力的成熟度，不是「该不该用」。

窗口 336h · 输入 155 signal · 未归类 72 / 155（46.5%）

## 环的移动

对比基线：2026-10-05T14:40:16.367Z

- model-capability：已确立 → 沉寂（动量 -0.09，源 10）
- inference-and-cost：已确立 → 待观察（动量 +1.00，源 2）

## 扇区全貌

### 已确立（adopt）

#### context-and-memory —— 上下文与记忆

4 个独立源 · 4 个事件（近 2 / 远 2）· 动量 +0.00

覆盖广（4 个独立源）、动量持平 —— 生态已收敛，处于稳定期。

- **NVIDIA DGX Spark 64GB Gives Developers More Ways to Build and Scale Local AI** — rss:nvidia-blog · https://blogs.nvidia.com/blog/local-ai-dgx-spark-64gb-sync/
- **v2.11.0** — github:google-adk-python · https://github.com/google/adk-python/releases/tag/v2.11.0
- **Advancing Private AI Compute with secure, server-side memory** — rss:google-deepmind · https://deepmind.google/blog/advancing-private-ai-compute-with-secure-server-side-memory/
- **Better prompt caching for GPT-6** — rss:openai-news · https://openai.com/index/better-prompt-caching-for-gpt-6

#### dev-tooling —— 开发者工具与实践

7 个独立源 · 14 个事件（近 9 / 远 5）· 动量 +0.29

覆盖广（7 个独立源）、动量温和为正（+0.29）—— 生态已收敛且仍在缓升。

- **SDK TypeScript Release v0.1.18** — github:qwen-code · https://github.com/QwenLM/qwen-code/releases/tag/sdk-typescript-v0.1.18
- **v2.1.289** — github:anthropic-claude-code · https://github.com/anthropics/claude-code/releases/tag/v2.1.289
- **v2.1.288** — github:anthropic-claude-code · https://github.com/anthropics/claude-code/releases/tag/v2.1.288
- **Copilot code review: API support and new default effort level** — rss:github-copilot-changelog · https://github.blog/changelog/2026-10-02-copilot-code-review-api-support-and-new-default-effort-level
- **GitHub Copilot can now interact with desktop apps with computer use** — rss:github-copilot-changelog · https://github.blog/changelog/2026-10-01-github-copilot-can-now-interact-with-desktop-apps
- 还有 9 条

#### eval-and-benchmark —— 评测与基准

4 个独立源 · 6 个事件（近 3 / 远 3）· 动量 +0.00

覆盖广（4 个独立源）、动量持平 —— 生态已收敛，处于稳定期。

- **SCLATE: A Substrate for Continual-Learning Agent Training and Evaluation** — rss:apple-ml · https://machinelearning.apple.com/research/sclate-agent-training-evaluation
- **Open TTS Leaderboard: Scalable Evaluation for Multilingual Text-to-Speech and Voice Cloning** — rss:huggingface-blog · https://huggingface.co/blog/open-tts-leaderboard
- **NVIDIA Kumo Tabular Sets a New Accuracy-Efficiency Frontier for Tabular Prediction** — rss:huggingface-blog · https://huggingface.co/blog/nvidia/kumo-tabular
- **Language Models for Text Classification: From Bag-of-Words to Jev** — rss:sebastian-raschka · https://magazine.sebastianraschka.com/p/classifier-history-and-jev
- **Wayfair boosts catalog accuracy and support speed with OpenAI** — rss:openai-news · https://openai.com/index/wayfair
- 还有 1 条

### 试用中（trial）

#### agent-framework —— Agent 框架与编排

5 个独立源 · 5 个事件（近 4 / 远 1）· 动量 +0.60

覆盖达标（5 个独立源）且动量急升（+0.60）—— 共识形成前的活跃试验期。

- **v2.1.290** — github:anthropic-claude-code · https://github.com/anthropics/claude-code/releases/tag/v2.1.290
- **Import AI 475: Swarm scaling; Google DeepMind watermarks biology; and the AI science economy** — rss:import-ai · https://jack-clark.net/2026/10/05/import-ai-475-swarm-scaling-google-deepmind-watermarks-biology-and-the-ai-science-economy/
- **Dynamic workflows in Copilot CLI and the Copilot app** — rss:github-copilot-changelog · https://github.blog/changelog/2026-10-01-dynamic-workflows-in-copilot-cli-and-the-copilot-app
- **How Much of a Harness Does a Strong Agent Need for Autonomous ML Engineering?** — rss:apple-ml · https://machinelearning.apple.com/research/harness-autonomous-ml-engineering
- **Bluesky reply bot checker** — rss:simon-willison · https://simonwillison.net/2026/Sep/27/bluesky-bot-check/

### 待观察（assess）

#### tool-and-protocol —— 工具与协议

2 个独立源 · 2 个事件（近 1 / 远 1）· 动量 +0.00

动量持平但独立源偏少（仅 2 个）—— 只够放进观察位。

- **0.160.1** — github:openai-codex · https://github.com/openai/codex/releases/tag/rust-v0.160.1
- **Getting the Source Right, Not Just the Fact: Source-Aware Verification for MCP Agents** — rss:huggingface-blog · https://huggingface.co/blog/MultiverseComputingCAI/getting-the-source-right-not-just-the-fact-source

#### inference-and-cost —— 推理与成本

2 个独立源 · 3 个事件（近 3 / 远 0）· 动量 +1.00

有升势（+1.00）但独立源偏少（仅 2 个）—— 只够放进观察位。

- **Quoting Felix Rieseberg** — rss:simon-willison · https://simonwillison.net/2026/Oct/5/felix-rieseberg/
- **September sponsors-only newsletter** — rss:simon-willison · https://simonwillison.net/2026/Oct/3/newsletter/
- **Disrupting a coordinated model-distillation campaign** — rss:openai-news · https://openai.com/index/disrupting-a-coordinated-model-distillation-campaign

### 沉寂（hold）

#### model-capability —— 模型能力与发布

10 个独立源 · 35 个事件（近 16 / 远 19）· 动量 -0.09

动量转负（-0.09，10 个源）—— 注意力在退。

- **Qwen Code Desktop v0.25.0** — github:qwen-code · https://github.com/QwenLM/qwen-code/releases/tag/desktop-v0.25.0
- **[AINews] not much happened today** — rss:latent-space · https://www.latent.space/p/ainews-not-much-happened-today-cee
- **Selected models in GitHub Copilot deprecated** — rss:github-copilot-changelog · https://github.blog/changelog/2026-10-02-selected-models-in-github-copilot-deprecated
- **A model guide for the GPT-6 family** — rss:openai-news · https://openai.com/index/practical-guide-building-gpt-6
- **Inside-Out AI: Rebuilding Airbnb Behind the Scenes and Across the Guest Experience** — rss:latent-space · https://www.latent.space/p/airbnb
- 还有 30 条

#### product-and-business —— 产品与商业

4 个独立源 · 7 个事件（近 3 / 远 4）· 动量 -0.14

动量转负（-0.14，4 个源）—— 注意力在退。

- **[AINews] Reflection Beam - 501B-A23B American Open Model** — rss:latent-space · https://www.latent.space/p/ainews-reflection-beam-501b-a23b
- **How Albertsons Companies is reimagining retail from the inside out** — rss:openai-news · https://openai.com/index/albertsons-reimagining-retail
- **Why Dwarkesh is Wrong about Computer Use + How OpenAI shipped its Jev competitor in 1 Week** — rss:latent-space · https://www.latent.space/p/devday-2026
- **The Lenfest Institute grows landmark program with expanded OpenAI support** — rss:openai-news · https://openai.com/index/lenfest-ai-collaborative-expansion
- **Contain the Chaos: ‘CONTROL Resonant’ Launches on GeForce NOW** — rss:nvidia-blog · https://blogs.nvidia.com/blog/geforce-now-thursday-control-resonant/
- 还有 2 条

#### safety-and-governance —— 安全与治理

4 个独立源 · 7 个事件（近 2 / 远 5）· 动量 -0.43

动量转负（-0.43，4 个源）—— 注意力在退。

- **0.160.0** — github:openai-codex · https://github.com/openai/codex/releases/tag/rust-v0.160.0
- **Quoting Anthropic Frontier Red Team** — rss:simon-willison · https://simonwillison.net/2026/Sep/29/anthropic-frontier-red-team/
- **Quoting @joedaroo** — rss:simon-willison · https://simonwillison.net/2026/Sep/28/joedaroo/
- **How we will do better for Australia** — rss:openai-news · https://openai.com/index/how-we-will-do-better-for-australia
- **🔬Bio-security is an AI Arms Race - Eric Nguyen (CEO, Radical Numerics)** — rss:latent-space · https://www.latent.space/p/bio-security-is-an-ai-arms-race-eric
- 还有 2 条

## 健康指标

未归类 72 / 155（46.5%）

---

<!-- digest v1 · radar v1 · taxonomy v1 · generated 2026-10-06T13:19:15.000Z · src 2026-10-06T13:19:15.139Z -->

*Generated through the Follow Builders skill: https://github.com/yueyueshine/agent-technology-radar*
