// ============================================================================
// Signal — the Phase 2B signal contract, in one place
// ============================================================================
// Phase 2B normalises six fetch paths into one `signals[]` stream: the three
// legacy feeds (x / podcast / blog, from generate-feed.js) plus the Phase 2A
// channels (rss / github / api, from fetch-channels.js).
//
// Everything the pipeline must agree on lives here so no rule is duplicated:
//   - the signal `id` hash (deterministic, carries no semantics)
//   - the channel -> type mapping
//   - every lookback window, and the dedup TTL that must outlive them all
//
// plan: .claude/plans/phase-2-signal-feed.plan.md  §3.1, §3.2, §3.4
// ============================================================================

import { createHash } from "node:crypto";

// -- Signal id ---------------------------------------------------------------

// Length is pinned by the plan (§3.1 / §8): the first 32 hex chars (128 bit).
// §9's open question ("16 or 32?") is closed by board decision — 32.
// Readability is carried by source_id / native_id, so the key is not shortened.
export const SIGNAL_ID_LENGTH = 32;

export function signalId(sourceId, nativeId) {
  return createHash("sha256")
    .update(`${sourceId}\n${nativeId}`)
    .digest("hex")
    .slice(0, SIGNAL_ID_LENGTH);
}

// -- text --------------------------------------------------------------------

// §3.1 requires an explicit retention policy for `text`, otherwise the product
// grows with the archive (plan §2.2.1 measured `feed-rss.json` at 768 KB for
// one run — roughly 280 MB/year of full article bodies).
//
// Board decision D3: truncate. 2000 characters is the size the downstream
// digest needs to judge a signal; the full body stays in the gitignored feed
// intermediates, where it is already available.
export const TEXT_MAX_CHARS = 2000;

export function truncateText(text, max = TEXT_MAX_CHARS) {
  if (typeof text !== "string") return null;
  return text.length <= max ? text : text.slice(0, max);
}

// -- published_at -------------------------------------------------------------

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "Aug 26, 2026" / "August 26, 2026" / "Aug 26 2026" — the day-based shapes the
// blog sources actually emit (§2.2.1 measured one).
//
// These carry no time and no zone, so `Date.parse` resolves them against the
// machine's local zone: the same feed normalises to 2026-08-25T16:00:00Z on a
// UTC+8 box and 2026-08-26T00:00:00Z on UTC. §3.3 requires a fixed ISO 8601 UTC
// contract, and agreement between a dev box and CI is the point of a contract,
// so the day-based forms are pinned to UTC midnight here rather than left to
// the ambient zone.
function parseDayMonthYear(raw) {
  const m = raw.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  return Date.UTC(Number(m[3]), month, Number(m[2]));
}

// §3.3 — `published_at` is ISO 8601 UTC or null, never a third thing. Sources
// disagree about format ("Aug 26, 2026", "2026-09-25T21:50:12Z", or nothing at
// all), so every value goes through here.
//
// The contract is "do not crash, do not stay silent": an unparseable or missing
// value yields `null` plus a reason the caller records as a warning, and the
// item still flows through the pipeline.
export function normalizePublishedAt(raw) {
  if (raw === null || raw === undefined || raw === "") {
    return { value: null, reason: "missing" };
  }
  if (typeof raw !== "string") {
    return { value: null, reason: `not a string (${typeof raw})` };
  }
  // A date-only ISO string ("2026-09-25") is already defined as UTC midnight,
  // so it needs no pinning; only the month-name forms are zone-sensitive.
  const pinned = parseDayMonthYear(raw.trim());
  const t = pinned !== null ? pinned : Date.parse(raw);
  if (Number.isNaN(t)) {
    return { value: null, reason: `unparseable: ${JSON.stringify(raw)}` };
  }
  return { value: new Date(t).toISOString() };
}

// -- type --------------------------------------------------------------------

// The full controlled enum (§3.1). New channels must map onto one of these
// rather than inventing a value — that is what makes `type` filterable.
export const SIGNAL_TYPES = new Set([
  "tweet",
  "podcast_episode",
  "blog_post",
  "release",
  "paper",
  "story",
  "page",
]);

// channel -> type (§3.2 N6). Channels absent here have no fetcher yet
// (hackernews / arxiv / huggingface / reddit are batch 2).
//
// §3.2 N6 omits `rss`, but rss is 18 active sources and cannot be left
// unmapped. Its entries are individual writers' articles, so they map to
// `blog_post`; `channel` is what separates them from the `blog` channel.
// Flagged to the board as a spec gap rather than silently decided.
export const TYPE_BY_CHANNEL = {
  x: "tweet",
  podcast: "podcast_episode",
  blog: "blog_post",
  rss: "blog_post",
  github: "release",
  api: "story",
};

// -- Lookback windows and the dedup TTL ---------------------------------------

// The single source of truth for every lookback window. Both scripts import
// these: the previous copies drifted apart, and that drift is exactly what
// produced the podcast re-send bug (plan §1.4).
export const LOOKBACK_HOURS = {
  x: 24,
  blog: 72,
  github: 168,
  api: 168,
  rss: 336,
  podcast: 336,
};

export const MAX_LOOKBACK_HOURS = Math.max(...Object.values(LOOKBACK_HOURS));

// Dedup state must outlive the widest lookback window. If it does not, an item
// still inside the window loses its "already seen" record and is sent again
// (§1.4: a 7-day TTL under a 14-day podcast window).
export const DEDUP_TTL_DAYS = 30;

// Fail-fast, checked at startup. Raising a lookback window without raising the
// TTL is a silent re-send bug; this turns it into a crash. Merely widening the
// TTL by hand would leave the trap for whoever next edits a lookback window.
//
// Parameterised so the gate can exercise the violating case without editing
// this file; production callers use the defaults.
export function assertTtlCoversLookback(
  ttlDays = DEDUP_TTL_DAYS,
  maxLookbackHours = MAX_LOOKBACK_HOURS,
) {
  const ttlHours = ttlDays * 24;
  if (ttlHours < maxLookbackHours) {
    throw new Error(
      `Dedup TTL ${ttlDays}d (${ttlHours}h) < max lookback ` +
        `${maxLookbackHours}h — items still inside a lookback window would be ` +
        `re-sent. Raise DEDUP_TTL_DAYS.`,
    );
  }
}
