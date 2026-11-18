#!/usr/bin/env node
// Backfill tinymem from Claude Code's existing transcripts.
//
//   node lib/import.mjs --dry-run         # list what would be imported
//   node lib/import.mjs                   # import everything not yet imported
//   node lib/import.mjs --project erp     # only projects whose path matches
//   node lib/import.mjs --limit 5
//
// Transcripts can be hundreds of megabytes, so every file is STREAMED and only
// a bounded head+tail of the conversation is kept in memory.
import { homedir } from "node:os";
import { join } from "node:path";
import { createReadStream, existsSync, statSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { remember, recent, importedSessions, canonical } from "./store.mjs";
import { buildPrompt, runModel, parseRecords } from "./summarise.mjs";

const PROJECTS = process.env.TINYMEM_PROJECTS || join(homedir(), ".claude", "projects");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};

const DRY = has("--dry-run");
const FILTER = (val("--project", "") || "").toLowerCase();
const LIMIT = Number(val("--limit", "0")) || Infinity;
const HEAD_TURNS = 8;
const TAIL_TURNS = 40;
const MAX_CHARS = 24_000;

/** Every real conversation transcript: no subagent, workflow or observer files. */
function findTranscripts() {
  const out = [];
  if (!existsSync(PROJECTS)) return out;
  for (const dir of readdirSync(PROJECTS)) {
    const d = join(PROJECTS, dir);
    let st;
    try {
      st = statSync(d);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (dir.includes("claude-mem-observer-sessions")) continue;
    // Only files directly in the project dir — nested dirs are subagents/workflows.
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(d, f);
      try {
        if (statSync(p).isFile()) out.push(p);
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

/** Stream one transcript, returning a bounded summary of the conversation. */
async function readTranscript(file) {
  const head = [];
  const tail = [];
  const cwdCount = new Map();
  let sessionId = "";
  let firstTs = "";
  let lastTs = "";
  let turns = 0;

  const rl = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.sessionId && !sessionId) sessionId = e.sessionId;
    // The encoded directory name is NOT reliable — a session can be relocated.
    // The cwd recorded on entries is the truth, so take the most common one.
    if (e.cwd) cwdCount.set(e.cwd, (cwdCount.get(e.cwd) || 0) + 1);

    if (e.isSidechain) continue; // subagent chatter, not the conversation
    if (e.type !== "user" && e.type !== "assistant") continue;
    const role = e.message && e.message.role;
    if (!role) continue;

    const text = textOf(e.message.content).trim();
    if (!text) continue;
    if (text.startsWith("<system-reminder>") || text.startsWith("Caveat:")) continue;

    if (e.timestamp) {
      if (!firstTs) firstTs = e.timestamp;
      lastTs = e.timestamp;
    }

    const entry = `${role.toUpperCase()}: ${text.slice(0, 1500)}`;
    turns++;
    if (head.length < HEAD_TURNS) head.push(entry);
    else {
      tail.push(entry);
      if (tail.length > TAIL_TURNS) tail.shift();
    }
  }
  rl.close();

  let cwd = "";
  let best = -1;
  for (const [k, v] of cwdCount) if (v > best) ((best = v), (cwd = k));

  let convo = [...head, ...(tail.length ? ["…"] : []), ...tail].join("\n\n");
  if (convo.length > MAX_CHARS) convo = convo.slice(0, 4000) + "\n…\n" + convo.slice(-(MAX_CHARS - 4000));

  return { sessionId, cwd, convo, turns, firstTs, lastTs };
}

const files = findTranscripts();
const done = importedSessions();

console.log(`found ${files.length} transcript(s) in ${PROJECTS}`);

let imported = 0;
let skipped = 0;
let stored = 0;

for (const file of files) {
  if (imported >= LIMIT) break;

  let t;
  try {
    t = await readTranscript(file);
  } catch (e) {
    console.log(`  ! unreadable ${file}: ${e.message}`);
    continue;
  }

  if (!t.cwd || t.turns < 4) {
    skipped++;
    continue;
  }
  if (FILTER && !canonical(t.cwd).includes(FILTER)) {
    skipped++;
    continue;
  }
  if (t.sessionId && done.has(t.sessionId)) {
    skipped++;
    continue;
  }

  const mb = (statSync(file).size / 1048576).toFixed(1);
  const when = (t.firstTs || "").slice(0, 10);
  console.log(`\n→ ${t.cwd}\n  ${when}, ${t.turns} turns, ${mb} MB`);

  if (DRY) {
    imported++;
    continue;
  }

  const known = recent(t.cwd, 30)
    .map((r) => `- ${r.title || r.text.slice(0, 60)}`)
    .join("\n");

  let out;
  try {
    out = runModel(buildPrompt({ cwd: t.cwd, convo: t.convo, known, when }));
  } catch (e) {
    console.log(`  ! summariser failed: ${e.message}`);
    continue;
  }

  const records = parseRecords(out);
  for (const r of records) {
    remember({
      cwd: t.cwd,
      type: r.type || "note",
      title: (r.title || "").slice(0, 60),
      text: r.text.trim(),
      tags: Array.isArray(r.tags) ? r.tags.slice(0, 5) : [],
      session: t.sessionId,
      ts: t.lastTs || new Date().toISOString(),
    });
    console.log(`  + [${r.type}] ${r.title}`);
    stored++;
  }
  if (!records.length) {
    // Record the session anyway so a re-run does not pay for it again.
    remember({
      cwd: t.cwd,
      type: "note",
      title: "(no durable facts in this session)",
      text: `Session on ${when} held nothing worth remembering.`,
      tags: ["empty"],
      session: t.sessionId,
      ts: t.lastTs || new Date().toISOString(),
    });
    console.log("  · nothing worth keeping");
  }
  imported++;
}

console.log(
  `\ndone — ${imported} session(s) processed, ${stored} memor${stored === 1 ? "y" : "ies"} stored, ${skipped} skipped`
);
