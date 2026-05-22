import * as p from "@clack/prompts";
import { categoryOrder, isMulti, selectedAll } from "@stanza/registry";
import { defineCommand } from "citty";
import pc from "picocolors";

import { findProjectRoot, readManifest } from "../lib/manifest";
import { commonArgs } from "./_args";

export const list = defineCommand({
  meta: { name: "list", description: "List installed modules." },
  args: { ...commonArgs },
  run: () => cmdList(),
});

export async function cmdList(): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    p.log.error("No stanza.json found.");
    process.exitCode = 1;
    return;
  }
  const manifest = readManifest(projectRoot);

  const rows: string[] = [];
  for (const category of categoryOrder) {
    const records = selectedAll(manifest, category);
    if (records.length === 0) {
      // Show single-choice categories as empty; multi-choice ones stay hidden.
      if (!isMulti(category)) rows.push(`${pc.cyan(category.padEnd(10))} ${pc.dim("(empty)")}`);
      continue;
    }
    for (const m of records) {
      rows.push(
        `${pc.cyan(category.padEnd(10))} ${m.id} ${pc.dim(`@${m.version}`)} ${pc.dim(`[${m.adapter}]`)}`,
      );
    }
  }

  console.log(rows.join("\n"));
}
