#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Channel Fetchers (Phase 2A)
// ============================================================================
// Fetches the channels that have no fetcher yet, producing a UNIFORM item
// shape so the signal pipeline (2B) has only one input shape to understand.
//
// Batch 1 channels: rss, github, api, web.
// Currently implemented: rss.
//
// Deliberately does NOT deduplicate — dedup is 2B's job, keyed on the signal
// id. This script only applies a lookback window.
//
// Usage: node fetch-channels.js [--channel rss|github|api|web]
// Output: feed-<channel>.json
// ============================================================================

import { readFile, writeFile } from "fs/promises";
import { join } from "path";

// -- Constants ---------------------------------------------------------------

const SCRIPT_DIR = decodeURIComponent(new URL(".", import.meta.url).pathname);
const REGISTRY_PATH = join(SCRIPT_DIR, "..", "config", "default-sources.json");

// RSS sources publish at very different rates (some post a few times a year).
// A short window would leave low-frequency sources permanently silent, so this
// is deliberately wider than the blog channel's 72h.
const RSS_LOOKBACK_HOURS = 168; // 7 days

const GITHUB_LOOKBACK_HOURS = 168; // 7 days
// Caps how many releases one repo can emit per run. Needed because some repos
// publish per sub-package (langchain) or ship frequent patches (claude-code).
const MAX_RELEASES_PER_REPO = 5;
// Second line of defence for projects that ship nightlies WITHOUT setting the
// GitHub `prerelease` flag.
const PRERELEASE_TAG_RE = /(nightly|preview|snapshot)/i;

// Several feed hosts reject non-browser user agents.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 20000;

// -- Registry ----------------------------------------------------------------

async function loadRegistry() {
  const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf-8"));
  if (registry?.schemaVersion !== 2) {
    throw new Error(
      `Source registry: unsupported schemaVersion ${registry?.schemaVersion} (expected 2)`,
    );
  }
  return registry.sources || [];
}

// -- Feed parsing ------------------------------------------------------------
// Handles RSS 2.0 (<item>) and Atom (<entry>). Regex-based, matching the style
// of the existing fetchers in generate-feed.js.

