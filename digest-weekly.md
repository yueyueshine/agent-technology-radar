# Agent Technology Radar — 周报 — 2026-11-19

> 生态注意力视角。环 = 生态注意力的成熟度，不是「该不该用」。

窗口 336h · 输入 201 signal · 未归类 95 / 201（47.3%）

## 环的移动

对比基线：2026-11-18T15:40:46.030Z

- agent-framework：待观察 → 沉寂（动量 -1.00，源 1）
- inference-and-cost：待观察 → 试用中（动量 +0.75，源 4）
- product-and-business：已确立 → 沉寂（动量 -0.08，源 5）
- safety-and-governance：已确立 → 试用中（动量 +0.56，源 4）

## 扇区全貌

### 已确立（adopt）

#### model-capability —— 模型能力与发布

12 个独立源 · 30 个事件（近 20 / 远 10）· 动量 +0.33

覆盖广（12 个独立源）、动量温和为正（+0.33）—— 生态已收敛且仍在缓升。

- **Introducing GPT-6.2 Astra and Sol** — rss:openai-news · https://openai.com/index/introducing-gpt-6-2-astra-sol
- **Release v0.27.4** — github:qwen-code · https://github.com/QwenLM/qwen-code/releases/tag/v0.27.4
- **[AINews] Gemini 4 Neon: GDM's Opus/Sol Contender** — rss:latent-space · https://latent.space/p/ainews-gemini-4-neon-gdm-s-opus-sol-contender/
- **v2.1.328** — github:anthropic-claude-code · https://github.com/anthropics/claude-code/releases/tag/v2.1.328
- **langchain-openai==1.8.3** — github:langchain · https://github.com/langchain-ai/langchain/releases/tag/langchain-openai%3D%3D1.8.3
- 还有 25 条

#### dev-tooling —— 开发者工具与实践

8 个独立源 · 27 个事件（近 19 / 远 8）· 动量 +0.41

覆盖广（8 个独立源）、动量温和为正（+0.41）—— 生态已收敛且仍在缓升。

- **Connect Supabase, Box, Calendly, and more to Copilot** — rss:github-copilot-changelog · https://github.blog/changelog/2026-11-18-connect-supabase-box-calendly-and-more-to-copilot
- **Customize GitHub Copilot for your team** — rss:github-copilot-changelog · https://github.blog/changelog/2026-11-18-customize-github-copilot-for-your-team
- **Inside the Codex sandbox** — rss:openai-news · https://openai.com/index/inside-the-codex-sandbox
- **v2.1.327** — github:anthropic-claude-code · https://github.com/anthropics/claude-code/releases/tag/v2.1.327
- **0.169.1** — github:openai-codex · https://github.com/openai/codex/releases/tag/rust-v0.169.1
- 还有 22 条

### 试用中（trial）

#### tool-and-protocol —— 工具与协议

3 个独立源 · 3 个事件（近 3 / 远 0）· 动量 +1.00

覆盖达标（3 个独立源）且动量急升（+1.00）—— 共识形成前的活跃试验期。

- **v2.5.0** — github:mcp-servers · https://github.com/modelcontextprotocol/servers/releases/tag/v2.5.0
- **0.170.0** — github:openai-codex · https://github.com/openai/codex/releases/tag/rust-v0.170.0
- **v2.1.326** — github:anthropic-claude-code · https://github.com/anthropics/claude-code/releases/tag/v2.1.326

#### inference-and-cost —— 推理与成本

4 个独立源 · 8 个事件（近 7 / 远 1）· 动量 +0.75

覆盖达标（4 个独立源）且动量急升（+0.75）—— 共识形成前的活跃试验期。

- **langchain==1.5.1** — github:langchain · https://github.com/langchain-ai/langchain/releases/tag/langchain%3D%3D1.5.1
- **180B Parameters, 32GB of RAM: Pushing MoE Inference to the Limit with Transformers** — rss:huggingface-blog · https://huggingface.co/blog/moe-expert-streaming
- **Ian Buck Kicks Off NVIDIA’s Week at SC26 as Science Enters the Age of Agents** — rss:nvidia-blog · https://blogs.nvidia.com/blog/ian-buck-sc26/
- **NVIDIA Sweeps MLPerf Training and Endpoints as Vera Rubin Debuts With Leading Performance** — rss:nvidia-blog · https://blogs.nvidia.com/blog/mlperf-training-endpoints-vera-rubin/
- **NVIDIA CUDA-X Libraries Give Agents the Tools to Accelerate Scientific Discovery** — rss:nvidia-blog · https://blogs.nvidia.com/blog/cuda-x-libraries-agents-accelerate-scientific-discovery/
- 还有 3 条

