#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Phase 5 gate
// ============================================================================
// The executable definition of "Phase 5 works". Same shape as gate-2b / gate-3
// / gate-4: one process, no framework, red/green per check, driving the real
// CLI as a child process against fixtures.
//
// Everything here goes through build-digest.js on disk, never through the
// library's functions, so the gate tests the product a reader would actually
// get.
//
// Usage: node gate-5.js
// Exit: 0 all green, 1 any red
//
// plan: .claude/plans/phase-5-daily-weekly-digest.plan.md §7.1 / §8
// ============================================================================

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOPICS } from "./lib/taxonomy.js";
import { RINGS } from "./lib/radar.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// Frozen clock, as in gate-4: the date header and any recency-derived ordering
// must be a function of `--now`, not of when the suite happens to run.
const NOW_MS = Date.parse("2026-09-29T00:00:00.000Z");
const NOW = new Date(NOW_MS).toISOString();
const WINDOW_HOURS = 336;

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

// Same deliberate naivety as gate-3 / gate-4: the static checks look for
// prohibitions in the *code*, so comments come out first — otherwise writing
// down the rule would itself trip the check, and the obvious fix would be to
// delete the explanation. `(^|[^:])` keeps `https://` from reading as a
// comment.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// -- Fixture ------------------------------------------------------------------

function signal(id, { title, url = `https://ex.example/${id}`, publishedAt = NOW } = {}) {
  return {
    id,
    source_id: "rss:fixture",
    native_id: id,
    channel: "rss",
    type: "article",
    title: title ?? `T-${id}`,
    url,
    original_url: url,
    is_secondary: false,
    published_at: publishedAt,
    collected_at: NOW,
    text: "",
  };
}

function cluster(topic, { id, signalIds, url, weight = 1, diversity = 1 } = {}) {
  seq += 1;
  return {
    clusterId: id ?? `cl${String(seq).padStart(4, "0")}`,
    topic,
    signalIds,
    primaryUrl: url === undefined ? `https://ex.example/${id ?? seq}` : url,
    sourceDiversity: diversity,
    publishedAtLatest: NOW,
    weight,
  };
}

// One row per topic: [topic, ring, breadth, recent, prior, clusterCount?].
// `recent`/`prior` are the halves the ring rule needs; the ring column is the
// EXPECTED outcome. `clusterCount` defaults to recent+prior and exists only for
// the one row that has clusters but no measurable direction — breadth is not
// read on that path, which is precisely what G4 must not demand of it.
//
// Every branch of the rule is occupied: adopt, trial, assess-rising,
// assess-flat, assess-undated, hold-falling, hold-no-activity.
const TOPIC_ROWS = [
  ["model-capability", "adopt", 5, 5, 3],
  ["agent-framework", "assess", 1, 1, 0],
  ["tool-and-protocol", "hold", 1, 0, 1],
  ["context-and-memory", "trial", 3, 3, 0],
  ["inference-and-cost", "assess", 2, 2, 2],
  ["dev-tooling", "adopt", 4, 4, 2],
  // Clusters exist but none carries a date: decideRing returns assess BEFORE
  // reading breadth (radar.js:73-83). The fixture omitted this branch, which is
  // why G4 asserted breadth here and stayed green while being wrong.
  ["product-and-business", "assess", 1, 0, 0, 2],
  ["safety-and-governance", "adopt", 3, 3, 2],
  ["eval-and-benchmark", "hold", 0, 0, 0],
];

function momentumOf(recent, prior) {
  const dated = recent + prior;
  return dated === 0 ? null : (recent - prior) / dated;
}

function sectorRow([topic, ring, breadth, recent, prior, clusterCount]) {
  return {
    topic,
    ring,
    weight: breadth * 2,
    signalCount: recent + prior,
    clusterCount: clusterCount ?? recent + prior,
    breadth,
    recentClusters: recent,
    priorClusters: prior,
    momentum: momentumOf(recent, prior),
    ringReason: `fixture:${ring}`,
    signalIds: [],
  };
}

