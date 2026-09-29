// ============================================================================
// Topic clustering — Phase 3, decisions D1 / D2
// ============================================================================
// Three stages, in this order, because the order is load-bearing (§3.2):
//
//   signals[] --(1) merge--> clusters[] --(2) classify--> topic --(3) weight
//
// Classifying before merging would give "several signals that happen to share a
// topic", which is not a merge. Phase 2 deliberately left cross-source
// de-duplication to this phase (plan §3.4 / §10), so merging several sources'
// reporting of one event into a single cluster is a requirement here, not an
// optimisation.
//
// Everything is deterministic: same input, byte-identical output. That is what
// makes the Phase 3 exit criteria testable at all (§7.1).
//
// plan: .claude/plans/phase-3-topic-clustering.plan.md §3, §4
// ============================================================================

import { signalId } from "./signal.js";
import { TOPICS, UNCLASSIFIED } from "./taxonomy.js";

// -- Tunables, all in one place ----------------------------------------------
// These are choices, not facts. They live at the top so they are reviewable and
// changeable in one place rather than buried in the algorithm (§9).

// How much of `text` the classifier reads. Titles are short and 100% present;
// bodies are ~1600 chars, so reading all of it would cost 10x for little extra
// signal. 400 chars covers a lede paragraph.
export const CLASSIFY_TEXT_CHARS = 400;

// Two signals are treated as reports of the same event when their title token
// sets overlap this much AND they come from different sources.
export const MERGE_JACCARD_THRESHOLD = 0.6;

// Weight decay: a cluster loses half its recency contribution every 7 days.
export const RECENCY_HALF_LIFE_HOURS = 168;

// Tokens too common to identify an event.
const TITLE_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "are", "was", "were",
  "you", "your", "our", "its", "his", "her", "their", "have", "has", "had",
  "not", "but", "can", "will", "now", "new", "how", "why", "what", "when",
  "into", "out", "about", "over", "more", "most", "than", "then", "they",
  "a", "an", "of", "to", "in", "on", "at", "by", "as", "is", "be", "or",
  "if", "we", "it", "do", "so", "up", "no", "introducing", "announcing",
]);

// -- (2) Classification -------------------------------------------------------
//
// Precompiled once. A term matches only as a whole word, so "mcp" does not fire
// inside "mcps" — inflected forms are simply misses, which is the documented
// low-recall trade-off rather than a bug (§3.1).
function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

const COMPILED = TOPICS.map((topic) => ({
  id: topic.id,
  terms: Object.entries(topic.terms).map(([term, weight]) => ({
    term,
    weight,
    pattern: termPattern(term),
  })),
}));

export function classifyText(haystack) {
  let bestId = UNCLASSIFIED;
  let bestScore = 0;

  // Iterating TOPICS in declaration order makes ties resolve the same way every
  // run; otherwise a tie would be broken by visit order.
  for (const topic of COMPILED) {
    let score = 0;
    for (const { weight, pattern } of topic.terms) {
      if (pattern.test(haystack)) score += weight;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = topic.id;
    }
  }
  return bestId;
}

function clusterHaystack(members) {
  const titles = members.map((signal) => signal.title || "").join(" ");
  const body = (members[0].text || "").slice(0, CLASSIFY_TEXT_CHARS);
  return `${titles} ${body}`;
}

// -- (1) Cross-source merge ---------------------------------------------------

function titleTokens(signal) {
  const raw = (signal.title || "").toLowerCase();
  const tokens = raw
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !TITLE_STOPWORDS.has(token));
  return new Set(tokens);
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  if (shared === 0) return 0;
  return shared / (a.size + b.size - shared);
}

