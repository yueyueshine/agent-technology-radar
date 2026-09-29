// ============================================================================
// Agent Technology Radar — Feishu custom-bot payloads (Phase 6)
// ============================================================================
// Everything that happens BEFORE the network: turning a rendered digest into
// one or more signed webhook payloads. No I/O, no clock, no credentials — the
// caller passes `timestamp` and `secret` in, so the same input always yields
// the same bytes (plan §7.1 G1).
//
// Three decisions from the phase 6 plan live here:
//   D1  interactive card, schema 2.0, one markdown element   (§2)
//   D3  split on `## ` section boundaries, never truncate    (§4)
//   D4  HMAC-SHA256 signature over `timestamp\nsecret`       (§5)
//
// plan: .claude/plans/phase-6-feishu-delivery.plan.md §2, §4, §5
// ============================================================================

import { createHmac } from "node:crypto";

// Feishu's documented ceiling for a custom-bot request body. Over it the
// request is rejected outright, so this is a hard boundary, not a target.
export const MAX_PAYLOAD_BYTES = 20 * 1024;

// Where we stop packing. The gap to MAX_PAYLOAD_BYTES is deliberate: the
// serialised payload grows when the shard count pushes a two-digit suffix into
// every title, and Chinese text costs 3 bytes per character, so "it fit in the
// preview" is not the same as "it fits".
export const SPLIT_THRESHOLD_BYTES = 18 * 1024;

// The weekly report is rendered on every run but delivered once a week,
// otherwise the group gets the same window twice a day. ISO weekday: 1 = Monday,
// covering the week just finished (plan §3, §9 open question).
export const WEEKLY_DELIVERY_WEEKDAY = 1;

export const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// -- Signature (D4) -----------------------------------------------------------
// Official algorithm: the signing key IS `timestamp + "\n" + secret`, and the
// message that gets signed is the empty string.
export function sign(timestamp, secret) {
  return createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
}

// -- Card (D1) ----------------------------------------------------------------

export function buildCard({ title, markdown }) {
  return {
    schema: "2.0",
    header: { title: { tag: "plain_text", content: title } },
    body: { elements: [{ tag: "markdown", content: markdown }] },
  };
}

export function buildPayload({ title, markdown, timestamp, secret }) {
  return {
    timestamp: String(timestamp),
    sign: sign(timestamp, secret),
    msg_type: "interactive",
    card: buildCard({ title, markdown }),
  };
}