#### safety-and-governance —— 安全与治理

4 个独立源 · 9 个事件（近 7 / 远 2）· 动量 +0.56

覆盖达标（4 个独立源）且动量急升（+0.56）—— 共识形成前的活跃试验期。

- **Managing frontier AI risk: From training to deployment** — rss:openai-news · https://openai.com/index/managing-frontier-ai-risk
- **External sandboxes for coding agents** — rss:simon-willison · https://simonwillison.net/2026/Nov/17/external-sandboxes-for-coding-agents/
- **Strengthening NATO and allied cyber defenses with AI** — rss:openai-news · https://openai.com/index/strengthening-nato-allied-cyber-defences-ai
- **Introducing OpenAI for Chile** — rss:openai-news · https://openai.com/index/introducing-openai-for-chile
- **Our first phase of embedded assessments** — rss:openai-news · https://openai.com/index/our-first-phase-of-embedded-assessments
- 还有 4 条

### 沉寂（hold）

#### agent-framework —— Agent 框架与编排

1 个独立源 · 1 个事件（近 0 / 远 1）· 动量 -1.00

动量转负（-1.00，1 个源）—— 注意力在退。

- **aws-emulator** — rss:simon-willison · https://simonwillison.net/2026/Nov/11/aws-emulator/

#### context-and-memory —— 上下文与记忆

4 个独立源 · 5 个事件（近 1 / 远 4）· 动量 -0.60

动量转负（-0.60，4 个源）—— 注意力在退。

- **NVIDIA RTX Spark Compact Desktops Out Now** — rss:nvidia-blog · https://blogs.nvidia.com/blog/rtx-spark-desktop-local-ai-available-now/
- **Token Pooling-Aware Training for Multi-Vector Embedding Models** — rss:huggingface-blog · https://huggingface.co/blog/token-pooling
- **From Full to Hybrid Attention in LLMs** — rss:sebastian-raschka · https://sebastianraschka.com/blog/2026/full-to-hybrid-attention.html
- **Weighted State Souping for Efficient Long-Context Retrieval** — rss:apple-ml · https://machinelearning.apple.com/research/weighted-state-souping
- **On the Importance of Gating: Memorization vs. In-Context Learning in State Space Models** — rss:apple-ml · https://machinelearning.apple.com/research/gating-memorization-in-context

#### product-and-business —— 产品与商业

5 个独立源 · 13 个事件（近 6 / 远 7）· 动量 -0.08

动量转负（-0.08，5 个源）—— 注意力在退。

- **Astra for Law leads in legal intelligence** — rss:openai-news · https://openai.com/index/astra-law-6-2
- **LVMH’s Media Division announces strategic partnership with OpenAI** — rss:openai-news · https://openai.com/index/lvmh-media-division-partnership
- **The King’s Trust and OpenAI launch £1m partnership** — rss:openai-news · https://openai.com/index/the-kings-trust-and-openai
- **At Holiday Extras, dots get to work before anyone asks** — rss:openai-news · https://openai.com/business/customer-stories/holiday-extras-dots
- **Open-source AI without Jensen** — rss:interconnects · https://www.interconnects.ai/p/open-source-ai-without-jensen
- 还有 8 条

#### eval-and-benchmark —— 评测与基准

4 个独立源 · 5 个事件（近 1 / 远 4）· 动量 -0.60

动量转负（-0.60，4 个源）—— 注意力在退。

- **Import AI 481: AI sub-contractors; a wet lab for AI; and subterfuge during development** — rss:import-ai · https://jack-clark.net/2026/11/16/import-ai-481-ai-sub-contractors-a-wet-lab-for-ai-and-subterfuge-during-development/
- **JioStar’s chief architect on AI discovery at 500M-user scale** — rss:openai-news · https://openai.com/index/jiostar-vijay-seshadri
- **Toward a Theory of Evaluability** — rss:apple-ml · https://machinelearning.apple.com/research/theory-evaluability
- **Egyptian and Nigerian English join the Open ASR Leaderboard** — rss:huggingface-blog · https://huggingface.co/blog/open-asr-leaderboard-liva
- **Measuring how AI agents handle everyday wet-lab science** — rss:openai-news · https://openai.com/index/measuring-how-ai-agents-handle-wet-lab-science

## 健康指标

未归类 95 / 201（47.3%）

---

<!-- digest v1 · radar v1 · taxonomy v1 · generated 2026-11-19T15:45:23.000Z · src 2026-11-19T15:45:23.815Z -->

*Generated through the Follow Builders skill: https://github.com/yueyueshine/agent-technology-radar*
