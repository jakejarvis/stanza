#!/usr/bin/env bun
import { run } from "@stanza/cli";
import mri from "mri";

/**
 * `pnpm create stanza my-app` lands here. We forward straight to the CLI's
 * init command — no extra logic, since the wizard wants to live in one place.
 *
 * The argv shape from npm's `create-` convention is the same as a normal CLI
 * invocation, with the project name as the first positional arg.
 */
const argv = mri(process.argv.slice(2), {
  alias: { h: "help", v: "version" },
  boolean: ["help", "version", "yes", "dry-run", "no-telemetry"],
});

// Inject the `init` verb so the user-facing command stays terse.
argv._ = ["init", ...argv._];

run(argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
