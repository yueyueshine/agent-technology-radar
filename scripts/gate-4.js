#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Phase 4 gate
// ============================================================================
// The executable definition of "Phase 4 works". Same shape as gate-2b / gate-3:
// one process, no framework, red/green per check, driving real child processes
// against fixtures.
//
// Usage: node gate-4.js
// Exit: 0 all green, 1 any red
//
// plan: .claude/plans/phase-4-technology-radar.plan.md §7.1 / §8
// ============================================================================

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOPICS } from "./lib/taxonomy.js";
import { RINGS, M_RISE, B_NARROW, M_SURGE } from "./lib/radar.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// Frozen clock. The window is split relative to `now`, so every check passes
// one; otherwise a boundary cluster could belong to different halves on two
// runs and "deterministic" would be untestable.
const NOW_MS = Date.parse("2026-09-29T00:00:00.000Z");
const NOW = new Date(NOW_MS).toISOString();
const WINDOW_HOURS = 336;
const HALF_LIFE_HOURS = 168; // Phase 3's RECENCY_HALF_LIFE_HOURS

// Sector order must be the taxonomy's declaration order, never the input's.
const TAXONOMY_ORDER = TOPICS.map((topic) => topic.id);

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

// Same deliberate naivety as gate-3: the static checks look for prohibitions in
// the *code*, so comments come out first — otherwise documenting a rule would
// itself trip the check and the obvious fix would be to delete the explanation.
// `(^|[^:])` keeps `https://` from reading as a comment.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// -- Fixtures -----------------------------------------------------------------

// One cluster. `ageHours === null` produces the undated case Phase 2B allows.
function cluster(topic, ageHours, { diversity = 1 } = {}) {
  seq += 1;
  const recency =
    ageHours === null ? 0 : Math.exp((-Math.LN2 * ageHours) / HALF_LIFE_HOURS);
  return {
    clusterId: `cl${String(seq).padStart(4, "0")}`,
    topic,
    signalIds: [`s${String(seq).padStart(4, "0")}`],
    primaryUrl: `https://example.com/${seq}`,
    sourceDiversity: diversity,
    publishedAtLatest:
      ageHours === null ? null : new Date(NOW_MS - ageHours * 3600e3).toISOString(),
    weight: diversity * recency,
  };
}

// A Phase 3 topic entry. `weightOverride` exists so G6 can prove the weight is
// passed through rather than recomputed: a sentinel no recomputation could hit.
function topicEntry(topic, clusters, breadth, weightOverride) {
  return {
    topic,
    weight:
      weightOverride !== undefined
        ? weightOverride
        : clusters.reduce((sum, c) => sum + c.weight, 0),
    signalCount: clusters.reduce((sum, c) => sum + c.signalIds.length, 0),
    clusterCount: clusters.length,
    sourceDiversity: breadth,
    undatedClusters: clusters.filter((c) => c.publishedAtLatest === null).length,
    signalIds: clusters.flatMap((c) => c.signalIds),
  };
}

function doc(entries, clusters, extra = {}) {
  const total = clusters.reduce((sum, c) => sum + c.signalIds.length, 0);
  return {
    generatedAt: NOW,
    windowHours: WINDOW_HOURS,
    taxonomyVersion: "v1",
    inputSignalCount: total,
    clusterCount: clusters.length,
    topics: entries,
    unclassified: {
      signalCount: 3,
      clusterCount: 3,
      ratio: total === 0 ? 0 : 3 / total,
      signalIds: ["u1", "u2", "u3"],
    },
    clusters,
    ...extra,
  };
}

