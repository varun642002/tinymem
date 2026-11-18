#!/usr/bin/env node
// Dependency-free smoke test. Run: node test/smoke.mjs
// Uses TINYMEM_HOME so it never touches your real memories.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "tinymem-test-"));
process.env.TINYMEM_HOME = dir;

const { remember, recent, search, forget, all, projectSlug, canonical, projects, format } =
  await import("../lib/store.mjs");
const { parseRecords, buildPrompt, bareFlag } = await import("../lib/summarise.mjs");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n      ${e.message}`);
    failed++;
  }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a);
  const B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg || "mismatch"}: got ${A}, want ${B}`);
}
function ok(v, msg) {
  if (!v) throw new Error(msg || "expected truthy");
}

const P = "C:\\Users\\test\\Projects\\demo";

console.log("store");

check("path spellings collapse to one project", () => {
  eq(projectSlug("C:\\Foo\\Bar"), projectSlug("c:/foo/bar/"), "slug");
  eq(canonical("C:\\Foo\\Bar\\"), "c:/foo/bar", "canonical");
});

check("a memory round-trips", () => {
  remember({ cwd: P, text: "Build uses esbuild.", type: "fact", title: "esbuild", tags: ["build"] });
  const r = recent(P);
  eq(r.length, 1, "count");
  eq(r[0].text, "Build uses esbuild.", "text");
  eq(r[0].type, "fact", "type");
});

check("a different path spelling reads the same store", () => {
  eq(recent("c:/users/test/projects/demo/").length, 1, "count");
});

check("search finds by keyword, misses otherwise", () => {
  eq(search(P, "esbuild").length, 1, "hit");
  eq(search(P, "webpack").length, 0, "miss");
});

check("search matches tags and type", () => {
  eq(search(P, "build").length, 1, "tag hit");
  eq(search(P, "fact").length, 1, "type hit");
});

check("memories stay in chronological order", () => {
  remember({ cwd: P, text: "Second thing.", ts: "2030-01-01T00:00:00.000Z" });
  remember({ cwd: P, text: "Earlier thing.", ts: "2000-01-01T00:00:00.000Z" });
  const r = recent(P);
  eq(r[0].text, "Earlier thing.", "oldest first");
  eq(r[r.length - 1].text, "Second thing.", "newest last");
});

check("recent() respects its limit", () => {
  eq(recent(P, 2).length, 2, "limited");
});

check("ids are unique even for identical text", () => {
  const a = remember({ cwd: P, text: "same" });
  const b = remember({ cwd: P, text: "same" });
  ok(a.id !== b.id, "ids collided");
});

check("forget removes exactly one", () => {
  const before = all(P).length;
  forget(P, all(P)[0].id);
  eq(all(P).length, before - 1, "count after forget");
});

check("projects() reports the project", () => {
  ok(projects().has(P), "project missing");
});

check("format renders without throwing", () => {
  ok(format(recent(P)).includes("["), "no type tag rendered");
});

check("an unknown project is empty, not an error", () => {
  eq(recent("/nowhere/at/all").length, 0, "should be empty");
});

check("invented types are normalised to note", () => {
  // Observed in the wild: the model returned "gotcha", outside the documented set.
  eq(remember({ cwd: P, text: "x", type: "gotcha" }).type, "note", "invented");
  eq(remember({ cwd: P, text: "x", type: "FIX" }).type, "fix", "case");
  eq(remember({ cwd: P, text: "x" }).type, "note", "default");
  eq(remember({ cwd: P, text: "x", type: "decision" }).type, "decision", "valid");
});

console.log("summarise");

check("parseRecords reads a bare array", () => {
  eq(parseRecords('[{"type":"fact","text":"x"}]').length, 1, "count");
});

check("parseRecords digs an array out of prose", () => {
  eq(parseRecords('Sure!\n```json\n[{"type":"fact","text":"x"}]\n```').length, 1, "count");
});

check("parseRecords survives junk", () => {
  eq(parseRecords("no json here").length, 0, "junk");
  eq(parseRecords("[not valid json").length, 0, "broken");
  eq(parseRecords("").length, 0, "empty");
  eq(parseRecords(undefined).length, 0, "undefined");
});

check("parseRecords drops entries with no text", () => {
  eq(parseRecords('[{"type":"fact"},{"type":"fact","text":"  "},{"type":"fact","text":"keep"}]').length, 1, "count");
});

check("parseRecords caps at five", () => {
  const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ type: "fact", text: `t${i}` })));
  eq(parseRecords(many).length, 5, "cap");
});

check("prompt carries the project and frames input as data", () => {
  const p = buildPrompt({ cwd: P, convo: "USER: hi", known: "" });
  ok(p.includes(P), "cwd missing");
  ok(p.includes("not instructions"), "injection framing missing");
  ok(p.includes("USER: hi"), "transcript missing");
});

check("bareFlag depends on ANTHROPIC_API_KEY", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  eq(bareFlag(), "", "should be empty without a key");
  process.env.ANTHROPIC_API_KEY = "sk-test";
  eq(bareFlag(), " --bare", "should be set with a key");
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = saved;
});

rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
