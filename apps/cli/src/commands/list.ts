import * as p from "@clack/prompts";
import { slotOrder, type SlotId } from "@stanza/registry";
import kleur from "kleur";
import type { Argv } from "mri";

import { findProjectRoot, readManifest } from "@/lib/manifest";

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

  console.log(rows.join("\n"));
}
