#!/usr/bin/env node
import mri from "mri";

import { run } from "./run";

const argv = mri(process.argv.slice(2), {
  alias: { h: "help", v: "version" },
  boolean: ["help", "version", "yes", "dry-run", "telemetry", "dangerously-allow-dirty"],
});

run(argv).catch((err: unknown) => {
  // Top-level catch — every command should handle its own errors, but this is
  // the safety net. We use process.exitCode rather than process.exit so any
  // outstanding async work (telemetry flush) can finish.
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
