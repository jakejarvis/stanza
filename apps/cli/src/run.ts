import { defineCommand, runMain } from "citty";

import { version } from "../package.json" with { type: "json" };
import { add } from "./commands/add";
import { doctor } from "./commands/doctor";
import { init } from "./commands/init";
import { list } from "./commands/list";
import { remove } from "./commands/remove";
import { search } from "./commands/search";
import * as telemetry from "./lib/telemetry";

let startedAt = 0;

const KNOWN_COMMANDS = new Set(["init", "add", "remove", "list", "search", "doctor"]);

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
  subCommands: { init, add, remove, list, search, doctor },
  setup({ rawArgs }) {
    const raw = rawArgs.find((arg) => !arg.startsWith("-"));
    // No verb (bare `stanza`/help/version): leave telemetry unconfigured so
    // cleanup's capture/flush no-op. Bucket against the known subcommand
    // set so a typo like `stanza ohno` doesn't pollute the `command` tag.
    if (!raw) return;
    const command = KNOWN_COMMANDS.has(raw) ? raw : "unknown";
    startedAt = Date.now();
    telemetry.configure({
      command,
      version,
      disabled: telemetry.isTelemetryDisabled(rawArgs),
    });
    installInterruptHandler(command);
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

let interruptHandlerInstalled = false;

// Print a recovery hint on Ctrl-C so users aren't left wondering why
// re-running init dies with "Directory already exists" — without this,
// the process tears down silently mid-applyModule and leaves a half-
// bootstrapped tree behind.
function installInterruptHandler(command: string): void {
  if (interruptHandlerInstalled) return;
  interruptHandlerInstalled = true;
  process.on("SIGINT", () => {
    process.stderr.write("\nInterrupted.\n");
    if (command === "init") {
      process.stderr.write(
        "If a project directory was created, delete it manually before retrying.\n",
      );
    } else if (command === "add" || command === "remove") {
      process.stderr.write(
        `\`stanza ${command}\` may have left partial changes — review \`git status\` before continuing.\n`,
      );
    }
    process.exit(130);
  });
}
