import kleur from "kleur";
import type { Argv } from "mri";

import { cmdAdd } from "./commands/add";
import { cmdInit } from "./commands/init";
import { cmdList } from "./commands/list";
import { cmdRemove } from "./commands/remove";
import { cmdSearch } from "./commands/search";

const VERSION = "0.1.0";

const HELP = `${kleur.bold("stanza")} — modular monorepo template CLI

${kleur.bold("Usage")}
  stanza <command> [options]

${kleur.bold("Commands")}
  init [name]                  Scaffold a new monorepo via the interactive wizard.
  add <slot> <module>          Add a module to the current project.
  remove <slot>                Remove the module currently filling a slot.
  list                         List installed modules.
  search [query]               Search the registry.

${kleur.bold("Options")}
  -h, --help                   Show this help.
  -v, --version                Print the CLI version.
  --yes                        Accept all defaults; suppress prompts.
  --dry-run                    Print the actions that would be taken; write nothing.
  --no-telemetry               Disable telemetry for this invocation.

${kleur.dim("Docs: https://stanza.dev")}
`;

export async function run(argv: Argv): Promise<void> {
  if (argv.version) {
    console.log(VERSION);
    return;
  }

  const [command, ...rest] = argv._;
  if (!command || argv.help) {
    console.log(HELP);
    return;
  }

  switch (command) {
    case "init":
      await cmdInit({ name: rest[0], argv });
      return;
    case "add":
      await cmdAdd({ slot: rest[0], moduleId: rest[1], argv });
      return;
    case "remove":
      await cmdRemove({ slot: rest[0], argv });
      return;
    case "list":
      await cmdList({ argv });
      return;
    case "search":
      await cmdSearch({ query: rest.join(" "), argv });
      return;
    default:
      console.error(kleur.red(`Unknown command: ${command}`));
      console.error(HELP);
      process.exitCode = 1;
  }
}