function radarFromRows(rows = TOPIC_ROWS) {
  const sectors = rows.map(sectorRow);
  const summary = {};
  for (const ring of RINGS) summary[ring] = 0;
  for (const sector of sectors) summary[sector.ring] += 1;
  return {
    generatedAt: NOW,
    radarVersion: "v1",
    taxonomyVersion: "v1",
    sourceGeneratedAt: NOW,
    windowHours: WINDOW_HOURS,
    inputSignalCount: 15,
    measuredSpanHours: 336,
    ringRule: { momentumMidpointHours: 168, narrowBreadth: 3, surgeMomentum: 0.5 },
    sectors,
    unclassified: { signalCount: 2, ratio: 2 / 17 },
    summary,
  };
}

// The clusters and the window signals. `w-mc-nourl` carries no link at all and
// `w-cm-orig` has only `original_url`; both are in the delta, so G2 has
// something to drop and something to keep. `cl-dt-unlinked` has no primaryUrl,
// so the weekly list has a link-less cluster to drop too.
function buildClusters() {
  return [
    cluster("model-capability", {
      id: "cl-mc-1",
      // The extra ids exist so G2 can build a section of seven items; only some
      // of them are ever placed in the default delta.
      signalIds: [
        "w-mc-1", "w-mc-2", "w-mc-nourl",
        "w-mc-a", "w-mc-b", "w-mc-c", "w-mc-d", "w-mc-e", "w-mc-f",
      ],
    }),
    cluster("model-capability", { id: "cl-mc-2", signalIds: ["w-mc-3"] }),
    cluster("agent-framework", { id: "cl-af-1", signalIds: ["w-af-1"] }),
    cluster("tool-and-protocol", { id: "cl-tp-1", signalIds: ["w-tp-1"] }),
    cluster("context-and-memory", { id: "cl-cm-1", signalIds: ["w-cm-1", "w-cm-2", "w-cm-orig"] }),
    cluster("inference-and-cost", { id: "cl-ic-1", signalIds: ["w-ic-1", "w-ic-2"] }),
    cluster("dev-tooling", { id: "cl-dt-1", signalIds: ["w-dt-1", "w-dt-2"] }),
    cluster("dev-tooling", { id: "cl-dt-unlinked", signalIds: ["w-dt-nolink"], url: null }),
    cluster("product-and-business", { id: "cl-pb-1", signalIds: ["w-pb-1", "w-pb-2"] }),
    cluster("safety-and-governance", { id: "cl-sg-1", signalIds: ["w-sg-1", "w-sg-2"] }),
  ];
}

function buildWindow(clusters) {
  const ids = clusters.flatMap((c) => c.signalIds);
  const special = {
    "w-mc-nourl": { title: "NOURL-TITLE", url: null },
    "w-cm-orig": { title: "ORIG-TITLE", url: null, originalUrl: "https://orig.example/x" },
    "w-dt-nolink": { title: "NOLINK-CLUSTER" },
  };
  const signals = ids.map((id) => {
    const s = special[id];
    if (!s) return signal(id);
    const built = signal(id, { title: s.title, url: s.url });
    if (s.originalUrl) built.original_url = s.originalUrl;
    return built;
  });
  signals.push(signal("u-1", { title: "POOL-TITLE-1" }));
  signals.push(signal("u-2", { title: "POOL-TITLE-2" }));
  return {
    generatedAt: NOW,
    count: signals.length,
    duplicates: 0,
    perChannel: {},
    signals,
    errors: [],
  };
}

function buildTopics(clusters, { reorder = false } = {}) {
  const entries = TOPIC_ROWS.filter(([, , , recent, prior]) => recent + prior > 0).map(
    ([topic, , breadth, recent, prior]) => ({
      topic,
      weight: breadth * 2,
      signalCount: recent + prior,
      clusterCount: recent + prior,
      sourceDiversity: breadth,
      undatedClusters: 0,
      signalIds: clusters.filter((c) => c.topic === topic).flatMap((c) => c.signalIds),
    }),
  );
  // G3 needs the input's own order and weights to be irrelevant to the output.
  // Phase 3 sorts topics by weight, so that array order is not stable across
  // runs; a digest that inherited it would reshuffle every day.
  const ordered = reorder
    ? [...entries].reverse().map((e, i) => ({ ...e, weight: 100 - i }))
    : entries;
  return {
    generatedAt: NOW,
    windowHours: WINDOW_HOURS,
    taxonomyVersion: "v1",
    inputSignalCount: 17,
    clusterCount: clusters.length,
    topics: ordered,
    unclassified: {
      signalCount: 2,
      clusterCount: 2,
      ratio: 2 / 17,
      signalIds: ["u-1", "u-2"],
    },
    clusters,
  };
}

