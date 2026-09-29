// ============================================================================
// Technology Radar — Phase 4, decisions D1 / D2
// ============================================================================
// Maps the nine frozen Phase 3 topics onto a polar radar: one sector per topic,
// four rings. The ring is NOT a recency bucket and NOT a recommendation — it is
// the maturity of ecosystem attention, computed from two orthogonal, countable
// axes (plan §2, §4):
//
//   breadth  — how many independent sources are talking about it (no time in it)
//   momentum — is it getting more or less coverage, window's second half vs first
//
// The one thing that would quietly ruin this: computing momentum from Phase 3's
// `weight`. weight = source_diversity × recency ALREADY contains exponential
// decay, so a weight-difference between the two halves is approximately "the
// newer half is newer" — recency in a hat, which is exactly what the exit
// criterion forbids ("not simply ordered by time"). Hence counts, not weights.
//
// Everything here is deterministic: same input, byte-identical output.
//
// plan: .claude/plans/phase-4-technology-radar.plan.md §2, §3, §4, §5
// ============================================================================

import { TOPICS } from "./taxonomy.js";

// -- Tunables, all in one place ----------------------------------------------
// Choices, not facts. They live at the top so they are reviewable and
// changeable in one place rather than buried in the algorithm (plan §4.1, §9).
//
// Changing any of them changes what the rings MEAN for a given weight series,
// so RADAR_VERSION must move with them. Unlike Phase 3's taxonomyVersion that
// does not invalidate history: a radar is recomputable from the stored weight
// series, which is why the thresholds are also copied into every product.

export const RADAR_VERSION = "v1";

// Momentum at or above zero counts as rising — exactly zero does not.
export const M_RISE = 0;

// Fewer than this many distinct sources is "narrow": too few independent
// attestations to be more than a watch item, however fast it is rising.
export const B_NARROW = 3;

// At or above this momentum a broad topic is "surging" rather than "settled".
export const M_SURGE = 0.5;

// Strongest first, matching the classic radar reading (inner ring = most
// settled). Used for the summary and for prose, never for sector ORDER —
// sector order is frozen by the taxonomy, see buildRadar below.
export const RINGS = ["adopt", "trial", "assess", "hold"];

// -- Ring decision ------------------------------------------------------------

