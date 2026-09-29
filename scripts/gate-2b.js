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
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

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

// Runs the normalizer without asserting on its exit code, so a check can
// exercise a run that is supposed to fail. `scriptDir` points at a copied tree
// when a check needs to break something inside it; `tz` sets the child's
// timezone, which is the only way to prove a result does not depend on it.
function runNormalize({ feedsDir, state, only, tz, scriptDir = SCRIPT_DIR }) {
  const args = [join(scriptDir, "normalize-signals.js"), "--feeds-dir", feedsDir];
  args.push("--state", state ?? join(tmpRoot, `state-auto-${stateSeq++}.json`));
  if (only) args.push("--only", only);
  const env = tz ? { ...process.env, TZ: tz } : process.env;
  try {
    execFileSync(process.execPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env,
    });
    return { ok: true, stderr: "" };
  } catch (err) {
    return { ok: false, stderr: String(err.stderr) };
  }
}

function normalize(opts = {}) {
  const result = runNormalize(opts);
  if (!result.ok) {
    throw new Error(`normalize-signals failed: ${result.stderr.trim()}`);
  }
  const root = dirname(opts.scriptDir ?? SCRIPT_DIR);
  return JSON.parse(readFileSync(join(root, "signals.json"), "utf-8"));
}

// A throwaway copy of the tree, for checks that need to break something the
// normalizer touches — G6 patches a constant in it, G9 occupies the product path.
function copyTree(name) {
  const root = join(tmpRoot, name);
  mkdirSync(root, { recursive: true });
  cpSync(join(REPO_ROOT, "config"), join(root, "config"), { recursive: true });
  cpSync(SCRIPT_DIR, join(root, "scripts"), {
    recursive: true,
    filter: (src) => !src.includes("node_modules"),
  });
  return root;
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
    const broken = copyTree("broken");
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

  // G7 — §3.3: the contract is "the same feed normalises to the same instant
  // everywhere". A zone-less value must be refused, not resolved against
  // whichever timezone the runner happens to have. Nothing else in this suite
  // varies TZ, so without this check the whole of §3.3 was unverified.
  check("G7 时间归一不随时区变：无时区一律拒绝", () => {
    const dir = feedDir("tz");
    const blog = (title, url, publishedAt) => ({
      source_id: "blog:claude-blog",
      title,
      url,
      publishedAt,
      content: "c",
    });
    writeFeed(dir, "blogs", {
      generatedAt: "2026-09-28T10:00:00.000Z",
      blogs: [
        blog("zone-less", "https://claude.com/blog/tz-a", "2026-09-25T21:50:12"),
        blog("zulu", "https://claude.com/blog/tz-b", "2026-09-25T21:50:12Z"),
        blog("rfc2822", "https://claude.com/blog/tz-c", "Tue, 22 Sep 2026 21:00:00 GMT"),
        blog("offset", "https://claude.com/blog/tz-d", "2026-09-25T21:50:12+08:00"),
        blog("date-only", "https://claude.com/blog/tz-e", "2026-09-25"),
      ],
    });

    const utc = normalize({ feedsDir: dir, only: "blog", tz: "UTC" });
    const shanghai = normalize({ feedsDir: dir, only: "blog", tz: "Asia/Shanghai" });
    assert(
      JSON.stringify(utc.signals) === JSON.stringify(shanghai.signals),
      "the same feed normalised differently under TZ=UTC and TZ=Asia/Shanghai",
    );

    const at = (url) => utc.signals.find((s) => s.url === url).published_at;
    assert(at("https://claude.com/blog/tz-a") === null, "a zone-less datetime was accepted");
    assert(
      at("https://claude.com/blog/tz-b") === "2026-09-25T21:50:12.000Z",
      `zulu: ${at("https://claude.com/blog/tz-b")}`,
    );
    assert(
      at("https://claude.com/blog/tz-c") === "2026-09-22T21:00:00.000Z",
      `rfc2822: ${at("https://claude.com/blog/tz-c")}`,
    );
    assert(
      at("https://claude.com/blog/tz-d") === "2026-09-25T13:50:12.000Z",
      `offset: ${at("https://claude.com/blog/tz-d")}`,
    );
    assert(
      at("https://claude.com/blog/tz-e") === "2026-09-25T00:00:00.000Z",
      `date-only: ${at("https://claude.com/blog/tz-e")}`,
    );

    const warned = new Set((utc.normalization_warnings || []).map((w) => w.native_id));
    assert(
      warned.has("https://claude.com/blog/tz-a"),
      "the refusal was not recorded as a warning",
    );
  });

  // G8 — §3.4: an untrustworthy state file must stop the run. Silently swapping
  // in an empty state re-sends everything inside every lookback window (§1.4);
  // a malformed `seen` used to either do that or crash with a raw TypeError.
  check("G8 坏 state 一律报错退出，不静默重置、不改写文件", () => {
    const dir = feedDir("badstate");
    writeFeed(dir, "blogs", {
      generatedAt: "2026-09-28T10:00:00.000Z",
      blogs: [
        {
          source_id: "blog:claude-blog",
          title: "t",
          url: "https://claude.com/blog/bad-state",
          publishedAt: "2026-09-25T21:50:12Z",
          content: "c",
        },
      ],
    });

    const broken = {
      "truncated JSON": '{"version":1,"seen":{"a":1',
      "top-level null": "null",
      "top-level array": "[1,2,3]",
      "seen is an array": '{"version":1,"seen":[]}',
      "seen is a number": '{"version":1,"seen":5}',
      "seen is null": '{"version":1,"seen":null}',
      "non-numeric timestamp": '{"version":1,"seen":{"a":"2026-09-01"}}',
    };

    let i = 0;
    for (const [name, text] of Object.entries(broken)) {
      const path = join(tmpRoot, `state-bad-${i++}.json`);
      writeFileSync(path, text);
      const run = runNormalize({ feedsDir: dir, only: "blog", state: path });
      assert(!run.ok, `${name}: the run did NOT abort`);
      assert(
        /dedup state/.test(run.stderr),
        `${name}: message does not name the dedup state — ${run.stderr.trim()}`,
      );
      assert(
        readFileSync(path, "utf-8") === text,
        `${name}: the state file was rewritten instead of left alone`,
      );
    }
  });

  // G9 — §3.4: state must never advance past a product that was not written.
  // The other order records an id as seen and loses that signal for the TTL.
  check("G9 产物写失败时 state 不前进，signal 不丢", () => {
    const dir = feedDir("order");
    writeFeed(dir, "blogs", {
      generatedAt: "2026-09-28T10:00:00.000Z",
      blogs: [
        {
          source_id: "blog:claude-blog",
          title: "t",
          url: "https://claude.com/blog/order",
          publishedAt: "2026-09-25T21:50:12Z",
          content: "c",
        },
      ],
    });

    // Occupy the product path with a directory so the write cannot succeed.
    const broken = copyTree("order-broken");
    mkdirSync(join(broken, "signals.json"));

    const state = join(tmpRoot, "state-g9.json");
    const failed = runNormalize({
      scriptDir: join(broken, "scripts"),
      feedsDir: dir,
      only: "blog",
      state,
    });
    assert(!failed.ok, "the product write did not fail — this check proves nothing");
    assert(
      !existsSync(state),
      "state was advanced even though the product write failed — the signal is now lost",
    );

    // The signal must still be reachable on the next run.
    const clean = copyTree("order-clean");
    const out = normalize({
      scriptDir: join(clean, "scripts"),
      feedsDir: dir,
      only: "blog",
      state,
    });
    assert(out.count === 1, `the signal was lost: count=${out.count}`);
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
