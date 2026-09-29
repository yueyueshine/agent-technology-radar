#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Technology Radar (Phase 4)
// ============================================================================
// Reads the Phase 3 product and writes `radar.json`:
//
//   topics.json --rings--> radar.json
//
// Input is the PUBLIC topic product only, so `unclassified` is the only
// "unclassified" thing that can appear here and it is carried as a health
// metric, never as a sector (Phase 3 §2.2).
//
// Usage: node build-radar.js [--topics FILE] [--out FILE] [--now ISO]
//
// `--now` freezes the clock: the window is split relative to it, so without it
// two runs a second apart could place a boundary cluster in different halves
// and "deterministic" would be untestable. The gate always passes it.
//
// plan: .claude/plans/phase-4-technology-radar.plan.md §4, §5
// ============================================================================

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic } from "./lib/io.js";
import { buildRadar, RINGS } from "./lib/radar.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

// How far past the declared window the measured span may drift before we say
// so. The upstream fetchers do the cutting and nothing enforces the label
// (plan §1.5), so this is a warning, never a failure: an over-wide input is an
// upstream observation, not a Phase 4 defect.
const SPAN_TOLERANCE_HOURS = 1;

function argValue(args, name) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const topicsPath = resolve(
    REPO_ROOT,
    argValue(args, "--topics") ?? "topics.json",
  );
  const outPath = resolve(REPO_ROOT, argValue(args, "--out") ?? "radar.json");
  const nowArg = argValue(args, "--now");
  const now = nowArg ? Date.parse(nowArg) : Date.now();
  if (Number.isNaN(now)) {
    throw new Error(`--now is not a parsable date: ${JSON.stringify(nowArg)}`);
  }

  if (!existsSync(topicsPath)) {
    throw new Error(`${topicsPath} not found — run cluster-signals.js first`);
  }
  const input = JSON.parse(await readFile(topicsPath, "utf-8"));

  const radar = buildRadar(input, now);

  await writeJsonAtomic(outPath, radar);

  const counts = RINGS.map((ring) => `${ring}=${radar.summary[ring]}`).join(" ");
  console.error(
    `${radar.sectors.length} sector(s) · ${counts} · ` +
      `span=${radar.measuredSpanHours === null ? "n/a" : radar.measuredSpanHours.toFixed(1) + "h"}`,
  );
  for (const sector of radar.sectors) {
    console.error(
      `  ${sector.topic.padEnd(24)} ${sector.ring.padEnd(7)} ` +
        `w=${sector.weight.toFixed(3)} breadth=${sector.breadth} ` +
        `clusters=${sector.recentClusters}/${sector.priorClusters} ` +
        `momentum=${sector.momentum === null ? "n/a" : sector.momentum.toFixed(3)}`,
    );
  }

  if (
    radar.measuredSpanHours !== null &&
    radar.measuredSpanHours > radar.windowHours + SPAN_TOLERANCE_HOURS
  ) {
    console.error(
      `  ! measured span ${radar.measuredSpanHours.toFixed(1)}h exceeds the ` +
        `declared window ${radar.windowHours}h — the input holds signals older ` +
        `than the window (upstream cutoff is in the fetchers, plan §1.5)`,
    );
  }
}

main().catch((err) => {
  console.error("Radar build failed:", err.message);
  process.exit(1);
});
