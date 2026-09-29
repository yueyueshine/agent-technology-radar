#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Phase 3 gate
// ============================================================================
// The executable definition of "Phase 3 works". Same shape as gate-2b: one
// process, no framework, red/green per check, driven against fixtures.
//
// Usage: node gate-3.js
// Exit: 0 all green, 1 any red
//
// plan: .claude/plans/phase-3-topic-clustering.plan.md §7.1 / §8
// ============================================================================

import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOPIC_IDS, UNCLASSIFIED, TAXONOMY_VERSION } from "./lib/taxonomy.js";
import { RECENCY_HALF_LIFE_HOURS } from "./lib/topics.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// A frozen clock. Recency decays with wall-clock time, so every check passes
// one; otherwise two runs a second apart differ and "deterministic" would be
// untestable.
const NOW = "2026-09-29T00:00:00.000Z";

const results = [];
let tmpRoot;
let seq = 0;

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// The static checks below look for prohibitions in the *code*, so comments must
// come out first — otherwise documenting a rule ("`tier` is deliberately
// absent") would itself trip the check and the obvious fix would be to delete
// the explanation. Deliberately naive: it is a guard against a literal
// reappearing in the weighting path, not a parser. `(^|[^:])` keeps `https://`
// from being mistaken for a comment.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// -- Fixtures -----------------------------------------------------------------

function signal(fields) {
  seq += 1;
  const n = seq;
  return {
    id: `sig${String(n).padStart(4, "0")}`,
    source_id: "rss:openai-news",
    native_id: `n${n}`,
    channel: "rss",
    type: "blog_post",
    title: "untitled",
    url: `https://example.com/${n}`,
    original_url: `https://example.com/${n}`,
    is_secondary: false,
    published_at: "2026-09-28T00:00:00.000Z",
    collected_at: "2026-09-29T00:00:00.000Z",
    text: "",
    ...fields,
  };
}