// The delta: a strict SUBSET of the window. Three classified signals across two
// different topics that share a ring, the unclassified pool entry, and the two
// link edge cases (one with no link at all, one carrying only `original_url`).
// The two same-ring topics are load-bearing: with one sector per ring, an
// intra-ring ordering bug in the daily path would be unobservable (found by the
// injection pass).
function buildDelta() {
  const noUrl = signal("w-mc-nourl", { title: "NOURL-TITLE", url: null });
  noUrl.original_url = null;
  const origOnly = signal("w-cm-orig", { title: "ORIG-TITLE", url: null });
  origOnly.original_url = "https://orig.example/x";

  const signals = [
    signal("w-mc-1", { title: "MC-TODAY" }),
    signal("w-dt-1", { title: "DT-TODAY" }),
    signal("w-cm-1", { title: "CM-TODAY" }),
    noUrl,
    origOnly,
    signal("u-1", { title: "POOL-TITLE-1" }),
  ];
  return { generatedAt: NOW, count: signals.length, duplicates: 0, perChannel: {}, signals, errors: [] };
}

function prevRadarFor(rows) {
  const radar = radarFromRows(rows);
  radar.generatedAt = "2026-09-28T00:00:00.000Z";
  return radar;
}

// -- Running the real script --------------------------------------------------

function writeCase(files) {
  const dir = mkdtempSync(join(tmpRoot, "case-"));
  writeFileSync(join(dir, "topics.json"), JSON.stringify(files.topics));
  writeFileSync(join(dir, "radar.json"), JSON.stringify(files.radar));
  writeFileSync(join(dir, "signals.json"), JSON.stringify(files.signals));
  writeFileSync(join(dir, "signals-window.json"), JSON.stringify(files.window));
  if (files.prevRadar) {
    writeFileSync(join(dir, "prev-radar.json"), JSON.stringify(files.prevRadar));
  }
  return dir;
}

// The main fixture: every ring occupied, one topic with zero clusters, an
// unclassified pool, a link-less signal and a link-less cluster.
function makeCase({ reorder = false, delta = buildDelta() } = {}) {
  const clusters = buildClusters();
  const window_ = buildWindow(clusters);
  const topics = buildTopics(clusters, { reorder });
  const radar = radarFromRows();
  return writeCase({ topics, radar, signals: delta, window: window_ });
}

function run(dir, mode, { prevRadar = false, noSignals = false, now = NOW, env } = {}) {
  seq += 1;
  const outPath = join(dir, `${mode}-${seq}.md`);
  const args = [
    join(SCRIPT_DIR, "build-digest.js"),
    "--mode",
    mode,
    "--topics",
    join(dir, "topics.json"),
    "--radar",
    join(dir, "radar.json"),
    "--signals",
    noSignals ? join(dir, "does-not-exist.json") : join(dir, "signals.json"),
    "--window",
    join(dir, "signals-window.json"),
    "--out",
    outPath,
    "--now",
    now,
  ];
  if (prevRadar) args.push("--prev-radar", join(dir, "prev-radar.json"));
  const result = spawnSync(process.execPath, args, {
    encoding: "utf-8",
    ...(env ? { env } : {}),
  });
  let markdown = null;
  try {
    markdown = readFileSync(outPath, "utf-8");
  } catch {
    markdown = null;
  }
  return {
    status: result.status,
    out: `${result.stdout || ""}${result.stderr || ""}`,
    markdown,
  };
}

// A digest that ran and produced a file, or an assertion failure naming why not.
function digestOf(dir, mode, opts) {
  const result = run(dir, mode, opts);
  assert(
    result.status === 0 && result.markdown !== null,
    `build-digest.js --mode ${mode} failed (status ${result.status}): ${result.out.trim()}`,
  );
  return result.markdown;
}

// -- Parsing the output (the checks read text, not the library's internals) ---
// Independent by construction: the numbers are pulled back out of the rendered
// Markdown with regexes and compared to radar.json. Re-using the renderer's own
// functions here would only prove it agrees with itself (phase 4 finding F1).

