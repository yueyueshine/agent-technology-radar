#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Daily / Weekly Digest (Phase 5)
// ============================================================================
// Renders the Phase 3 / 4 products into a Markdown digest:
//
//   topics.json + radar.json (+ signals.json | signals-window.json) --> digest-*.md
//
//   --mode daily   the cross-run delta (signals.json) grouped by each topic's
//                  ring, plus the current radar. Answers "what is new today".
//   --mode weekly  the whole window, section by section, plus ring movement
//                  against a previous radar.json. Answers "how has the shape
//                  of the ecosystem changed".
//
// Nothing here decides anything and nothing here calls a model: the verdict
// sentences are templates filled from radar.json's already-computed numbers
// (plan §2, D1). The repo has zero secrets and this step adds none.
//
// Usage:
//   node build-digest.js --mode daily  [--out FILE] [--now ISO]
//   node build-digest.js --mode weekly [--prev-radar FILE] [--out FILE] [--now ISO]
//
// `--now` freezes the clock. Without it the report's date comes from the
// machine clock and two runs could differ; the gate always passes it.
//
// plan: .claude/plans/phase-5-daily-weekly-digest.plan.md §3, §4, §5
// ============================================================================

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeTextAtomic } from "./lib/io.js";
import { renderDigest, DEFAULT_TOP_N } from "./lib/digest.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

function argValue(args, name) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

async function main() {
  const args = process.argv.slice(2);
  const mode = argValue(args, "--mode");
  if (mode !== "daily" && mode !== "weekly") {
    throw new Error(
      `--mode is required and must be "daily" or "weekly", got ${JSON.stringify(mode)}`,
    );
  }

  const pathFor = (flag, fallback) =>
    resolve(REPO_ROOT, argValue(args, flag) ?? fallback);

  const topicsPath = pathFor("--topics", "topics.json");
  const radarPath = pathFor("--radar", "radar.json");
  const windowPath = pathFor("--window", "signals-window.json");
  const signalsPath = pathFor("--signals", "signals.json");
  const prevRadarArg = argValue(args, "--prev-radar");
  const prevRadarPath = prevRadarArg ? resolve(REPO_ROOT, prevRadarArg) : null;
  const outPath = resolve(REPO_ROOT, argValue(args, "--out") ?? `digest-${mode}.md`);
  const topArg = argValue(args, "--top");
  const topN = topArg ? Number(topArg) : DEFAULT_TOP_N;
  if (!Number.isInteger(topN) || topN <= 0) {
    throw new Error(`--top must be a positive integer, got ${JSON.stringify(topArg)}`);
  }

  const nowArg = argValue(args, "--now");
  const now = nowArg ? Date.parse(nowArg) : Date.now();
  if (Number.isNaN(now)) {
    throw new Error(`--now is not a parsable date: ${JSON.stringify(nowArg)}`);
  }

  // Radar and topics are the load-bearing inputs; their absence is never a
  // legitimate state, so they fail fast (gate G12).
  if (!existsSync(radarPath)) {
    throw new Error(`${radarPath} not found — run build-radar.js first`);
  }
  if (!existsSync(topicsPath)) {
    throw new Error(`${topicsPath} not found — run cluster-signals.js first`);
  }
  const radar = await readJson(radarPath);
  const topics = await readJson(topicsPath);

  // The daily delta can legitimately be empty, and on a quiet run the file may
  // not exist at all. That is not an error — a digest with no new signals is a
  // true statement about the day (gate G9). Warn rather than whisper it.
  let signals = { signals: [] };
  if (existsSync(signalsPath)) {
    signals = await readJson(signalsPath);
  } else if (mode === "daily") {
    console.error(
      `  ! ${signalsPath} not found — treating today's delta as empty (quiet run)`,
    );
  }

  // The window is where titles come from. The weekly report cannot list links
  // with no way to resolve them, so we do not degrade here.
  const windowDoc = existsSync(windowPath) ? await readJson(windowPath) : null;
  if (mode === "weekly" && !windowDoc) {
    throw new Error(`${windowPath} not found — the weekly digest needs it for titles`);
  }

  let prevRadar = null;
  if (prevRadarPath) {
    if (!existsSync(prevRadarPath)) {
      throw new Error(`--prev-radar ${prevRadarPath} not found`);
    }
    prevRadar = await readJson(prevRadarPath);
  }

  const markdown = renderDigest(
    { topics, radar, signals, window: windowDoc, prevRadar },
    { mode, now, topN },
  );

  await writeTextAtomic(outPath, markdown);

  const lines = markdown.split("\n").length;
  console.error(
    `${mode} digest → ${outPath} (${lines} lines, ${markdown.length} bytes)`,
  );
}

main().catch((err) => {
  console.error("Digest build failed:", err.message);
  process.exit(1);
});
