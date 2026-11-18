// tinymem storage: one JSONL file per project, under ~/.tinymem/
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";

export const ROOT = process.env.TINYMEM_HOME || join(homedir(), ".tinymem");

/**
 * Canonical form of a path, so C:\Foo\ and c:/foo are the same project.
 * (Windows hands us both spellings depending on who invoked us.)
 */
export function canonical(cwd) {
  return String(cwd || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Stable, readable filename for a project directory. */
export function projectSlug(cwd) {
  const c = canonical(cwd);
  const name = (basename(c) || "root").replace(/[^a-z0-9._-]/g, "-");
  const hash = createHash("sha1").update(c).digest("hex").slice(0, 8);
  return `${name}-${hash}`;
}

export function storePath(cwd) {
  mkdirSync(ROOT, { recursive: true });
  return join(ROOT, `${projectSlug(cwd)}.jsonl`);
}

/**
 * Append one memory.
 * @param {{cwd:string, text:string, type?:string, title?:string, tags?:string[], session?:string, ts?:string}} m
 */
export function remember({
  cwd,
  text,
  type = "note",
  title = "",
  tags = [],
  session = "",
  ts = new Date().toISOString(),
}) {
  const rec = {
    id: createHash("sha1").update(`${Date.now()}${Math.random()}${text}`).digest("hex").slice(0, 12),
    ts,
    project: cwd,
    type, // decision | fix | preference | fact | state | note
    title,
    text,
    tags,
    session,
  };
  appendFileSync(storePath(cwd), JSON.stringify(rec) + "\n", "utf8");
  return rec;
}

export function all(cwd) {
  const p = storePath(cwd);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Most recent N, oldest first so they read chronologically. */
export function recent(cwd, n = 25) {
  return all(cwd)
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-n);
}

/** Naive keyword scoring — no dependencies, good enough to be useful. */
export function search(cwd, query, n = 10) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return recent(cwd, n);
  return all(cwd)
    .map((r) => {
      const hay = `${r.title} ${r.text} ${(r.tags || []).join(" ")} ${r.type}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.ts.localeCompare(b.r.ts))
    .slice(0, n)
    .map((x) => x.r);
}

export function forget(cwd, id) {
  const kept = all(cwd).filter((r) => r.id !== id);
  writeFileSync(storePath(cwd), kept.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

/** Every session id already recorded anywhere — used to make import resumable. */
export function importedSessions() {
  mkdirSync(ROOT, { recursive: true });
  const seen = new Set();
  for (const f of readdirSync(ROOT)) {
    if (!f.endsWith(".jsonl")) continue;
    for (const line of readFileSync(join(ROOT, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const s = JSON.parse(line).session;
        if (s) seen.add(s);
      } catch {
        /* ignore malformed line */
      }
    }
  }
  return seen;
}

export function projects() {
  mkdirSync(ROOT, { recursive: true });
  const out = new Map();
  for (const f of readdirSync(ROOT)) {
    if (!f.endsWith(".jsonl")) continue;
    for (const line of readFileSync(join(ROOT, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        out.set(r.project, (out.get(r.project) || 0) + 1);
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

export function format(records) {
  return records
    .map((r) => {
      const day = (r.ts || "").slice(0, 10);
      const head = r.title || r.text.split("\n")[0].slice(0, 60);
      return `- [${r.type}] ${head} (${day}, id:${r.id})\n  ${r.text.replace(/\n/g, "\n  ")}`;
    })
    .join("\n");
}
