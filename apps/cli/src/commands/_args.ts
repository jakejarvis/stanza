import type { ArgsDef } from "citty";

// citty doesn't merge a parent command's args into subcommands, so these are
// spread into each subcommand's `args`.
export const commonArgs = {
  "dry-run": {
    type: "boolean",
    default: false,
    description: "Print the actions that would be taken; write nothing.",
  },
  "dangerously-allow-dirty": {
    type: "boolean",
    default: false,
    description: "Allow mutating commands to run with a dirty git working tree.",
  },
  telemetry: {
    type: "boolean",
    default: true,
    description:
      "Disable with --no-telemetry (also honors STANZA_TELEMETRY/DO_NOT_TRACK and skips CI).",
  },
} satisfies ArgsDef;

// Open record (not a per-command literal type) because handlers index
// dynamically by slot/add-on id.
export type CliArgs = Record<string, unknown> & { _: (string | number)[] };