// Spans the rings, the boundary values, the undated branch, and two topics that
// are absent entirely. An earlier instinct was a thin fixture — that is exactly
// what made two Phase 3 checks vacuous (§7.3 there), so this one is built to
// exercise every branch of the ring rule.
function mainFixture() {
  const mcC = [
    cluster("model-capability", 1),
    cluster("model-capability", 2),
    cluster("model-capability", 3),
    cluster("model-capability", 4),
    cluster("model-capability", 5),
    cluster("model-capability", 6),
    cluster("model-capability", 200),
    cluster("model-capability", 220),
    cluster("model-capability", 240),
  ];
  const dtC = [
    cluster("dev-tooling", 10),
    cluster("dev-tooling", 20),
    cluster("dev-tooling", 30),
    cluster("dev-tooling", 40),
  ];
  const tpC = [cluster("tool-and-protocol", 300)];
  const pbC = [
    cluster("product-and-business", 50),
    cluster("product-and-business", 60),
    cluster("product-and-business", 200),
    cluster("product-and-business", 210),
  ];
  const ebC = [cluster("eval-and-benchmark", 12)];
  // Every cluster undated: clusterCount > 0 but no measurable direction.
  const cmC = [cluster("context-and-memory", null)];
  // momentum is exactly M_SURGE — the >= boundary must land on trial.
  const sgC = [
    cluster("safety-and-governance", 8),
    cluster("safety-and-governance", 9),
    cluster("safety-and-governance", 10),
    cluster("safety-and-governance", 200),
  ];

  const clusters = [...mcC, ...dtC, ...tpC, ...pbC, ...ebC, ...cmC, ...sgC];
  const entries = [
    topicEntry("model-capability", mcC, 13),
    topicEntry("dev-tooling", dtC, 4),
    topicEntry("tool-and-protocol", tpC, 1),
    topicEntry("product-and-business", pbC, 5),
    topicEntry("eval-and-benchmark", ebC, 2),
    topicEntry("context-and-memory", cmC, 1),
    topicEntry("safety-and-governance", sgC, 3),
  ];
  return doc(entries, clusters);
}

// Built so that "momentum from counts" and "momentum from Phase 3 weight" give
// OPPOSITE answers. Weight carries exponential recency, so a recent
// many-source cluster weighs far more than older single-source ones; reading
// momentum off weight would call this RISING while counting says FALLING.
function decayDiscriminatingFixture() {
  const mcC = [
    // 1 recent cluster, 10 sources: weight ≈ 10 × 0.996
    cluster("model-capability", 1, { diversity: 10 }),
    // 2 old clusters, 1 source each: weight ≈ 2 × 0.438
    cluster("model-capability", 200),
    cluster("model-capability", 210),
  ];
  const dtC = [cluster("dev-tooling", 5)];
  const clusters = [...mcC, ...dtC];
  const entries = [
    topicEntry("model-capability", mcC, 12),
    topicEntry("dev-tooling", dtC, 1),
  ];
  return doc(entries, clusters);
}

// Built so the `>=` at the half-split is observable. One cluster sits EXACTLY
// on the midpoint, so under §4.1's `publishedAtLatest >= now - mid` the split is
// 1 recent / 1 prior (momentum 0 → adopt), while a `>` implementation gets
// 0 recent / 2 prior (momentum −1 → hold). Without a cluster on the boundary the
// two conventions are indistinguishable and the split is asserted nowhere —
// which is exactly how the `>=`/`>` mutation survived review (finding F3).
function midpointFixture() {
  const mcC = [cluster("model-capability", 168), cluster("model-capability", 200)];
  return doc([topicEntry("model-capability", mcC, 5)], mcC);
}

// -- Running the real script --------------------------------------------------

function build(input, { now = NOW } = {}) {
  const dir = mkdtempSync(join(tmpRoot, "case-"));
  const inPath = join(dir, "topics.json");
  const outPath = join(dir, "radar.json");
  writeFileSync(inPath, JSON.stringify(input));
  // spawnSync, not execFileSync: the over-wide warning (G10) is written to
  // stderr on a SUCCESSFUL run, and execFileSync only surfaces stderr when the
  // child exits non-zero — which made G10 unable to see the very thing it
  // checks.
  const result = spawnSync(
    process.execPath,
    [
      join(SCRIPT_DIR, "build-radar.js"),
      "--topics",
      inPath,
      "--out",
      outPath,
      "--now",
      now,
    ],
    { encoding: "utf-8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `build-radar.js failed (status ${result.status}):\n${result.stderr}`,
    );
  }
  return {
    raw: readFileSync(outPath),
    json: JSON.parse(readFileSync(outPath, "utf-8")),
    stderr: result.stderr || "",
  };
}

