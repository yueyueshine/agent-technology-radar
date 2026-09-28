#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Phase 2B gate
// ============================================================================
// The project has no test suite (2A runbook §2), so this is the executable
// definition of "2B works": one process, no framework, red/green per check.
//
// Every check drives `normalize-signals.js` as a child process against a
// fixture, because the thing being verified is the pipeline's behaviour, not a
// function's return value. The one exception is TTL fail-fast, which needs a
// deliberately broken constant and therefore runs a patched copy of the tree.
//
// Usage: node gate-2b.js
// Exit: 0 all green, 1 any red
//
// plan: .claude/plans/phase-2-signal-feed.plan.md §7.1 / §8
// ============================================================================

import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const SIGNALS_PATH = join(REPO_ROOT, "signals.json");

const results = [];
let tmpRoot;

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

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// -- Fixtures ------------------------------------------------------------------

function writeFeed(dir, channel, payload) {
  writeFileSync(join(dir, `feed-${channel}.json`), JSON.stringify(payload));
}

// Runs the normalizer and returns the parsed product.
//
// Every call gets its own state file, because the normalizer's default is the
// repo's real `state-signals.json`: without this the checks would write fixture
// ids into committed state, and a check's own output would depend on whether an
// earlier check had already seen the same fixture. Callers that want two runs to
// share state (G4, G5) pass `state` explicitly; everyone else gets a fresh file,
// so each check is order-independent.
let stateSeq = 0;
function normalize({ feedsDir, state, only }) {
  const args = [join(SCRIPT_DIR, "normalize-signals.js"), "--feeds-dir", feedsDir];
  args.push("--state", state ?? join(tmpRoot, `state-auto-${stateSeq++}.json`));
  if (only) args.push("--only", only);
  execFileSync(process.execPath, args, { stdio: ["ignore", "ignore", "pipe"] });
  return JSON.parse(readFileSync(SIGNALS_PATH, "utf-8"));
}

