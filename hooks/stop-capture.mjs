#!/usr/bin/env node
// Stop hook: summarise the session just finished into durable memories.
// Set TINYMEM_AUTOCAPTURE=0 to disable and rely on /remember instead.
import { readFileSync, existsSync } from "node:fs";
import { remember, recent } from "../lib/store.mjs";
import { buildPrompt, runModel, parseRecords } from "../lib/summarise.mjs";

const DEBUG = process.env.TINYMEM_DEBUG === "1";

// Loop guards: the summariser is itself a Claude session and would otherwise
// trigger this very hook again.
if (process.env.TINYMEM_CHILD === "1") process.exit(0);
if (process.env.TINYMEM_AUTOCAPTURE === "0") process.exit(0);

const input = JSON.parse((await readStdin()) || "{}");
if (input.stop_hook_active) process.exit(0);

const cwd = input.cwd || process.cwd();
const transcript = input.transcript_path;
if (!transcript || !existsSync(transcript)) process.exit(0);

// Condense the transcript to just the conversation, newest turns last.
const turns = [];
for (const line of readFileSync(transcript, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  if (e.isSidechain) continue;
  const msg = e.message;
  if (!msg || !msg.role) continue;
  const text = Array.isArray(msg.content)
    ? msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
    : typeof msg.content === "string"
      ? msg.content
      : "";
  const t = text.trim();
  if (!t || t.startsWith("<system-reminder>")) continue;
  turns.push(`${msg.role.toUpperCase()}: ${t.slice(0, 2000)}`);
}
if (turns.length < 4) process.exit(0);

const convo = turns.slice(-40).join("\n\n").slice(-24000);
const known = recent(cwd, 30)
  .map((r) => `- ${r.title || r.text.slice(0, 60)}`)
  .join("\n");

let out;
try {
  out = runModel(buildPrompt({ cwd, convo, known }), { timeout: 90_000 });
} catch (e) {
  // Memory must never block the user's session.
  if (DEBUG) process.stderr.write(`tinymem: summariser failed: ${e.message}\n`);
  process.exit(0);
}
if (DEBUG) process.stderr.write(`tinymem: model said: ${out}\n`);

let n = 0;
for (const r of parseRecords(out)) {
  remember({
    cwd,
    type: r.type || "note",
    title: (r.title || "").slice(0, 60),
    text: r.text.trim(),
    tags: Array.isArray(r.tags) ? r.tags.slice(0, 5) : [],
    session: input.session_id || "",
  });
  n++;
}
if (n) process.stderr.write(`tinymem: stored ${n} memor${n === 1 ? "y" : "ies"}\n`);

function readStdin() {
  return new Promise((res) => {
    let d = "";
    if (process.stdin.isTTY) return res("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => res(d));
  });
}
