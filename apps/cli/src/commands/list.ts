import * as p from "@clack/prompts";
import { addonOrder, slotOrder, type SlotId } from "@stanza/registry";
import kleur from "kleur";
import type { Argv } from "mri";

import { findProjectRoot, readManifest } from "../lib/manifest";

export async function cmdList(_args: { argv: Argv }): Promise<void> {
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
      ? `${kleur.cyan(slot.padEnd(10))} ${m.id} ${kleur.dim(`@${m.version}`)} ${kleur.dim(`[${m.adapter}]`)}`
      : `${kleur.cyan(slot.padEnd(10))} ${kleur.dim("(empty)")}`;
  });

  // Add-on rows after the slots — a category can list several.
  for (const category of addonOrder) {
    for (const m of manifest.addons[category] ?? []) {
      rows.push(
        `${kleur.cyan(category.padEnd(10))} ${m.id} ${kleur.dim(`@${m.version}`)} ${kleur.dim(`[${m.adapter}]`)}`,
      );
    }
  }

  console.log(rows.join("\n"));
}
