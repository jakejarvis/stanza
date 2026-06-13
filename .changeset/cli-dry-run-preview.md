---
"stanza-cli": minor
---

`stanza add --dry-run` now prints a grouped plan of every file it would create, modify, or skip — including the source files its codemods would edit and the reason for any skip (e.g. a dependency you already pin higher) — instead of just "no files were written". A real `add` prints the same created/modified/skipped tally as a one-line summary when it finishes.

To enumerate codemod edits accurately, a dry run now reads your source files, so it can surface blockers (like a missing root layout) before a real apply. It still writes nothing.
