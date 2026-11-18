# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-11-18

First public release.

### Added
- `SessionStart` hook that injects a project's stored memories into each new session.
- `Stop` hook that summarises the finished session into 0–5 durable memories
  via headless `claude -p`, deduplicated against what is already stored.
- JSONL store, one file per project, under `~/.tinymem/`.
- `/remember`, `/recall` and `/memory-import` slash commands.
- `lib/cli.mjs`: `add`, `search`, `list`, `forget`, `projects`, `where`.
- `lib/import.mjs`: streaming, resumable backfill from existing Claude Code
  transcripts. Bounded memory, so multi-hundred-megabyte files import safely.
- `test/smoke.mjs`: 19 dependency-free assertions.
- CI across Linux, macOS and Windows on Node 18, 20 and 22.

### Fixed during development
- Windows path spellings (`C:\Foo` vs `c:/foo/`) hashed to different projects,
  so the hook and the CLI wrote to separate store files.
- Node refuses to spawn `.cmd` directly; the Windows `claude` call now goes
  through the shell as a single command string, avoiding the deprecated
  `shell: true` with an args array.
- `--bare` authenticates only via `ANTHROPIC_API_KEY`, so it silently broke
  capture on subscription logins. It is now added only when that key is present.
- The importer read the project path from the transcript's directory name, which
  is wrong for relocated sessions; it now reads `cwd` from the entries.
- The `SessionStart` hook crashed on malformed stdin instead of degrading to
  "no memories".

[1.0.0]: https://github.com/varun642002/tinymem/releases/tag/v1.0.0
