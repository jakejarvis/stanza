---
"stanza-cli": minor
---

`stanza add <category>` no longer requires a module id. Omit it and, on a TTY, `add` opens an interactive picker of that category's modules — modules that aren't compatible yet (a peer isn't installed) or are already installed render disabled with the reason shown inline. Off a TTY (CI, piped input) it lists the available ids and exits instead of hanging. Typing an id that doesn't exist now drops a TTY user into the same picker rather than failing with an opaque "module not found".

`stanza remove <category>` mirrors this for multi-choice categories: omitting the id on a TTY opens a picker over the installed records (it still errors with the installed list off a TTY).
