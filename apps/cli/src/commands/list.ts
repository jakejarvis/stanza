import * as p from "@clack/prompts";
import { categoryOrder } from "@withstanza/registry";
import { DEFAULT_NAMESPACE, isMulti, selectedAll } from "@withstanza/schema";
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
      // Show the namespace prefix only for third-party records; first-party
      // (`@stanza`, or absent) keeps the listing terse.
      const nsTag = m.namespace && m.namespace !== DEFAULT_NAMESPACE ? `${m.namespace}/` : "";
      rows.push(
        `${pc.cyan(category.padEnd(10))} ${nsTag}${m.id} ${pc.dim(`@${m.version}`)} ${pc.dim(`[${m.adapter}]`)}`,
      );
    }
  }

  console.log(rows.join("\n"));
}
