#!/usr/bin/env node
// tinymem CLI — used by the slash commands, and handy on its own.
//   node lib/cli.mjs add "<text>" [--type fact] [--title "..."] [--tags a,b]
//   node lib/cli.mjs search "<query>"
//   node lib/cli.mjs list [n]
//   node lib/cli.mjs forget <id>
//   node lib/cli.mjs where
//   node lib/cli.mjs projects
import { remember, search, recent, forget, format, storePath, projects } from "./store.mjs";

const [, , cmd, ...rest] = process.argv;
const cwd = process.cwd();

const flag = (name, def = "") => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? def : rest[i + 1] ?? def;
};
const positional = () => {
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) { i++; continue; }
    out.push(rest[i]);
  }
  return out;
};

switch (cmd) {
  case "add": {
    const text = positional().join(" ");
    if (!text) { console.error("nothing to remember"); process.exit(1); }
    const r = remember({
      cwd,
      text,
      type: flag("type", "note"),
      title: flag("title", ""),
      tags: flag("tags", "").split(",").map((s) => s.trim()).filter(Boolean),
    });
    console.log(`stored ${r.id} [${r.type}] ${r.title || r.text.slice(0, 50)}`);
    break;
  }
  case "search": {
    const hits = search(cwd, positional().join(" "));
    console.log(hits.length ? format(hits) : "no matches");
    break;
  }
  case "list": {
    const n = Number(positional()[0] || 20);
    const hits = recent(cwd, n);
    console.log(hits.length ? format(hits) : "no memories for this project yet");
    break;
  }
  case "forget": {
    forget(cwd, positional()[0]);
    console.log("forgotten");
    break;
  }
  case "where":
    console.log(storePath(cwd));
    break;
  case "projects": {
    const p = [...projects().entries()].sort((a, b) => b[1] - a[1]);
    if (!p.length) { console.log("no memories stored yet"); break; }
    for (const [proj, n] of p) console.log(`${String(n).padStart(4)}  ${proj}`);
    break;
  }
  default:
    console.log("usage: add | search | list | forget | where | projects");
}
