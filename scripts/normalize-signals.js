#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Signal Normalizer (Phase 2B)
// ============================================================================
// Turns the six fetch paths into one `signals[]` stream:
//
//   legacy (generate-feed.js):  feed-x.json (nested)  feed-podcasts.json  feed-blogs.json
//   channels (fetch-channels.js): feed-rss.json  feed-github.json  feed-api.json
//
// The two paths have different shapes (plan §1.1); this is the single place
// that knows about both, so nothing downstream has to.
//
// Usage: node normalize-signals.js [--only x,blog] [--feeds-dir DIR]
//                                  [--state FILE] [--no-dedup] [--print]
// Output: signals.json (+ the dedup state)
//
// `--feeds-dir` reads the feed-*.json inputs from DIR instead of the repo root.
// The x and podcast channels have no API key, so they can only ever be
// normalised from fixtures (plan §7.2) — this is how the gate does that.
//
// plan: .claude/plans/phase-2-signal-feed.plan.md  §3.2 (B3)
// ============================================================================

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  signalId,
  normalizePublishedAt,
  TYPE_BY_CHANNEL,
  DEDUP_TTL_DAYS,
  assertTtlCoversLookback,
} from "./lib/signal.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const REGISTRY_PATH = join(REPO_ROOT, "config", "default-sources.json");
const STATE_PATH = join(REPO_ROOT, "state-signals.json");

// -- Input map ---------------------------------------------------------------

// The three legacy feeds carry the channel in the file, and x is the only one
// whose entries nest their items (§3.2 N1).
const LEGACY_FEEDS = {
  x: { file: "feed-x.json", list: "x", nested: "tweets" },
  podcast: { file: "feed-podcasts.json", list: "podcasts" },
  blog: { file: "feed-blogs.json", list: "blogs" },
};

// The Phase 2A feeds already carry the uniform item shape, so they need no
// per-channel adapter beyond the list key.
const CHANNEL_FEEDS = {
  rss: { file: "feed-rss.json", list: "items" },
  github: { file: "feed-github.json", list: "items" },
  api: { file: "feed-api.json", list: "items" },
};

// x / podcast / blog stay first so a stored `signals.json` diff reads in the
// order the pipeline was built. Ordering has no semantic meaning.
const CHANNEL_ORDER = ["x", "podcast", "blog", "rss", "github", "api"];

// -- Registry ------------------------------------------------------------------

async function loadRegistry() {
  const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf-8"));
  if (registry?.schemaVersion !== 2) {
    throw new Error(
      `Source registry: unsupported schemaVersion ${registry?.schemaVersion} (expected 2)`,
    );
  }
  const byId = new Map();
  for (const entry of registry.sources || []) byId.set(entry.id, entry);
  return byId;
}

// -- Adapters: feed entry -> raw signal fields --------------------------------

// x is the only nested shape: one entry per builder holding their tweets. The
// parent fields (name / handle / bio) are dropped — `source_id` is what ties a
// tweet back to its account now (§3.2 N1).
function adaptX(entry) {
  return (entry.tweets || []).map((t) => ({
    source_id: entry.source_id,
    native_id: t.id,
    title: null,
    url: t.url,
    original_url: t.url,
    published_at: t.createdAt,
    text: t.text,
  }));
}

// podcast / blog entries arrive already flat; only the field names differ from
// the signal contract.
function adaptPodcast(entry) {
  return [
    {
      source_id: entry.source_id,
      native_id: entry.guid,
      title: entry.title ?? null,
      url: entry.url,
      original_url: entry.url,
      published_at: entry.publishedAt,
      text: entry.transcript,
    },
  ];
}

function adaptBlog(entry) {
  return [
    {
      source_id: entry.source_id,
      native_id: entry.url,
      title: entry.title ?? null,
      url: entry.url,
      original_url: entry.url,
      published_at: entry.publishedAt,
      text: entry.content,
    },
  ];
}

