#!/usr/bin/env node

// ============================================================================
// Agent Technology Radar — Phase 6 gate
// ============================================================================
// The executable definition of "Phase 6 works". Same shape as gate-2b / gate-3
// / gate-4 / gate-5: one process, no framework, red/green per check, driving the
// real CLI as a child process against fixtures.
//
// What is DIFFERENT here, and why:
//
//   * The deliverable is a network call, so the gate stands up a loopback HTTP
//     server and takes the place of Feishu. That is the strongest evidence
//     available offline: the payloads, the signature, the shard count and the
//     failure paths all cross a real socket. It is NOT the same as delivering to
//     the real group — that needs the real webhook and is marked unverified in
//     the plan (§7.2). No packet leaves this machine: the server binds 127.0.0.1
//     on an ephemeral port.
//
//   * The child is spawned ASYNC. spawnSync would block this process's event
//     loop, so the mock server could never answer and every --send check would
//     hang until the client's own 15s timeout.
//
// The signature is recomputed here from the official algorithm rather than
// imported from lib/feishu.js. Importing `sign` would only prove it agrees with
// itself (the same class of error as phase 4's finding F1).
//
// Usage: node gate-6.js
// Exit: 0 all green, 1 any red
//
// plan: .claude/plans/phase-6-feishu-delivery.plan.md §7.1 / §8
// ============================================================================

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const DELIVER = join(SCRIPT_DIR, "deliver-feishu.js");

// Restated from the plan, not imported: if the implementation's idea of the
// limit drifts, this gate must notice rather than follow it.
const MAX_PAYLOAD_BYTES = 20 * 1024;
const SPLIT_THRESHOLD_BYTES = 18 * 1024;

const SECRET = "gate6-secret";
// 2026-09-28 is a Monday and 2026-09-29 a Tuesday (UTC) — the weekly rule needs
// both a day it fires on and a day it must stay quiet.
const MONDAY = "2026-09-28T06:17:00Z";
const TUESDAY = "2026-09-29T06:17:00Z";

const results = [];
let tmpRoot;
let caseSeq = 0;

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Same deliberate naivety as gate-3 / gate-4 / gate-5: the static checks look
// for prohibitions in the *code*, so comments come out first — otherwise writing
// down the rule would itself trip the check, and the obvious fix would be to
// delete the explanation. `(^|[^:])` keeps `https://` from reading as a comment.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// -- The signature, recomputed from the documented algorithm -------------------
// stringToSign = `${timestamp}\n${secret}`, and the SIGNED message is empty.
function expectedSign(timestamp, secret) {
  return createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
}

// The same two strings with the roles swapped. A plausible misreading of the
// algorithm — and one that still produces a stable-looking Base64 blob, so
// nothing else in this gate would catch it.
function transposedSign(timestamp, secret) {
  return createHmac("sha256", secret).update(`${timestamp}\n${secret}`).digest("base64");
}

