// ============================================================================
// Daily / Weekly Digest — Phase 5, decisions D1 / D2
// ============================================================================
// Renders the judgements Phase 3 and Phase 4 already computed into Markdown a
// human can read.
//
// The split of labour is the whole design (plan §2):
//
//   Phase 3  computes topic weights
//   Phase 4  computes ring + momentum per sector
//   Phase 5  TRANSLATES that into sentences and organises it for reading
//
// So nothing here decides anything. The verdict sentence is a template whose
// slots are the numbers already sitting in radar.json, which is why the output
// is byte-reproducible and gated rather than generated. There is no model call
// and no key: the repo has zero secrets (constraint 6), and a template that
// only fills in computed values cannot fabricate a fact the way a model could
// (plan §1.5, §2).
//
// The failure mode this file must never have: becoming a news list. A digest
// that is just titles + links, in time order, is exactly what PLAN.md global
// constraint 4 forbids. Every section here leads with the ring verdict (a
// conclusion), then the evidence (breadth, momentum), then the links.
//
// Determinism: everything is a pure function of (input, now). Every list has a
// stable tiebreak, every Map is iterated as a sorted array, and no clock is
// read outside `now`.
//
// plan: .claude/plans/phase-5-daily-weekly-digest.plan.md §2, §3, §4, §5
// ============================================================================

import { TOPICS } from "./taxonomy.js";
import { RINGS } from "./radar.js";

export const DIGEST_VERSION = "v1";

// How many items a section lists before it summarises the rest. Chosen for a
// phone screen, inheriting the intent of prompts/digest-intro.md:59 ("Keep
// formatting clean and scannable — this will be read on a phone screen").
export const DEFAULT_TOP_N = 5;

const LABELS = new Map(TOPICS.map((topic) => [topic.id, topic.label]));

// Chinese labels for the rings. Presentation only — the ring VOCABULARY is
// Phase 4's (RINGS, imported above), and this map never invents a member.
const RING_LABEL = {
  adopt: "已确立",
  trial: "试用中",
  assess: "待观察",
  hold: "沉寂",
};

// -- Small formatting helpers -------------------------------------------------

