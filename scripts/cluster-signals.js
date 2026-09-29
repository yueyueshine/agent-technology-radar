#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Topic Clustering (Phase 3)
// ============================================================================
// Reads the public signal product and writes `topics.json`:
//
//   signals.json --merge--> clusters --classify--> topic --weight--> topics.json
//
// Input is the PUBLIC product only. Internal signals live in
// `signals-internal.json` and are not read here, which is what keeps them out
// of `topics.json` as well (plan §4.3 — internal has no downstream path yet).
//
// Usage: node cluster-signals.js [--signals FILE] [--out FILE] [--now ISO]
//
// `--now` freezes the clock. Recency decays with wall-clock time, so without it
// two runs a second apart produce different weights and "deterministic" would be
// untestable. The gate always passes it.
//
// plan: .claude/plans/phase-3-topic-clustering.plan.md §5
// ============================================================================

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic } from "./lib/io.js";
import { MAX_LOOKBACK_HOURS } from "./lib/signal.js";
import { TAXONOMY_VERSION, UNCLASSIFIED } from "./lib/taxonomy.js";
import {
  mergeIntoClusters,
  scoreClusters,
  summarizeByTopic,
} from "./lib/topics.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

function argValue(args, name) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const signalsPath = resolve(
    REPO_ROOT,
    argValue(args, "--signals") ?? "signals.json",
  );
  const outPath = resolve(REPO_ROOT, argValue(args, "--out") ?? "topics.json");
  const nowArg = argValue(args, "--now");
  const now = nowArg ? Date.parse(nowArg) : Date.now();
  if (Number.isNaN(now)) {
    throw new Error(`--now is not a parsable date: ${JSON.stringify(nowArg)}`);
  }

  if (!existsSync(signalsPath)) {
    throw new Error(`${signalsPath} not found — run normalize-signals.js first`);
  }
  const input = JSON.parse(await readFile(signalsPath, "utf-8"));
  const signals = input.signals || [];

  const clusters = mergeIntoClusters(signals);
  const scored = scoreClusters(clusters, now);
  const byTopic = summarizeByTopic(scored);

  // Sorted by weight, ties broken by topic id so the order never depends on
  // insertion order.
  const topics = [...byTopic.values()]
    .filter((entry) => entry.topic !== UNCLASSIFIED)
    .sort((a, b) => b.weight - a.weight || (a.topic < b.topic ? -1 : 1))
    .map((entry) => ({
      topic: entry.topic,
      weight: entry.weight,
      signalCount: entry.signalCount,
      clusterCount: entry.clusterCount,
      sourceDiversity: entry.sourceIds.size,
      undatedClusters: entry.undatedClusters,
      signalIds: entry.signalIds,
    }));

  const unclassified = byTopic.get(UNCLASSIFIED) ?? {
    signalCount: 0,
    clusterCount: 0,
  };

  const out = {
    generatedAt: new Date(now).toISOString(),
    // The window the input was produced under, not a fresh choice made here.
    windowHours: MAX_LOOKBACK_HOURS,
    taxonomyVersion: TAXONOMY_VERSION,
    inputSignalCount: signals.length,
    clusterCount: scored.length,
    topics,
    unclassified: {
      signalCount: unclassified.signalCount,
      clusterCount: unclassified.clusterCount,
      ratio: signals.length === 0 ? 0 : unclassified.signalCount / signals.length,
      // Carried explicitly: tuning the keyword tables means looking at WHICH
      // signals missed, not just how many. It is also what makes the
      // conservation check in the gate exact.
      signalIds: unclassified.signalIds ?? [],
    },
    clusters: scored
      .map((cluster) => ({
        clusterId: cluster.clusterId,
        topic: cluster.topic,
        signalIds: cluster.signalIds,
        primaryUrl: cluster.primaryUrl,
        sourceDiversity: cluster.sourceDiversity,
        publishedAtLatest: cluster.publishedAtLatest,
        weight: cluster.weight,
      }))
      .sort((a, b) => (a.clusterId < b.clusterId ? -1 : 1)),
  };

  await writeJsonAtomic(outPath, out);

  console.error(
    `${signals.length} signal(s) → ${scored.length} cluster(s) → ` +
      `${topics.length} topic(s)`,
  );
  for (const topic of topics) {
    console.error(
      `  ${topic.topic.padEnd(24)} weight=${topic.weight.toFixed(3)} ` +
        `signals=${topic.signalCount} clusters=${topic.clusterCount} ` +
        `sources=${topic.sourceDiversity}`,
    );
  }
  // Printed unconditionally: this ratio is the only measurement of how stale the
  // keyword tables have become (§2.2), so it must not be something you have to
  // go looking for.
  console.error(
    `  ${UNCLASSIFIED.padEnd(24)} ${out.unclassified.signalCount} signal(s) ` +
      `(${(out.unclassified.ratio * 100).toFixed(1)}%) — 主题表老化指标`,
  );
}

main().catch((err) => {
  console.error("Topic clustering failed:", err.message);
  process.exit(1);
});