// Runs the CLI and hands back the raw outcome, for checks whose subject is a
// failure rather than a product.
function runCli(input) {
  const dir = mkdtempSync(join(tmpRoot, "case-"));
  const inPath = join(dir, "topics.json");
  const outPath = join(dir, "radar.json");
  writeFileSync(inPath, JSON.stringify(input));
  const result = spawnSync(
    process.execPath,
    [
      join(SCRIPT_DIR, "build-radar.js"),
      "--topics",
      inPath,
      "--out",
      outPath,
      "--now",
      NOW,
    ],
    { encoding: "utf-8" },
  );
  return {
    status: result.status,
    out: `${result.stdout || ""}${result.stderr || ""}`,
  };
}

// Re-implemented from the documented rule (plan §4.1) AND recomputed from the
// INPUT's cluster timestamps rather than from the sector's emitted counts.
// Reading the emitted counts back only re-verifies the arithmetic while leaving
// the half-split — the actual rule — unchecked: under the first version of this
// check, flipping the boundary from `>=` to `>` stayed green (finding F3).
function expectedRingFromInput(input, topic) {
  const entry = (input.topics || []).find((t) => t.topic === topic);
  const clusters = (input.clusters || []).filter((c) => c.topic === topic);
  const midpointMs = NOW_MS - (input.windowHours / 2) * 3600e3;

  let recent = 0;
  let prior = 0;
  for (const c of clusters) {
    if (!c.publishedAtLatest) continue;
    const publishedMs = Date.parse(c.publishedAtLatest);
    if (Number.isNaN(publishedMs)) continue;
    if (publishedMs >= midpointMs) recent += 1;
    else prior += 1;
  }

  const breadth = entry ? entry.sourceDiversity : 0;
  if (clusters.length === 0) return "hold";
  const dated = recent + prior;
  if (dated === 0) return "assess";
  const momentum = (recent - prior) / dated;
  if (momentum < M_RISE) return "hold";
  if (breadth < B_NARROW) return "assess";
  if (momentum >= M_SURGE) return "trial";
  return "adopt";
}

