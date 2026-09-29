#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Deliver a digest to Feishu (Phase 6)
// ============================================================================
//   digest-<mode>.md  -->  one or more signed custom-bot webhook payloads
//
// This is the DELIVERY layer and nothing else. It reads a rendered digest,
// adapts its markup for the card (tables to lists), splits it if it would
// exceed the webhook's body limit, signs it, and posts it. It never writes a
// product and never touches the code that renders one (constraint 1 / gate
// G11) — digest-daily.md and digest-weekly.md are byte-identical after a run.
//
// Usage:
//   node deliver-feishu.js --mode daily  [--file F] [--now ISO] [--print] [--send]
//   node deliver-feishu.js --mode weekly [--file F] [--now ISO] [--print] [--send] [--force-weekly]
//
//   --print   write the payload JSON to stdout, one shard per line. No network,
//             ever — that is the default path and what the gate exercises.
//   --send    actually POST them. The ONLY thing that opens a socket.
//   --now     freeze the clock: it fixes the signature timestamp and decides
//             which weekday it is. Without it the machine clock is used.
//
// Credentials come from the environment (FEISHU_WEBHOOK_URL / _SECRET) so they
// never appear in a command line.
//
// plan: .claude/plans/phase-6-feishu-delivery.plan.md §3, §5, §7.1
// ============================================================================

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_PAYLOAD_BYTES,
  WEEKLY_DELIVERY_WEEKDAY,
  WEEKDAY_NAMES,
  baseTitleFrom,
  planMessages,
} from "./lib/feishu.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const REQUEST_TIMEOUT_MS = 15000;

function argValue(args, name) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

// Fail fast and name the file. A half-rendered or empty digest would otherwise
// go out as a plausible-looking empty card, which is worse than no card.
async function readDigest(path) {
  if (!existsSync(path)) {
    throw new Error(`${path} not found — nothing to deliver`);
  }
  const text = await readFile(path, "utf-8");
  if (text.trim() === "") {
    throw new Error(`${path} is empty — refusing to deliver an empty card`);
  }
  if (!/^#\s+\S/m.test(text)) {
    throw new Error(`${path} has no Markdown heading — that is not a rendered digest`);
  }
  // A file whose every non-blank line is a heading survives the two checks above
  // and then loses its only content to the title lift, producing a card with an
  // empty body. Same reasoning as the empty file: that is worse than no card.
  if (!text.split("\n").some((line) => line.trim() !== "" && !/^#/.test(line.trim()))) {
    throw new Error(`${path} holds nothing but headings — refusing to deliver an empty card`);
  }
  return text;
}

function postJson(url, body) {
  return new Promise((resolvePromise, reject) => {
    const target = new URL(url);
    const send = target.protocol === "http:" ? httpRequest : httpsRequest;
    const req = send(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolvePromise({ status: res.statusCode, body: data }));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`no response within ${REQUEST_TIMEOUT_MS}ms`)));
    req.on("error", reject);
    req.end(body);
  });
}

