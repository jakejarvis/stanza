import kleur from "kleur";
import type { Argv } from "mri";

import { loadRegistry } from "../registry-loader.ts";

export async function cmdSearch(args: { query?: string; argv: Argv }): Promise<void> {
  const registry = await loadRegistry();
  const q = (args.query ?? "").toLowerCase().trim();

  const results = registry.index.modules.filter((m) => {
    if (!q) return true;
    return (
      m.id.toLowerCase().includes(q) ||
      m.label.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.slot.includes(q)
    );
  });

  if (results.length === 0) {
    console.log(kleur.dim("No modules found."));
    return;
  }

  for (const m of results) {
    const head = `${kleur.bold(m.label)} ${kleur.dim(`(${m.slot}/${m.id})`)}`;
    const desc = m.description ? `  ${kleur.dim(m.description)}` : "";
    console.log(`${head}\n${desc}`);
  }
}