const SECTION_RE = /^### (.+?)（(\w+)）\s*$/;
const SECTOR_RE = /^#### (\S+) —— (.+)$/;
const STATS_RE = /^(\d+) 个独立源 · (\d+) 个事件（近 (\d+) \/ 远 (\d+)）· 动量 (\S+)$/;

function parseWeeklySectors(markdown) {
  const lines = markdown.split("\n");
  const out = [];
  let ring = null;
  for (let i = 0; i < lines.length; i += 1) {
    const section = lines[i].match(SECTION_RE);
    if (section) {
      ring = section[2];
      continue;
    }
    const sector = lines[i].match(SECTOR_RE);
    if (!sector) continue;
    const stats = (lines[i + 2] || "").match(STATS_RE);
    if (!stats) continue;
    out.push({
      topic: sector[1],
      ring,
      breadth: Number(stats[1]),
      clusters: Number(stats[2]),
      recent: Number(stats[3]),
      prior: Number(stats[4]),
      momentum: stats[5],
      sentence: (lines[i + 4] || "").trim(),
    });
  }
  return out;
}

// Every bullet that claims to be a piece of content. The "还有 N 条" roll-up is
// not an item — it is a count of items deliberately not shown.
function bulletLines(markdown) {
  return markdown
    .split("\n")
    .filter((line) => /^- /.test(line))
    .filter((line) => !/^- 还有 \d+ 条$/.test(line));
}

// -- Checks -------------------------------------------------------------------