// A Feishu bot answers 200 with `{"code":0,"msg":"success"}`; older tenants use
// `{"StatusCode":0,...}`. An error comes back either as a non-2xx or as a 200
// carrying a non-zero code, and both have to count as failure — treating the
// second shape as success is exactly how a broken delivery looks healthy.
//
// A 2xx that is not JSON is ALSO a failure, for the same reason: the webhook
// always answers in JSON, so an HTML body means something between here and
// Feishu replied (a proxy, a captive portal) and we have no evidence the card
// arrived. Calling that a success is the silent failure constraint 4 forbids.
function interpret(response) {
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, detail: `HTTP ${response.status} ${response.body.slice(0, 300)}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return {
      ok: false,
      detail: `HTTP ${response.status} but the body is not JSON: ${response.body.slice(0, 200)}`,
    };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { ok: false, detail: `HTTP ${response.status} but the body is not an object` };
  }
  if (typeof parsed.code === "number" && parsed.code !== 0) {
    return { ok: false, detail: `code ${parsed.code}: ${parsed.msg ?? "(no msg)"}` };
  }
  if (typeof parsed.StatusCode === "number" && parsed.StatusCode !== 0) {
    return { ok: false, detail: `StatusCode ${parsed.StatusCode}: ${parsed.StatusMessage ?? ""}` };
  }
  if (typeof parsed.code !== "number" && typeof parsed.StatusCode !== "number") {
    return {
      ok: false,
      detail: `HTTP ${response.status} but the body carries no code: ${response.body.slice(0, 200)}`,
    };
  }
  return { ok: true, detail: `HTTP ${response.status}` };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = argValue(args, "--mode");
  if (mode !== "daily" && mode !== "weekly") {
    throw new Error(
      `--mode is required and must be "daily" or "weekly", got ${JSON.stringify(mode)}`,
    );
  }
  const send = args.includes("--send");
  const print = args.includes("--print");

  const webhookUrl = process.env.FEISHU_WEBHOOK_URL ?? "";
  const secret = process.env.FEISHU_WEBHOOK_SECRET ?? "";

  // Plan §0.3 / D2: an unconfigured webhook is the expected state in a repo
  // that has no secrets, and the CI step must stay green there. Every day that
  // this step is red is a day a real gate failure gets lost in the noise.
  if (send && webhookUrl === "") {
    console.warn(
      "  ! FEISHU_WEBHOOK_URL is not set — skipping delivery (nothing was sent, exiting 0)",
    );
    return 0;
  }
  // The mirror case is NOT a skip. D4 puts the bot behind signature
  // verification, so an unsigned card would be rejected — but a repo that
  // configured only half of the pair should hear about it, not silently stop
  // delivering.
  if (send && secret === "") {
    throw new Error(
      "FEISHU_WEBHOOK_URL is set but FEISHU_WEBHOOK_SECRET is not — with signature " +
        "verification on (phase 6 D4) an unsigned card is rejected. Set the secret, or " +
        "unset the URL to skip delivery.",
    );
  }

  const nowArg = argValue(args, "--now");
  const now = nowArg ? Date.parse(nowArg) : Date.now();
  if (Number.isNaN(now)) {
    throw new Error(`--now is not a parsable date: ${JSON.stringify(nowArg)}`);
  }

  // The weekly report is rendered every run; sending it every run would post
  // the same seven-day window daily. The rule lives here rather than in the
  // workflow so that a frozen clock can test it.
  const weekday = new Date(now).getUTCDay();
  if (mode === "weekly" && !args.includes("--force-weekly") && weekday !== WEEKLY_DELIVERY_WEEKDAY) {
    console.warn(
      `  ! weekly digest is delivered on ${WEEKDAY_NAMES[WEEKLY_DELIVERY_WEEKDAY]} (UTC) only; ` +
        `today is ${WEEKDAY_NAMES[weekday]} — skipping (use --force-weekly to override)`,
    );
    return 0;
  }

  const filePath = resolve(REPO_ROOT, argValue(args, "--file") ?? `digest-${mode}.md`);
  const markdown = await readDigest(filePath);
  const timestamp = Math.floor(now / 1000);

  const plan = planMessages({
    markdown,
    timestamp,
    secret,
    baseTitle: baseTitleFrom(markdown, mode),
  });

  if (print) {
    for (const message of plan.messages) {
      process.stdout.write(`${JSON.stringify(message.payload)}\n`);
    }
  }

  console.error(
    `${mode} digest → ${plan.total} card(s), ${plan.messages
      .map((m) => `${m.bytes}B`)
      .join(" + ")} (limit ${MAX_PAYLOAD_BYTES}B per card)`,
  );
  if (secret === "") {
    console.error(
      "  ! FEISHU_WEBHOOK_SECRET is not set — the emitted sign is computed over an empty secret",
    );
  }
  if (!send) {
    console.error("  (dry path: nothing was sent — pass --send to post)");
    return 0;
  }

  for (const message of plan.messages) {
    const body = JSON.stringify(message.payload);
    const response = await postJson(webhookUrl, body);
    const verdict = interpret(response);
    if (!verdict.ok) {
      throw new Error(
        `shard ${message.index + 1}/${plan.total} rejected by Feishu — ${verdict.detail}`,
      );
    }
    console.error(
      `  sent shard ${message.index + 1}/${plan.total} (${message.bytes}B, ${verdict.detail})`,
    );
  }

  console.error(`delivered ${plan.total} card(s) to Feishu`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Feishu delivery failed:", err.message);
    process.exit(1);
  });
