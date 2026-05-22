import * as p from "@clack/prompts";
import { addonOrder, slotOrder, type SlotId } from "@stanza/registry";
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

  const rows = slotOrder.map((slot: SlotId) => {
    const m = manifest.modules[slot];
    return m
      ? `${pc.cyan(slot.padEnd(10))} ${m.id} ${pc.dim(`@${m.version}`)} ${pc.dim(`[${m.adapter}]`)}`
      : `${pc.cyan(slot.padEnd(10))} ${pc.dim("(empty)")}`;
  });

  // Add-on rows after the slots — a category can list several.
  for (const category of addonOrder) {
    for (const m of manifest.addons[category] ?? []) {
      rows.push(
        `${pc.cyan(category.padEnd(10))} ${m.id} ${pc.dim(`@${m.version}`)} ${pc.dim(`[${m.adapter}]`)}`,
      );
    }
  }

  console.log(rows.join("\n"));
}