// Runs the clusterer against a fixture and returns both the parsed product and
// the raw bytes — G1 compares bytes, because key order and float formatting are
// part of "the same output".
function cluster(signals, { now = NOW } = {}) {
  const dir = join(tmpRoot, `case-${seq}`);
  mkdirSync(dir, { recursive: true });
  const signalsPath = join(dir, "signals.json");
  const outPath = join(dir, "topics.json");
  writeFileSync(
    signalsPath,
    JSON.stringify({ generatedAt: NOW, count: signals.length, signals }),
  );
  execFileSync(
    process.execPath,
    [
      join(SCRIPT_DIR, "cluster-signals.js"),
      "--signals",
      signalsPath,
      "--out",
      outPath,
      "--now",
      now,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  return {
    raw: readFileSync(outPath),
    json: JSON.parse(readFileSync(outPath, "utf-8")),
  };
}

// Spans enough topics that the ordering of the `topics` array is observable.
// An earlier version produced one or two topics, which made "shuffle the topics
// array" a no-op and hid the fact that G1 never exercised that path.
function mixedFixture() {
  return [
    signal({
      title: "Prompt caching for GPT-6 is now generally available",
      source_id: "rss:openai-news",
      text: "prompt caching improves cache hit rates",
    }),
    signal({
      title: "Serving long context without blowing up latency",
      source_id: "rss:simon-willison",
      text: "quantization, throughput and latency on a single gpu",
    }),
    signal({
      title: "Why our red team found a sandbox escape",
      source_id: "rss:latent-space",
      text: "prompt injection, guardrails and jailbreak resistance",
    }),
    signal({
      title: "MCP server design notes",
      source_id: "rss:karpathy",
      text: "tool use and function calling patterns",
    }),
    signal({
      title: "LangGraph multi-agent orchestration in production",
      source_id: "rss:langchain",
      text: "an agent framework with handoff",
    }),
    signal({
      title: "swe-bench leaderboard results for coding agents",
      source_id: "rss:import-ai",
      text: "a benchmark and evaluation suite",
    }),
    signal({
      title: "Series B funding for an agent startup",
      source_id: "rss:interconnects",
      text: "funding and valuation news",
    }),
    // The same event from a second source, so the fixture contains a cluster
    // with source_diversity > 1. Without one, every diversity is 1 and G4
    // cannot tell `weight = diversity × recency` from `weight = recency`.
    signal({
      title: "Series B funding for an agent startup",
      source_id: "rss:eugene-yan",
      text: "funding and valuation news",
    }),
    signal({
      title: "A quiet week",
      source_id: "rss:chip-huyen",
      text: "nothing in particular to report",
    }),
  ];
}

// -- Checks -------------------------------------------------------------------

function main() {
  tmpRoot = mkdtempSync(join(tmpdir(), "gate-3-"));

  // G1 — §7.1: the whole phase rests on determinism. Compares bytes, not parsed
  // objects: key order and number formatting are part of "the same output".
  check("G1 确定性：同输入同 --now 两次运行逐字节相同", () => {
    const signals = mixedFixture();
    const first = cluster(signals);
    const second = cluster(signals);
    assert(
      first.raw.equals(second.raw),
      "two runs over identical input produced different bytes",
    );
  });

  // G2 — §2: nothing may invent a topic id. The taxonomy is the one
  // irreversible artefact of this phase.
  check("G2 主题合法性：不存在表外主题", () => {
    const { json } = cluster(mixedFixture());
    const emitted = json.topics.map((t) => t.topic);
    for (const topic of emitted) {
      assert(
        TOPIC_IDS.has(topic),
        `topic "${topic}" is not in the taxonomy — the taxonomy is frozen`,
      );
    }
    assert(
      !emitted.includes(UNCLASSIFIED),
      "`unclassified` was emitted as a topic instead of the separate bucket",
    );
    assert(
      json.taxonomyVersion === TAXONOMY_VERSION,
      `taxonomyVersion is ${json.taxonomyVersion}, expected ${TAXONOMY_VERSION}`,
    );
  });

  // G3 — §7.1: every signal lands somewhere exactly once. This is what catches
  // a signal dropped between merge and roll-up.
  check("G3 总数守恒：每条 signal 恰好归属一次", () => {
    const signals = mixedFixture();
    const { json } = cluster(signals);
    const inTopics = json.topics.reduce((sum, t) => sum + t.signalCount, 0);
    const total = inTopics + json.unclassified.signalCount;
    assert(
      total === signals.length,
      `Σ topic.signalCount (${inTopics}) + unclassified (${json.unclassified.signalCount}) ` +
        `= ${total}, input was ${signals.length}`,
    );
    assert(
      json.inputSignalCount === signals.length,
      `inputSignalCount is ${json.inputSignalCount}, expected ${signals.length}`,
    );
    const seen = new Set();
    for (const topic of json.topics) {
      for (const id of topic.signalIds) {
        assert(!seen.has(id), `signal ${id} appears in more than one topic`);
        seen.add(id);
      }
    }
    // Signals in the unclassified bucket are claimed too — just not by a topic.
    for (const id of json.unclassified.signalIds ?? []) {
      assert(!seen.has(id), `signal ${id} is in a topic and in unclassified`);
      seen.add(id);
    }
    // Every cluster's members must be accounted for by one of the two paths.
    for (const clusterEntry of json.clusters) {
      for (const id of clusterEntry.signalIds) {
        assert(seen.has(id), `cluster holds a signal nothing claims: ${id}`);
      }
    }
    // And nothing may be invented: what is claimed must be exactly the input.
    assert(
      seen.size === signals.length,
      `${seen.size} signal(s) accounted for, input was ${signals.length}`,
    );
  });

  // G4 — §7.1: the weight must be reproducible from countable facts alone.
  // Recomputes the formula independently instead of comparing code to itself.
  check("G4 权重可复现：按 §4 公式独立重算一致", () => {
    const { json } = cluster(mixedFixture());
    const halfLifeMs = RECENCY_HALF_LIFE_HOURS * 60 * 60 * 1000;
    for (const entry of json.clusters) {
      const expected =
        entry.publishedAtLatest === null
          ? 0
          : entry.sourceDiversity *
            Math.exp(
              (-Math.LN2 * (Date.parse(NOW) - Date.parse(entry.publishedAtLatest))) /
                halfLifeMs,
            );
      assert(
        Math.abs(entry.weight - expected) < 1e-9,
        `cluster ${entry.clusterId}: weight ${entry.weight} != recomputed ${expected}`,
      );
    }
    for (const topic of json.topics) {
      const fromClusters = json.clusters
        .filter((entry) => entry.topic === topic.topic)
        .reduce((sum, entry) => sum + entry.weight, 0);
      assert(
        Math.abs(topic.weight - fromClusters) < 1e-9,
        `topic ${topic.topic}: weight ${topic.weight} != Σ cluster weights ${fromClusters}`,
      );
    }
  });

  // G5 — §7.1 / §4: a weight must be explainable by counts, not by a lookup.
  check("G5 权重可解释：由 source_diversity 等可数事实还原", () => {
    const signals = mixedFixture();
    const { json } = cluster(signals);
    const byId = new Map(signals.map((s) => [s.id, s]));
    for (const entry of json.clusters) {
      const distinct = new Set(
        entry.signalIds.map((id) => byId.get(id).source_id),
      ).size;
      assert(
        entry.sourceDiversity === distinct,
        `cluster ${entry.clusterId}: sourceDiversity ${entry.sourceDiversity} != distinct sources ${distinct}`,
      );
    }
    for (const topic of json.topics) {
      const union = new Set();
      for (const entry of json.clusters.filter((e) => e.topic === topic.topic)) {
        for (const id of entry.signalIds) union.add(byId.get(id).source_id);
      }
      assert(
        topic.sourceDiversity === union.size,
        `topic ${topic.topic}: sourceDiversity ${topic.sourceDiversity} != union ${union.size}`,
      );
    }
  });

  // G6 — the Phase 3 exit criterion as a static check: no source, person or
  // role may add weight. Narrow on purpose — it can only see literal
  // occurrences, which is exactly the failure it exists to catch.
  check("G6 无硬编码提权：权重路径不出现 tier / 具体源加成", () => {
    const files = [
      ["taxonomy.js", readFileSync(join(SCRIPT_DIR, "lib", "taxonomy.js"), "utf-8")],
      ["topics.js", readFileSync(join(SCRIPT_DIR, "lib", "topics.js"), "utf-8")],
    ];
    for (const [name, raw] of files) {
      const source = stripComments(raw);
      assert(
        !/\btier\b/.test(source),
        `${name} references \`tier\` in code — plan §10 forbids converting tier into a weight`,
      );
      const boosted = source.match(/\b(rss|blog|x|github|podcast|api):[a-z0-9-]+/g);
      assert(
        boosted === null,
        `${name} names a specific registry source (${(boosted || []).join(", ")}) — per-source boosts are forbidden`,
      );
    }
  });

  // G7 — the same prohibition applied to the Phase 3 computation path. NOT the
  // whole script tree: `generate-feed.js` uses `tier` to validate the registry
  // schema, which is legitimate and must not be forbidden. What is forbidden is
  // `tier` reaching a topic or a weight.
  check("G7 tier 未进入第 3 阶段的任何计算", () => {
    const sources = [
      ["cluster-signals.js", readFileSync(join(SCRIPT_DIR, "cluster-signals.js"), "utf-8")],
      ["lib/topics.js", readFileSync(join(SCRIPT_DIR, "lib", "topics.js"), "utf-8")],
      ["lib/taxonomy.js", readFileSync(join(SCRIPT_DIR, "lib", "taxonomy.js"), "utf-8")],
    ];
    const offenders = sources
      .filter(([, raw]) => /\btier\b/.test(stripComments(raw)))
      .map(([name]) => name);
    assert(
      offenders.length === 0,
      `\`tier\` appears in code in: ${offenders.join(", ")}`,
    );
  });

  // G8 — §3.2 / plan §3.4: merging several sources' reports of one event is a
  // Phase 3 requirement, not an optimisation. Three sources, one event.
  check("G8 跨源合并：同事件多源 → 1 个 cluster", () => {
    const signals = [
      signal({
        title: "OpenAI releases GPT-6 Sol and Luna",
        source_id: "rss:openai-news",
      }),
      signal({
        title: "OpenAI releases GPT-6 Sol and Luna",
        source_id: "rss:simon-willison",
      }),
      signal({
        title: "OpenAI releases GPT-6 Sol and Luna",
        source_id: "rss:latent-space",
      }),
    ];
    const { json } = cluster(signals);
    assert(
      json.clusterCount === 1,
      `expected the three reports to merge into 1 cluster, got ${json.clusterCount}`,
    );
    assert(
      json.clusters[0].signalIds.length === 3,
      `the cluster holds ${json.clusters[0].signalIds.length} signals, expected 3`,
    );
    assert(
      json.clusters[0].sourceDiversity === 3,
      `sourceDiversity is ${json.clusters[0].sourceDiversity}, expected 3`,
    );
  });

  // G9 — §2.2: the stale-taxonomy metric must exist and be arithmetically
  // right. Without it the low-recall cost of the keyword tables is invisible.
  check("G9 unclassified 可见且比例正确", () => {
    const signals = mixedFixture();
    const { json } = cluster(signals);
    assert(
      json.unclassified && typeof json.unclassified.signalCount === "number",
      "no unclassified bucket in the output",
    );
    const expected = json.unclassified.signalCount / signals.length;
    assert(
      Math.abs(json.unclassified.ratio - expected) < 1e-12,
      `ratio ${json.unclassified.ratio} != ${expected}`,
    );
    assert(
      json.unclassified.signalCount > 0,
      "the fixture is meant to include an unclassifiable signal",
    );
  });

  rmSync(tmpRoot, { recursive: true, force: true });

  const red = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - red.length}/${results.length} green` +
      (red.length ? ` — ${red.length} RED` : ""),
  );
  process.exit(red.length ? 1 : 0);
}

main();