function main() {
  tmpRoot = mkdtempSync(join(tmpdir(), "gate-5-"));

  // G1 — §7.1: the phase rests on determinism. Bytes, not objects.
  check("G1 确定性：同一组输入 + 同一 --now，日/周报逐字节相同", () => {
    for (const mode of ["daily", "weekly"]) {
      const dir = makeCase();
      const first = digestOf(dir, mode);
      const second = digestOf(dir, mode);
      assert(first === second, `--mode ${mode} produced different bytes on two runs`);
    }
  });

  // G2 — §4.3: "No link = not real". Inherited from prompts/digest-intro.md.
  check("G2 链接强制：无链接的条目被剔除，每条列出的内容都带链接", () => {
    const dir = makeCase();
    const daily = digestOf(dir, "daily");
    const weekly = digestOf(dir, "weekly");

    for (const [name, markdown] of [["daily", daily], ["weekly", weekly]]) {
      for (const line of bulletLines(markdown)) {
        assert(
          /https?:\/\//.test(line),
          `${name}: a listed item has no link: ${line}`,
        );
      }
    }

    assert(
      !daily.includes("NOURL-TITLE"),
      "daily: a signal with neither url nor original_url was still listed",
    );
    assert(
      daily.includes("ORIG-TITLE") && daily.includes("orig.example"),
      "daily: a signal with only original_url was dropped instead of falling back to it",
    );
    assert(
      !weekly.includes("NOLINK-CLUSTER"),
      "weekly: a cluster with no primaryUrl was still listed",
    );

    // The roll-up arithmetic (review finding L4). A section that drops a
    // link-less item out of its top N must not count that item as shown:
    // "listed + 还有 N 条" has to equal the real total.
    const fixtureTopics = JSON.parse(readFileSync(join(dir, "topics.json"), "utf-8"));
    const mcIds = fixtureTopics.clusters
      .filter((c) => c.topic === "model-capability")
      .flatMap((c) => c.signalIds);
    assert(mcIds.length >= 7, `fixture: only ${mcIds.length} model-capability signals`);
    const rows = mcIds.slice(0, 7).map((id, i) => {
      const s = signal(id, {
        title: `ROLLUP-${i}`,
        url: i < 3 ? null : `https://ex.example/${id}`,
      });
      // Newest first, so the three link-less ones are inside the top N and get
      // dropped there rather than at the tail.
      s.published_at = `2026-09-2${9 - i}T00:00:00.000Z`;
      return s;
    });
    const rollupDir = makeCase({
      delta: {
        generatedAt: NOW, count: rows.length, duplicates: 0, perChannel: {},
        signals: rows, errors: [],
      },
    });
    const rolled = digestOf(rollupDir, "daily");
    const block = (rolled.split("#### model-capability")[1] || "").split("####")[0];
    const listed = block
      .split("\n")
      .filter((l) => /^- /.test(l) && !/^- 还有 \d+ 条$/.test(l)).length;
    const rollup = Number((block.match(/^- 还有 (\d+) 条$/m) || [])[1]);
    assert(rollup === 5, `roll-up says "还有 ${rollup} 条", expected 5`);
    assert(
      listed + rollup === rows.length,
      `roll-up is inconsistent: ${listed} listed + "还有 ${rollup} 条" != ${rows.length} total`,
    );
  });

  // G3 — §4.2: section order is the ring, sector order is the taxonomy. Neither
  // may follow the input array (which Phase 3 sorts by weight).
  check("G3 环驱动排序：打乱输入顺序与权重，输出不变；分组按环序", () => {
    for (const mode of ["daily", "weekly"]) {
      const plain = digestOf(makeCase(), mode);
      const shuffled = digestOf(makeCase({ reorder: true }), mode);
      assert(
        plain === shuffled,
        `${mode}: reordering topics[] / rewriting weights changed the output`,
      );

      const headings = [...plain.matchAll(/^### (.+?)（(\w+)）\s*$/gm)].map((m) => m[2]);
      for (let i = 1; i < headings.length; i += 1) {
        assert(
          RINGS.indexOf(headings[i]) > RINGS.indexOf(headings[i - 1]),
          `${mode}: ring sections are out of order: ${headings.join(" > ")}`,
        );
      }
      assert(
        new Set(headings).size === headings.length,
        `${mode}: a ring section appeared twice: ${headings.join(" > ")}`,
      );
    }
  });

  // G4 — §4.1 / §7.1: the judgement must be a function of radar.json, and the
  // sentence must state numbers that match it. Parsed from the Markdown.
  check("G4 判断句来自规则：扇区统计与结论句均由 radar.json 独立复核一致", () => {
    const dir = makeCase();
    const weekly = digestOf(dir, "weekly");
    const radar = JSON.parse(readFileSync(join(dir, "radar.json"), "utf-8"));
    const sectors = parseWeeklySectors(weekly);

    assert(
      sectors.length === TAXONOMY_ORDER.length,
      `weekly lists ${sectors.length} sector(s), expected ${TAXONOMY_ORDER.length}`,
    );
    // §4.2: ring-major, taxonomy order inside each ring. The expected sequence
    // is derived from radar.json + the taxonomy declaration order, NOT from
    // whatever the renderer emitted.
    const expectedOrder = RINGS.flatMap((ring) =>
      TAXONOMY_ORDER.filter(
        (topic) => radar.sectors.find((s) => s.topic === topic)?.ring === ring,
      ),
    );
    assert(
      sectors.map((s) => s.topic).join(",") === expectedOrder.join(","),
      `weekly sectors are not in ring-major taxonomy order:\n` +
        `  got      ${sectors.map((s) => s.topic).join(",")}\n` +
        `  expected ${expectedOrder.join(",")}`,
    );

    const SHAPE = {
      adopt: /覆盖广（\d+ 个独立源）/,
      trial: /共识形成前的活跃试验期/,
      assess: /只够放进观察位|方向不可测/,
      hold: /注意力在退|窗口内无任何活动/,
    };
    // The rings whose decision actually consults breadth. For `hold` the rule
    // short-circuits on momentum first. For `assess` with a null momentum it
    // short-circuits even earlier — clusters exist but none is dated, so
    // direction is unmeasurable and breadth is never read (radar.js:73-83).
    // Demanding the count there failed a CORRECT implementation (review finding
    // M1), which is the same class of error as phase 4's finding F1: a check
    // that encodes the author's misreading instead of the spec.
    const breadthDecides = (sector) => sector.momentum !== null && sector.ring !== "hold";

    for (const parsed of sectors) {
      const truth = radar.sectors.find((s) => s.topic === parsed.topic);
      assert(truth, `radar.json has no sector ${parsed.topic}`);
      const expectedMomentum =
        truth.momentum === null
          ? "n/a"
          : `${truth.momentum >= 0 ? "+" : ""}${truth.momentum.toFixed(2)}`;
      assert(
        parsed.ring === truth.ring,
        `${parsed.topic}: printed under ring ${parsed.ring}, radar says ${truth.ring}`,
      );
      assert(
        parsed.breadth === truth.breadth,
        `${parsed.topic}: printed breadth ${parsed.breadth}, radar says ${truth.breadth}`,
      );
      assert(
        parsed.clusters === truth.clusterCount,
        `${parsed.topic}: printed ${parsed.clusters} clusters, radar says ${truth.clusterCount}`,
      );
      assert(
        parsed.recent === truth.recentClusters && parsed.prior === truth.priorClusters,
        `${parsed.topic}: printed halves ${parsed.recent}/${parsed.prior}, ` +
          `radar says ${truth.recentClusters}/${truth.priorClusters}`,
      );
      assert(
        parsed.momentum === expectedMomentum,
        `${parsed.topic}: printed momentum ${parsed.momentum}, radar says ${expectedMomentum}`,
      );
      assert(
        SHAPE[truth.ring].test(parsed.sentence),
        `${parsed.topic} (${truth.ring}): the verdict sentence does not match the ring: "${parsed.sentence}"`,
      );
      if (breadthDecides(truth)) {
        assert(
          parsed.sentence.includes(`${truth.breadth} 个`),
          `${parsed.topic}: the sentence hides the breadth the ring was decided on: "${parsed.sentence}"`,
        );
      }
      // Any sentence that asserts a direction must show the number it asserts.
      // A non-zero momentum is the only case where direction is claimed.
      if (truth.momentum !== null && truth.momentum !== 0) {
        assert(
          parsed.sentence.includes(expectedMomentum),
          `${parsed.topic}: the sentence claims a trend but hides its momentum ` +
            `(${expectedMomentum}): "${parsed.sentence}"`,
        );
      }
    }
  });

  // G5 — §3 / §7.1: the unclassified pool is shown, but never inside a topic.
  check("G5 未归类不冒充主题：只出现在显式标注的池区，不混进主题段落", () => {
    const daily = digestOf(makeCase(), "daily");
    const marker = daily.indexOf("## 未归类");
    assert(marker !== -1, "daily: the unclassified pool is missing entirely");
    const heading = daily.slice(marker, daily.indexOf("\n", marker));
    assert(
      /非主题/.test(heading),
      `daily: the pool heading does not say it is not a topic: "${heading}"`,
    );
    const before = daily.slice(0, marker);
    const after = daily.slice(marker);
    assert(
      after.includes("POOL-TITLE-1"),
      "daily: an unclassified signal was dropped instead of being shown in the pool",
    );
    assert(
      !before.includes("POOL-TITLE-1"),
      "daily: an unclassified signal was listed inside a topic section",
    );
  });

  // G6 — §3 / §7.1: a daily digest is about the delta. A signal that is in the
  // window but not in the delta must not appear, or the report would be the
  // same every day.
  check("G6 日报用增量：只列 signals.json 的新信号，窗口独有者不出现", () => {
    const dir = makeCase();
    const daily = digestOf(dir, "daily");
    const window_ = JSON.parse(readFileSync(join(dir, "signals-window.json"), "utf-8"));
    const delta = JSON.parse(readFileSync(join(dir, "signals.json"), "utf-8"));
    const deltaIds = new Set(delta.signals.map((s) => s.id));

    const windowOnly = window_.signals.filter((s) => !deltaIds.has(s.id) && s.title);
    assert(windowOnly.length > 0, "fixture: the delta is not a strict subset of the window");
    for (const s of windowOnly) {
      assert(
        !daily.includes(s.title),
        `daily: "${s.title}" is in the window but not in the delta, yet it was listed`,
      );
    }
    assert(daily.includes("MC-TODAY"), "daily: a signal that IS in the delta was dropped");
  });

  // G7 — §3: the weekly report is about the window, so an empty delta must not
  // shrink it to nothing.
  check("G7 周报用全窗：增量为空时仍覆盖全部 9 个扇区", () => {
    const empty = { generatedAt: NOW, count: 0, duplicates: 0, perChannel: {}, signals: [], errors: [] };
    const dir = makeCase({ delta: empty });
    const weekly = digestOf(dir, "weekly");
    const topics = parseWeeklySectors(weekly).map((s) => s.topic);
    assert(
      topics.length === TAXONOMY_ORDER.length &&
        TAXONOMY_ORDER.every((topic) => topics.includes(topic)),
      `weekly with an empty delta covered ${topics.join(",")}`,
    );
  });

  // G8 — §4.4: ring movement, with an honest degraded path rather than a
  // fabricated one.
  check("G8 环移动：有前任则报，无移动则说无，无前任则降级", () => {
    const dir = makeCase();
    const radar = JSON.parse(readFileSync(join(dir, "radar.json"), "utf-8"));
    const movementOf = (markdown) =>
      markdown.slice(markdown.indexOf("## 环的移动"), markdown.indexOf("## 扇区全貌"));

    // A predecessor identical to the current radar: no movement.
    writeFileSync(
      join(dir, "prev-radar.json"),
      JSON.stringify({ ...radar, generatedAt: "2026-09-28T00:00:00.000Z" }),
    );
    const same = digestOf(dir, "weekly", { prevRadar: true });
    assert(same.includes("本周无环变动"), "weekly: identical radars did not report no change");
    assert(!/→/.test(movementOf(same)), "weekly: a movement arrow appeared with no movement");

    // A predecessor with model-capability in a different ring: movement.
    const prev = prevRadarFor(TOPIC_ROWS);
    prev.sectors.find((s) => s.topic === "model-capability").ring = "trial";
    writeFileSync(join(dir, "prev-radar.json"), JSON.stringify(prev));
    const diff = digestOf(dir, "weekly", { prevRadar: true });
    assert(
      /model-capability/.test(movementOf(diff)) && /试用中 → 已确立/.test(movementOf(diff)),
      `weekly: a real ring change was not reported: ${JSON.stringify(movementOf(diff))}`,
    );

    // A predecessor from a DIFFERENT topic list: the comparison is meaningless,
    // so it must degrade rather than report movement that is an artefact of the
    // topic list changing (review finding M2).
    const otherTaxonomy = JSON.parse(JSON.stringify(radar));
    otherTaxonomy.taxonomyVersion = "v0";
    otherTaxonomy.generatedAt = "2026-09-27T00:00:00.000Z";
    for (const s of otherTaxonomy.sectors) s.ring = "hold";
    writeFileSync(join(dir, "prev-radar.json"), JSON.stringify(otherTaxonomy));
    const crossTaxonomy = digestOf(dir, "weekly", { prevRadar: true });
    assert(
      /无对比基线/.test(movementOf(crossTaxonomy)) &&
        !/→/.test(movementOf(crossTaxonomy)),
      `weekly: movement was reported against a radar from a different taxonomy: ` +
        `${JSON.stringify(movementOf(crossTaxonomy))}`,
    );

    // No predecessor at all: degrade, do not invent and do not fail.
    const none = digestOf(dir, "weekly");
    assert(
      /无对比基线/.test(movementOf(none)),
      `weekly: no baseline was not stated: ${JSON.stringify(movementOf(none))}`,
    );
    assert(!/→/.test(movementOf(none)), "weekly: a movement was invented with no predecessor");
  });

  // G9 — §3: a quiet day is a true statement, not a crash.
  check("G9 空增量不崩：为空或缺失时仍产出日报（含雷达全貌），退出码 0", () => {
    const empty = { generatedAt: NOW, count: 0, duplicates: 0, perChannel: {}, signals: [], errors: [] };
    const dir = makeCase({ delta: empty });

    const blank = digestOf(dir, "daily");
    assert(blank.includes("今日无新增信号"), "daily: an empty delta did not say so");
    assert(blank.includes("## 当前雷达"), "daily: an empty delta dropped the radar overview");

    const missing = digestOf(dir, "daily", { noSignals: true });
    assert(
      missing.includes("今日无新增信号"),
      "daily: a missing signals.json was not treated as an empty delta",
    );
    assert(missing.includes("## 当前雷达"), "daily: a missing signals.json dropped the radar");
  });

  // G10 — §0.2: tier and per-source boosts must not exist in this layer.
  check("G10 无 tier / 按源加成：代码中不出现 tier 或具体 registry 源 id", () => {
    for (const file of ["lib/digest.js", "build-digest.js"]) {
      const source = stripComments(readFileSync(join(SCRIPT_DIR, file), "utf-8"));
      assert(
        !/\btier/i.test(source),
        `${file}: references tier — the tier must not reach the digest`,
      );
      const sourceId = source.match(/["'`](?:rss|github|api|web|x|podcast):[a-z0-9-]+["'`]/i);
      assert(
        !sourceId,
        `${file}: hardcodes a registry source id (${sourceId && sourceId[0]}) — a per-source boost in waiting`,
      );
    }
  });

  // G11 — §0.2 constraint 6: this layer must add no secrets and make no calls.
  check("G11 零 secrets / 零网络：不读环境变量、不发请求，清空环境仍产出", () => {
    for (const file of ["lib/digest.js", "build-digest.js"]) {
      const source = stripComments(readFileSync(join(SCRIPT_DIR, file), "utf-8"));
      assert(!/process\.env/.test(source), `${file}: reads process.env`);
      assert(!/\bfetch\s*\(/.test(source), `${file}: makes a network request`);
      assert(!/from\s+["'](?:node:)?https?["']/.test(source), `${file}: imports an http client`);
      assert(!/_(?:KEY|TOKEN)\b/.test(source), `${file}: mentions a secret-shaped name`);
    }

    // And prove it at runtime: a scrubbed environment must still produce a
    // digest, so nothing here silently depends on a credential being present.
    const dir = makeCase();
    const result = run(dir, "weekly", { env: { PATH: process.env.PATH ?? "" } });
    assert(
      result.status === 0 && result.markdown !== null,
      `weekly failed with a scrubbed environment (status ${result.status}): ${result.out.trim()}`,
    );
  });

  // G12 — §7.1: a broken input must stop the run, not yield half a report.
  check("G12 坏输入 fail-fast：缺 sectors / 未知环 / 坏 topics 都报错退出", () => {
    const cases = [
      ["radar with no sectors array", (f) => { delete f.radar.sectors; }, /sectors/],
      ["radar with an empty sectors array", (f) => { f.radar.sectors = []; }, /sectors/],
      ["radar sector with an unknown ring", (f) => { f.radar.sectors[0].ring = "dormant"; }, /ring/],
      ["topics with no clusters array", (f) => { delete f.topics.clusters; }, /clusters/],
      ["radar missing windowHours", (f) => { delete f.radar.windowHours; }, /windowHours/],
      [
        "radar without a sector that topics.json reports",
        (f) => { f.radar.sectors = f.radar.sectors.filter((s) => s.topic !== "dev-tooling"); },
        /dev-tooling/,
      ],
    ];

    for (const [name, mutate, expected] of cases) {
      const clusters = buildClusters();
      const files = {
        topics: buildTopics(clusters),
        radar: radarFromRows(),
        signals: buildDelta(),
        window: buildWindow(clusters),
      };
      mutate(files);
      const dir = mkdtempSync(join(tmpRoot, "case-"));
      writeFileSync(join(dir, "topics.json"), JSON.stringify(files.topics));
      writeFileSync(join(dir, "radar.json"), JSON.stringify(files.radar));
      writeFileSync(join(dir, "signals.json"), JSON.stringify(files.signals));
      writeFileSync(join(dir, "signals-window.json"), JSON.stringify(files.window));
      const result = run(dir, "weekly");
      assert(result.status !== 0, `${name}: was accepted (exit ${result.status})`);
      assert(
        expected.test(result.out),
        `${name}: the error does not name the field ${expected}: ${result.out.trim()}`,
      );
    }
  });

  // G13 — §5.1: the digest records which radar.json it was rendered from. Without
  // it a stale digest committed by a failed run is indistinguishable from a
  // current one, because two runs can hold the same number of signals.
  check("G13 溯源：footer 记录输入 radar 的 generatedAt，且与输入一致", () => {
    for (const mode of ["daily", "weekly"]) {
      const dir = makeCase();
      const markdown = digestOf(dir, mode);
      const radar = JSON.parse(readFileSync(join(dir, "radar.json"), "utf-8"));
      const match = markdown.match(/^<!-- [^>]*?\bsrc (\S+) -->$/m);
      assert(match, `${mode}: the footer records no source radar`);
      assert(
        match[1] === radar.generatedAt,
        `${mode}: the footer claims radar ${match[1]}, radar.json says ${radar.generatedAt}`,
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