export function bytesOf(payload) {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

// The card title comes from the digest's own H1, so the message header cannot
// disagree with the body it carries and no clock is involved. The fallback
// exists for a hand-written fixture, not for a product the pipeline makes.
export function baseTitleFrom(markdown, mode) {
  const heading = markdown.match(/^#\s+(.+?)\s*$/m);
  if (heading) return heading[1];
  return mode === "weekly" ? "Agent Technology Radar — 周报" : "Agent Technology Radar — 日报";
}

// -- Title (D1) ---------------------------------------------------------------
// The digest opens with `# Agent Technology Radar — 日报 — 2026-09-29`, and the
// card's header renders that same string. Left in the body it appears twice: a
// heading directly under the header that says nothing new. So the H1 is lifted
// out of the body and only the header carries it.
export function stripLeadingTitle(markdown) {
  const match = markdown.match(/^(?:[ \t]*\n)*[ \t]*#[^#][^\n]*\n+/);
  return match ? markdown.slice(match[0].length) : markdown;
}

// -- Links (§8 "链接可点击") --------------------------------------------------
// The digest writes bare URLs (`- **Title** — rss:source · https://…`). The
// card's markdown element is documented as CommonMark-compatible, and CommonMark
// does NOT autolink a bare URL — it stays plain text. The element's own table
// documents `[文字](url)` as the hyperlink syntax, so every bare URL is wrapped
// in it on the way out. The link TEXT is the URL itself, matching what the doc
// shows a bare-URL hyperlink rendering as.
//
// Already-linked targets are left alone, as are `<…>` autolinks, so this is
// idempotent rather than doubling the wrappers on a second pass.
//
// `*` is excluded from the URL body on purpose. The digest's last line is
// `*Generated through the Follow Builders skill: https://…*`, where the closing
// `*` is the emphasis delimiter. Letting it into the match produces
// `[…radar*](…radar*)`: the link points at a URL that does not exist AND the
// italics lose their closer. A `*` inside a real URL is vanishingly rare next
// to that. `<`/`>`/`"` are excluded for the same reason — they close markup.
const BARE_URL_RE = /(?<!\]\()(?<!<)(https?:\/\/[^\s)*<>"]+)/g;

export function linkify(markdown) {
  return markdown.replace(BARE_URL_RE, (_match, url) => `[${url}](${url})`);
}

// -- Table degradation (§2) ---------------------------------------------------
// The card's markdown element DOES render tables, but its documented rule is
// "除标题行外，最多展示五行数据，超出五行将分页展示。不支持自定义。" The digest's
// radar table has nine data rows, so a real table would show five and paginate
// the rest — strictly less than the list below, which shows all nine.
// Decomposition happens on the way out only: digest-*.md stays standard
// Markdown (constraint 1 / gate G11).
//
// The header row supplies the labels rather than being dropped, so a row keeps
// meaning ("环=已确立") instead of becoming a bare number.

const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const SEPARATOR_CELL_RE = /^:?-{3,}:?$/;

function cells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(row) {
  return row.length > 0 && row.every((cell) => SEPARATOR_CELL_RE.test(cell));
}

function bulletFor(row, header) {
  const [first, ...rest] = row;
  const head = first ? `**${first}**` : "";
  if (!header || header.length < 2) {
    return `- ${row.join(" · ")}`.trimEnd();
  }
  const labelled = rest
    .map((cell, index) => {
      if (cell === "") return null;
      const label = header[index + 1];
      return label ? `${label}=${cell}` : cell;
    })
    .filter(Boolean);
  return `- ${head}${labelled.length ? `：${labelled.join(" · ")}` : ""}`;
}

export function degradeTables(markdown) {
  const lines = markdown.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!TABLE_ROW_RE.test(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const block = [];
    while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
      block.push(cells(lines[i]));
      i += 1;
    }
    // A header is only a header if a separator follows it; anything else is
    // just a one-line table, and guessing labels from it would invent meaning.
    const header = block.length > 1 && !isSeparatorRow(block[0]) ? block[0] : null;
    for (const row of block.slice(header ? 1 : 0)) {
      if (isSeparatorRow(row)) continue;
      out.push(bulletFor(row, header));
    }
  }
  return out.join("\n");
}

// -- Splitting (D3) -----------------------------------------------------------
// Cut at `## ` boundaries so a shard never splits a section. A single section
// larger than the budget falls back to line boundaries. A single LINE larger
// than the budget cannot be cut without corrupting it (a URL would break in
// half), so it goes out on its own and the hard limit below decides — a loud
// red beats a silently mutilated link.

const SHARD_WIDTH = " · 第 999/999 条";

function shardTitle(base, index, total) {
  return total > 1 ? `${base} · 第 ${index + 1}/${total} 条` : base;
}

function sectionAtoms(body) {
  return body.split(/\n(?=## )/);
}

function splitByLines(text, fits) {
  const chunks = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (current === null) {
      current = line;
      continue;
    }
    const candidate = `${current}\n${line}`;
    if (fits(candidate)) {
      current = candidate;
    } else {
      chunks.push(current);
      current = line;
    }
  }
  if (current !== null) chunks.push(current);
  return chunks;
}

function pack(atoms, fits) {
  const messages = [];
  let current = null;
  for (const atom of atoms) {
    if (current === null) {
      current = atom;
      continue;
    }
    const candidate = `${current}\n${atom}`;
    if (fits(candidate)) {
      current = candidate;
    } else {
      messages.push(current);
      current = atom;
    }
  }
  if (current !== null) messages.push(current);
  return messages.length ? messages : [""];
}

/**
 * Turn one digest into the list of payloads to post.
 *
 * Returns `{ body, messages, total }` where `body` is the digest after the
 * title is lifted out, tables are degraded and bare URLs are linked — the text
 * the shards must add back up to.
 */
export function planMessages({
  markdown,
  timestamp,
  secret,
  baseTitle,
  budgetBytes = SPLIT_THRESHOLD_BYTES,
}) {
  const body = linkify(degradeTables(stripLeadingTitle(markdown)));
  // Measured with the widest shard suffix any real run could produce, so the
  // budget holds once the true `k/N` is known — the titles are not known until
  // the packing is done, which is exactly the circularity this avoids.
  const fits = (text) =>
    bytesOf(buildPayload({ title: `${baseTitle}${SHARD_WIDTH}`, markdown: text, timestamp, secret })) <=
    budgetBytes;

  const atoms = sectionAtoms(body).flatMap((section) =>
    fits(section) ? [section] : splitByLines(section, fits),
  );
  const packed = pack(atoms, fits);

  const messages = packed.map((chunk, index) => {
    const payload = buildPayload({
      title: shardTitle(baseTitle, index, packed.length),
      markdown: chunk,
      timestamp,
      secret,
    });
    const bytes = bytesOf(payload);
    if (bytes >= MAX_PAYLOAD_BYTES) {
      throw new Error(
        `shard ${index + 1}/${packed.length} serialises to ${bytes} bytes, at or over Feishu's ` +
          `${MAX_PAYLOAD_BYTES}-byte limit — refusing to send a body the webhook will reject`,
      );
    }
    return { index, total: packed.length, payload, bytes, text: chunk };
  });

  return { body, messages, total: messages.length };
}