function main() {
  tmpRoot = mkdtempSync(join(tmpdir(), "gate-4-"));

  // G1 — §7.1: the phase rests on determinism. Bytes, not objects: key order
  // and float formatting are part of "the same output".
  check("G1 确定性：同输入同 --now 两次运行逐字节相同", () => {
    const input = mainFixture();
    const first = build(input);
    const second = build(input);
    assert(
      first.raw.equals(second.raw),
      "two runs over identical input produced different bytes",
    );
  });

  // G2 — §7.1: nothing may invent a ring or a sector, and the health metric
  // must never be dressed up as one.
  check("G2 环与扇区合法性：环在枚举内，9 个主题恰好各一次", () => {
    const { json } = build(mainFixture());
    assert(
      json.sectors.length === TAXONOMY_ORDER.length,
      `expected ${TAXONOMY_ORDER.length} sectors, got ${json.sectors.length}`,
    );
    for (const sector of json.sectors) {
      assert(
        RINGS.includes(sector.ring),
        `ring "${sector.ring}" is not one of ${RINGS.join("/")}`,
      );
      assert(
        sector.topic !== "unclassified",
        "`unclassified` was emitted as a sector — it is a health metric",
      );
    }
    const emitted = new Set(json.sectors.map((s) => s.topic));
    for (const topic of TAXONOMY_ORDER) {
      assert(emitted.has(topic), `taxonomy topic "${topic}" has no sector`);
    }
    assert(
      json.radarVersion === "v1",
      `radarVersion is ${json.radarVersion}, expected v1`,
    );
  });

  // G3 — §3 / §5.2: position stability is the whole point of a radar. Phase 3
  // sorts its topics by weight; if that order leaked through, every sector
  // would move daily and nothing could be tracked across time.
  check("G3 扇区顺序冻结：与输入顺序/权重无关，恒为 taxonomy 顺序", () => {
    const input = mainFixture();
    // Reversed input order AND weights sorted the other way: an implementation
    // that inherited the input's order would be caught on either.
    const shuffled = {
      ...input,
      topics: [...input.topics].reverse().sort((a, b) => a.weight - b.weight),
      clusters: [...input.clusters].reverse(),
    };
    const { json } = build(shuffled);
    const emitted = json.sectors.map((s) => s.topic);
    assert(
      JSON.stringify(emitted) === JSON.stringify(TAXONOMY_ORDER),
      `sector order drifted:\n  got      ${emitted.join(", ")}\n  expected ${TAXONOMY_ORDER.join(", ")}`,
    );
  });

  // G4 — §7.1: the ring must be reproducible from the input alone. The
  // half-split is recomputed from timestamps and pinned explicitly at the
  // boundary, because two conventions can agree on a ring and hide the
  // difference.
  check("G4 环规则可复现：由输入时间戳独立重算（含中点与无日期分支）", () => {
    for (const [label, input] of [
      ["main", mainFixture()],
      ["decay-discriminating", decayDiscriminatingFixture()],
      ["midpoint", midpointFixture()],
    ]) {
      const { json } = build(input);
      for (const topic of TAXONOMY_ORDER) {
        const sector = json.sectors.find((s) => s.topic === topic);
        assert(sector, `${label}: no sector for ${topic}`);
        const want = expectedRingFromInput(input, topic);
        assert(
          sector.ring === want,
          `${label} / ${topic}: ring ${sector.ring} != recomputed ${want} ` +
            `(breadth ${sector.breadth}, recent ${sector.recentClusters}, prior ${sector.priorClusters}, ` +
            `clusterCount ${sector.clusterCount})`,
        );
      }
    }

    // §4.1 splits on `publishedAtLatest >= now - mid`, so a cluster exactly on
    // the midpoint belongs to the RECENT half. Pinned on its own because a ring
    // can coincide across the two conventions.
    const mid = build(midpointFixture()).json.sectors.find(
      (s) => s.topic === "model-capability",
    );
    assert(
      mid.recentClusters === 1 && mid.priorClusters === 1,
      `the cluster on the midpoint landed in the wrong half: recent ${mid.recentClusters}, prior ${mid.priorClusters} — §4.1 says >=, so it is recent`,
    );
  });

  // G5 — §4.2, the load-bearing one. Weight already contains exponential
  // recency, so momentum read off weight is recency in a hat — exactly the
  // "simply ordered by time" the exit criterion forbids.
  check("G5 动量未衰减：不是用 weight 前后半段相减", () => {
    const input = decayDiscriminatingFixture();
    const { json } = build(input);
    const sector = json.sectors.find((s) => s.topic === "model-capability");
    assert(sector, "discriminating fixture lost its topic");

    // Counts say falling: 1 recent vs 2 prior.
    const countMomentum = (1 - 2) / 3;
    assert(
      Math.abs(sector.momentum - countMomentum) < 1e-12,
      `momentum should be the count-based ${countMomentum}, got ${sector.momentum}`,
    );
    assert(
      sector.ring === "hold",
      `count-based momentum is negative, so the ring must be hold, got ${sector.ring}`,
    );

    // Prove the fixture actually discriminates: the weight-based reading must
    // land somewhere else, or this check would pass against a decayed
    // implementation too.
    const entry = input.topics.find((t) => t.topic === "model-capability");
    const members = input.clusters.filter((c) => c.topic === "model-capability");
    let recentWeight = 0;
    let priorWeight = 0;
    for (const c of members) {
      const age = (NOW_MS - Date.parse(c.publishedAtLatest)) / 3600e3;
      if (age < WINDOW_HOURS / 2) recentWeight += c.weight;
      else priorWeight += c.weight;
    }
    const weightMomentum =
      (recentWeight - priorWeight) / (recentWeight + priorWeight);
    assert(
      weightMomentum >= M_SURGE && entry.sourceDiversity >= B_NARROW,
      `fixture is not discriminating: weight-based momentum ${weightMomentum} would ` +
        `not have produced a different ring`,
    );
  });

  // G6 — constraint 5: Phase 4 carries the weight through. A sentinel no
  // recomputation or second decay could produce is the only way to prove it.
  check("G6 weight 直通：不重算、不再施加一次衰减", () => {
    const input = mainFixture();
    const sentinel = 999.9;
    input.topics.find((t) => t.topic === "dev-tooling").weight = sentinel;
    const { json } = build(input);
    const byTopic = new Map(json.sectors.map((s) => [s.topic, s]));
    for (const entry of input.topics) {
      assert(
        byTopic.get(entry.topic).weight === entry.weight,
        `${entry.topic}: weight ${byTopic.get(entry.topic).weight} != input ${entry.weight}`,
      );
    }
    assert(
      byTopic.get("dev-tooling").weight === sentinel,
      "the sentinel weight was recomputed or re-decayed",
    );
    // The input's provenance rides along untouched; without it a radar.json
    // built from a different run is indistinguishable from a current one.
    assert(
      json.sourceGeneratedAt === input.generatedAt,
      `sourceGeneratedAt ${json.sourceGeneratedAt} != input generatedAt ${input.generatedAt}`,
    );
  });

  // G7 — the prohibitions, applied to the Phase 4 path. `\btier` without a
  // trailing boundary, so `tierBoost` / `tiers` are caught too: the first
  // version used `\btier\b` and a `TIER_BOOST` table sailed past it (finding F6,
  // 2026-09-29). Still a literal guard, not a parser — see plan §9.
  check("G7 无 tier / 按源加成：权重与环路径不出现 tier 或具体源 id", () => {
    const files = [
      ["lib/radar.js", readFileSync(join(SCRIPT_DIR, "lib", "radar.js"), "utf-8")],
      ["build-radar.js", readFileSync(join(SCRIPT_DIR, "build-radar.js"), "utf-8")],
    ];
    for (const [name, raw] of files) {
      const source = stripComments(raw);
      assert(
        !/\btier/i.test(source),
        `${name} references \`tier\` in code — plan §10 forbids it in the radar path`,
      );
      const boosted = source.match(/\b(rss|blog|x|github|podcast|api):[a-z0-9-]+/g);
      assert(
        boosted === null,
        `${name} names a specific registry source (${(boosted || []).join(", ")}) — per-source boosts are forbidden`,
      );
    }
  });

  // G8 — §2.2 / §3: dropping the health metric would make the radar look
  // complete when the taxonomy is visibly failing to classify half the corpus.
  check("G8 健康指标带出：unclassified 与输入一致，不静默丢弃", () => {
    const input = mainFixture();
    const { json } = build(input);
    assert(
      json.unclassified && typeof json.unclassified.signalCount === "number",
      "no unclassified metric in the output",
    );
    assert(
      json.unclassified.signalCount === input.unclassified.signalCount,
      `unclassified.signalCount ${json.unclassified.signalCount} != input ${input.unclassified.signalCount}`,
    );
    assert(
      json.unclassified.ratio === input.unclassified.ratio,
      `unclassified.ratio ${json.unclassified.ratio} != input ${input.unclassified.ratio}`,
    );
  });

  // G9 — §3: a topic with nothing in the window is still a sector. Letting it
  // vanish would silently resize the radar from run to run. Also the inverse:
  // a topic that HAS clusters but no `topics[]` entry must still be counted
  // consistently rather than claiming "no clusters" next to non-zero numbers.
  check("G9 扇区计数自洽：零活动扇区不消失，有 cluster 无条目也不自相矛盾", () => {
    const { json } = build(mainFixture()); // fixture omits two topics
    const byTopic = new Map(json.sectors.map((s) => [s.topic, s]));
    for (const topic of ["agent-framework", "inference-and-cost"]) {
      const sector = byTopic.get(topic);
      assert(sector, `zero-activity topic "${topic}" vanished from the radar`);
      assert(
        sector.signalCount === 0 && sector.clusterCount === 0,
        `${topic}: expected zero counts, got signalCount ${sector.signalCount} / clusterCount ${sector.clusterCount}`,
      );
      assert(
        sector.momentum === null,
        `${topic}: momentum should be null (unobserved, not flat), got ${sector.momentum}`,
      );
      assert(
        sector.ring === "hold",
        `${topic}: ring should be hold, got ${sector.ring}`,
      );
      assert(
        /no clusters/i.test(sector.ringReason),
        `${topic}: ringReason should say why, got ${JSON.stringify(sector.ringReason)}`,
      );
    }

    // Clusters present, topic entry absent. The sector must agree with itself
    // (finding F2, 2026-09-29: clusterCount came from the entry while
    // recent/prior came from the clusters, so this printed clusterCount 0
    // beside two counted clusters with a "no clusters in window" reason).
    const orphan = build(
      doc(
        [],
        [
          cluster("model-capability", 1),
          cluster("model-capability", 2),
          cluster("model-capability", 300),
        ],
      ),
    ).json.sectors.find((s) => s.topic === "model-capability");
    assert(
      orphan.clusterCount === orphan.recentClusters + orphan.priorClusters,
      `orphan sector is self-contradictory: clusterCount ${orphan.clusterCount} vs ` +
        `recent ${orphan.recentClusters} + prior ${orphan.priorClusters}`,
    );
    assert(
      !/no clusters/i.test(orphan.ringReason),
      `orphan sector claims no clusters while counting ${orphan.clusterCount}`,
    );
  });

  // G10 — §1.5: `windowHours` is a label the upstream fetchers do not enforce,
  // so the real span is measured and an over-wide input is said out loud
  // rather than trusted.
  check("G10 实测跨度：独立算出并对超窗输入告警", () => {
    const { json } = build(mainFixture());
    const expected = 300; // the oldest cluster in the fixture is 300h old
    assert(
      Math.abs(json.measuredSpanHours - expected) < 1e-6,
      `measuredSpanHours ${json.measuredSpanHours} != recomputed ${expected}`,
    );
    assert(
      json.measuredSpanHours <= json.windowHours,
      `fixture unexpectedly exceeds its window (${json.measuredSpanHours}h)`,
    );

    // Beyond the window: the product must carry the number and the script must
    // say so on stderr. The exit code stays 0 — this is an upstream
    // observation, not a Phase 4 failure.
    const wide = mainFixture();
    const stray = cluster("eval-and-benchmark", 400);
    wide.clusters.push(stray);
    wide.topics
      .find((t) => t.topic === "eval-and-benchmark")
      .signalIds.push(stray.signalIds[0]);
    const result = build(wide);
    assert(
      result.json.measuredSpanHours > WINDOW_HOURS,
      `expected an over-wide span, got ${result.json.measuredSpanHours}h`,
    );
    assert(
      /exceeds the declared window/.test(result.stderr),
      `no warning on stderr for an over-wide input; stderr was:\n${result.stderr}`,
    );
  });

  // G11 — a missing or non-positive window makes the midpoint NaN, drops every
  // cluster into the prior half, and yields an all-hold radar that looks
  // perfectly well-formed. Fail loudly instead (finding F5, 2026-09-29).
  check("G11 坏 windowHours 必须 fail-fast，不静默产出全 hold", () => {
    for (const bad of [undefined, 0, -1, null, "336", NaN]) {
      const input = mainFixture();
      if (bad === undefined) delete input.windowHours;
      else input.windowHours = bad;
      const result = runCli(input);
      assert(
        result.status !== 0,
        `windowHours=${JSON.stringify(bad)} was accepted (exit ${result.status}) — the radar silently degrades to all-hold`,
      );
      assert(
        /windowHours/.test(result.out),
        `windowHours=${JSON.stringify(bad)}: the error does not name the field: ${result.out.trim()}`,
      );
    }
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