function firstMatch(block, patterns) {
  for (const re of patterns) {
    const m = block.match(re);
    if (m) return m[1];
  }
  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

function stripHtml(s) {
  return decodeEntities(
    s
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseFeed(xml) {
  const items = [];
  let m;

  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  while ((m = itemRe.exec(xml)) !== null) {
    const b = m[1];
    const link = firstMatch(b, [
      /<link>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/link>/i,
      /<link>([\s\S]*?)<\/link>/i,
    ]);
    const guid = firstMatch(b, [
      /<guid[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/guid>/i,
      /<guid[^>]*>([\s\S]*?)<\/guid>/i,
    ]);
    items.push({
      title: firstMatch(b, [
        /<title>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/title>/i,
        /<title>([\s\S]*?)<\/title>/i,
      ]),
      link,
      nativeId: guid || link,
      publishedRaw:
        firstMatch(b, [/<pubDate>([\s\S]*?)<\/pubDate>/i]) ||
        firstMatch(b, [/<dc:date>([\s\S]*?)<\/dc:date>/i]),
      body: firstMatch(b, [
        /<content:encoded>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content:encoded>/i,
        /<content:encoded>([\s\S]*?)<\/content:encoded>/i,
        /<description>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/i,
        /<description>([\s\S]*?)<\/description>/i,
      ]),
    });
  }
  if (items.length > 0) return items;

  const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
  while ((m = entryRe.exec(xml)) !== null) {
    const b = m[1];
    const link =
      firstMatch(b, [/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i]) ||
      firstMatch(b, [/<link[^>]*href=["']([^"']+)["']/i]);
    const id = firstMatch(b, [/<id>([\s\S]*?)<\/id>/i]);
    items.push({
      title: firstMatch(b, [/<title[^>]*>([\s\S]*?)<\/title>/i]),
      link,
      nativeId: id || link,
      publishedRaw:
        firstMatch(b, [/<published>([\s\S]*?)<\/published>/i]) ||
        firstMatch(b, [/<updated>([\s\S]*?)<\/updated>/i]),
      body: firstMatch(b, [
        /<content[^>]*>([\s\S]*?)<\/content>/i,
        /<summary[^>]*>([\s\S]*?)<\/summary>/i,
      ]),
    });
  }
  return items;
}

// -- RSS channel -------------------------------------------------------------

// Emits the uniform item shape
//   { source_id, native_id, title, url, original_url, published_at, text }
//
// `published_at` is the RAW source value — normalising it to ISO 8601 is 2B's
// job, and keeping it raw here means an unparseable date stays visible instead
// of being silently rewritten.
//
// `original_url` equals `url` for RSS sources: every rss entry in the registry
// is a first-hand publisher, so the item link IS the original.
async function fetchRssChannel(sources, errors) {
  const cutoff = new Date(Date.now() - RSS_LOOKBACK_HOURS * 60 * 60 * 1000);
  const items = [];

  for (const source of sources) {
    const { id, name, rssUrl } = source;
    if (!rssUrl) {
      errors.push(`${id}: missing rssUrl`);
      continue;
    }

    let xml;
    try {
      const res = await fetch(rssUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        errors.push(`${id}: HTTP ${res.status} (${name})`);
        continue;
      }
      xml = await res.text();
    } catch (err) {
      // undici's TypeError("fetch failed") hides the real cause, which makes a
      // timeout indistinguishable from a DNS or TLS failure. Surface it.
      const cause = err?.cause?.code || err?.cause?.message || "";
      errors.push(
        `${id}: fetch failed — ${err.message}${cause ? ` (${cause})` : ""} (${name})`,
      );
      continue;
    }

    const parsed = parseFeed(xml);
    if (parsed.length === 0) {
      errors.push(`${id}: feed parsed to 0 items (${name})`);
      continue;
    }

    let kept = 0;
    for (const p of parsed) {
      // Untraceable items are dropped: without a native id and a link there is
      // nothing to dedup on and nothing to point at.
      if (!p.nativeId || !p.link) continue;
      if (p.publishedRaw) {
        const t = new Date(p.publishedRaw);
        if (!Number.isNaN(t.getTime()) && t < cutoff) continue;
      }
      items.push({
        source_id: id,
        native_id: p.nativeId,
        title: p.title ? stripHtml(p.title) : null,
        url: p.link,
        original_url: p.link,
        published_at: p.publishedRaw || null,
        text: p.body ? stripHtml(p.body) : null,
      });
      kept += 1;
    }

    console.error(
      `  ${id}: ${parsed.length} parsed, ${kept} within ${RSS_LOOKBACK_HOURS}h`,
    );
  }

  return items;
}

// -- GitHub channel ----------------------------------------------------------

// Emits the uniform item shape. Signal = RELEASE 发布 (commits and star counts
// are far too noisy to be a radar signal).
//
// Noise handling, all measured against the real repos:
//   - `prerelease` / `draft` flags are excluded. This is what keeps
//     google-gemini/gemini-cli usable at all: 45 of its last 50 releases are
//     nightly prereleases, and only the ~weekly stable ones survive.
//   - A tag-pattern guard covers projects that ship nightlies without setting
//     the prerelease flag.
//   - A per-repo cap bounds the feed. langchain-ai/langchain publishes per
//     sub-package (langchain, langchain-core, langchain-openai, …), so one repo
//     can otherwise emit many releases.
async function fetchGithubChannel(sources, errors) {
  const cutoff = new Date(Date.now() - GITHUB_LOOKBACK_HOURS * 60 * 60 * 1000);
  const items = [];

  for (const source of sources) {
    const { id, name, repo } = source;
    if (!repo) {
      errors.push(`${id}: missing repo`);
      continue;
    }

    let releases;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/releases?per_page=30`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": USER_AGENT,
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        // 404 = repo gone/renamed; 403 or 429 = unauthenticated rate limit
        // (60 req/h shared across the runner's IP).
        errors.push(`${id}: HTTP ${res.status} (${name} / ${repo})`);
        continue;
      }
      releases = await res.json();
    } catch (err) {
      const cause = err?.cause?.code || err?.cause?.message || "";
      errors.push(
        `${id}: fetch failed — ${err.message}${cause ? ` (${cause})` : ""} (${repo})`,
      );
      continue;
    }

    if (!Array.isArray(releases) || releases.length === 0) {
      errors.push(`${id}: repo has no releases (${repo})`);
      continue;
    }

    let kept = 0;
    let skippedPre = 0;
    for (const rel of releases) {
      if (rel.draft || rel.prerelease) {
        skippedPre += 1;
        continue;
      }
      if (PRERELEASE_TAG_RE.test(rel.tag_name || "")) {
        skippedPre += 1;
        continue;
      }
      if (rel.published_at) {
        const t = new Date(rel.published_at);
        if (!Number.isNaN(t.getTime()) && t < cutoff) continue;
      }
      if (!rel.tag_name || !rel.html_url) continue;
      if (kept >= MAX_RELEASES_PER_REPO) break;

      items.push({
        source_id: id,
        native_id: rel.tag_name,
        title: rel.name || rel.tag_name,
        url: rel.html_url,
        original_url: rel.html_url,
        published_at: rel.published_at || null,
        text: rel.body || null,
      });
      kept += 1;
    }

    console.error(
      `  ${id}: ${releases.length} releases, ${skippedPre} pre/draft skipped, ${kept} kept`,
    );
  }

  return items;
}

// -- Channel dispatch --------------------------------------------------------

const CHANNELS = {
  rss: { fetch: fetchRssChannel, lookbackHours: RSS_LOOKBACK_HOURS },
  github: { fetch: fetchGithubChannel, lookbackHours: GITHUB_LOOKBACK_HOURS },
  // api / web — batch 1, not implemented yet.
};

// -- Main --------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = args.indexOf("--channel");
  const requested =
    flag !== -1 && args[flag + 1] ? [args[flag + 1]] : Object.keys(CHANNELS);

  const all = await loadRegistry();

  for (const channel of requested) {
    const handler = CHANNELS[channel];
    if (!handler) {
      throw new Error(`channel "${channel}" is not implemented yet`);
    }

    // active-only: an inactive entry must never be fetched. This mirrors the
    // loader's guard in generate-feed.js.
    const sources = all.filter(
      (s) => s.channel === channel && s.active === true,
    );
    if (sources.length === 0) {
      console.error(`${channel}: no active sources`);
      continue;
    }

    console.error(
      `Fetching ${channel} (${sources.length} active source(s))...`,
    );
    const errors = [];
    const items = await handler.fetch(sources, errors);

    // Log each failure inline. The errors also land in the feed JSON, but that
    // file is no longer committed, so the CI log is the only place a failing
    // source is visible without downloading an artifact.
    for (const e of errors) console.error(`  ! ${e}`);

    const feed = {
      generatedAt: new Date().toISOString(),
      channel,
      lookbackHours: handler.lookbackHours,
      items,
      stats: { sources: sources.length, items: items.length },
      errors: errors.length > 0 ? errors : undefined,
    };
    await writeFile(
      join(SCRIPT_DIR, "..", `feed-${channel}.json`),
      JSON.stringify(feed, null, 2),
    );
    console.error(
      `  feed-${channel}.json: ${items.length} item(s), ${errors.length} error(s)`,
    );
  }
}

main().catch((err) => {
  console.error("Channel fetch failed:", err.message);
  process.exit(1);
});