// rss / github / api already emit the B-path shape (§2.2), so this only fills
// the gaps a given item may have left.
function adaptChannel(entry) {
  return [
    {
      source_id: entry.source_id,
      native_id: entry.native_id,
      title: entry.title ?? null,
      url: entry.url,
      original_url: entry.original_url,
      published_at: entry.published_at,
      text: entry.text,
    },
  ];
}

const ADAPTERS = {
  x: adaptX,
  podcast: adaptPodcast,
  blog: adaptBlog,
  rss: adaptChannel,
  github: adaptChannel,
  api: adaptChannel,
};

// -- Reading feeds --------------------------------------------------------------

async function readFeed(channel, feedsDir) {
  const spec = LEGACY_FEEDS[channel] || CHANNEL_FEEDS[channel];
  const path = join(feedsDir, spec.file);
  if (!existsSync(path)) return null;
  const feed = JSON.parse(await readFile(path, "utf-8"));
  return { feed, entries: feed[spec.list] || [] };
}

// -- Normalize -----------------------------------------------------------------

function normalizeEntry(channel, entry, feed, warnings, errors, registry) {
  const { source_id: sourceId, native_id: nativeId } = entry;

  // §3.2 N2 — the registry entry is the authority on channel and role, not the
  // feed the item arrived in.
  const source = sourceId ? registry.get(sourceId) : undefined;

  if (!source) {
    errors.push(
      `source_id "${sourceId ?? "(missing)"}" does not resolve in the registry ` +
        `(channel ${channel}, native_id ${nativeId ?? "(missing)"})`,
    );
    return null;
  }
  if (source.channel !== channel) {
    errors.push(
      `source_id "${sourceId}" is registered on channel "${source.channel}" ` +
        `but arrived on "${channel}"`,
    );
    return null;
  }

  const type = TYPE_BY_CHANNEL[channel];
  if (!type) {
    errors.push(`channel "${channel}" has no signal type mapping (plan §3.2 N6)`);
    return null;
  }

  if (!nativeId) {
    errors.push(`source_id "${sourceId}" produced an item with no native_id`);
    return null;
  }

  // §3.5 — a signal without a clickable original link is not traceable, so it
  // does not enter the feed at all.
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  if (url === "") {
    errors.push(
      `source_id "${sourceId}" item "${nativeId}" has no usable url — dropped (§3.5)`,
    );
    return null;
  }

  // §3.1/§3.5 — `original_url` is the first-hand source of *this* item. For a
  // first-hand source that is the item's own url. For an aggregator it is the
  // page it points at, and only when that page is a different one: a self-link
  // means the aggregator never resolved a first-hand source.
  //
  // `is_secondary` is not an independent flag — it is exactly "no first-hand
  // source", so the two can never contradict each other.
  let originalUrl;
  if (source.role === "aggregator") {
    const candidate =
      typeof entry.original_url === "string" ? entry.original_url.trim() : "";
    originalUrl = candidate !== "" && candidate !== url ? candidate : null;
  } else {
    originalUrl = url;
  }
  const isSecondary = originalUrl === null;

  // §3.3 — the item survives an unparseable date, but the reason is recorded so
  // the failure is visible instead of silently becoming a null.
  const published = normalizePublishedAt(entry.published_at);
  if (published.reason) {
    warnings.push({
      source_id: sourceId,
      native_id: nativeId,
      field: "published_at",
      reason: published.reason,
    });
  }

  return {
    // §3.1 — deterministic, carries no semantics.
    id: signalId(sourceId, nativeId),
    source_id: sourceId,
    native_id: nativeId,
    channel,
    type,
    title: entry.title ?? null,
    url,
    original_url: originalUrl,
    is_secondary: isSecondary,
    published_at: published.value,
    // Always present, and independent of published_at (§3.1): it answers
    // "why is this showing up now?" when published_at cannot.
    collected_at: feed.generatedAt ?? new Date().toISOString(),
    text: entry.text ?? null,
  };
}

// -- Dedup state ---------------------------------------------------------------

