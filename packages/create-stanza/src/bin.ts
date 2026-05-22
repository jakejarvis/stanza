#!/usr/bin/env node
import { run } from "stanza-cli";

import { version } from "../package.json" with { type: "json" };

// `pnpm create stanza my-app` forwards straight to the CLI's init command.
const argv = process.argv.slice(2);

// Injecting `init` means runMain never sees `-v` as the lone arg, so handle the
// version request here rather than launching the wizard.
if (argv.includes("-v") || argv.includes("--version")) {
  console.log(version);
} else {
  run(["init", ...argv]).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