// Union-find over the signals, deterministic by construction: signals are
// sorted by id first and a union always attaches the higher index to the lower
// one, so the grouping does not depend on input order.
//
// Known limit (§9): the pairwise pass is O(n²). At today's volume (~150 signals
// per window) that is ~11k comparisons and stays workable into the low
// thousands; past that it needs a token index to block candidate pairs.
export function mergeIntoClusters(signals) {
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ordered = [...signals].sort(byId);
  const parent = ordered.map((_, index) => index);

  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    if (rootA < rootB) parent[rootB] = rootA;
    else parent[rootA] = rootB;
  };

  const tokens = ordered.map(titleTokens);
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      // Only different sources can be "one event reported twice". Two items from
      // one source are that source's own duplication, which Phase 2 already
      // handled on signal id.
      if (ordered[i].source_id === ordered[j].source_id) continue;
      if (jaccard(tokens[i], tokens[j]) >= MERGE_JACCARD_THRESHOLD) union(i, j);
    }
  }

  const groups = new Map();
  ordered.forEach((signal, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(signal);
  });

  return [...groups.values()]
    .map((members) => {
      const sorted = [...members].sort(byId);
      const ids = sorted.map((signal) => signal.id);
      return {
        clusterId: signalId("cluster:v1", ids.join(",")),
        members: sorted,
        signalIds: ids,
        primaryUrl: sorted[0].url,
      };
    })
    .sort((a, b) => (a.clusterId < b.clusterId ? -1 : 1));
}

// -- (3) Weight ---------------------------------------------------------------
//
// weight = Σ over clusters of ( source_diversity × recency )   (§4)
//
// `tier` is deliberately absent, and so is any term keyed on a source or a
// person: `tier` is a human attention label that plan §10 forbids converting
// into a weight, and a per-source boost is forbidden by the exit criteria.
export function scoreClusters(clusters, now = Date.now()) {
  const halfLifeMs = RECENCY_HALF_LIFE_HOURS * 60 * 60 * 1000;

  return clusters.map((cluster) => {
    const distinctSources = new Set(
      cluster.members.map((signal) => signal.source_id),
    ).size;

    // published_at may be null (Phase 2B §3.3). Such a cluster has no age and so
    // contributes no recency — but it is counted in `undated` rather than
    // silently vanishing, so the loss stays visible (§4, §9).
    const published = cluster.members
      .map((signal) => signal.published_at)
      .filter((value) => typeof value === "string")
      .map((value) => Date.parse(value))
      .filter((value) => !Number.isNaN(value));

    const undated = published.length === 0;
    const latest = undated ? null : Math.max(...published);
    const recency = undated
      ? 0
      : Math.exp((-Math.LN2 * (now - latest)) / halfLifeMs);

    return {
      clusterId: cluster.clusterId,
      signalIds: cluster.signalIds,
      primaryUrl: cluster.primaryUrl,
      topic: classifyText(clusterHaystack(cluster.members)),
      sourceDiversity: distinctSources,
      publishedAtLatest: undated ? null : new Date(latest).toISOString(),
      recency,
      weight: distinctSources * recency,
      undated,
      sourceIds: cluster.members.map((signal) => signal.source_id),
    };
  });
}

// Rolls clusters up per topic. `signalIds` is sorted so the product is stable
// regardless of cluster ordering.
export function summarizeByTopic(scoredClusters) {
  const byTopic = new Map();
  const ensure = (topic) => {
    if (!byTopic.has(topic)) {
      byTopic.set(topic, {
        topic,
        weight: 0,
        signalCount: 0,
        clusterCount: 0,
        undatedClusters: 0,
        sourceIds: new Set(),
        signalIds: [],
      });
    }
    return byTopic.get(topic);
  };

  for (const cluster of scoredClusters) {
    const entry = ensure(cluster.topic);
    entry.weight += cluster.weight;
    entry.clusterCount += 1;
    entry.signalCount += cluster.signalIds.length;
    if (cluster.undated) entry.undatedClusters += 1;
    entry.signalIds.push(...cluster.signalIds);
    for (const sourceId of cluster.sourceIds) entry.sourceIds.add(sourceId);
  }

  for (const entry of byTopic.values()) entry.signalIds.sort();
  return byTopic;
}