// §3.4 — the dedup key is the signal `id`, i.e. "which source's which item".
// A content hash would re-send on a title edit and collide across sources.
async function loadState(statePath) {
  if (!existsSync(statePath)) return { version: 1, seen: {} };
  try {
    const state = JSON.parse(await readFile(statePath, "utf-8"));
    if (!state.seen) state.seen = {};
    return state;
  } catch {
    return { version: 1, seen: {} };
  }
}

// Drops signals already seen inside the TTL, records the rest, and prunes
// entries that have aged out. Pruning is what keeps the state from growing
// without bound; the TTL must outlive every lookback window or a pruned entry
// is re-sent, which is the podcast bug (§1.4).
function dedup(signals, state) {
  const ttlMs = DEDUP_TTL_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const fresh = [];

  for (const signal of signals) {
    const seenAt = state.seen[signal.id];
    if (seenAt !== undefined && now - seenAt < ttlMs) continue;
    state.seen[signal.id] = now;
    fresh.push(signal);
  }

  for (const [id, seenAt] of Object.entries(state.seen)) {
    if (now - seenAt >= ttlMs) delete state.seen[id];
  }

  return { fresh, dropped: signals.length - fresh.length };
}

// -- Main ----------------------------------------------------------------------

async function main() {
  // Fail fast before any write: a TTL shorter than a lookback window silently
  // re-sends content that never left the window (§3.4).
  assertTtlCoversLookback();

  const args = process.argv.slice(2);
  const argValue = (name) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
  };
  const onlyArg = argValue("--only");
  const only = onlyArg ? new Set(onlyArg.split(",")) : null;
  const feedsDirArg = argValue("--feeds-dir");
  const feedsDir = feedsDirArg ? resolve(REPO_ROOT, feedsDirArg) : REPO_ROOT;
  const stateArg = argValue("--state");
  const statePath = stateArg ? resolve(REPO_ROOT, stateArg) : STATE_PATH;
  const noDedup = args.includes("--no-dedup");

  const registry = await loadRegistry();

  const signals = [];
  const warnings = [];
  const errors = [];
  const perChannel = {};

  for (const channel of CHANNEL_ORDER) {
    if (only && !only.has(channel)) continue;
    const loaded = await readFeed(channel, feedsDir);
    if (!loaded) {
      perChannel[channel] = { entries: 0, signals: 0, missing: true };
      continue;
    }
    const adapt = ADAPTERS[channel];
    let count = 0;
    for (const entry of loaded.entries) {
      for (const raw of adapt(entry)) {
        const signal = normalizeEntry(
          channel,
          raw,
          loaded.feed,
          warnings,
          errors,
          registry,
        );
        if (signal) {
          signals.push(signal);
          count += 1;
        }
      }
    }
    perChannel[channel] = { entries: loaded.entries.length, signals: count };
  }

  // Dedup runs last: only signals that survived traceability and time
  // normalisation are worth recording as seen.
  let emitted = signals;
  let duplicates = 0;
  if (!noDedup) {
    const state = await loadState(statePath);
    const result = dedup(signals, state);
    emitted = result.fresh;
    duplicates = result.dropped;
    await writeFile(statePath, JSON.stringify(state, null, 2));
  }

  const out = {
    generatedAt: new Date().toISOString(),
    count: emitted.length,
    duplicates,
    perChannel,
    signals: emitted,
    normalization_warnings: warnings.length > 0 ? warnings : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };

  await writeFile(join(REPO_ROOT, "signals.json"), JSON.stringify(out, null, 2));

  console.error(`signals.json: ${emitted.length} signal(s)`);
  for (const [channel, s] of Object.entries(perChannel)) {
    console.error(
      s.missing
        ? `  ${channel}: no feed file`
        : `  ${channel}: ${s.entries} entr(ies) -> ${s.signals} signal(s)`,
    );
  }
  if (duplicates > 0) console.error(`  ${duplicates} duplicate(s) suppressed`);
  if (errors.length > 0) console.error(`  ${errors.length} error(s)`);
  if (args.includes("--print")) console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error("Signal normalization failed:", err.message);
  process.exit(1);
});