function bytesOf(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function payloadBytes(payload) {
  return bytesOf(payload);
}

// -- Fixtures -----------------------------------------------------------------

// No table anywhere, so the shard invariant in G4 can be an exact equality
// rather than a subsequence argument.
function fixturePlain() {
  return [
    "# Radar Fixture — 日报 — 2026-09-29",
    "",
    "> fixture digest. 无表格，分片必须逐字符还原。",
    "",
    "## 今日新增 3 条信号",
    "",
    "### 已确立（adopt）",
    "",
    "#### model-capability —— 模型能力与发布",
    "",
    "- **ALPHA** — https://ex.example/alpha",
    "- **BETA** — https://ex.example/beta",
    "",
    "## 未归类（1）—— 未归入扇区，非主题",
    "",
    "- **GAMMA** — https://ex.example/gamma",
    "",
    "## 健康指标",
    "",
    "未归类 1 / 3",
    "",
    // The real digest's last line, and the trap that goes with it: a URL closed
    // by the emphasis delimiter rather than by whitespace.
    "*Generated through the Follow Builders skill: https://ex.example/skill*",
    "",
  ].join("\n");
}

// Mirrors the real `## 当前雷达` table in digest-daily.md: five columns, nine
// data rows. It used to hold three rows, which let a row-dropping bug through —
// capping the loop at five rows left this gate 14/14 green while silently
// losing six rows of a nine-row table (independent review, finding 1). The
// expected output below is built from this table, so the count cannot drift.
const TABLE_ROWS = [
  ["model-capability", "已确立", "13", "26 / 11", "+0.41"],
  ["agent-framework", "待观察", "1", "1 / 0", "+1.00"],
  ["tool-and-protocol", "沉寂", "1", "0 / 1", "-1.00"],
  ["context-and-memory", "试用中", "3", "3 / 0", "+1.00"],
  ["inference-and-cost", "待观察", "2", "2 / 2", "+0.00"],
  ["dev-tooling", "已确立", "7", "15 / 6", "+0.43"],
  ["product-and-business", "沉寂", "4", "4 / 5", "-0.11"],
  ["safety-and-governance", "已确立", "5", "6 / 3", "+0.33"],
  ["eval-and-benchmark", "沉寂", "3", "1 / 2", "-0.33"],
];

function fixtureTables() {
  return [
    "# Radar Fixture — 日报 — 2026-09-29",
    "",
    "## 今日新增 1 条信号",
    "",
    "- **ALPHA** — https://ex.example/alpha",
    "",
    "## 当前雷达",
    "",
    "| 扇区 | 环 | 源 | 事件（近/远） | 动量 |",
    "| --- | --- | --- | --- | --- |",
    ...TABLE_ROWS.map((row) => `| ${row.join(" | ")} |`),
    "",
    "> 动量 = 窗口后半段 vs 前半段。",
    "",
    "## 健康指标",
    "",
    "未归类 0 / 3",
    "",
  ].join("\n");
}

// Big enough to need several shards at the 18 KB budget, and built from whole
// `## ` sections so the packing has real boundaries to work with.
function fixtureHuge({ sections = 40, bullets = 25 } = {}) {
  const lines = [
    "# Radar Fixture — 日报 — 2026-09-29",
    "",
    "> 大 fixture：分片路径。",
    "",
  ];
  for (let s = 0; s < sections; s += 1) {
    lines.push(`## 段 ${s} —— section ${s}`);
    lines.push("");
    lines.push("### 已确立（adopt）");
    lines.push("");
    for (let b = 0; b < bullets; b += 1) {
      lines.push(`- **ITEM-${s}-${b}** — https://ex.example/${s}/${b}`);
    }
    lines.push("");
  }
  lines.push("## 健康指标");
  lines.push("");
  lines.push("未归类 0 / 12000");
  lines.push("");
  return lines.join("\n");
}

// One section whose single line alone busts the 20 KB ceiling. It cannot be cut
// without breaking a URL in half, so the contract is a loud failure — the one
// case where truncating or dropping would be worse than a red step.
function fixtureOneHugeLine() {
  return [
    "# Radar Fixture — 日报 — 2026-09-29",
    "",
    "## 巨行",
    "",
    `- ${"X".repeat(26000)}`,
    "",
    "## 尾段",
    "",
    "- **TAIL** — https://ex.example/tail",
    "",
  ].join("\n");
}

// A single line that fits under the 20 KB ceiling but not under the 18 KB
// packing budget. It goes out alone, over budget and still deliverable — the
// band between the two numbers is real, so the gate tests it rather than
// claiming a guarantee the implementation never made (review finding 3).
function fixtureWideLine() {
  return [
    "# Radar Fixture — 日报 — 2026-09-29",
    "",
    "## 宽行",
    "",
    `- ${"X".repeat(18990)}`,
    "",
    "## 尾段",
    "",
    "- **TAIL** — https://ex.example/tail",
    "",
  ].join("\n");
}

// What the shards must add back up to, computed here rather than read out of
// the implementation: the H1 is lifted into the card header (plan §2 step 1)
// and every bare URL becomes an explicit markdown link (plan §2 step 3).
function expectedBody(markdown) {
  const rest = markdown.slice(markdown.indexOf("\n") + 1).replace(/^\n+/, "");
  return rest.replace(/(?<!\]\()(?<!<)(https?:\/\/[^\s)*<>"]+)/g, (_match, url) => `[${url}](${url})`);
}

function caseDir(files) {
  caseSeq += 1;
  const dir = mkdtempSync(join(tmpRoot, `case-${caseSeq}-`));
  const paths = {};
  for (const [name, text] of Object.entries(files)) {
    paths[name] = join(dir, name);
    writeFileSync(paths[name], text);
  }
  return paths;
}

// -- Running the real script (async: the mock server needs the event loop) ----

function buildArgs({ mode, file, now, print, send, forceWeekly }) {
  const args = [DELIVER];
  if (mode !== undefined) args.push("--mode", mode);
  if (file !== undefined) args.push("--file", file);
  if (now !== undefined) args.push("--now", now);
  if (print) args.push("--print");
  if (send) args.push("--send");
  if (forceWeekly) args.push("--force-weekly");
  return args;
}

function deliver({ mode, file, now, print = false, send = false, forceWeekly = false, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, buildArgs({ mode, file, now, print, send, forceWeekly }), {
      // A scrubbed environment: an ambient FEISHU_* in the shell must not be able
      // to change what this gate measures.
      env: { PATH: process.env.PATH ?? "", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const finish = (status) => {
      const payloads = [];
      const badLines = [];
      for (const line of stdout.split("\n")) {
        if (line.trim() === "") continue;
        try {
          payloads.push(JSON.parse(line));
        } catch (err) {
          badLines.push(`${err.message}: ${line.slice(0, 120)}`);
        }
      }
      resolve({ status, stdout, stderr, out: `${stdout}${stderr}`, payloads, badLines });
    };
    child.on("error", (err) => { stderr += `spawn failed: ${err.message}`; finish(-1); });
    child.on("close", finish);
  });
}

// `--print` only, so a check that forgets `send` cannot silently post. Every
// dry inspection in this file goes through here.
function plan({ file, mode = "daily", now = TUESDAY, forceWeekly = false, env = {} } = {}) {
  return deliver({
    mode, file, now, forceWeekly, print: true,
    env: { FEISHU_WEBHOOK_SECRET: SECRET, ...env },
  });
}

function payloadsOf(run, what) {
  assert(run.status === 0, `${what}: exit ${run.status}: ${run.out.trim()}`);
  assert(run.badLines.length === 0, `${what}: stdout is not one payload per line: ${run.badLines[0]}`);
  assert(run.payloads.length > 0, `${what}: no payload was emitted`);
  return run.payloads;
}

function contentOf(payload) {
  return payload.card.body.elements[0].content;
}

// -- The stand-in for Feishu --------------------------------------------------

async function startMock(respond) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requests.push({ method: req.method, headers: req.headers, body });
      const answer = respond(requests.length, body) ?? {};
      res.writeHead(answer.status ?? 200, { "Content-Type": answer.contentType ?? "application/json" });
      res.end(answer.payload ?? '{"code":0,"msg":"success"}');
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/hook`;
  return { url, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function withMock(respond, fn) {
  const mock = await startMock(respond);
  try {
    return await fn(mock);
  } finally {
    await mock.close();
  }
}

// A port nothing is listening on. Bound and released rather than hard-coded, so
// the check cannot pass merely because some other service happens to be there.
async function closedUrl() {
  const mock = await startMock(() => ({}));
  const { url } = mock;
  await mock.close();
  return url;
}

// -- Checks -------------------------------------------------------------------

async function main() {
  tmpRoot = mkdtempSync(join(tmpdir(), "gate-6-"));

  const fixture = caseDir({
    "plain.md": fixturePlain(),
    "tables.md": fixtureTables(),
    "huge.md": fixtureHuge(),
    "one-huge-line.md": fixtureOneHugeLine(),
    "wide-line.md": fixtureWideLine(),
    "empty.md": "",
    "heading-only.md": "# Only A Title\n",
    "bare.txt": "just some prose, no heading at all\n",
  });

  // G1 — §7.1: the same digest and the same --now must serialise to the same
  // bytes. Any clock, Map-iteration or path leak shows up here.
  await check("G1 确定性：同一输入 + 同一 --now，载荷逐字节相同；换路径与换运行不改字节", async () => {
    const first = payloadsOf(await plan({ file: fixture["plain.md"] }), "run 1");
    const second = payloadsOf(await plan({ file: fixture["plain.md"] }), "run 2");
    assert(
      first.map(JSON.stringify).join("\n") === second.map(JSON.stringify).join("\n"),
      "two identical runs produced different payloads",
    );

    // Same content, different directory and filename: the payload must not
    // record where the digest came from.
    const copy = caseDir({ "renamed.md": fixturePlain() });
    const moved = payloadsOf(await plan({ file: copy["renamed.md"] }), "copied path");
    assert(
      moved.map(JSON.stringify).join("\n") === first.map(JSON.stringify).join("\n"),
      "moving the digest to another path changed the payload — the path leaks into the card",
    );
  });

  // G2 — §7.1 / D4: the signature, recomputed from the official algorithm.
  await check("G2 签名正确性：按官方算法独立重算一致；换 secret 即变；键与消息不得互换", async () => {
    const run = payloadsOf(await plan({ file: fixture["plain.md"] }), "signed plan");
    const expectedTs = String(Math.floor(Date.parse(TUESDAY) / 1000));

    for (const [index, payload] of run.entries()) {
      assert(
        payload.timestamp === expectedTs,
        `shard ${index + 1}: timestamp ${payload.timestamp}, expected ${expectedTs} (seconds, from --now)`,
      );
      const want = expectedSign(payload.timestamp, SECRET);
      assert(
        payload.sign === want,
        `shard ${index + 1}: sign ${payload.sign}, independently computed ${want}`,
      );
      assert(
        payload.sign !== transposedSign(payload.timestamp, SECRET),
        `shard ${index + 1}: key and message are swapped — the secret is being signed WITH the timestamp`,
      );
    }

    const otherSecret = payloadsOf(
      await plan({ file: fixture["plain.md"], env: { FEISHU_WEBHOOK_SECRET: "gate6-secret-2" } }),
      "other secret",
    );
    assert(
      otherSecret[0].sign !== run[0].sign,
      "the same digest under a different secret produced the same signature — the secret is not in the key",
    );

    assert(
      expectedSign("1", SECRET) !== expectedSign("2", SECRET),
      "fixture/tooling error: the signature does not depend on the timestamp",
    );
  });

  // G3 — §7.1 / D3: Feishu rejects a body over 20 KB outright.
  await check("G3 20 KB 硬约束：大输入切成多条，每条严格小于 20 KB；预算内不超 18432 B", async () => {
    const run = await plan({ file: fixture["huge.md"] });
    const payloads = payloadsOf(run, "huge plan");
    assert(
      bytesOf(fixtureHuge()) > SPLIT_THRESHOLD_BYTES,
      `fixture error: the huge digest is only ${bytesOf(fixtureHuge())} bytes — it does not force a split`,
    );
    assert(payloads.length > 1, `a ${bytesOf(fixtureHuge())}-byte digest went out as ${payloads.length} card(s)`);

    // The hard ceiling holds for EVERY shard, always — that is Feishu's rule.
    for (const [index, payload] of payloads.entries()) {
      const bytes = payloadBytes(payload);
      assert(
        bytes < MAX_PAYLOAD_BYTES,
        `shard ${index + 1}/${payloads.length} is ${bytes} bytes, at or over the ${MAX_PAYLOAD_BYTES}-byte limit`,
      );
    }
    // The 18 KB figure is a PACKING budget, not a promise. It is met whenever
    // every section could be split at a boundary — which is this fixture. A
    // single line that does not fit goes out alone instead (below, and §4).
    for (const [index, payload] of payloads.entries()) {
      const bytes = payloadBytes(payload);
      assert(
        bytes <= SPLIT_THRESHOLD_BYTES,
        `shard ${index + 1}/${payloads.length} is ${bytes} bytes, over the ${SPLIT_THRESHOLD_BYTES}-byte budget — ` +
          `the packing is not honouring it, and this fixture has no line it could not cut`,
      );
    }
    assert(
      payloads.every((p) => /第 \d+\/\d+ 条/.test(p.card.header.title.content)),
      `a shard title does not say which part it is: ${payloads.map((p) => p.card.header.title.content).join(" | ")}`,
    );

    // The band between budget and ceiling: real, deliverable, and therefore
    // asserted rather than left to chance.
    const wide = payloadsOf(await plan({ file: fixture["wide-line.md"] }), "wide-line plan");
    assert(
      wide.some((p) => payloadBytes(p) > SPLIT_THRESHOLD_BYTES),
      "fixture error: the wide-line digest produced no over-budget shard",
    );
    for (const [index, payload] of wide.entries()) {
      assert(
        payloadBytes(payload) < MAX_PAYLOAD_BYTES,
        `wide-line shard ${index + 1}/${wide.length} is ${payloadBytes(payload)} bytes — over the hard limit`,
      );
    }
    assert(
      wide.map(contentOf).join("\n") === expectedBody(fixtureWideLine()),
      "the wide-line digest lost content on the way out",
    );
  });

  // G4 — §7.1 / §4: splitting is a transport concern, never a place content may
  // be lost. Exact equality, because the fixture has no tables.
  await check("G4 分片不丢内容：各段拼回 == 原正文（去标题），节标题一条不少且有序", async () => {
    const source = fixtureHuge();
    const payloads = payloadsOf(await plan({ file: fixture["huge.md"] }), "huge plan");
    const expected = expectedBody(source);
    const got = payloads.map(contentOf).join("\n");
    assert(
      got === expected,
      `shards do not add back up to the body: ${bytesOf(got)} bytes of shard text vs ${bytesOf(expected)} bytes of ` +
        `input — first divergence at offset ${[...expected].findIndex((ch, i) => got[i] !== ch)}`,
    );

    const headingsOf = (text) => text.match(/^## .+$/gm) ?? [];
    assert(
      headingsOf(got).join("\n") === headingsOf(expected).join("\n"),
      "section headings were lost or reordered across shards",
    );

    const small = payloadsOf(await plan({ file: fixture["plain.md"] }), "plain plan");
    assert(
      small.length === 1,
      `a ${bytesOf(fixturePlain())}-byte digest was split into ${small.length} cards`,
    );
    assert(
      contentOf(small[0]) === expectedBody(fixturePlain()),
      "the single-shard path changed the body",
    );
  });

  // G5 — §2 / §7.1: the card's markdown element renders tables but caps them at
  // five data rows ("超出五行将分页展示"), and the radar table has nine. So the
  // table leaves as a list — and all nine rows have to be there.
  await check("G5 表格降级：输出无表格行，九行数据全部转为带标签的列表项", async () => {
    const payloads = payloadsOf(await plan({ file: fixture["tables.md"] }), "table plan");
    const text = payloads.map(contentOf).join("\n");

    for (const line of text.split("\n")) {
      assert(!/^\s*\|/.test(line), `a table row survived into the card: ${JSON.stringify(line)}`);
    }
    assert(!/\|\s*-{3,}/.test(text), "a table separator row survived into the card");
    assert(!/-{3,}\s*\|/.test(text), "a table separator row survived into the card");

    // Scoped to the radar section, so a bullet elsewhere in the digest cannot be
    // mistaken for a degraded row (this check was wrong that way once).
    const start = text.indexOf("## 当前雷达");
    assert(start !== -1, "the 当前雷达 section vanished from the card");
    const section = text.slice(start, text.indexOf("\n## ", start));
    const rows = section.split("\n").filter((l) => /^- \*\*/.test(l));

    // The exact expected lines, built from TABLE_ROWS — not from the
    // implementation's own output, which would only prove it agrees with itself.
    const expected = TABLE_ROWS.map(
      ([name, ring, sources, events, momentum]) =>
        `- **${name}**：环=${ring} · 源=${sources} · 事件（近/远）=${events} · 动量=${momentum}`,
    );
    assert(
      rows.length === TABLE_ROWS.length,
      `the radar table became ${rows.length} row(s), expected ${TABLE_ROWS.length} — ` +
        `a table is capped at five visible rows by Feishu, a list is not, so losing rows here is losing data`,
    );
    for (const [index, line] of expected.entries()) {
      assert(
        rows[index] === line,
        `degraded row ${index + 1} is wrong:\n  got      ${rows[index]}\n  expected ${line}`,
      );
    }
    assert(
      (section.match(/^- \*\*/gm) ?? []).length === TABLE_ROWS.length,
      `the 当前雷达 section holds ${(section.match(/^- \*\*/gm) ?? []).length} row(s), expected ${TABLE_ROWS.length}`,
    );
  });

  // G6 — §0.3 / §7.1: no secrets in this repo is the EXPECTED state, and a
  // permanently red step would drown the real failures.
  await check("G6 secret 缺失即降级：无 URL 时 exit 0 + 明确 warning 且不发网络；只配一半则报错", async () => {
    await withMock(() => ({}), async (mock) => {
      const skip = await deliver({ mode: "daily", file: fixture["plain.md"], now: TUESDAY, send: true, env: {} });
      assert(skip.status === 0, `an unconfigured webhook exited ${skip.status}, expected 0: ${skip.out.trim()}`);
      assert(/FEISHU_WEBHOOK_URL/.test(skip.out), `the warning does not name the missing variable: ${skip.out.trim()}`);
      assert(
        /skip|nothing was sent|未发送|跳过/i.test(skip.out),
        `the warning does not say delivery was skipped: ${skip.out.trim()}`,
      );
      assert(mock.requests.length === 0, `an unconfigured webhook still made ${mock.requests.length} request(s)`);

      // Half a credential pair is a misconfiguration, not a skip: D4 puts the bot
      // behind signature verification, so an unsigned card is rejected anyway.
      const half = await deliver({
        mode: "daily", file: fixture["plain.md"], now: TUESDAY, send: true,
        env: { FEISHU_WEBHOOK_URL: mock.url },
      });
      assert(half.status !== 0, "a URL with no secret was accepted instead of reported");
      assert(
        /FEISHU_WEBHOOK_SECRET/.test(half.out),
        `the error does not name the missing secret: ${half.out.trim()}`,
      );
      assert(mock.requests.length === 0, "a half-configured webhook reached the network");
    });
  });

  // G7 — §8: "失败时必须可观测". Every shape Feishu (or something in front of it)
  // can answer with has to end in a non-zero exit and a message carrying the
  // detail — including the 200 that is secretly an error.
  await check("G7 失败可观测：非 2xx / 非零 code / 非 JSON 200 / 连接失败 都 exit 非 0 且报出原因", async () => {
    const cases = [
      ["200 with code 9499", () => ({ status: 200, payload: '{"code":9499,"msg":"Bad Request"}' }), /9499/],
      ["500", () => ({ status: 500, payload: "oops" }), /500/],
      [
        "200 with StatusCode 19001",
        () => ({ status: 200, payload: '{"StatusCode":19001,"StatusMessage":"param invalid"}' }),
        /19001/,
      ],
      [
        "200 with an HTML body",
        () => ({ status: 200, contentType: "text/html", payload: "<!DOCTYPE html><title>proxy</title>" }),
        /not JSON|不是 JSON/i,
      ],
      ["200 with no code at all", () => ({ status: 200, payload: '{"ok":true}' }), /no code/],
      ["200 with a non-object body", () => ({ status: 200, payload: '"success"' }), /not an object/],
    ];

    for (const [name, respond, expected] of cases) {
      await withMock(respond, async (mock) => {
        const run = await deliver({
          mode: "daily", file: fixture["plain.md"], now: TUESDAY, send: true,
          env: { FEISHU_WEBHOOK_URL: mock.url, FEISHU_WEBHOOK_SECRET: SECRET },
        });
        assert(run.status !== 0, `${name}: was reported as delivered (exit ${run.status}): ${run.out.trim()}`);
        assert(
          expected.test(run.out),
          `${name}: the error does not carry the reason ${expected}: ${run.out.trim()}`,
        );
        assert(mock.requests.length === 1, `${name}: expected exactly one attempt, saw ${mock.requests.length}`);
      });
    }

    // Nothing listening at all.
    const dead = await closedUrl();
    const refused = await deliver({
      mode: "daily", file: fixture["plain.md"], now: TUESDAY, send: true,
      env: { FEISHU_WEBHOOK_URL: dead, FEISHU_WEBHOOK_SECRET: SECRET },
    });
    assert(refused.status !== 0, `a refused connection exited ${refused.status}`);
    assert(/failed|refused|ECONNREFUSED/i.test(refused.out), `the error names no cause: ${refused.out.trim()}`);
  });

  // G8 — §2 / §3: the happy path, over a real socket, on the multi-shard input.
  await check("G8 成功路径：mock 收到 N 条合法载荷（顺序、大小、签名、卡片结构），exit 0", async () => {
    await withMock(() => ({ status: 200, payload: '{"code":0,"msg":"success"}' }), async (mock) => {
      const run = await deliver({
        mode: "daily", file: fixture["huge.md"], now: TUESDAY, send: true,
        env: { FEISHU_WEBHOOK_URL: mock.url, FEISHU_WEBHOOK_SECRET: SECRET },
      });
      assert(run.status === 0, `expected success, got exit ${run.status}: ${run.out.trim()}`);
      assert(
        mock.requests.length > 1,
        `only ${mock.requests.length} request(s) reached the webhook for a ${bytesOf(fixtureHuge())}-byte digest`,
      );

      const sent = [];
      for (const request of mock.requests) {
        assert(request.method === "POST", `a shard went out as ${request.method}`);
        assert(
          /application\/json/.test(request.headers["content-type"] ?? ""),
          `a shard went out as ${request.headers["content-type"]}`,
        );
        const bytes = Buffer.byteLength(request.body, "utf8");
        assert(bytes < MAX_PAYLOAD_BYTES, `a shard on the wire is ${bytes} bytes`);
        const payload = JSON.parse(request.body);
        sent.push(payload);

        assert(payload.msg_type === "interactive", `msg_type is ${payload.msg_type}, expected interactive (D1)`);
        assert(payload.card.schema === "2.0", `card schema is ${payload.card.schema}, expected 2.0 (D1)`);
        assert(
          payload.card.header.title.tag === "plain_text",
          `the card header title is a ${payload.card.header.title.tag}`,
        );
        assert(
          payload.card.body.elements[0].tag === "markdown",
          `the card body element is a ${payload.card.body.elements[0].tag}`,
        );
        assert(
          payload.sign === expectedSign(payload.timestamp, SECRET),
          "a shard went out with a signature that does not match its own timestamp",
        );
      }

      const order = sent.map((p) => p.card.header.title.content.match(/第 (\d+)\/(\d+) 条/) ?? []);
      assert(
        order.every((m, i) => m[1] === String(i + 1) && m[2] === String(sent.length)),
        `the shards arrived out of order or mislabelled: ${order.map((m) => m[0]).join(" | ")}`,
      );
      assert(
        sent.map(contentOf).join("\n") === expectedBody(fixtureHuge()),
        "what crossed the wire does not add back up to the digest",
      );
      assert(
        run.stdout.trim() === "",
        `--send still wrote payloads to stdout: ${run.stdout.slice(0, 120)}`,
      );
    });
  });

  // G8b — §7.1: the default path must not open a socket. Pointed at a live
  // server, a --print run must leave it with zero requests.
  await check("G8b 默认不触网：--print 配了 URL 也不发请求；真实发送只由 --send 触发", async () => {
    await withMock(() => ({}), async (mock) => {
      const run = await deliver({
        mode: "daily", file: fixture["plain.md"], now: TUESDAY, print: true,
        env: { FEISHU_WEBHOOK_URL: mock.url, FEISHU_WEBHOOK_SECRET: SECRET },
      });
      assert(run.status === 0, `--print exited ${run.status}: ${run.out.trim()}`);
      assert(run.payloads.length > 0, "--print emitted no payload");
      assert(
        mock.requests.length === 0,
        `--print posted ${mock.requests.length} request(s) to a configured webhook`,
      );
    });
  });

  // G9 — §8 "链接可点击": the criterion is clickability, not mere survival of the
  // characters. A bare URL is not a link — the card's markdown element is
  // documented as CommonMark-compatible, and CommonMark does not autolink — so
  // the delivery layer wraps every URL as `[url](url)`. This check asserts the
  // wrapping; the previous version only asserted the substring was still there
  // and would have passed with the links unclickable (review finding 4).
  await check("G9 链接可点：每条 URL 都在显式 markdown 链接里，文本即目标，无裸 URL 残留", async () => {
    const source = fixtureHuge();
    const payloads = payloadsOf(await plan({ file: fixture["huge.md"] }), "huge plan");
    const text = payloads.map(contentOf).join("\n");

    const urls = source.match(/https?:\/\/[^\s)]+/g) ?? [];
    assert(urls.length > 100, `fixture error: only ${urls.length} URL(s) in the huge digest`);

    const links = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    assert(
      links.length === urls.length,
      `the card holds ${links.length} markdown link(s) for ${urls.length} URL(s) in the input`,
    );
    for (const [, label, target] of links) {
      assert(label === target, `a link points at ${target} but reads "${label}" — the text was rewritten`);
    }
    const targets = new Set(links.map(([, , target]) => target));
    for (const url of urls) {
      assert(targets.has(url), `the link ${url} did not survive into the card`);
    }

    // The decisive one: no URL-shaped text may be left outside a link.
    const bare = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "").match(/https?:\/\/[^\s)]+/);
    assert(!bare, `a URL was left bare, so it renders as text and not as a link: ${bare && bare[0]}`);

    // And through the table path, where a cell could swallow the URL.
    const tableText = payloadsOf(await plan({ file: fixture["tables.md"] }), "table plan")
      .map(contentOf)
      .join("\n");
    assert(
      tableText.includes("[https://ex.example/alpha](https://ex.example/alpha)"),
      `table degradation ate or un-linked the URL outside the table: ${JSON.stringify(tableText)}`,
    );

    // A URL closed by the emphasis delimiter instead of whitespace — the shape
    // of the real digest's footer. Letting the `*` into the URL corrupts the
    // link target AND eats the italics' closing marker, and the assertions
    // above would not notice because both sides of the link stay equal.
    const plain = contentOf(payloadsOf(await plan({ file: fixture["plain.md"] }), "plain plan")[0]);
    const footer = plain.split("\n").find((line) => line.includes("Follow Builders")) ?? "";
    assert(
      footer ===
        "*Generated through the Follow Builders skill: [https://ex.example/skill](https://ex.example/skill)*",
      `a URL abutting an emphasis marker was mis-linked: ${JSON.stringify(footer)}`,
    );
  });

  // G10 — §0.2 constraints 3 / 10: no tier, no per-source boost, in this layer
  // any more than in the one that renders the digest.
  await check("G10 无 tier / 按源加成：代码中不出现 tier 或具体 registry 源 id", async () => {
    for (const file of ["lib/feishu.js", "deliver-feishu.js"]) {
      const source = stripComments(readFileSync(join(SCRIPT_DIR, file), "utf-8"));
      assert(!/\btier/i.test(source), `${file}: references tier — the tier must not reach delivery`);
      const sourceId = source.match(/["'`](?:rss|github|api|web|podcast):[a-z0-9-]+["'`]/i);
      assert(
        !sourceId,
        `${file}: hardcodes a registry source id (${sourceId && sourceId[0]}) — a per-source boost in waiting`,
      );
    }
  });

  // G11 — §0.2 constraint 1 / §6: adaptation happens on the way out. The digest
  // on disk is a standard-Markdown product and must be byte-identical after a
  // run, however the card was reshaped.
  await check("G11 不碰产物：跑完 digest-*.md 逐字节不变，仓库根目录不新增文件", async () => {
    const repoDaily = join(REPO_ROOT, "digest-daily.md");
    const repoWeekly = join(REPO_ROOT, "digest-weekly.md");
    const before = {
      daily: readFileSync(repoDaily, "utf-8"),
      weekly: readFileSync(repoWeekly, "utf-8"),
      fixture: readFileSync(fixture["tables.md"], "utf-8"),
      listing: readdirSync(REPO_ROOT).sort().join("\n"),
    };
    assert(/\| --- \|/.test(before.fixture), "fixture error: the source digest holds no table separator to preserve");

    // The default path: no --file, so it reads the real digest in the repo root.
    const real = await deliver({ mode: "daily", now: TUESDAY, print: true, env: { FEISHU_WEBHOOK_SECRET: SECRET } });
    assert(real.status === 0, `the default path failed on the real digest: ${real.out.trim()}`);
    assert(real.payloads.length > 0, "the default path emitted no payload for the real digest");

    await withMock(() => ({ status: 200, payload: '{"code":0,"msg":"success"}' }), async (mock) => {
      const sent = await deliver({
        mode: "daily", file: fixture["tables.md"], now: TUESDAY, send: true,
        env: { FEISHU_WEBHOOK_URL: mock.url, FEISHU_WEBHOOK_SECRET: SECRET },
      });
      assert(sent.status === 0, `the send path failed: ${sent.out.trim()}`);
    });

    assert(readFileSync(repoDaily, "utf-8") === before.daily, "digest-daily.md was rewritten by the delivery layer");
    assert(readFileSync(repoWeekly, "utf-8") === before.weekly, "digest-weekly.md was rewritten by the delivery layer");
    assert(
      readFileSync(fixture["tables.md"], "utf-8") === before.fixture,
      "the source digest was rewritten in place after being degraded for the card",
    );
    assert(
      readdirSync(REPO_ROOT).sort().join("\n") === before.listing,
      "the delivery layer added or removed a file in the repo root",
    );
  });

  // G12 — §7.1: a broken input must stop the run, not put out a plausible card.
  await check("G12 坏输入 fail-fast：缺文件 / 空文件 / 非 Markdown / 缺 --mode / 坏 --now 都报错退出", async () => {
    const cases = [
      ["a missing digest", { mode: "daily", file: join(tmpRoot, "nope.md"), now: TUESDAY }, /not found/],
      ["an empty digest", { mode: "daily", file: fixture["empty.md"], now: TUESDAY }, /empty/],
      ["a digest with no heading", { mode: "daily", file: fixture["bare.txt"], now: TUESDAY }, /heading/],
      [
        "a digest that is nothing but a heading",
        { mode: "daily", file: fixture["heading-only.md"], now: TUESDAY },
        /nothing but headings/,
      ],
      ["an unknown --mode", { mode: "hourly", file: fixture["plain.md"], now: TUESDAY }, /--mode/],
      ["no --mode at all", { file: fixture["plain.md"], now: TUESDAY }, /--mode/],
      ["an unparsable --now", { mode: "daily", file: fixture["plain.md"], now: "yesterday-ish" }, /--now/],
    ];
    for (const [name, args, expected] of cases) {
      const run = await deliver({ ...args, print: true, env: { FEISHU_WEBHOOK_SECRET: SECRET } });
      assert(run.status !== 0, `${name}: was accepted (exit ${run.status})`);
      assert(expected.test(run.out), `${name}: the error does not name the problem ${expected}: ${run.out.trim()}`);
    }

    // A single line too long to cut: loud, not silent. Truncating would ship a
    // broken URL; dropping it would ship a digest missing content.
    const oversize = await plan({ file: fixture["one-huge-line.md"] });
    assert(oversize.status !== 0, `a section that cannot fit one card exited ${oversize.status}`);
    assert(
      /20480|20 \* 1024|limit/i.test(oversize.out),
      `the oversized-line failure does not say why: ${oversize.out.trim()}`,
    );
  });

  // G13 — §3: the weekly report is rendered on every run but must not be posted
  // on every run, or the group gets the same seven-day window daily.
  await check("G13 周报只在周一发：周二静默 exit 0 且无请求；周一或 --force-weekly 才发；日报不受限", async () => {
    await withMock(() => ({ status: 200, payload: '{"code":0,"msg":"success"}' }), async (mock) => {
      const env = { FEISHU_WEBHOOK_URL: mock.url, FEISHU_WEBHOOK_SECRET: SECRET };
      const weeklySend = (extra) => deliver({ mode: "weekly", file: fixture["plain.md"], send: true, env, ...extra });

      const tuesday = await weeklySend({ now: TUESDAY });
      assert(tuesday.status === 0, `a Tuesday weekly run exited ${tuesday.status}: ${tuesday.out.trim()}`);
      assert(
        mock.requests.length === 0,
        `the weekly report was posted on a Tuesday (${mock.requests.length} request(s))`,
      );
      assert(/周一/.test(tuesday.out), `the skip does not say which day it delivers on: ${tuesday.out.trim()}`);

      const monday = await weeklySend({ now: MONDAY });
      assert(monday.status === 0, `a Monday weekly run exited ${monday.status}: ${monday.out.trim()}`);
      assert(mock.requests.length === 1, `a Monday weekly run made ${mock.requests.length} request(s)`);

      const forced = await weeklySend({ now: TUESDAY, forceWeekly: true });
      assert(forced.status === 0, `--force-weekly exited ${forced.status}: ${forced.out.trim()}`);
      assert(mock.requests.length === 2, `--force-weekly made ${mock.requests.length - 1} request(s)`);

      const daily = await deliver({ mode: "daily", file: fixture["plain.md"], now: TUESDAY, send: true, env });
      assert(daily.status === 0, `a daily run exited ${daily.status}: ${daily.out.trim()}`);
      assert(mock.requests.length === 3, "a daily run was gated on the weekday");
    });
  });

  rmSync(tmpRoot, { recursive: true, force: true });

  const red = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - red.length}/${results.length} green` +
      (red.length ? ` — ${red.length} RED` : ""),
  );
  process.exit(red.length ? 1 : 0);
}

main().catch((err) => {
  console.error("gate-6 crashed:", err && err.stack ? err.stack : err);
  process.exit(1);
});
