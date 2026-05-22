#!/usr/bin/env node
import { run } from "./run";

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
