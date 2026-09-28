#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — one-off dedup state migration (Phase 2B, block B6)
// ============================================================================
// The legacy dedup state (`state-feed.json`) is keyed by *native id*: tweet id,
// episode guid, article URL. The signal pipeline (§3.4) dedups on the signal
// `id` — `sha256(source_id + "\n" + native_id)[:32]` — which is a different key
// space. Board decision D2 was to migrate rather than reset, so that content
// already inside a lookback window is not sent a second time.
//
// Usage: node migrate-state.js [--in state-feed.json] [--out state-signals.json]
//
// ---------------------------------------------------------------------------
// What this can and cannot recover
// ---------------------------------------------------------------------------
// Computing a signal id needs BOTH halves — source_id *and* native_id — but the
// legacy tables store only the native id:
//
//   seenArticles  URLs      -> recoverable: registry blog entries carry
//                              `articleBaseUrl`, so the owning source is a
//                              prefix match on the URL.
//   seenTweets    tweet ids -> NOT recoverable offline. Nothing in the state
//                              file says which account a tweet id belongs to.
//   seenVideos    guids     -> NOT recoverable offline, same reason.
//
// Those two are reported, not dropped silently. The practical impact is nil
// today: `generate-feed.js` still dedups x / podcast / blog on the legacy
// tables before a signal is ever built (plan §10 forbids rewriting those
// fetchers in 2B), so signal-level state is a second line of defence for them,
// and the *only* line for rss / github / api — which had no legacy state to
// begin with. See the issue report for the measured impact.
// ============================================================================

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { signalId, DEDUP_TTL_DAYS } from "./lib/signal.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

const LEGACY_TABLES = {
  seenArticles: "blog article url",
  seenTweets: "tweet id",
  seenVideos: "episode guid",
};

// The only table whose owning source can be derived from the value alone.
const RECOVERABLE_TABLES = new Set(["seenArticles"]);

function parseArgs(args) {
  const value = (name, fallback) => {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
  };
  return {
    in: resolve(REPO_ROOT, value("--in", "state-feed.json")),
    out: resolve(REPO_ROOT, value("--out", "state-signals.json")),
  };
}

async function main() {
  const { in: inPath, out: outPath } = parseArgs(process.argv.slice(2));

  if (!existsSync(inPath)) {
    throw new Error(`no legacy state at ${inPath} — nothing to migrate`);
  }
  const legacy = JSON.parse(await readFile(inPath, "utf-8"));

  const registry = JSON.parse(
    await readFile(join(REPO_ROOT, "config", "default-sources.json"), "utf-8"),
  );
  const blogs = (registry.sources || []).filter(
    (s) => s.channel === "blog" && typeof s.articleBaseUrl === "string",
  );

  const seen = {};
  const report = { migrated: 0, unrecoverable: {}, unmatched: [] };

  for (const table of Object.keys(LEGACY_TABLES)) {
    if (RECOVERABLE_TABLES.has(table)) continue;
    const entries = Object.entries(legacy[table] || {});
    if (entries.length === 0) continue;
    report.unrecoverable[table] = {
      count: entries.length,
      reason: `${LEGACY_TABLES[table]} carries no source_id`,
    };
  }

  // Articles are the one table whose owning source is derivable.
  for (const [url, ts] of Object.entries(legacy.seenArticles || {})) {
    const owner = blogs.find((b) => url.startsWith(b.articleBaseUrl));
    if (!owner) {
      report.unmatched.push(url);
      continue;
    }
    seen[signalId(owner.id, url)] = ts;
    report.migrated += 1;
  }

  const out = {
    version: 1,
    migratedAt: new Date().toISOString(),
    migratedFrom: "state-feed.json",
    ttlDays: DEDUP_TTL_DAYS,
    seen,
  };
  await writeFile(outPath, JSON.stringify(out, null, 2));

  console.error(`migrated ${report.migrated} entr(ies) -> ${outPath}`);
  for (const [table, info] of Object.entries(report.unrecoverable)) {
    console.error(
      `  ! ${table}: ${info.count} entr(ies) NOT migrated — ${info.reason}`,
    );
  }
  if (report.unmatched.length > 0) {
    console.error(
      `  ! ${report.unmatched.length} article url(s) matched no source:`,
    );
    for (const url of report.unmatched) console.error(`      ${url}`);
  }
  console.error(
    `  note: x / podcast are still deduped inside generate-feed.js on the ` +
      `legacy tables, so this does not re-send them.`,
  );
}

main().catch((err) => {
  console.error("State migration failed:", err.message);
  process.exit(1);
});
