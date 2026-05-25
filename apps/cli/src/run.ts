import { defineCommand, runMain } from "citty";

import { version } from "../package.json" with { type: "json" };
import { add } from "./commands/add";
import { init } from "./commands/init";
import { list } from "./commands/list";
import { remove } from "./commands/remove";
import { search } from "./commands/search";
import * as telemetry from "./lib/telemetry";

let startedAt = 0;

const main = defineCommand({
  meta: {
    name: "stanza",
    version,
    description:
      "Modular monorepo scaffolding CLI.\n\n" +
      "Examples\n" +
      "  stanza init my-app --yes --framework=next --orm=drizzle --db=postgres --testing=vitest,playwright\n" +
      "  stanza add auth better-auth\n" +
      "  stanza add testing vitest\n" +
      "  stanza remove testing vitest\n" +
      "  stanza remove payments\n\n" +
      "Docs: https://stanza.tools",
  },
  subCommands: { init, add, remove, list, search },
  setup({ rawArgs }) {
    const command = rawArgs.find((arg) => !arg.startsWith("-"));
    // No verb (bare `stanza`/help/version): leave telemetry unconfigured so
    // cleanup's capture/flush no-op.
    if (!command) return;
    startedAt = Date.now();
    telemetry.configure({
      command,
      version,
      disabled: telemetry.isTelemetryDisabled(rawArgs),
    });
  },
  // citty awaits cleanup before runMain's process.exit, so the flush lands. It
  // can't see the run error, so only handled errors (process.exitCode) read as
  // failure; thrown ones record as success.
  async cleanup() {
    const status = process.exitCode ? "failure" : "success";
    telemetry.capture("cli_command", { status, duration_ms: Date.now() - startedAt });
    await telemetry.flush();
  },
});

export function run(rawArgs: string[] = process.argv.slice(2)): Promise<void> {
  return runMain(main, { rawArgs });
}