function feedDir(name) {
  const dir = join(tmpRoot, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function buildFixtures() {
  // x: nested, two builders, 3 tweets total — exercises §3.2 N1 flattening.
  const xDir = feedDir("x");
  writeFeed(xDir, "x", {
    generatedAt: "2026-09-28T10:00:00.000Z",
    x: [
      {
        source: "x",
        source_id: "x:karpathy",
        name: "Andrej Karpathy",
        handle: "karpathy",
        bio: "b",
        tweets: [
          {
            id: "1001",
            text: "t1",
            createdAt: "2026-09-28T01:00:00.000Z",
            url: "https://x.com/karpathy/status/1001",
          },
          {
            id: "1002",
            text: "t2",
            createdAt: "2026-09-28T02:00:00.000Z",
            url: "https://x.com/karpathy/status/1002",
          },
        ],
      },
      {
        source: "x",
        source_id: "x:swyx",
        name: "swyx",
        handle: "swyx",
        bio: "b",
        tweets: [
          {
            id: "2001",
            text: "t3",
            createdAt: "2026-09-28T03:00:00.000Z",
            url: "https://x.com/swyx/status/2001",
          },
        ],
      },
    ],
  });

  // blog: the four time shapes §3.3 has to survive, plus traceability failures
  // (no url, blank url, unregistered source) that must be dropped, not emitted.
  const blogDir = feedDir("blog");
  writeFeed(blogDir, "blogs", {
    generatedAt: "2026-09-28T10:00:00.000Z",
    blogs: [
      {
        source_id: "blog:claude-blog",
        title: "source format",
        url: "https://claude.com/blog/a",
        publishedAt: "Aug 26, 2026",
        content: "c",
      },
      {
        source_id: "blog:claude-blog",
        title: "iso",
        url: "https://claude.com/blog/b",
        publishedAt: "2026-09-25T21:50:12Z",
        content: "c",
      },
      {
        source_id: "blog:claude-blog",
        title: "unparseable",
        url: "https://claude.com/blog/c",
        publishedAt: "not a date at all",
        content: "c",
      },
      {
        source_id: "blog:claude-blog",
        title: "missing",
        url: "https://claude.com/blog/d",
        publishedAt: null,
        content: "c",
      },
      {
        source_id: "blog:claude-blog",
        title: "no url",
        url: null,
        publishedAt: "2026-09-25T21:50:12Z",
        content: "c",
      },
      {
        source_id: "blog:claude-blog",
        title: "blank url",
        url: "   ",
        publishedAt: "2026-09-25T21:50:12Z",
        content: "c",
      },
      {
        source_id: "blog:not-registered",
        title: "unknown source",
        url: "https://claude.com/blog/e",
        publishedAt: "2026-09-25T21:50:12Z",
        content: "c",
      },
    ],
  });

  // api: aggregator, all three §3.5 outcomes.
  const apiDir = feedDir("api");
  writeFeed(apiDir, "api", {
    generatedAt: "2026-09-28T10:00:00.000Z",
    items: [
      {
        source_id: "api:aihot",
        native_id: "agg-resolved",
        title: "t",
        url: "https://aihot.news/items/1",
        original_url: "https://x.com/a/status/1",
        published_at: "2026-09-25T21:50:12Z",
        text: "x",
      },
      {
        source_id: "api:aihot",
        native_id: "agg-unresolved",
        title: "t",
        url: "https://aihot.news/items/2",
        original_url: null,
        published_at: "2026-09-25T21:50:12Z",
        text: "x",
      },
      {
        source_id: "api:aihot",
        native_id: "agg-selflink",
        title: "t",
        url: "https://aihot.news/items/3",
        original_url: "https://aihot.news/items/3",
        published_at: "2026-09-25T21:50:12Z",
        text: "x",
      },
    ],
  });

  return { xDir, blogDir, apiDir };
}

// -- Checks --------------------------------------------------------------------

function main() {
  tmpRoot = mkdtempSync(join(tmpdir(), "gate-2b-"));
  const { xDir, blogDir, apiDir } = buildFixtures();
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  // G1 — §3.2 N1/N3: x flattens to one signal per tweet; ids are deterministic.
  check("G1 x 拍平：条数 = sum(tweets)，id 为 32 位 hex", () => {
    const out = normalize({ feedsDir: xDir, only: "x" });
    assert(out.count === 3, `expected 3 signals, got ${out.count}`);
    assert(
      out.signals.every((s) => /^[0-9a-f]{32}$/.test(s.id)),
      "an id is not 32 hex chars",
    );
    assert(
      out.signals.every((s) => s.channel === "x" && s.type === "tweet"),
      "channel/type not injected",
    );
    assert(
      out.signals.every((s) => !("tweets" in s) && !("handle" in s)),
      "parent fields leaked onto the flattened signal",
    );
  });

  // G1b — §3.1: same input, same id.
  check("G1b id 确定性：同输入两次跑得到同一 id", () => {
    const a = normalize({ feedsDir: xDir, only: "x" });
    const b = normalize({ feedsDir: xDir, only: "x" });
    assert(
      JSON.stringify(a.signals.map((s) => s.id)) ===
        JSON.stringify(b.signals.map((s) => s.id)),
      "ids differ across runs",
    );
  });

  // G2 — §3.3: every published_at is ISO 8601 or null; the rest is warned.
  check("G2 时间归一：只剩 ISO 或 null，且不可解析不静默", () => {
    const out = normalize({ feedsDir: blogDir, only: "blog" });
    assert(
      out.signals.every(
        (s) => s.published_at === null || ISO.test(s.published_at),
      ),
      "a signal kept a non-ISO published_at",
    );
    const byUrl = Object.fromEntries(out.signals.map((s) => [s.url, s]));
    assert(
      byUrl["https://claude.com/blog/a"].published_at ===
        "2026-08-26T00:00:00.000Z",
      "source-format date was not converted",
    );
    assert(
      byUrl["https://claude.com/blog/c"].published_at === null,
      "unparseable date was not nulled",
    );
    const warned = new Set(
      (out.normalization_warnings || []).map((w) => w.native_id),
    );
    assert(
      warned.has("https://claude.com/blog/c") &&
        warned.has("https://claude.com/blog/d"),
      "unparseable/missing date produced no warning",
    );
    assert(
      out.signals.every((s) => typeof s.collected_at === "string" && s.collected_at),
      "collected_at missing",
    );
  });

  // G3 — §3.5: url is mandatory; original_url / is_secondary cannot disagree.
  check("G3 可追溯性：缺 url 剔除；aggregator 二者必居其一", () => {
    const out = normalize({ feedsDir: blogDir, only: "blog" });
    assert(
      out.signals.every((s) => typeof s.url === "string" && s.url.trim() !== ""),
      "a signal without a usable url was emitted",
    );
    assert(
      out.signals.every((s) => (s.original_url === null) === s.is_secondary),
      "is_secondary and original_url disagree",
    );
    const errs = (out.errors || []).join("\n");
    assert(
      /no usable url/.test(errs) && /does not resolve/.test(errs),
      `expected drop errors, got: ${errs || "(none)"}`,
    );

    const agg = normalize({ feedsDir: apiDir, only: "api" });
    const byId = Object.fromEntries(agg.signals.map((s) => [s.native_id, s]));
    assert(
      byId["agg-resolved"].original_url === "https://x.com/a/status/1" &&
        byId["agg-resolved"].is_secondary === false,
      "resolved aggregator item is wrong",
    );
    assert(
      byId["agg-unresolved"].original_url === null &&
        byId["agg-unresolved"].is_secondary === true,
      "unresolved aggregator item is wrong",
    );
    assert(
      byId["agg-selflink"].original_url === null &&
        byId["agg-selflink"].is_secondary === true,
      "aggregator self-link should count as unresolved",
    );
  });

  // G4 — §3.4: the dedup key is the signal id, so a second run is empty.
  check("G4 幂等：同一输入跑两次，第二次 0 产出", () => {
    const state = join(tmpRoot, "state-g4.json");
    const first = normalize({ feedsDir: xDir, only: "x", state });
    assert(first.count === 3, `first run emitted ${first.count}, expected 3`);
    const second = normalize({ feedsDir: xDir, only: "x", state });
    assert(
      second.count === 0 && second.duplicates === 3,
      `second run emitted ${second.count} (duplicates=${second.duplicates})`,
    );
  });

  // G5 — §1.4 / §3.4: the 30-day TTL must cover the widest lookback (336h = 14
  // days), so an entry seen 8 days ago stays suppressed — that is the podcast
  // bug. Pruning must still happen, so an entry seen past the TTL comes back;
  // otherwise "still suppressed" would also pass with a TTL of forever.
  check("G5 播客 bug：8 天前见过的条目不再重发，TTL 之外的条目会回来", () => {
    const state = join(tmpRoot, "state-g5.json");
    const fresh = normalize({ feedsDir: xDir, only: "x", state });
    const [victim, stale] = fresh.signals;
    const days = (n) => Date.now() - n * 24 * 3600 * 1000;
    writeFileSync(
      state,
      JSON.stringify({
        version: 1,
        seen: { [victim.id]: days(8), [stale.id]: days(31) },
      }),
    );

    const out = normalize({ feedsDir: xDir, only: "x", state });
    assert(
      !out.signals.some((s) => s.id === victim.id),
      "an entry seen 8 days ago was re-emitted (the podcast bug)",
    );
    assert(
      out.signals.some((s) => s.id === stale.id),
      "an entry seen 31 days ago was not pruned — the state never shrinks",
    );
    assert(
      out.duplicates === 1,
      `expected 1 duplicate, got ${out.duplicates} (count=${out.count})`,
    );
  });

  // G6 — §3.4: TTL < max lookback must abort the run, not warn.
  check("G6 fail-fast：TTL 7 天 < lookback 336h 时进程退出", () => {
    const broken = join(tmpRoot, "broken");
    mkdirSync(broken, { recursive: true });
    cpSync(join(REPO_ROOT, "config"), join(broken, "config"), {
      recursive: true,
    });
    cpSync(SCRIPT_DIR, join(broken, "scripts"), {
      recursive: true,
      filter: (src) => !src.includes("node_modules"),
    });
    const libPath = join(broken, "scripts", "lib", "signal.js");
    const patched = readFileSync(libPath, "utf-8").replace(
      /export const DEDUP_TTL_DAYS = \d+;/,
      "export const DEDUP_TTL_DAYS = 7;",
    );
    assert(/DEDUP_TTL_DAYS = 7;/.test(patched), "could not patch the TTL constant");
    writeFileSync(libPath, patched);

    let failed = false;
    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [
          join(broken, "scripts", "normalize-signals.js"),
          "--feeds-dir",
          xDir,
          "--state",
          join(tmpRoot, "state-g6.json"),
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    } catch (err) {
      failed = true;
      stderr = String(err.stderr);
    }
    assert(failed, "TTL 7d did not abort the run");
    assert(
      /Dedup TTL 7d \(168h\) < max lookback 336h/.test(stderr),
      `unexpected failure message: ${stderr.trim() || "(empty)"}`,
    );
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
