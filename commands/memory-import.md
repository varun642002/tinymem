---
description: Backfill memory from your existing Claude Code transcripts
allowed-tools: Bash(node:*)
argument-hint: [--dry-run | --project <name> | --limit <n>]
---

Backfill tinymem from Claude Code's past transcripts.

Each session costs one small model call, so start with a dry run unless the user
already asked for the real thing.

!`node "${CLAUDE_PLUGIN_ROOT}/lib/import.mjs" $ARGUMENTS`

Report what was imported, grouped by project. If this was a dry run, say what a
real run would cost in rough terms and offer to run it.
