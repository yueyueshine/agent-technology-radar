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

// -- published_at -------------------------------------------------------------

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
  const t = Date.parse(raw);
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
export function assertTtlCoversLookback() {
  const ttlHours = DEDUP_TTL_DAYS * 24;
  if (ttlHours < MAX_LOOKBACK_HOURS) {
    throw new Error(
      `Dedup TTL ${DEDUP_TTL_DAYS}d (${ttlHours}h) < max lookback ` +
        `${MAX_LOOKBACK_HOURS}h — items still inside a lookback window would be ` +
        `re-sent. Raise DEDUP_TTL_DAYS.`,
    );
  }
}