function oneLine(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

// Escape the one character that would break a Markdown table cell.
function cell(value) {
  return oneLine(value).replace(/\|/g, "\\|");
}

function fmtSigned(value, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function dayOf(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function pct(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

// Code-unit comparison, deliberately NOT `localeCompare`. The default collation
// depends on the runtime's locale environment, which is a determinism hole in a
// product whose entire contract is byte-identical output. No reproduction was
// found across five locales, but the cheaper guarantee is to not depend on it.
function cmpStr(a, b) {
  const x = String(a ?? "");
  const y = String(b ?? "");
  return x < y ? -1 : x > y ? 1 : 0;
}

// A bullet for one piece of content. Returns null when there is no link: the
// rule inherited from prompts/digest-intro.md:43-49 is "No link = not real =
// do not include", and it is enforced by dropping the item here rather than
// printing a link-less line (gate G2).
function bullet({ title, sourceId, url }) {
  if (!url) return null;
  const meta = [sourceId, url].filter(Boolean).join(" · ");
  // A title is not always available (the cluster's signal may be outside the
  // window product this run), so the dash only appears when there is a title to
  // attach it to. `- — url` would read as a broken item.
  return title ? `- **${oneLine(title)}** — ${meta}` : `- ${meta}`;
}

function bullets(items) {
  const lines = [];
  for (const item of items) {
    const line = bullet(item);
    if (line) lines.push(line);
  }
  return lines;
}

// -- The verdict sentence (the "judgement" half of the digest) -----------------
//
// A pure function of the numbers radar.json already stores. It states the
// conclusion the ring encodes and shows the evidence behind it, so a reader can
// check the call without reading code — the same contract as Phase 4's
// `ringReason` (phase 4 plan §4.3).

export function verdictSentence(sector) {
  const m = sector.momentum;
  const mm = m === null ? null : fmtSigned(m, 2);
  const breadth = sector.breadth;

  switch (sector.ring) {
    case "adopt":
      return m === 0
        ? `覆盖广（${breadth} 个独立源）、动量持平 —— 生态已收敛，处于稳定期。`
        : `覆盖广（${breadth} 个独立源）、动量温和为正（${mm}）—— 生态已收敛且仍在缓升。`;
    case "trial":
      return `覆盖达标（${breadth} 个独立源）且动量急升（${mm}）—— 共识形成前的活跃试验期。`;
    case "assess":
      if (m === null) {
        return `窗口内有事件但均无发布时间 —— 方向不可测，只够放进观察位。`;
      }
      // assess is reached by two different situations: rising-but-narrow
      // (momentum > 0) and flat-but-narrow (momentum 0). Calling the second one
      // "有升势" would assert a trend that is not there — and the first one
      // must print the momentum it is claiming.
      if (m === 0) {
        return `动量持平但独立源偏少（仅 ${breadth} 个）—— 只够放进观察位。`;
      }
      return `有升势（${mm}）但独立源偏少（仅 ${breadth} 个）—— 只够放进观察位。`;
    case "hold":
      if (m === null) {
        return `窗口内无任何活动。`;
      }
      // The source count is printed even though it did not decide this ring:
      // "broad but fading" and "narrow and fading" are the same ring and very
      // different news.
      return `动量转负（${mm}，${breadth} 个源）—— 注意力在退。`;
    default:
      // Unreachable: assertInput rejects an unknown ring before rendering.
      return "";
  }
}

// -- Input validation (fail fast, plan §7.1 G12) ------------------------------

function assertInput(input, mode) {
  const { topics, radar } = input;

  if (!radar || !Array.isArray(radar.sectors) || radar.sectors.length === 0) {
    throw new Error("radar.json is missing a non-empty `sectors` array");
  }
  for (const sector of radar.sectors) {
    if (!sector.topic) {
      throw new Error("a radar sector is missing `topic`");
    }
    if (!RINGS.includes(sector.ring)) {
      throw new Error(
        `radar sector ${JSON.stringify(sector.topic)} has an unknown ring ` +
          `${JSON.stringify(sector.ring)}; expected one of ${RINGS.join(", ")}`,
      );
    }
  }

  if (!topics || !Array.isArray(topics.topics) || !Array.isArray(topics.clusters)) {
    throw new Error("topics.json is missing its `topics` / `clusters` arrays");
  }

  // Phase 4 fails fast on the same misconfiguration (radar.js). Here the window
  // is only a label, so a bad one silently renders "undefinedh" instead of
  // failing — a wrong statement is worse than a stopped run (review finding L1).
  if (
    typeof radar.windowHours !== "number" ||
    !Number.isFinite(radar.windowHours) ||
    radar.windowHours <= 0
  ) {
    throw new Error(
      `radar.json windowHours must be a positive number, got ${JSON.stringify(radar.windowHours)}`,
    );
  }

  // A topic with no sector cannot be placed in a ring, and its signals would be
  // filed under the "in no sector" pool — a false claim about signals that DID
  // match the vocabulary. These two products always come from one run, so a
  // mismatch means they did not (review finding L2).
  const sectorTopics = new Set(radar.sectors.map((s) => s.topic));
  for (const entry of topics.topics) {
    if (!sectorTopics.has(entry.topic)) {
      throw new Error(
        `topics.json reports topic ${JSON.stringify(entry.topic)} but radar.json ` +
          `has no sector for it — the two products are from different runs`,
      );
    }
  }

  if (mode === "daily" && !input.signals) {
    throw new Error("the daily digest needs signals.json (the deduped delta)");
  }
  if (mode === "weekly" && !input.window) {
    throw new Error("the weekly digest needs signals-window.json to resolve titles");
  }
  if (mode === "weekly" && input.prevRadar && !Array.isArray(input.prevRadar.sectors)) {
    throw new Error("the previous radar passed to --prev-radar has no `sectors` array");
  }
}

// -- Shared context -----------------------------------------------------------

function context(input) {
  const { topics, radar } = input;
  const topicById = new Map((topics.topics || []).map((t) => [t.topic, t]));
  const sectorByTopic = new Map(radar.sectors.map((s) => [s.topic, s]));

  // signalId -> topic, so a signal with no topic field can be placed. Built
  // from the clusters, which is the only place the mapping exists.
  const topicOfSignal = new Map();
  for (const cluster of topics.clusters) {
    for (const id of cluster.signalIds || []) topicOfSignal.set(id, cluster.topic);
  }
  for (const id of topics.unclassified?.signalIds || []) {
    topicOfSignal.set(id, null); // explicitly unclassified
  }

  return { topicById, sectorByTopic, topicOfSignal };
}

function labelFor(topic) {
  return LABELS.get(topic) ?? topic;
}

// Ring groups in the canonical strength order, each holding the taxonomy-ordered
// sectors that fall in it. Sector order inside a group is the taxonomy's
// declaration order, never the input array's (which Phase 3 sorts by weight) —
// position stability across time is the point (phase 4 plan §3, gate G3).
function sectorsByRing(radar) {
  const groups = new Map(RINGS.map((ring) => [ring, []]));
  const byTopic = new Map(radar.sectors.map((s) => [s.topic, s]));
  for (const { id } of TOPICS) {
    const sector = byTopic.get(id);
    if (sector) groups.get(sector.ring).push(sector);
  }
  return groups;
}

function healthLine(radar) {
  const u = radar.unclassified ?? { signalCount: 0, ratio: 0 };
  return `未归类 ${u.signalCount} / ${radar.inputSignalCount}（${pct(u.ratio)}）`;
}

function footer(input, now) {
  const { radar } = input;
  return [
    `<!-- digest v${DIGEST_VERSION.slice(1)} · radar ${radar.radarVersion} · ` +
      `taxonomy ${radar.taxonomyVersion} · generated ${new Date(now).toISOString()} · ` +
      // Which radar.json this was rendered from. Two runs can hold the same
      // number of signals, so without this a stale committed digest cannot be
      // told from a current one (the same reasoning as phase 4's finding F4).
      `src ${radar.generatedAt} -->`,
    ``,
    `*Generated through the Follow Builders skill: ` +
      `https://github.com/yueyueshine/agent-technology-radar*`,
  ].join("\n");
}

// -- Radar overview table (shared by both modes) ------------------------------

function radarTable(radar) {
  const lines = [
    `| 扇区 | 环 | 源 | 事件（近/远） | 动量 |`,
    `| --- | --- | --- | --- | --- |`,
  ];
  for (const { id } of TOPICS) {
    const sector = radar.sectors.find((s) => s.topic === id);
    if (!sector) continue;
    const momentum = sector.momentum === null ? "n/a" : fmtSigned(sector.momentum, 2);
    lines.push(
      `| ${cell(id)} | ${cell(RING_LABEL[sector.ring])} | ${sector.breadth} | ` +
        `${sector.recentClusters} / ${sector.priorClusters} | ${momentum} |`,
    );
  }
  return lines.join("\n");
}

// -- Daily ---------------------------------------------------------------------

function renderDaily(input, now, topN) {
  const { topics, radar, signals } = input;
  const { sectorByTopic, topicOfSignal } = context(input);

  // Only the delta. `signals.json` is the cross-run dedup product: what is new
  // since the last run (plan §3). This is what makes a daily digest daily —
  // without it the report would be identical every day (gate G6).
  const delta = [...(signals.signals || [])].sort(
    (a, b) =>
      cmpStr(b.published_at, a.published_at) || cmpStr(a.id, b.id),
  );

  const classified = new Map(); // topic -> signals[]
  const pool = [];
  for (const signal of delta) {
    const topic = topicOfSignal.get(signal.id);
    if (topic && sectorByTopic.has(topic)) {
      if (!classified.has(topic)) classified.set(topic, []);
      classified.get(topic).push(signal);
    } else {
      pool.push(signal);
    }
  }

  const out = [];
  out.push(`# Agent Technology Radar — 日报 — ${dayOf(now)}`);
  out.push(``);
  out.push(`> 生态注意力视角。环 = 生态注意力的成熟度，不是「该不该用」。`);
  out.push(``);
  out.push(
    `窗口 ${radar.windowHours}h · 输入 ${radar.inputSignalCount} signal · ` +
      healthLine(radar),
  );
  out.push(``);

  const groups = sectorsByRing(radar);
  const totalClassified = [...classified.values()].reduce((n, l) => n + l.length, 0);
  out.push(`## 今日新增 ${totalClassified} 条信号`);
  out.push(``);

  if (totalClassified === 0) {
    out.push(`今日无新增信号。`);
    out.push(``);
  } else {
    for (const ring of RINGS) {
      const ringSectors = groups.get(ring).filter((s) => classified.has(s.topic));
      if (ringSectors.length === 0) continue;
      out.push(`### ${RING_LABEL[ring]}（${ring}）`);
      out.push(``);
      for (const sector of ringSectors) {
        const list = classified.get(sector.topic);
        out.push(`#### ${sector.topic} —— ${labelFor(sector.topic)}`);
        out.push(``);
        // Count what was printed, not what was selected: `bullets` drops items
        // with no usable link, so `list.length - topN` overstates the remainder
        // whenever one of the top N was dropped (review finding L4).
        const shown = bullets(list.slice(0, topN).map((s) => ({
          title: s.title,
          sourceId: s.source_id,
          url: s.url || s.original_url,
        })));
        out.push(...shown);
        if (list.length > shown.length) out.push(`- 还有 ${list.length - shown.length} 条`);
        out.push(``);
      }
    }
  }

  // The unclassified pool is surfaced, not dropped — but under a heading that
  // says plainly it is NOT a topic. "未归入扇区" rather than "词表未命中": a
  // signal can also land here because its cluster carries a topic the radar has
  // no sector for, and calling that a vocabulary miss would be false.
  if (pool.length > 0) {
    out.push(`## 未归类（${pool.length}）—— 未归入扇区，非主题`);
    out.push(``);
    const shown = bullets(pool.slice(0, topN).map((s) => ({
      title: s.title,
      sourceId: s.source_id,
      url: s.url || s.original_url,
    })));
    out.push(...shown);
    if (pool.length > shown.length) out.push(`- 还有 ${pool.length - shown.length} 条`);
    out.push(``);
  }

  out.push(`## 当前雷达`);
  out.push(``);
  out.push(radarTable(radar));
  out.push(``);
  out.push(`> 动量 = 窗口后半段 vs 前半段的事件数对比，未含时间衰减。`);
  out.push(``);

  out.push(`## 健康指标`);
  out.push(``);
  out.push(healthLine(radar));
  out.push(``);
  out.push(`---`);
  out.push(``);
  out.push(footer(input, now));
  out.push(``);

  return out.join("\n");
}

// -- Weekly ---------------------------------------------------------------------

function ringMovement(input) {
  const { radar, prevRadar } = input;
  if (!prevRadar || !Array.isArray(prevRadar.sectors) || prevRadar.sectors.length === 0) {
    // No predecessor to compare against. Say so plainly rather than inventing a
    // movement or failing — radar.json has one commit of history today
    // (plan §1.4, gate G8).
    return [`无对比基线（首份 radar.json）。`];
  }

  // radar.js carries taxonomyVersion precisely so that two radars built on
  // different topic lists are never compared against each other. Comparing
  // anyway reports movement that is an artefact of the topic list changing, not
  // of the ecosystem — fabricated in the sense that matters (review finding M2).
  if (
    prevRadar.taxonomyVersion != null &&
    radar.taxonomyVersion != null &&
    prevRadar.taxonomyVersion !== radar.taxonomyVersion
  ) {
    return [
      `无对比基线（基线主题表 ${prevRadar.taxonomyVersion} ≠ 当前 ` +
        `${radar.taxonomyVersion}，环不可比）。`,
    ];
  }

  const prevByTopic = new Map(prevRadar.sectors.map((s) => [s.topic, s]));
  const lines = [];
  for (const sector of radar.sectors) {
    const prev = prevByTopic.get(sector.topic);
    if (!prev) {
      lines.push(
        `- ${sector.topic}：新增扇区 → ${RING_LABEL[sector.ring]}（${sector.ring}）`,
      );
      continue;
    }
    if (prev.ring !== sector.ring) {
      const momentum =
        sector.momentum === null ? "n/a" : fmtSigned(sector.momentum, 2);
      lines.push(
        `- ${sector.topic}：${RING_LABEL[prev.ring]} → ${RING_LABEL[sector.ring]}` +
          `（动量 ${momentum}，源 ${sector.breadth}）`,
      );
    }
  }
  if (lines.length === 0) return [`本周无环变动。`];
  return lines;
}

function renderWeekly(input, now, topN) {
  const { topics, radar, window } = input;

  const signalById = new Map((window.signals || []).map((s) => [s.id, s]));
  const clustersByTopic = new Map();
  for (const cluster of topics.clusters) {
    if (!clustersByTopic.has(cluster.topic)) clustersByTopic.set(cluster.topic, []);
    clustersByTopic.get(cluster.topic).push(cluster);
  }

  const out = [];
  out.push(`# Agent Technology Radar — 周报 — ${dayOf(now)}`);
  out.push(``);
  out.push(`> 生态注意力视角。环 = 生态注意力的成熟度，不是「该不该用」。`);
  out.push(``);
  out.push(
    `窗口 ${radar.windowHours}h · 输入 ${radar.inputSignalCount} signal · ` +
      healthLine(radar),
  );
  out.push(``);

  out.push(`## 环的移动`);
  out.push(``);
  if (input.prevRadar?.generatedAt) {
    out.push(`对比基线：${input.prevRadar.generatedAt}`);
    out.push(``);
  }
  out.push(...ringMovement(input));
  out.push(``);

  out.push(`## 扇区全貌`);
  out.push(``);

  const groups = sectorsByRing(radar);
  for (const ring of RINGS) {
    const ringSectors = groups.get(ring);
    if (ringSectors.length === 0) continue;
    out.push(`### ${RING_LABEL[ring]}（${ring}）`);
    out.push(``);
    for (const sector of ringSectors) {
      out.push(`#### ${sector.topic} —— ${labelFor(sector.topic)}`);
      out.push(``);
      const momentum = sector.momentum === null ? "n/a" : fmtSigned(sector.momentum, 2);
      out.push(
        `${sector.breadth} 个独立源 · ${sector.clusterCount} 个事件` +
          `（近 ${sector.recentClusters} / 远 ${sector.priorClusters}）· 动量 ${momentum}`,
      );
      out.push(``);
      out.push(verdictSentence(sector));
      out.push(``);

      const clusters = [...(clustersByTopic.get(sector.topic) || [])].sort(
        (a, b) => b.weight - a.weight || cmpStr(a.clusterId, b.clusterId),
      );
      const shown = bullets(
        clusters.slice(0, topN).map((cluster) => {
          // ANY signal of the cluster, not just the first: if the first is
          // outside the window product a sibling can still supply the title.
          const signal = (cluster.signalIds || [])
            .map((id) => signalById.get(id))
            .find(Boolean);
          return {
            title: signal?.title,
            sourceId: signal?.source_id,
            // Always the cluster's own primaryUrl: present on every cluster
            // (measured 170/170), so a link can never be missing.
            url: cluster.primaryUrl,
          };
        }),
      );
      out.push(...shown);
      if (clusters.length > shown.length) out.push(`- 还有 ${clusters.length - shown.length} 条`);
      out.push(``);
    }
  }

  out.push(`## 健康指标`);
  out.push(``);
  out.push(healthLine(radar));
  out.push(``);
  out.push(`---`);
  out.push(``);
  out.push(footer(input, now));
  out.push(``);

  return out.join("\n");
}

// -- Entry point ---------------------------------------------------------------

export function renderDigest(input, { mode, now = Date.now(), topN = DEFAULT_TOP_N } = {}) {
  if (mode !== "daily" && mode !== "weekly") {
    throw new Error(`mode must be "daily" or "weekly", got ${JSON.stringify(mode)}`);
  }
  assertInput(input, mode);
  return mode === "daily"
    ? renderDaily(input, now, topN)
    : renderWeekly(input, now, topN);
}
