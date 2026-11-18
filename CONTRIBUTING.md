# Contributing to tinymem

Thanks for taking a look. 🙏

## The one rule

**tinymem has no dependencies, and that is a feature.** It runs anywhere Node
runs, installs instantly, and can't rot because a transitive package broke.

A PR that adds a dependency isn't an automatic no — but it has to buy something
real, and say so in the description.

## Getting set up

```bash
git clone https://github.com/varun642002/tinymem
```

```bash
cd tinymem && node test/smoke.mjs
```

That's the whole setup. There is no build step.

Try your copy in a live session without installing it:

```bash
claude --plugin-dir /path/to/tinymem
```

## Before you open a PR

```bash
node test/smoke.mjs
```

Tests use `TINYMEM_HOME` pointed at a temp directory, so they never touch your
real memories. Add a case for anything you fix — `test/smoke.mjs` is plain Node,
no framework.

Also check your scripts parse:

```bash
for f in lib/*.mjs hooks/*.mjs; do node --check "$f"; done
```

CI runs both on Linux, macOS and Windows against Node 18, 20 and 22.

## Things that are easy to get wrong

These already cost someone a debugging session. The README's "Notes for anyone
forking this" has the full list, but in short:

1. **Windows paths** — `C:\Foo` and `c:/foo/` must resolve to the same store file.
2. **Spawning `claude` on Windows** — `.cmd` needs the shell, as one string.
3. **`--bare` and OAuth** — it only authenticates via `ANTHROPIC_API_KEY`.
4. **Transcript directory names lie** — read `cwd` from inside the entries.

## Hooks must never break a session

Anything in `hooks/` runs in the user's critical path. If it throws, their
session start or stop is disrupted. Every failure path there is swallowed on
purpose — please keep it that way, and put diagnostics behind `TINYMEM_DEBUG`.

## Memories are untrusted data

Transcript content flows into memory, and memory flows back into context. The
injected block states that it's background data rather than instructions. If you
touch the prompts or the injection, preserve that framing.

## Style

Match what's there: ES modules, 2-space indent, double quotes, and comments that
explain *why* rather than restating the code.
