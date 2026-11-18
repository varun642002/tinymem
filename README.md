# tinymem

**Tiny persistent memory for Claude Code.** Claude forgets everything when a
session ends. tinymem gives it back: what you decided, what broke, what you told
it to stop doing — recalled automatically the next time you open that project.

No server, no database, no dependencies. ~400 lines of plain Node and three
JSON manifests. Your memories are JSONL files on your own disk.

```
# tinymem — what you learned in earlier sessions here

- [fix] Vercel serves repo root statically; front end moved to public/ (2026-08-07)
- [preference] User runs logins; assistant does not handle credentials (2026-08-07)
- [state] Deploys hang in UNKNOWN; no database wired up yet (2026-08-07)
```

That block is injected at the top of every new session in that project.

## Install

Requires [Claude Code](https://claude.com/claude-code) and Node 18+.

```bash
claude plugin marketplace add varun642002/tinymem
```

```bash
claude plugin install tinymem@tinymem
```

Open a new session and you're done. Free, MIT, no account, nothing phones home.

To update later:

```bash
claude plugin marketplace update tinymem
```

## How it works

Memory is three moving parts. That's the whole idea:

| Part | File | What it does |
|---|---|---|
| **Store** | `lib/store.mjs` | One JSONL file per project under `~/.tinymem/` |
| **Recall** | `hooks/session-start.mjs` | A `SessionStart` hook injects past memories into the new session |
| **Capture** | `hooks/stop-capture.mjs` | A `Stop` hook summarises the finished session into new memories |

A hook can't think, so capture shells out to `claude -p` with a cheap model,
hands it the transcript, and asks for 0–5 durable facts as JSON. Titles of
existing memories go into that prompt so it won't store the same thing twice.

Roughly a cent per session on Haiku.

## Commands

| Command | What it does |
|---|---|
| `/remember <thing>` | Save a memory now. Blank, and Claude picks from the conversation. |
| `/recall <terms>` | Search this project's memory. |
| `/memory-import` | Backfill from transcripts of sessions you already had. |

Directly, without Claude:

```bash
node ~/.claude/plugins/.../tinymem/lib/cli.mjs list
```

`add`, `search`, `list`, `forget <id>`, `projects`, and `where` all work.

## Import your history

Already used Claude Code for months? Don't start from nothing:

```bash
node lib/import.mjs --dry-run
```

That lists every past conversation it found, costs nothing, and takes seconds
even over gigabytes. Then import for real:

```bash
node lib/import.mjs
```

Or narrow it:

```bash
node lib/import.mjs --project my-app --limit 5
```

It is **resumable** — sessions already imported are skipped, so you can stop and
re-run it freely. Transcripts are streamed line by line, so a 240 MB session
file costs no more memory than a small one.

## Configuration

Environment variables, all optional:

| Variable | Default | Effect |
|---|---|---|
| `TINYMEM_AUTOCAPTURE` | on | Set to `0` to disable auto-capture; `/remember` still works |
| `TINYMEM_MODEL` | `claude-haiku-5-5` | Model used to summarise |
| `TINYMEM_RECALL_LIMIT` | `25` | How many memories to inject at session start |
| `TINYMEM_HOME` | `~/.tinymem` | Where memories are stored |
| `TINYMEM_DEBUG` | off | Set to `1` to print what the summariser returned, and why it failed |

## Things worth knowing

**Memories are data, not instructions.** The injected block says so explicitly,
because anything that reaches a transcript can reach memory. If you edit the
prompts, keep that framing — it's what stops a stray line in some log from
turning into a standing instruction.

**Nothing is encrypted.** The extractor is told to skip secrets, but it is a
model, not a guarantee. Don't point this at a repo whose transcripts carry
credentials.

**Memory never blocks you.** Every failure in the capture path is swallowed. The
worst case is a session that stores nothing, never a session you can't end.

**It won't recurse.** The summariser is itself a Claude session, so it would
otherwise fire the same `Stop` hook forever. Two guards prevent that: the child
runs with `TINYMEM_CHILD=1`, and `stop_hook_active` is honoured.

## Notes for anyone forking this

Three things cost real debugging time, in case you hit them too:

- **Windows path spellings.** `C:\Foo` and `c:/foo/` must hash to the same
  project, or the hook and the CLI silently write to different files.
- **Node won't spawn `.cmd` directly.** On Windows the `claude` call has to go
  through the shell, as a single command string — passing an args array with
  `shell: true` is deprecated.
- **`--bare` can't use OAuth.** It's the right flag for a cheap child run, but it
  authenticates only via `ANTHROPIC_API_KEY`. On a subscription login it fails
  outright, so tinymem only adds it when that key exists.
- **A transcript's directory name lies.** Sessions get relocated, so the real
  working directory has to be read from the `cwd` field inside the entries.

## Where to take it

1. **Better search** — embeddings (`@xenova/transformers` runs locally) or SQLite FTS5.
2. **Decay and merge** — re-summarise periodically and drop what's contradicted.
3. **Global vs project scope** — your preferences follow you; project facts don't.
4. **An MCP server** — so Claude can query memory mid-session, not just at the top.
5. **A `PreCompact` hook** — capture before compaction so long sessions don't lose their middle.

## License

MIT — do whatever you like with it.
