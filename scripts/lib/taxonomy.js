// ============================================================================
// Topic taxonomy — Phase 3, decision D1
// ============================================================================
// Nine frozen topics plus an `unclassified` bucket. The taxonomy is the one
// irreversible part of Phase 3: once signals are labelled with it, changing the
// list invalidates every historical label and Phase 4 loses the ability to
// compare a topic across time. Hence TAXONOMY_VERSION, and hence the topic list
// living in one place with nothing else allowed to invent a topic id.
//
// plan: .claude/plans/phase-3-topic-clustering.plan.md §2
// ============================================================================

export const TAXONOMY_VERSION = "v1";

// Not a topic. A health metric: its share of the output measures how stale the
// keyword tables have become, which is the known cost of the rules-based
// classifier (§3.1). Kept visible on purpose rather than silently dropped.
export const UNCLASSIFIED = "unclassified";

// -- Keyword tables -----------------------------------------------------------

// Weights: 3 = names something only this topic talks about, 2 = a term the
// topic owns, 1 = suggestive but shared. A term is matched case-insensitively
// as a whole word, so "model" does not fire on "modelling" or "role-models".
//
// v1 is deliberately small and high-precision. The documented failure mode is
// low recall — a signal whose wording is absent here lands in `unclassified`.
// That cost is measurable (the ratio is reported every run) and the fix is to
// add a term, or to swap the whole classifier for the embedding path (§3.1 B),
// which the output contract in §5 is designed to survive unchanged.
export const TOPICS = [
  {
    id: "model-capability",
    label: "模型能力与发布",
    terms: {
      "gpt-5": 3, "gpt-6": 3, "claude opus": 3, "claude sonnet": 3, "gemini": 3,
      "llama": 3, "mistral": 3, "qwen": 3, "deepseek": 3, "grok": 3,
      "frontier model": 3, "foundation model": 2, "multimodal": 2,
      "reasoning model": 3, "context window": 2, "model release": 3,
      "state of the art": 1, "benchmark score": 1, "intelligence": 1,
    },
  },
  {
    id: "agent-framework",
    label: "Agent 框架与编排",
    terms: {
      "multi-agent": 3, "multi agent": 3, "agent framework": 3, "orchestration": 2,
      "agentic workflow": 3, "autogen": 3, "langgraph": 3, "crewai": 3,
      "swarm": 2, "handoff": 2, "subagent": 2, "planner": 1,
      "agent loop": 3, "task decomposition": 2,
    },
  },
  {
    id: "tool-and-protocol",
    label: "工具与协议",
    terms: {
      "model context protocol": 3, "mcp server": 3, "mcp": 2,
      "function calling": 3, "tool use": 3, "tool calling": 3,
      "a2a": 2, "agent-to-agent": 3, "agent client protocol": 3,
      "structured output": 2, "json schema": 1, "stdio": 1,
    },
  },
  {
    id: "context-and-memory",
    label: "上下文与记忆",
    terms: {
      "prompt caching": 3, "cache hit": 2, "long context": 3,
      "retrieval": 2, "retrieval-augmented": 3, "rag": 2,
      "vector database": 2, "embedding": 2, "semantic search": 2,
      "memory": 2, "compaction": 2, "kv cache": 2, "context management": 2,
    },
  },
  {
    id: "inference-and-cost",
    label: "推理与成本",
    terms: {
      "inference": 3, "quantization": 3, "quantized": 3, "throughput": 2,
      "latency": 2, "tokens per second": 3, "serving": 2, "vllm": 3,
      "gpu": 2, "cuda": 2, "distillation": 2, "cost per token": 3,
      "pricing": 2, "batch api": 2, "speculative decoding": 3,
    },
  },
  {
    id: "dev-tooling",
    label: "开发者工具与实践",
    terms: {
      "coding agent": 3, "code generation": 2, "ide": 2, "cli": 2,
      "copilot": 3, "codex": 3, "cursor": 3, "claude code": 3,
      "pull request": 2, "unit test": 1, "refactor": 2, "debugging": 2,
      "developer experience": 2, "code review": 2, "repository": 1,
    },
  },
  {
    id: "product-and-business",
    label: "产品与商业",
    terms: {
      "funding": 3, "series a": 3, "series b": 3, "valuation": 3,
      "acquisition": 3, "acquires": 3, "ipo": 3, "revenue": 3,
      "enterprise adoption": 3, "customers": 2, "partnership": 2,
      "launch": 2, "general availability": 3, "ga release": 2,
      "commercial": 2, "subscription": 2,
    },
  },
  {
    id: "safety-and-governance",
    label: "安全与治理",
    terms: {
      "alignment": 3, "jailbreak": 3, "prompt injection": 3, "red team": 3,
      "guardrail": 3, "responsible ai": 3, "ai safety": 3, "misuse": 2,
      "regulation": 3, "compliance": 2, "eu ai act": 3, "policy": 1,
      "cbrn": 3, "cyber": 2, "sandbox escape": 3, "vulnerability": 2,
    },
  },
  {
    id: "eval-and-benchmark",
    label: "评测与基准",
    terms: {
      "benchmark": 3, "evaluation suite": 3, "evals": 3, "eval": 2,
      "swe-bench": 3, "mmlu": 3, "gpqa": 3, "humaneval": 3,
      "leaderboard": 3, "accuracy": 2, "pass rate": 2, "grader": 2,
      "ground truth": 2, "ablation": 2,
    },
  },
];

// A fast membership test for "is this a topic id we are allowed to emit".
export const TOPIC_IDS = new Set(TOPICS.map((topic) => topic.id));
