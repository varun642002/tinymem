---
description: Save something to this project's memory
allowed-tools: Bash(node:*)
argument-hint: [what to remember — or leave blank to let Claude choose]
---

Save a durable memory for this project.

If `$ARGUMENTS` is non-empty, store that. Otherwise pick the one or two most
useful durable facts from this conversation — a decision and its reason, a
correction the user gave you, a non-obvious constraint, or the state of ongoing
work. Skip anything obvious from the code or git history. Never store secrets.

Store each with:

```
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" add "<text>" --type <decision|fix|preference|fact|state> --title "<short title>" --tags "<a,b>"
```

Then confirm in one line what you saved.