function fmt(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

// Ordered, first match wins — the order is part of the rule, not an accident.
// Exported so the gate can recompute a ring independently instead of comparing
// the implementation to itself.
export function decideRing({ recent, prior, breadth, clusterCount }) {
  // No activity at all in the window. `momentum` stays null rather than 0: "we
  // saw nothing" is not the same claim as "the trend is flat", and collapsing
  // them would let an unobserved topic read as a measured one.
  if (clusterCount === 0) {
    return {
      ring: "hold",
      momentum: null,
      ringReason: "no clusters in window -> hold",
    };
  }

  const dated = recent + prior;
  if (dated === 0) {
    // Clusters exist but none carries `published_at` (Phase 2B §3.3 allows
    // null). Direction is unmeasurable, so the honest answer is "watch it"
    // rather than silently calling it flat.
    return {
      ring: "assess",
      momentum: null,
      ringReason:
        "clusters present but none carries publishedAtLatest — momentum undefined -> assess",
    };
  }

  const momentum = (recent - prior) / dated;

  if (momentum < M_RISE) {
    return {
      ring: "hold",
      momentum,
      ringReason: `momentum ${fmt(momentum)} < ${M_RISE} -> hold`,
    };
  }
  if (breadth < B_NARROW) {
    return {
      ring: "assess",
      momentum,
      ringReason:
        `momentum ${fmt(momentum)} >= ${M_RISE}; breadth ${breadth} < ${B_NARROW} -> assess`,
    };
  }
  if (momentum >= M_SURGE) {
    return {
      ring: "trial",
      momentum,
      ringReason:
        `momentum ${fmt(momentum)} >= ${M_RISE}; breadth ${breadth} >= ${B_NARROW}; ` +
        `momentum ${fmt(momentum)} >= ${M_SURGE} -> trial`,
    };
  }
  return {
    ring: "adopt",
    momentum,
    ringReason:
      `momentum ${fmt(momentum)} >= ${M_RISE}; breadth ${breadth} >= ${B_NARROW}; ` +
      `momentum ${fmt(momentum)} < ${M_SURGE} -> adopt`,
  };
}

// -- Assembly -----------------------------------------------------------------

// `topicsDoc` is the Phase 3 product verbatim. This function reads it and adds
// nothing to it: weights, counts and signalIds are passed through unchanged
// (constraint 5 — Phase 4 does not recompute the weight, and does not apply a
// second decay).
export function buildRadar(topicsDoc, now = Date.now()) {
  const windowHours = topicsDoc.windowHours;
  // Fail fast rather than degrade. With a missing or non-positive window the
  // midpoint is NaN (or "now"), so EVERY cluster lands in the prior half and
  // the whole radar silently reads as all-hold — a wrong product that looks
  // perfectly well-formed. Found by the independent review, 2026-09-29.
  if (
    typeof windowHours !== "number" ||
    !Number.isFinite(windowHours) ||
    windowHours <= 0
  ) {
    throw new Error(
      `topics.json windowHours must be a positive number, got ${JSON.stringify(windowHours)}`,
    );
  }
  const midpointMs = now - (windowHours / 2) * 60 * 60 * 1000;

  const clustersByTopic = new Map();
  for (const cluster of topicsDoc.clusters || []) {
    if (!clustersByTopic.has(cluster.topic)) clustersByTopic.set(cluster.topic, []);
    clustersByTopic.get(cluster.topic).push(cluster);
  }

  const reported = new Map(
    (topicsDoc.topics || []).map((entry) => [entry.topic, entry]),
  );

  // Sector ORDER is the taxonomy's declaration order, deliberately NOT the
  // input's array order. Phase 3 sorts its topics by weight, which means a
  // radar built on that order would reshuffle every day and no sector could be
  // tracked across time. Position stability is the whole point of a radar
  // (plan §3).
  const sectors = TOPICS.map(({ id: topic }) => {
    const entry = reported.get(topic);
    const clusters = clustersByTopic.get(topic) || [];

    let recent = 0;
    let prior = 0;
    for (const cluster of clusters) {
      if (!cluster.publishedAtLatest) continue;
      const publishedMs = Date.parse(cluster.publishedAtLatest);
      if (Number.isNaN(publishedMs)) continue;
      if (publishedMs >= midpointMs) recent += 1;
      else prior += 1;
    }

    const breadth = entry ? entry.sourceDiversity : 0;
    // Counted from the clusters, NOT read off the topic entry. The two agree in
    // any Phase 3 product, but where the entry is missing they do not: taking it
    // from the entry yields clusterCount 0 sitting next to non-zero
    // recent/prior, with a "no clusters in window" reason contradicting the
    // numbers printed beside it. Found by the independent review, 2026-09-29.
    const clusterCount = clusters.length;
    const decided = decideRing({ recent, prior, breadth, clusterCount });

    return {
      topic,
      ring: decided.ring,
      weight: entry ? entry.weight : 0,
      signalCount: entry ? entry.signalCount : 0,
      clusterCount,
      breadth,
      recentClusters: recent,
      priorClusters: prior,
      momentum: decided.momentum,
      ringReason: decided.ringReason,
      signalIds: entry ? entry.signalIds : [],
    };
  });

  // Measured, not declared. `windowHours` is a label the upstream fetchers do
  // not enforce (plan §1.5); the actual span of what arrived is this.
  const dated = (topicsDoc.clusters || [])
    .map((cluster) => cluster.publishedAtLatest)
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter((value) => !Number.isNaN(value));
  const measuredSpanHours =
    dated.length === 0 ? null : (now - Math.min(...dated)) / (60 * 60 * 1000);

  const summary = {};
  for (const ring of RINGS) summary[ring] = 0;
  for (const sector of sectors) summary[sector.ring] += 1;

  const unclassified = topicsDoc.unclassified ?? { signalCount: 0, ratio: 0 };

  return {
    generatedAt: new Date(now).toISOString(),
    radarVersion: RADAR_VERSION,
    // Carried through so a radar can never be compared against one built on a
    // different topic list.
    taxonomyVersion: topicsDoc.taxonomyVersion,
    // Provenance of the input. `inputSignalCount` cannot tell two runs apart
    // when they happen to hold the same number of signals, so without this a
    // stale radar.json passes a consistency check unnoticed (review finding F4,
    // 2026-09-29).
    sourceGeneratedAt: topicsDoc.generatedAt,
    windowHours,
    inputSignalCount: topicsDoc.inputSignalCount,
    measuredSpanHours,
    // The thresholds in force for this product, recorded so a historical
    // radar.json can still be explained after the constants are retuned.
    ringRule: {
      momentumMidpointHours: windowHours / 2,
      narrowBreadth: B_NARROW,
      surgeMomentum: M_SURGE,
    },
    sectors,
    // Not a sector. Phase 3 §2.2 defines this as the taxonomy-staleness health
    // metric; dropping it here would make the radar silently look complete.
    unclassified: {
      signalCount: unclassified.signalCount,
      ratio: unclassified.ratio,
    },
    summary,
  };
}
