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
// Usage: node normalize-signals.js [--only x,blog] [--feeds-dir DIR] [--print]
// Output: signals.json
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
import { signalId, TYPE_BY_CHANNEL } from "./lib/signal.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const REGISTRY_PATH = join(REPO_ROOT, "config", "default-sources.json");

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

  return {
    // §3.1 — deterministic, carries no semantics.
    id: signalId(sourceId, nativeId),
    source_id: sourceId,
    native_id: nativeId,
    channel,
    type,
    title: entry.title ?? null,
    url: entry.url ?? null,
    original_url: entry.original_url ?? null,
    is_secondary: false,
    published_at: entry.published_at ?? null,
    // Always present, and independent of published_at (§3.1): it answers
    // "why is this showing up now?" when published_at cannot.
    collected_at: feed.generatedAt ?? new Date().toISOString(),
    text: entry.text ?? null,
  };
}

// -- Main ----------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const argValue = (name) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : null;
  };
  const onlyArg = argValue("--only");
  const only = onlyArg ? new Set(onlyArg.split(",")) : null;
  const feedsDirArg = argValue("--feeds-dir");
  const feedsDir = feedsDirArg ? resolve(REPO_ROOT, feedsDirArg) : REPO_ROOT;

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

  const out = {
    generatedAt: new Date().toISOString(),
    count: signals.length,
    perChannel,
    signals,
    normalization_warnings: warnings.length > 0 ? warnings : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };

  await writeFile(join(REPO_ROOT, "signals.json"), JSON.stringify(out, null, 2));

  console.error(`signals.json: ${signals.length} signal(s)`);
  for (const [channel, s] of Object.entries(perChannel)) {
    console.error(
      s.missing
        ? `  ${channel}: no feed file`
        : `  ${channel}: ${s.entries} entr(ies) -> ${s.signals} signal(s)`,
    );
  }
  if (errors.length > 0) console.error(`  ${errors.length} error(s)`);
  if (args.includes("--print")) console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error("Signal normalization failed:", err.message);
  process.exit(1);
});
